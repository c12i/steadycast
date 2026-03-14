use std::io::Write;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct SynthPipeInner {
    pub pipe_path: Option<String>,
    pub writer: Option<std::io::BufWriter<std::fs::File>>,
}

pub struct SynthPipeState(pub Arc<Mutex<SynthPipeInner>>);

impl Default for SynthPipeState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(SynthPipeInner {
            pipe_path: None,
            writer: None,
        })))
    }
}

/// Creates a named FIFO (Unix) and returns its path. Removes any stale FIFO first.
#[tauri::command]
pub fn setup_synth_pipe(state: State<'_, SynthPipeState>) -> Result<String, String> {
    let mut inner = state.0.lock().unwrap();

    // Clean up old pipe if one exists.
    if let Some(ref old) = inner.pipe_path {
        let _ = std::fs::remove_file(old);
    }
    inner.writer = None;

    let path = std::env::temp_dir()
        .join("lofi-synth.pipe")
        .to_string_lossy()
        .into_owned();

    // Remove stale FIFO if present.
    let _ = std::fs::remove_file(&path);

    // Create the FIFO via the `mkfifo` system command (avoids libc FFI).
    #[cfg(unix)]
    {
        let status = std::process::Command::new("mkfifo")
            .arg(&path)
            .status()
            .map_err(|e| format!("mkfifo spawn failed: {e}"))?;
        if !status.success() {
            return Err(format!("mkfifo failed with status: {status}"));
        }
    }

    #[cfg(windows)]
    {
        return Err("Synthetic Mode streaming is not supported on Windows yet".into());
    }

    inner.pipe_path = Some(path.clone());
    Ok(path)
}

/// Opens the write end of the FIFO. Blocks (in a background thread) until FFmpeg
/// opens the read end, then returns. Call this *after* starting FFmpeg.
#[tauri::command]
pub async fn open_synth_pipe_writer(state: State<'_, SynthPipeState>) -> Result<(), String> {
    let path = {
        let inner = state.0.lock().unwrap();
        inner
            .pipe_path
            .clone()
            .ok_or("No synth pipe configured — call setup_synth_pipe first")?
    };

    // Opening a FIFO for writing blocks until there is a reader.
    // We use spawn_blocking so the Tokio runtime stays responsive.
    let file = tokio::task::spawn_blocking(move || {
        std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut inner = state.0.lock().unwrap();
    inner.writer = Some(std::io::BufWriter::with_capacity(65536, file));
    Ok(())
}

/// Receives interleaved f32le stereo samples from JS and writes them to the FIFO.
/// FFmpeg reads these as raw PCM (`-f f32le -ar 44100 -ac 2`).
#[tauri::command]
pub fn write_synth_audio(
    state: State<'_, SynthPipeState>,
    samples: Vec<f32>,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    if let Some(ref mut writer) = inner.writer {
        // Convert f32 samples to raw little-endian bytes.
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|&f| f.to_le_bytes())
            .collect();
        writer.write_all(&bytes).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Closes the writer and removes the FIFO file. Call when the stream stops.
#[tauri::command]
pub fn cleanup_synth_pipe(state: State<'_, SynthPipeState>) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    inner.writer = None; // Closes the file — FFmpeg sees EOF.
    if let Some(ref path) = inner.pipe_path.take() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
