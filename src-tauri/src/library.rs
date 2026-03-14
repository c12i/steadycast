// TODO: Host assets on own CDN (R2/S3) for long-term URL stability

use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::db::DbState;

static DEFAULT_CATALOG: &str = include_str!("../assets/default_library.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogAsset {
    pub id: String,
    pub name: String,
    pub artist: Option<String>,
    pub genre: Option<String>,
    pub category: Option<String>,
    pub asset_type: String, // "video" | "music" | "ambient"
    pub duration_seconds: Option<u32>,
    pub url: String,
    pub preview_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub source_platform: String,
    pub license: String,
    pub tags: Vec<String>,
    // Populated after download
    pub local_path: Option<String>,
    pub file_size_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawCatalog {
    version: u32,
    music: Vec<CatalogAsset>,
    ambient: Vec<CatalogAsset>,
    video: Vec<CatalogAsset>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryResponse {
    pub version: u32,
    pub music: Vec<CatalogAsset>,
    pub ambient: Vec<CatalogAsset>,
    pub video: Vec<CatalogAsset>,
}

// Merge catalog with cache info from DB
#[tauri::command]
pub fn get_library(
    _app: AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<LibraryResponse, String> {
    let raw: RawCatalog =
        serde_json::from_str(DEFAULT_CATALOG).map_err(|e| format!("Catalog parse error: {e}"))?;

    let conn = state.0.lock().unwrap();

    let resolve = |mut assets: Vec<CatalogAsset>| -> Vec<CatalogAsset> {
        for asset in &mut assets {
            let res: rusqlite::Result<(String, Option<i64>)> = conn.query_row(
                "SELECT local_path, file_size_bytes FROM cached_assets WHERE id = ?1",
                params![asset.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            );
            if let Ok((path, size)) = res {
                // Only populate local_path if file still exists on disk
                if std::path::Path::new(&path).exists() {
                    asset.local_path = Some(path);
                    asset.file_size_bytes = size.map(|s| s as u64);
                }
            }
        }
        assets
    };

    Ok(LibraryResponse {
        version: raw.version,
        music: resolve(raw.music),
        ambient: resolve(raw.ambient),
        video: resolve(raw.video),
    })
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn ext_for_url(url: &str) -> &'static str {
    let lower = url.split('?').next().unwrap_or(url).to_lowercase();
    if lower.ends_with(".webm") {
        "webm"
    } else if lower.ends_with(".ogg") {
        "ogg"
    } else if lower.ends_with(".oga") {
        "oga"
    } else if lower.ends_with(".ogv") {
        "ogv"
    } else if lower.ends_with(".mp4") {
        "mp4"
    } else {
        "mp3"
    }
}

#[tauri::command]
pub async fn download_asset(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<String, String> {
    // Find asset in catalog
    let raw: RawCatalog =
        serde_json::from_str(DEFAULT_CATALOG).map_err(|e| format!("Catalog parse error: {e}"))?;

    let asset = raw
        .music
        .iter()
        .chain(raw.ambient.iter())
        .chain(raw.video.iter())
        .find(|a| a.id == id)
        .ok_or_else(|| format!("Asset {id} not found in catalog"))?
        .clone();

    let dir = cache_dir(&app)?;
    let ext = ext_for_url(&asset.url);
    let local_path = dir.join(format!("{}.{}", id, ext));

    // Return early if already cached and file exists
    if local_path.exists() {
        return Ok(local_path.to_string_lossy().into_owned());
    }

    // Download
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&asset.url)
        .header("Referer", "https://mixkit.co/")
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Read failed: {e}"))?;

    let file_size = bytes.len() as i64;
    std::fs::write(&local_path, &bytes).map_err(|e| format!("Write failed: {e}"))?;

    let path_str = local_path.to_string_lossy().into_owned();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Persist to cache table
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO cached_assets (id, asset_type, source, name, local_path, file_size_bytes, cached_at)
         VALUES (?1, ?2, 'builtin', ?3, ?4, ?5, ?6)",
        params![id, asset.asset_type, asset.name, path_str, file_size, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(path_str)
}

#[tauri::command]
pub fn delete_cached_asset(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let res: rusqlite::Result<String> = conn.query_row(
        "SELECT local_path FROM cached_assets WHERE id = ?1",
        params![id],
        |row| row.get(0),
    );
    if let Ok(path) = res {
        let _ = std::fs::remove_file(&path);
    }
    conn.execute("DELETE FROM cached_assets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
