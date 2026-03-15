//! User-facing configuration: stream quality settings, playback preferences,
//! cache management, and the cache folder reveal utility.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use crate::db::DbState;

// ── Preferences ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Preferences {
    pub default_platform: String,
    pub music_volume: f32,
    pub ambient_volume: f32,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            default_platform: "youtube".into(),
            music_volume: 0.8,
            ambient_volume: 0.5,
        }
    }
}

#[tauri::command]
pub fn get_preferences(state: tauri::State<'_, DbState>) -> Preferences {
    let conn = state.0.lock().unwrap();
    let mut prefs = Preferences::default();

    let get = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM preferences WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    };

    if let Some(v) = get("default_platform")                        { prefs.default_platform = v; }
    if let Some(v) = get("music_volume").and_then(|s| s.parse().ok())  { prefs.music_volume = v; }
    if let Some(v) = get("ambient_volume").and_then(|s| s.parse().ok()) { prefs.ambient_volume = v; }
    prefs
}

#[tauri::command]
pub fn save_preferences(
    state: tauri::State<'_, DbState>,
    preferences: Preferences,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let upsert = |k: &str, v: &str| {
        conn.execute(
            "INSERT OR REPLACE INTO preferences (key, value) VALUES (?1, ?2)",
            params![k, v],
        )
    };
    upsert("default_platform", &preferences.default_platform).map_err(|e| e.to_string())?;
    upsert("music_volume",     &preferences.music_volume.to_string()).map_err(|e| e.to_string())?;
    upsert("ambient_volume",   &preferences.ambient_volume.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

// ── App settings ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    // Stream quality
    pub video_bitrate: String,   // "1500k" | "2500k" | "4000k" | "6000k"
    pub audio_bitrate: String,   // "96k" | "128k" | "192k"
    pub frame_rate: u32,         // 24 | 30 | 60
    pub encoding_preset: String, // ultrafast | superfast | veryfast | faster | fast | medium
    // Stream defaults
    pub default_platform: String,
    pub music_volume: f32,
    pub ambient_volume: f32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            video_bitrate: "2500k".into(),
            audio_bitrate: "128k".into(),
            frame_rate: 30,
            encoding_preset: "veryfast".into(),
            default_platform: "youtube".into(),
            music_volume: 0.8,
            ambient_volume: 0.5,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub total_bytes: u64,
    pub music_bytes: u64,
    pub ambient_bytes: u64,
    pub video_bytes: u64,
    pub total_files: u32,
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, DbState>) -> AppSettings {
    let conn = state.0.lock().unwrap();
    let mut s = AppSettings::default();

    let get = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    };

    if let Some(v) = get("video_bitrate") {
        s.video_bitrate = v;
    }
    if let Some(v) = get("audio_bitrate") {
        s.audio_bitrate = v;
    }
    if let Some(v) = get("frame_rate").and_then(|s| s.parse().ok()) {
        s.frame_rate = v;
    }
    if let Some(v) = get("encoding_preset") {
        s.encoding_preset = v;
    }
    if let Some(v) = get("default_platform") {
        s.default_platform = v;
    }
    if let Some(v) = get("music_volume").and_then(|s| s.parse().ok()) {
        s.music_volume = v;
    }
    if let Some(v) = get("ambient_volume").and_then(|s| s.parse().ok()) {
        s.ambient_volume = v;
    }

    s
}

#[tauri::command]
pub fn save_settings(
    state: tauri::State<'_, DbState>,
    settings: AppSettings,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let upsert = |k: &str, v: &str| {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![k, v],
        )
        .map_err(|e| e.to_string())
    };
    upsert("video_bitrate", &settings.video_bitrate)?;
    upsert("audio_bitrate", &settings.audio_bitrate)?;
    upsert("frame_rate", &settings.frame_rate.to_string())?;
    upsert("encoding_preset", &settings.encoding_preset)?;
    upsert("default_platform", &settings.default_platform)?;
    upsert("music_volume", &settings.music_volume.to_string())?;
    upsert("ambient_volume", &settings.ambient_volume.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_cache_stats(state: tauri::State<'_, DbState>) -> CacheStats {
    let conn = state.0.lock().unwrap();
    let mut stats = CacheStats {
        total_bytes: 0,
        music_bytes: 0,
        ambient_bytes: 0,
        video_bytes: 0,
        total_files: 0,
    };

    let mut stmt = conn
        .prepare("SELECT asset_type, COALESCE(file_size_bytes, 0) FROM cached_assets")
        .unwrap();
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .unwrap();

    for row in rows.flatten() {
        let (asset_type, size) = row;
        let bytes = size as u64;
        stats.total_bytes += bytes;
        stats.total_files += 1;
        match asset_type.as_str() {
            "music" => stats.music_bytes += bytes,
            "ambient" => stats.ambient_bytes += bytes,
            "video" => stats.video_bytes += bytes,
            _ => {}
        }
    }

    stats
}

#[tauri::command]
pub fn clear_cache(
    _app: AppHandle,
    state: tauri::State<'_, DbState>,
    asset_type: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();

    let paths: Vec<String> = {
        let query = match &asset_type {
            Some(t) => format!(
                "SELECT local_path FROM cached_assets WHERE source = 'builtin' AND asset_type = '{}'",
                t.replace('\'', "")
            ),
            None => "SELECT local_path FROM cached_assets WHERE source = 'builtin'".into(),
        };
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let result: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    for path in &paths {
        let _ = std::fs::remove_file(path);
    }

    match &asset_type {
        Some(t) => conn.execute(
            "DELETE FROM cached_assets WHERE source = 'builtin' AND asset_type = ?1",
            params![t],
        ),
        None => conn.execute("DELETE FROM cached_assets WHERE source = 'builtin'", []),
    }
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn reveal_cache_folder(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
