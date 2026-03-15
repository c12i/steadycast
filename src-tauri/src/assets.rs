use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoAsset {
    pub id: String,
    pub name: String,
    pub url: String,
    pub thumbnail_url: String,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicAsset {
    pub id: String,
    pub name: String,
    pub url: String,
    pub preview_url: String,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmbientAsset {
    pub id: String,
    pub name: String,
    pub url: String,
    pub preview_url: String,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetManifest {
    pub version: u32,
    pub videos: Vec<VideoAsset>,
    pub music: Vec<MusicAsset>,
    pub ambients: Vec<AmbientAsset>,
}

#[tauri::command]
pub async fn download_assets(
    app: AppHandle,
    manifest_url: String,
) -> Result<AssetManifest, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let assets_dir = app_dir.join("assets");
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();

    // Fetch remote manifest
    let remote: AssetManifest = client
        .get(&manifest_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // Compare with cached version
    let manifest_path = assets_dir.join("manifest.json");
    let local_version = if manifest_path.exists() {
        std::fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("version").and_then(|n| n.as_u64()))
            .unwrap_or(0)
    } else {
        0
    };

    if local_version >= remote.version as u64 {
        // Return cached manifest with local paths resolved
        if manifest_path.exists() {
            let cached = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
            return serde_json::from_str(&cached).map_err(|e| e.to_string());
        }
    }

    // Download all assets
    let mut manifest = remote;

    for asset in &mut manifest.videos {
        let path = fetch_file(&client, &asset.url, &assets_dir, &asset.id, "mp4").await?;
        asset.local_path = Some(path.to_string_lossy().into_owned());
    }
    for asset in &mut manifest.music {
        let path = fetch_file(&client, &asset.url, &assets_dir, &asset.id, "mp3").await?;
        asset.local_path = Some(path.to_string_lossy().into_owned());
    }
    for asset in &mut manifest.ambients {
        let path = fetch_file(&client, &asset.url, &assets_dir, &asset.id, "mp3").await?;
        asset.local_path = Some(path.to_string_lossy().into_owned());
    }

    // Persist manifest with local paths
    let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(&manifest_path, json).map_err(|e| e.to_string())?;

    Ok(manifest)
}

async fn fetch_file(
    client: &reqwest::Client,
    url: &str,
    dir: &Path,
    id: &str,
    ext: &str,
) -> Result<PathBuf, String> {
    let path = dir.join(format!("{}.{}", id, ext));
    if path.exists() {
        return Ok(path);
    }
    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path)
}
