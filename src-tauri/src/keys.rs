//! Stream key storage — save and retrieve per-platform RTMP stream keys.

use crate::db::DbState;
use rusqlite::params;

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
