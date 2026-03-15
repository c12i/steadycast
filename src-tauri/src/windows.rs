use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

// Preview config state

/// Transient selection passed from the main window to the preview window.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PreviewConfig {
    pub video_path: Option<String>,
    pub music_path: Option<String>,
    /// Full ordered playlist — used by the preview window to cycle tracks.
    pub music_playlist: Vec<String>,
    pub ambient_path: Option<String>,
    pub music_volume: f32,
    pub ambient_volume: f32,
}

pub struct PreviewState(pub Mutex<PreviewConfig>);

#[tauri::command]
pub fn set_preview_config(state: tauri::State<'_, PreviewState>, config: PreviewConfig) {
    *state.0.lock().unwrap() = config;
}

#[tauri::command]
pub fn get_preview_config(state: tauri::State<'_, PreviewState>) -> PreviewConfig {
    state.0.lock().unwrap().clone()
}

// Window commands

#[tauri::command]
pub fn open_preview_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("stream-preview") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "stream-preview",
        WebviewUrl::App("index.html#/preview".into()),
    )
    .title("Stream Preview")
    .inner_size(960.0, 540.0)
    .min_inner_size(480.0, 270.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_logs_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("ffmpeg-logs") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "ffmpeg-logs",
        WebviewUrl::App("index.html#/logs".into()),
    )
    .title("FFmpeg Logs")
    .inner_size(800.0, 600.0)
    .min_inner_size(400.0, 300.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
