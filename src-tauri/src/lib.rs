//! Lofi Stream Studio — Tauri backend entry point.
//!
//! Module responsibilities:
//!   stream      — FFmpeg process lifecycle, playlist cycling, RTMP output
//!   user_assets — user-uploaded files and synthesizer-generated tracks
//!   presets     — save/load/share stream configurations
//!   settings    — quality settings, playback preferences, cache management
//!   keys        — stream key storage (YouTube / Twitch)
//!   db          — SQLite connection and schema bootstrap
//!   windows     — secondary Tauri windows (preview, logs)
//!   license     — license validation stub

mod db;
mod keys;
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
        .manage(windows::PreviewState(std::sync::Mutex::new(windows::PreviewConfig::default())))
        .setup(|app| {
            use tauri::Manager;
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            std::fs::create_dir_all(app_dir.join("cache"))?;
            std::fs::create_dir_all(app_dir.join("user_assets"))?;
            let conn = db::init_db(&app_dir).map_err(|e| format!("DB init failed: {e}"))?;
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
            // User assets
            user_assets::add_user_asset,
            user_assets::get_user_assets,
            user_assets::delete_user_asset,
            user_assets::rename_user_asset,
            user_assets::save_synth_track,
            user_assets::save_ambient_file,
            // Presets
            presets::get_presets,
            presets::save_preset,
            presets::delete_preset,
            presets::import_preset_from_url,
            presets::export_preset,
            // Settings & preferences
            settings::get_settings,
            settings::save_settings,
            settings::get_preferences,
            settings::save_preferences,
            settings::get_cache_stats,
            settings::clear_cache,
            settings::reveal_cache_folder,
            // Stream keys
            keys::save_stream_key,
            keys::get_stream_key,
            // Windows
            windows::open_preview_window,
            windows::open_logs_window,
            windows::set_preview_config,
            windows::get_preview_config,
            // License
            license::validate_license,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
