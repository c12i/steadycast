use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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
