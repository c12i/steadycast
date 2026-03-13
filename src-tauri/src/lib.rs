mod assets;
mod db;
mod license;
mod stream;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(stream::StreamState::default())
        .setup(|app| {
            use tauri::Manager;
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let conn = db::init_db(&app_dir)
                .map_err(|e| format!("DB init failed: {e}"))?;
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            stream::start_stream,
            stream::stop_stream,
            stream::stream_status,
            stream::get_ffmpeg_logs,
            stream::clear_ffmpeg_logs,
            stream::get_current_stream_info,
            assets::download_assets,
            license::validate_license,
            db::save_stream_key,
            db::get_stream_key,
            db::get_preferences,
            db::save_preferences,
            windows::open_preview_window,
            windows::open_logs_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
