use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

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

pub fn init_db(app_data_dir: &Path) -> Result<Connection> {
    let path = app_data_dir.join("lofi_stream.db");
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stream_keys (
            platform TEXT PRIMARY KEY,
            key      TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS preferences (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;
    Ok(conn)
}

#[tauri::command]
pub fn save_stream_key(
    state: tauri::State<'_, DbState>,
    platform: String,
    key: String,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO stream_keys (platform, key) VALUES (?1, ?2)",
        params![platform, key],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_stream_key(
    state: tauri::State<'_, DbState>,
    platform: String,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    conn.query_row(
        "SELECT key FROM stream_keys WHERE platform = ?1",
        params![platform],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
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

    if let Some(v) = get("default_platform") {
        prefs.default_platform = v;
    }
    if let Some(v) = get("music_volume").and_then(|s| s.parse().ok()) {
        prefs.music_volume = v;
    }
    if let Some(v) = get("ambient_volume").and_then(|s| s.parse().ok()) {
        prefs.ambient_volume = v;
    }

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
    upsert("music_volume", &preferences.music_volume.to_string()).map_err(|e| e.to_string())?;
    upsert("ambient_volume", &preferences.ambient_volume.to_string())
        .map_err(|e| e.to_string())?;
    Ok(())
}
