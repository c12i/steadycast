//! Steadycast — Tauri backend entry point.
//!
//! Module responsibilities:
//!   stream      — FFmpeg process lifecycle, playlist cycling, RTMP output
//!   user_assets — user-uploaded files and synthesizer-generated tracks
//!   presets     — save/load/share stream configurations
//!   settings    — quality settings, playback preferences, cache management
//!   keys        — stream key storage (YouTube / Twitch)
//!   db          — SQLite connection and schema bootstrap
//!   windows     — secondary Tauri windows (preview, logs)

mod db;
mod keys;
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
        .manage(windows::PreviewState(std::sync::Mutex::new(
            windows::PreviewConfig::default(),
        )))
        .manage(stream::TrayMenuState::default())
        .setup(|app| {
            use tauri::{
                menu::{Menu, MenuItem, PredefinedMenuItem},
                tray::TrayIconBuilder,
                Manager,
            };

            // ── DB / directories ─────────────────────────────────────────────
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            std::fs::create_dir_all(app_dir.join("cache"))?;
            std::fs::create_dir_all(app_dir.join("user_assets"))?;
            let conn = db::init_db(&app_dir).map_err(|e| format!("DB init failed: {e}"))?;
            app.manage(db::DbState(std::sync::Mutex::new(conn)));

            // ── System tray ───────────────────────────────────────────────────
            let open_item = MenuItem::with_id(app, "open", "Open Steadycast", true, None::<&str>)?;
            let end_stream_item =
                MenuItem::with_id(app, "end_stream", "End Stream", false, None::<&str>)?;
            // Store a clone so update_tray can toggle it.
            app.state::<stream::TrayMenuState>()
                .end_stream_item
                .lock()
                .unwrap()
                .replace(end_stream_item.clone());
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu =
                Menu::with_items(app, &[&open_item, &end_stream_item, &separator, &quit_item])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Steadycast")
                .menu(&menu)
                .on_menu_event({
                    let app_handle = app.handle().clone();
                    move |_tray, event| match event.id().as_ref() {
                        "open" => {
                            if let Some(win) = app_handle.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "end_stream" => {
                            if let Some(state) = app_handle.try_state::<stream::StreamState>() {
                                stream::stop_stream_sync(&state);
                                stream::update_tray(&app_handle, false);
                            }
                        }
                        "quit" => {
                            if let Some(state) = app_handle.try_state::<stream::StreamState>() {
                                stream::stop_stream_sync(&state);
                            }
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click on the tray icon shows the main window.
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Hide main window on close (macOS) ─────────────────────────────
            if let Some(win) = app.get_webview_window("main") {
                win.on_window_event({
                    let win = win.clone();
                    move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win.hide();
                        }
                    }
                });
            }

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
            presets::rename_preset,
            presets::delete_preset,
            presets::import_preset_from_url,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
