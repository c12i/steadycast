//! Database bootstrap — connection wrapper and schema initialisation.
//! All query logic lives in the feature modules (keys, settings, library, …).

use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;

/// Tauri-managed state that provides thread-safe access to the SQLite connection.
pub struct DbState(pub Mutex<Connection>);

pub fn init_db(app_data_dir: &Path) -> Result<Connection> {
    let conn = Connection::open(app_data_dir.join("lofi_stream.db"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stream_keys (
            platform TEXT PRIMARY KEY,
            key      TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS preferences (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cached_assets (
            id              TEXT PRIMARY KEY,
            asset_type      TEXT NOT NULL,
            source          TEXT NOT NULL,
            name            TEXT NOT NULL,
            local_path      TEXT NOT NULL,
            file_size_bytes INTEGER,
            cached_at       INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS presets (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            video_id    TEXT,
            music_ids   TEXT NOT NULL,
            ambient_id  TEXT,
            source_url  TEXT,
            is_builtin  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL
        );",
    )?;
    Ok(conn)
}
