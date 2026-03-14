use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamConfig {
    pub video_path: String,
    /// The first (or current) music track. Derived from music_playlist[0] on start.
    pub music_path: String,
    /// Ordered playlist of music file paths to cycle through.
    pub music_playlist: Vec<String>,
    pub ambient_path: Option<String>,
    pub music_volume: f32,
    pub ambient_volume: f32,
    pub platform: String,
    pub stream_key: String,
    pub duration_seconds: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamStatus {
    pub is_running: bool,
    pub elapsed_seconds: u64,
    pub current_track_index: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct TrackChangedPayload {
    pub track_index: usize,
    pub music_path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct FfmpegLogEvent {
    pub line: String,
    pub is_stderr: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct CurrentStreamInfo {
    pub video_path: String,
    pub music_path: String,
    pub ambient_path: Option<String>,
    pub music_volume: f32,
    pub ambient_volume: f32,
    pub is_running: bool,
    pub current_track_index: usize,
    pub elapsed_seconds: u64,
}

const MAX_LOG_LINES: usize = 2000;

pub struct StreamState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
    pub start_time: Arc<Mutex<Option<std::time::Instant>>>,
    /// Full ordered playlist of music paths.
    pub playlist: Arc<Mutex<Vec<String>>>,
    /// Index of the currently playing track within playlist.
    pub track_index: Arc<Mutex<usize>>,
    /// Base config (music_path is overridden per track; everything else is constant).
    pub base_config: Arc<Mutex<Option<StreamConfig>>>,
    /// Set to true by stop_stream so the monitor task doesn't respawn after the kill.
    pub is_stopping: Arc<Mutex<bool>>,
    /// Circular buffer of captured FFmpeg log lines.
    pub logs: Arc<Mutex<VecDeque<FfmpegLogEvent>>>,
    /// caffeinate child process — keeps macOS awake for the duration of the stream.
    pub caffeinate: Arc<Mutex<Option<std::process::Child>>>,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            start_time: Arc::new(Mutex::new(None)),
            playlist: Arc::new(Mutex::new(Vec::new())),
            track_index: Arc::new(Mutex::new(0)),
            base_config: Arc::new(Mutex::new(None)),
            is_stopping: Arc::new(Mutex::new(false)),
            logs: Arc::new(Mutex::new(VecDeque::new())),
            caffeinate: Arc::new(Mutex::new(None)),
        }
    }
}

/// Spawn `caffeinate -i` to prevent macOS idle sleep while streaming.
/// No-op on non-macOS platforms.
fn start_caffeinate() -> Option<std::process::Child> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("caffeinate")
            .arg("-i")
            .spawn()
            .ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

fn stop_caffeinate(caffeinate: &Arc<Mutex<Option<std::process::Child>>>) {
    if let Some(mut child) = caffeinate.lock().unwrap().take() {
        let _ = child.kill();
    }
}

fn rtmp_url(platform: &str, key: &str) -> String {
    match platform {
        "twitch" => format!("rtmp://live.twitch.tv/app/{}", key),
        _ => format!("rtmp://a.rtmp.youtube.com/live2/{}", key),
    }
}

fn build_args(config: &StreamConfig, quality: &crate::settings::AppSettings) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    // -re: read video at native frame rate (required for stable RTMP ingest)
    // -stream_loop -1: loop forever
    args.extend(["-re", "-stream_loop", "-1", "-i", &config.video_path].map(String::from));

    args.extend(["-i", &config.music_path].map(String::from));

    if let Some(ref ambient) = config.ambient_path {
        // Ambient loops forever
        args.extend(["-stream_loop", "-1", "-i", ambient].map(String::from));
        let filter = format!(
            "[1]volume={}[a1];[2]volume={}[a2];[a1][a2]amix=inputs=2:duration=longest[aout]",
            config.music_volume, config.ambient_volume
        );
        args.extend(["-filter_complex".into(), filter]);
    } else {
        let filter = format!("[1]volume={}[aout]", config.music_volume);
        args.extend(["-filter_complex".into(), filter]);
    }

    args.extend(["-map", "0:v", "-map", "[aout]"].map(String::from));

    // Video encoding — settings-driven quality; YouTube requires yuv420p + 2-sec keyframes
    let fps = quality.frame_rate.to_string();
    let gop = (quality.frame_rate * 2).to_string();
    let bufsize = format!(
        "{}k",
        quality
            .video_bitrate
            .trim_end_matches('k')
            .parse::<u32>()
            .unwrap_or(2500)
            * 2
    );
    args.extend(["-c:v", "libx264", "-preset", &quality.encoding_preset].map(String::from));
    args.extend(
        [
            "-b:v",
            &quality.video_bitrate,
            "-maxrate",
            &quality.video_bitrate,
            "-bufsize",
            &bufsize,
        ]
        .map(String::from),
    );
    args.extend(["-pix_fmt", "yuv420p", "-r", &fps, "-g", &gop].map(String::from));

    // Audio encoding — 44100 Hz required by most RTMP ingest servers
    args.extend(
        [
            "-c:a",
            "aac",
            "-b:a",
            &quality.audio_bitrate,
            "-ar",
            "44100",
        ]
        .map(String::from),
    );

    if let Some(dur) = config.duration_seconds {
        args.extend(["-t".into(), dur.to_string()]);
    }

    args.push("-shortest".into());

    args.extend(["-f", "flv"].map(String::from));
    args.push(rtmp_url(&config.platform, &config.stream_key));

    args
}

