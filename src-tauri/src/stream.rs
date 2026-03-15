//! FFmpeg streaming — start/stop a live RTMP stream, cycle through a music
//! playlist, and surface status & logs to the frontend.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamConfig {
    pub video_path: String,
    /// Current music track path, or None when streaming video + ambient only.
    pub music_path: Option<String>,
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
    pub music_path: Option<String>,
    pub ambient_path: Option<String>,
    pub music_volume: f32,
    pub ambient_volume: f32,
    pub is_running: bool,
    pub current_track_index: usize,
    pub elapsed_seconds: u64,
}

// ── Stream state ──────────────────────────────────────────────────────────────

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
            child:       Arc::new(Mutex::new(None)),
            start_time:  Arc::new(Mutex::new(None)),
            playlist:    Arc::new(Mutex::new(Vec::new())),
            track_index: Arc::new(Mutex::new(0)),
            base_config: Arc::new(Mutex::new(None)),
            is_stopping: Arc::new(Mutex::new(false)),
            logs:        Arc::new(Mutex::new(VecDeque::new())),
            caffeinate:  Arc::new(Mutex::new(None)),
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: tauri::State<'_, StreamState>,
    config: StreamConfig,
) -> Result<(), String> {
    if state.child.lock().unwrap().is_some() {
        return Err("Stream is already running".into());
    }

    let playlist: Vec<String> = if !config.music_playlist.is_empty() {
        config.music_playlist.clone()
    } else if let Some(ref p) = config.music_path {
        vec![p.clone()]
    } else {
        vec![]
    };

    *state.playlist.lock().unwrap()    = playlist.clone();
    *state.track_index.lock().unwrap() = 0;
    *state.is_stopping.lock().unwrap() = false;
    state.logs.lock().unwrap().clear();

    let mut initial_config = config.clone();
    initial_config.music_path = playlist.first().cloned();
    *state.base_config.lock().unwrap() = Some(initial_config.clone());

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

    *state.child.lock().unwrap()      = Some(child);
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
    *state.is_stopping.lock().unwrap() = true;

    if let Some(c) = state.child.lock().unwrap().take() {
        c.kill().map_err(|e| e.to_string())?;
        *state.start_time.lock().unwrap() = None;
    }

    stop_caffeinate(&state.caffeinate);
    Ok(())
}

#[tauri::command]
pub fn stream_status(state: tauri::State<'_, StreamState>) -> StreamStatus {
    StreamStatus {
        is_running:          state.child.lock().unwrap().is_some(),
        elapsed_seconds:     state.start_time.lock().unwrap().map(|t| t.elapsed().as_secs()).unwrap_or(0),
        current_track_index: *state.track_index.lock().unwrap(),
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
    let music_path = state.playlist.lock().unwrap()
        .get(current_track_index)
        .cloned()
        .or_else(|| cfg.music_path.clone());
    let elapsed_seconds = state.start_time.lock().unwrap()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);

    Some(CurrentStreamInfo {
        video_path:   cfg.video_path,
        music_path,
        ambient_path: cfg.ambient_path,
        music_volume: cfg.music_volume,
        ambient_volume: cfg.ambient_volume,
        is_running,
        current_track_index,
        elapsed_seconds,
    })
}

// ── Private implementation ────────────────────────────────────────────────────

fn rtmp_url(platform: &str, key: &str) -> String {
    match platform {
        "twitch" => format!("rtmp://live.twitch.tv/app/{}", key),
        _        => format!("rtmp://a.rtmp.youtube.com/live2/{}", key),
    }
}

