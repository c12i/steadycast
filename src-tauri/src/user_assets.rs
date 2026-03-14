use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::db::DbState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAsset {
    pub id: String,
    pub name: String,
    pub asset_type: String, // "video" | "music" | "ambient"
    pub local_path: String,
    pub file_size_bytes: Option<u64>,
    pub cached_at: u64,
}

#[tauri::command]
pub async fn add_user_asset(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    source_path: String,
    asset_type: String,
    name: String,
) -> Result<UserAsset, String> {
    // Validate asset_type
    if !["video", "music", "ambient"].contains(&asset_type.as_str()) {
        return Err(format!("Invalid asset_type: {}", asset_type));
    }

    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err(format!("File not found: {}", source_path));
    }

    // Determine extension from source file
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or(if asset_type == "video" { "mp4" } else { "mp3" });

    // Destination: <app_data>/user_assets/<uuid>.<ext>
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("user_assets");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let id = format!("user-{}", Uuid::new_v4());
    let dest = dest_dir.join(format!("{}.{}", id, ext));

    std::fs::copy(&source_path, &dest).map_err(|e| format!("Copy failed: {e}"))?;

    let file_size = dest.metadata().map(|m| m.len()).ok();
    let path_str = dest.to_string_lossy().into_owned();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO cached_assets (id, asset_type, source, name, local_path, file_size_bytes, cached_at)
         VALUES (?1, ?2, 'user', ?3, ?4, ?5, ?6)",
        params![
            id,
            asset_type,
            name,
            path_str,
            file_size.map(|s| s as i64),
            now as i64
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(UserAsset {
        id,
        name,
        asset_type,
        local_path: path_str,
        file_size_bytes: file_size,
        cached_at: now,
    })
}

#[tauri::command]
pub fn get_user_assets(state: tauri::State<'_, DbState>) -> Vec<UserAsset> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, asset_type, local_path, file_size_bytes, cached_at
             FROM cached_assets WHERE source = 'user' ORDER BY cached_at DESC",
        )
        .unwrap();

    stmt.query_map([], |row| {
        Ok(UserAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            asset_type: row.get(2)?,
            local_path: row.get(3)?,
            file_size_bytes: row.get::<_, Option<i64>>(4)?.map(|s| s as u64),
            cached_at: row.get::<_, i64>(5)? as u64,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .filter(|a| std::path::Path::new(&a.local_path).exists())
    .collect()
}

#[tauri::command]
pub fn delete_user_asset(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let res: rusqlite::Result<String> = conn.query_row(
        "SELECT local_path FROM cached_assets WHERE id = ?1 AND source = 'user'",
        params![id],
        |row| row.get(0),
    );
    if let Ok(path) = res {
        let _ = std::fs::remove_file(&path);
    }
    conn.execute(
        "DELETE FROM cached_assets WHERE id = ?1 AND source = 'user'",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_user_asset(
    state: tauri::State<'_, DbState>,
    id: String,
    name: String,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE cached_assets SET name = ?1 WHERE id = ?2 AND source = 'user'",
        params![name, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Saves a base64-encoded WAV from the frontend as a user asset (music).
/// Base64 avoids the ~3× overhead of JSON-serializing a byte array.
#[tauri::command]
pub async fn save_synth_track(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::db::DbState>,
    wav_b64: String,
    name: String,
) -> Result<UserAsset, String> {
    use base64::Engine;
    let wav_bytes = base64::engine::general_purpose::STANDARD
        .decode(&wav_b64)
        .map_err(|e| format!("Base64 decode failed: {e}"))?;

    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("user_assets");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let id = format!("synth-{}", uuid::Uuid::new_v4());
    let dest = dest_dir.join(format!("{}.wav", id));

    std::fs::write(&dest, &wav_bytes).map_err(|e| format!("Write failed: {e}"))?;

    let file_size = wav_bytes.len() as u64;
    let path_str = dest.to_string_lossy().into_owned();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO cached_assets (id, asset_type, source, name, local_path, file_size_bytes, cached_at)
         VALUES (?1, 'music', 'user', ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, path_str, file_size as i64, now as i64],
    )
    .map_err(|e| e.to_string())?;

    Ok(UserAsset {
        id,
        name,
        asset_type: "music".into(),
        local_path: path_str,
        file_size_bytes: Some(file_size),
        cached_at: now,
    })
}
