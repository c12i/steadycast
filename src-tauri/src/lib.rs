mod assets;
mod db;
mod library;
mod license;
mod presets;
mod settings;
mod stream;
mod user_assets;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(stream::StreamState::default())
        .setup(|app| {
            use tauri::Manager;
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            // Ensure cache and user_assets subdirs exist
            std::fs::create_dir_all(app_dir.join("cache"))?;
            std::fs::create_dir_all(app_dir.join("user_assets"))?;
            let conn = db::init_db(&app_dir)
                .map_err(|e| format!("DB init failed: {e}"))?;
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Stream
            stream::start_stream,
            stream::stop_stream,
            stream::stream_status,
            stream::get_ffmpeg_logs,
            stream::clear_ffmpeg_logs,
            stream::get_current_stream_info,
            // Library
            library::get_library,
            library::download_asset,
            library::delete_cached_asset,
            // User assets
            user_assets::add_user_asset,
            user_assets::get_user_assets,
            user_assets::delete_user_asset,
            // Presets
            presets::get_presets,
            presets::save_preset,
            presets::delete_preset,
            presets::import_preset_from_url,
            presets::export_preset,
            // Settings
            settings::get_settings,
            settings::save_settings,
            settings::get_cache_stats,
            settings::clear_cache,
            settings::reveal_cache_folder,
            // Legacy manifest import (kept for compatibility)
            assets::download_assets,
            // Auth / keys
            license::validate_license,
            db::save_stream_key,
            db::get_stream_key,
            db::get_preferences,
            db::save_preferences,
            // Windows
            windows::open_preview_window,
            windows::open_logs_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