/// Splits raw bytes on `\n`/`\r`, stores each non-empty line in the log buffer, and emits it.
fn emit_log_lines(
    app: &AppHandle,
    logs_arc: &Arc<Mutex<VecDeque<FfmpegLogEvent>>>,
    bytes: &[u8],
    is_stderr: bool,
) {
    let raw = String::from_utf8_lossy(bytes);
    for line in raw.split(|c| c == '\n' || c == '\r') {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let event = FfmpegLogEvent {
            line: line.to_owned(),
            is_stderr,
        };
        {
            let mut logs = logs_arc.lock().unwrap();
            if logs.len() >= MAX_LOG_LINES {
                logs.pop_front();
            }
            logs.push_back(event.clone());
        }
        let _ = app.emit("ffmpeg-log", event);
    }
}

/// Spawns a background task that monitors the FFmpeg child process.
///
/// On a clean exit (code 0) it advances the playlist, respawns FFmpeg with the next
/// track, and emits a `track-changed` event to the frontend. On a non-zero exit or
/// when `is_stopping` is set, it clears state and exits.
fn spawn_monitor(
    app: AppHandle,
    initial_rx: tokio::sync::mpsc::Receiver<tauri_plugin_shell::process::CommandEvent>,
    child_arc: Arc<Mutex<Option<CommandChild>>>,
    time_arc: Arc<Mutex<Option<std::time::Instant>>>,
    playlist_arc: Arc<Mutex<Vec<String>>>,
    track_index_arc: Arc<Mutex<usize>>,
    base_config_arc: Arc<Mutex<Option<StreamConfig>>>,
    is_stopping_arc: Arc<Mutex<bool>>,
    logs_arc: Arc<Mutex<VecDeque<FfmpegLogEvent>>>,
    caffeinate_arc: Arc<Mutex<Option<std::process::Child>>>,
    quality: crate::settings::AppSettings,
) {
    tokio::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        let mut rx = initial_rx;

        loop {
            // Drain events until the process terminates.
            let exit_code = loop {
                match rx.recv().await {
                    Some(CommandEvent::Terminated(payload)) => {
                        break payload.code.unwrap_or(-1);
                    }
                    Some(CommandEvent::Stdout(bytes)) => {
                        emit_log_lines(&app, &logs_arc, &bytes, false);
                        continue;
                    }
                    Some(CommandEvent::Stderr(bytes)) => {
                        emit_log_lines(&app, &logs_arc, &bytes, true);
                        continue;
                    }
                    Some(_) => continue,
                    None => break -1, // channel closed unexpectedly
                }
            };

            // Child has exited — clear the handle immediately.
            *child_arc.lock().unwrap() = None;

            // Decide whether to stop or advance the playlist.
            let should_stop = {
                let flag = *is_stopping_arc.lock().unwrap();
                // Stop if: user-initiated kill OR FFmpeg crashed (non-zero exit)
                flag || exit_code != 0
            };

            if should_stop {
                *time_arc.lock().unwrap() = None;
                *is_stopping_arc.lock().unwrap() = false;
                stop_caffeinate(&caffeinate_arc);
                return;
            }

            // Clean exit means the music track finished — advance the playlist.
            let (next_index, next_music_path) = {
                let mut idx = track_index_arc.lock().unwrap();
                let playlist = playlist_arc.lock().unwrap();
                if playlist.is_empty() {
                    *time_arc.lock().unwrap() = None;
                    stop_caffeinate(&caffeinate_arc);
                    return;
                }
                *idx = (*idx + 1) % playlist.len();
                (*idx, playlist[*idx].clone())
            };

            // Check is_stopping again: user may have called stop between old exit and here.
            if *is_stopping_arc.lock().unwrap() {
                *time_arc.lock().unwrap() = None;
                *is_stopping_arc.lock().unwrap() = false;
                stop_caffeinate(&caffeinate_arc);
                return;
            }

            // Build config for the next track.
            let next_config = {
                let mut cfg = base_config_arc
                    .lock()
                    .unwrap()
                    .clone()
                    .expect("base_config missing in monitor");
                cfg.music_path = next_music_path.clone();
                cfg
            };

            let args = build_args(&next_config, &quality);

            // Respawn FFmpeg with the next track.
            match app
                .shell()
                .sidecar("ffmpeg")
                .map_err(|e| e.to_string())
                .and_then(|cmd| cmd.args(args).spawn().map_err(|e| e.to_string()))
            {
                Ok((new_rx, new_child)) => {
                    *child_arc.lock().unwrap() = Some(new_child);
                    rx = new_rx;

                    let _ = app.emit(
                        "track-changed",
                        TrackChangedPayload {
                            track_index: next_index,
                            music_path: next_music_path,
                        },
                    );
                }
                Err(e) => {
                    log::error!("Failed to respawn FFmpeg for next track: {e}");
                    *time_arc.lock().unwrap() = None;
                    stop_caffeinate(&caffeinate_arc);
                    return;
                }
            }
        }
    });
}

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: tauri::State<'_, StreamState>,
    config: StreamConfig,
) -> Result<(), String> {
    if state.child.lock().unwrap().is_some() {
        return Err("Stream is already running".into());
    }

    // Build the playlist: use music_playlist if provided, else fall back to music_path.
    let playlist: Vec<String> = if !config.music_playlist.is_empty() {
        config.music_playlist.clone()
    } else {
        vec![config.music_path.clone()]
    };

    if playlist.is_empty() {
        return Err("No music tracks in playlist".into());
    }

    // Initialise playlist state.
    *state.playlist.lock().unwrap() = playlist.clone();
    *state.track_index.lock().unwrap() = 0;
    *state.is_stopping.lock().unwrap() = false;
    state.logs.lock().unwrap().clear();

    // First track.
    let mut initial_config = config.clone();
    initial_config.music_path = playlist[0].clone();
    *state.base_config.lock().unwrap() = Some(initial_config.clone());

    // Load quality settings from DB (falls back to defaults if not set)
    let quality = app
        .try_state::<crate::db::DbState>()
        .map(|s| crate::settings::get_settings(s))
        .unwrap_or_default();

    let args = build_args(&initial_config, &quality);

    let (rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    *state.child.lock().unwrap() = Some(child);
    *state.start_time.lock().unwrap() = Some(std::time::Instant::now());
    *state.caffeinate.lock().unwrap() = start_caffeinate();

    spawn_monitor(
        app,
        rx,
        state.child.clone(),
        state.start_time.clone(),
        state.playlist.clone(),
        state.track_index.clone(),
        state.base_config.clone(),
        state.is_stopping.clone(),
        state.logs.clone(),
        state.caffeinate.clone(),
        quality,
    );

    Ok(())
}

#[tauri::command]
pub async fn stop_stream(state: tauri::State<'_, StreamState>) -> Result<(), String> {
    // Signal the monitor not to respawn after the kill.
    *state.is_stopping.lock().unwrap() = true;

    let child = state.child.lock().unwrap().take();
    if let Some(c) = child {
        c.kill().map_err(|e| e.to_string())?;
        *state.start_time.lock().unwrap() = None;
    }

    stop_caffeinate(&state.caffeinate);
    Ok(())
}

#[tauri::command]
pub fn stream_status(state: tauri::State<'_, StreamState>) -> StreamStatus {
    let is_running = state.child.lock().unwrap().is_some();
    let elapsed_seconds = state
        .start_time
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);
    let current_track_index = *state.track_index.lock().unwrap();
    StreamStatus {
        is_running,
        elapsed_seconds,
        current_track_index,
    }
}

#[tauri::command]
pub fn get_ffmpeg_logs(state: tauri::State<'_, StreamState>) -> Vec<FfmpegLogEvent> {
    state.logs.lock().unwrap().iter().cloned().collect()
}

#[tauri::command]
pub fn clear_ffmpeg_logs(state: tauri::State<'_, StreamState>) {
    state.logs.lock().unwrap().clear();
}

#[tauri::command]
pub fn get_current_stream_info(state: tauri::State<'_, StreamState>) -> Option<CurrentStreamInfo> {
    let is_running = state.child.lock().unwrap().is_some();
    let cfg = state.base_config.lock().unwrap().clone()?;
    let current_track_index = *state.track_index.lock().unwrap();
    let playlist = state.playlist.lock().unwrap();
    let music_path = playlist
        .get(current_track_index)
        .cloned()
        .unwrap_or(cfg.music_path.clone());
    let elapsed_seconds = state
        .start_time
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);
    Some(CurrentStreamInfo {
        video_path: cfg.video_path,
        music_path,
        ambient_path: cfg.ambient_path,
        music_volume: cfg.music_volume,
        ambient_volume: cfg.ambient_volume,
        is_running,
        current_track_index,
        elapsed_seconds,
    })
}
