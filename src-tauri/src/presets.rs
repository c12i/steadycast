use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::db::DbState;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub video_id: Option<String>,
    pub music_ids: Vec<String>,
    pub ambient_id: Option<String>,
    pub source_url: Option<String>,
    pub is_builtin: bool,
    pub created_at: u64,
}

// V2 manifest format for sharing presets
#[derive(Debug, Serialize, Deserialize)]
pub struct ShareableManifest {
    pub version: u32,
    pub name: String,
    pub description: Option<String>,
    pub preset: PresetRef,
    pub custom_assets: Vec<ManifestCustomAsset>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PresetRef {
    pub video_id: Option<String>,
    pub music_ids: Vec<String>,
    pub ambient_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestCustomAsset {
    pub id: String,
    pub asset_type: String,
    pub name: String,
    pub url: String,
    pub license: String,
}

#[tauri::command]
pub fn get_presets(state: tauri::State<'_, DbState>) -> Vec<Preset> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, video_id, music_ids, ambient_id, source_url, is_builtin, created_at
             FROM presets ORDER BY is_builtin DESC, created_at DESC",
        )
        .unwrap();

    stmt.query_map([], |row| {
        let music_ids_json: String = row.get(4)?;
        let music_ids: Vec<String> =
            serde_json::from_str(&music_ids_json).unwrap_or_default();
        Ok(Preset {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            video_id: row.get(3)?,
            music_ids,
            ambient_id: row.get(5)?,
            source_url: row.get(6)?,
            is_builtin: row.get::<_, i32>(7)? != 0,
            created_at: row.get::<_, i64>(8)? as u64,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

#[tauri::command]
pub fn save_preset(
    state: tauri::State<'_, DbState>,
    name: String,
    description: Option<String>,
    video_id: Option<String>,
    music_ids: Vec<String>,
    ambient_id: Option<String>,
) -> Result<Preset, String> {
    let id = Uuid::new_v4().to_string();
    let music_ids_json =
        serde_json::to_string(&music_ids).map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO presets (id, name, description, video_id, music_ids, ambient_id, is_builtin, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
        params![id, name, description, video_id, music_ids_json, ambient_id, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Preset {
        id,
        name,
        description,
        video_id,
        music_ids,
        ambient_id,
        source_url: None,
        is_builtin: false,
        created_at: now as u64,
    })
}

#[tauri::command]
pub fn delete_preset(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM presets WHERE id = ?1 AND is_builtin = 0",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn import_preset_from_url(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    url: String,
) -> Result<Preset, String> {
    let client = reqwest::Client::new();
    let manifest: ShareableManifest = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Parse failed: {e}"))?;

    // Download any custom assets in the manifest
    if !manifest.custom_assets.is_empty() {
        let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let cache_dir = app_dir.join("cache");
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

        let dl_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;

        for asset in &manifest.custom_assets {
            let ext = if asset.asset_type == "video" { "mp4" } else { "mp3" };
            let local_path = cache_dir.join(format!("{}.{}", asset.id, ext));

            if !local_path.exists() {
                let bytes = dl_client
                    .get(&asset.url)
                    .send()
                    .await
                    .map_err(|e| format!("Download failed for {}: {e}", asset.id))?
                    .bytes()
                    .await
                    .map_err(|e| e.to_string())?;
                std::fs::write(&local_path, &bytes).map_err(|e| e.to_string())?;
            }

            let path_str = local_path.to_string_lossy().into_owned();
            let file_size = local_path.metadata().map(|m| m.len() as i64).ok();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            let conn = state.0.lock().unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO cached_assets
                 (id, asset_type, source, name, local_path, file_size_bytes, cached_at)
                 VALUES (?1, ?2, 'manifest', ?3, ?4, ?5, ?6)",
                params![
                    asset.id,
                    asset.asset_type,
                    asset.name,
                    path_str,
                    file_size,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Save preset
    let music_ids_json =
        serde_json::to_string(&manifest.preset.music_ids).map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let id = Uuid::new_v4().to_string();

    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO presets
         (id, name, description, video_id, music_ids, ambient_id, source_url, is_builtin, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)",
        params![
            id,
            manifest.name,
            manifest.description,
            manifest.preset.video_id,
            music_ids_json,
            manifest.preset.ambient_id,
            url,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Preset {
        id,
        name: manifest.name,
        description: manifest.description,
        video_id: manifest.preset.video_id,
        music_ids: manifest.preset.music_ids,
        ambient_id: manifest.preset.ambient_id,
        source_url: Some(url),
        is_builtin: false,
        created_at: now as u64,
    })
}

#[tauri::command]
pub fn export_preset(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<ShareableManifest, String> {
    let conn = state.0.lock().unwrap();
    let preset: Preset = conn
        .query_row(
            "SELECT id, name, description, video_id, music_ids, ambient_id, source_url, is_builtin, created_at
             FROM presets WHERE id = ?1",
            params![id],
            |row| {
                let music_ids_json: String = row.get(4)?;
                let music_ids: Vec<String> =
                    serde_json::from_str(&music_ids_json).unwrap_or_default();
                Ok(Preset {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    video_id: row.get(3)?,
                    music_ids,
                    ambient_id: row.get(5)?,
                    source_url: row.get(6)?,
                    is_builtin: row.get::<_, i32>(7)? != 0,
                    created_at: row.get::<_, i64>(8)? as u64,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // Collect any custom (non-builtin) assets referenced by this preset
    let all_ids: Vec<String> = preset
        .video_id
        .iter()
        .chain(preset.music_ids.iter())
        .chain(preset.ambient_id.iter())
        .cloned()
        .collect();

    let mut custom_assets = Vec::new();
    for asset_id in &all_ids {
        if asset_id.starts_with("user-") || {
            // Check if it's a manifest-sourced custom asset
            conn.query_row(
                "SELECT source FROM cached_assets WHERE id = ?1",
                params![asset_id],
                |row| row.get::<_, String>(0),
            )
            .map(|s| s == "manifest")
            .unwrap_or(false)
        } {
            // Include as custom asset in export with original URL if available
            if let Ok((name, asset_type)) = conn.query_row(
                "SELECT name, asset_type FROM cached_assets WHERE id = ?1",
                params![asset_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            ) {
                custom_assets.push(ManifestCustomAsset {
                    id: asset_id.clone(),
                    asset_type,
                    name,
                    url: String::new(), // user assets can't be shared via URL
                    license: "Unknown".into(),
                });
            }
        }
    }

    Ok(ShareableManifest {
        version: 2,
        name: preset.name,
        description: preset.description,
        preset: PresetRef {
            video_id: preset.video_id,
            music_ids: preset.music_ids,
            ambient_id: preset.ambient_id,
        },
        custom_assets,
    })
}