fn build_args(config: &StreamConfig, quality: &crate::settings::AppSettings) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    // Input 0: video (always looped)
    args.extend(["-re", "-stream_loop", "-1", "-i", &config.video_path].map(String::from));

    let has_music   = config.music_path.is_some();
    let has_ambient = config.ambient_path.is_some();

    // Track which FFmpeg input index each audio source gets
    let mut next_idx: usize = 1;
    let music_idx = if has_music {
        let i = next_idx; next_idx += 1;
        args.extend(["-i", config.music_path.as_deref().unwrap()].map(String::from));
        Some(i)
    } else { None };
    let ambient_idx = if has_ambient {
        let i = next_idx;
        args.extend(["-stream_loop", "-1", "-i", config.ambient_path.as_deref().unwrap()].map(String::from));
        Some(i)
    } else { None };

    // Build audio filter + output mapping
    match (music_idx, ambient_idx) {
        (Some(mi), Some(ai)) => {
            args.extend([
                "-filter_complex".into(),
                format!("[{mi}]volume={mv}[a1];[{ai}]volume={av}[a2];[a1][a2]amix=inputs=2:duration=longest[aout]",
                    mv = config.music_volume, av = config.ambient_volume),
            ]);
            args.extend(["-map", "0:v", "-map", "[aout]"].map(String::from));
        }
        (Some(mi), None) => {
            args.extend(["-filter_complex".into(), format!("[{mi}]volume={}[aout]", config.music_volume)]);
            args.extend(["-map", "0:v", "-map", "[aout]"].map(String::from));
        }
        (None, Some(ai)) => {
            args.extend(["-filter_complex".into(), format!("[{ai}]volume={}[aout]", config.ambient_volume)]);
            args.extend(["-map", "0:v", "-map", "[aout]"].map(String::from));
        }
        (None, None) => {
            // No audio — generate silence so the stream has a valid audio track
            args.extend(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"].map(String::from));
            args.extend(["-map", "0:v", "-map", "1:a"].map(String::from));
        }
    }

    // Video encoding — YouTube requires yuv420p and 2-second keyframe intervals
    let fps     = quality.frame_rate.to_string();
    let gop     = (quality.frame_rate * 2).to_string();
    let bufsize = format!("{}k", quality.video_bitrate.trim_end_matches('k').parse::<u32>().unwrap_or(2500) * 2);
    args.extend(["-c:v", "libx264", "-preset", &quality.encoding_preset].map(String::from));
    args.extend(["-b:v", &quality.video_bitrate, "-maxrate", &quality.video_bitrate, "-bufsize", &bufsize].map(String::from));
    args.extend(["-pix_fmt", "yuv420p", "-r", &fps, "-g", &gop].map(String::from));

    // Audio encoding — 44100 Hz required by most RTMP ingest servers
    args.extend(["-c:a", "aac", "-b:a", &quality.audio_bitrate, "-ar", "44100"].map(String::from));

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
    for line in raw.split(['\n', '\r']) {
        let line = line.trim();
        if line.is_empty() { continue; }
        let event = FfmpegLogEvent { line: line.to_owned(), is_stderr };
        {
            let mut logs = logs_arc.lock().unwrap();
            if logs.len() >= MAX_LOG_LINES { logs.pop_front(); }
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
#[allow(clippy::too_many_arguments)]
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
            let exit_code = loop {
                match rx.recv().await {
                    Some(CommandEvent::Terminated(p)) => break p.code.unwrap_or(-1),
                    Some(CommandEvent::Stdout(b))     => { emit_log_lines(&app, &logs_arc, &b, false); }
                    Some(CommandEvent::Stderr(b))     => { emit_log_lines(&app, &logs_arc, &b, true); }
                    Some(_) => {}
                    None    => break -1,
                }
            };

            *child_arc.lock().unwrap() = None;

            let should_stop = *is_stopping_arc.lock().unwrap() || exit_code != 0;
            if should_stop {
                *time_arc.lock().unwrap()       = None;
                *is_stopping_arc.lock().unwrap() = false;
                stop_caffeinate(&caffeinate_arc);
                return;
            }

            // Clean exit: advance the playlist (or stop if no playlist).
            let (next_index, next_music_path) = {
                let mut idx  = track_index_arc.lock().unwrap();
                let playlist = playlist_arc.lock().unwrap();
                if playlist.is_empty() {
                    // Video + ambient-only stream — duration elapsed, clean stop.
                    *time_arc.lock().unwrap() = None;
                    stop_caffeinate(&caffeinate_arc);
                    return;
                }
                *idx = (*idx + 1) % playlist.len();
                (*idx, playlist[*idx].clone())
            };

            if *is_stopping_arc.lock().unwrap() {
                *time_arc.lock().unwrap()       = None;
                *is_stopping_arc.lock().unwrap() = false;
                stop_caffeinate(&caffeinate_arc);
                return;
            }

            let next_config = {
                let mut cfg = base_config_arc.lock().unwrap()
                    .clone()
                    .expect("base_config missing in monitor");
                cfg.music_path = Some(next_music_path.clone());
                cfg
            };

            match app.shell()
                .sidecar("ffmpeg")
                .map_err(|e| e.to_string())
                .and_then(|cmd| cmd.args(build_args(&next_config, &quality)).spawn().map_err(|e| e.to_string()))
            {
                Ok((new_rx, new_child)) => {
                    *child_arc.lock().unwrap() = Some(new_child);
                    rx = new_rx;
                    let _ = app.emit("track-changed", TrackChangedPayload {
                        track_index: next_index,
                        music_path:  next_music_path,
                    });
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

/// Spawn `caffeinate -i` to prevent macOS idle sleep while streaming. No-op elsewhere.
fn start_caffeinate() -> Option<std::process::Child> {
    #[cfg(target_os = "macos")]
    return std::process::Command::new("caffeinate").arg("-i").spawn().ok();
    #[cfg(not(target_os = "macos"))]
    None
}

fn stop_caffeinate(caffeinate: &Arc<Mutex<Option<std::process::Child>>>) {
    if let Some(mut child) = caffeinate.lock().unwrap().take() {
        let _ = child.kill();
    }
}
