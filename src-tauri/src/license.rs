/// Stub — Polar.sh license validation to be implemented later.
#[tauri::command]
pub async fn validate_license(_key: String) -> Result<bool, String> {
    Ok(true)
}
