// ── Legacy manifest types (kept for backward compat) ─────────────────────────

export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  thumbnail_url: string;
  local_path?: string;
}

export interface MusicAsset {
  id: string;
  name: string;
  url: string;
  preview_url: string;
  local_path?: string;
}

export interface AmbientAsset {
  id: string;
  name: string;
  url: string;
  preview_url: string;
  local_path?: string;
}

export interface AssetManifest {
  version: number;
  videos: VideoAsset[];
  music: MusicAsset[];
  ambients: AmbientAsset[];
}

// ── Library catalog ───────────────────────────────────────────────────────────

export interface CatalogAsset {
  id: string;
  name: string;
  artist: string | null;
  genre: string | null;
  category: string | null;
  asset_type: "video" | "music" | "ambient";
  duration_seconds: number | null;
  url: string;
  preview_url: string | null;
  thumbnail_url: string | null;
  source_platform: string;
  license: string;
  tags: string[];
  // Populated once downloaded
  local_path?: string;
  file_size_bytes?: number;
}

export interface LibraryResponse {
  version: number;
  music: CatalogAsset[];
  ambient: CatalogAsset[];
  video: CatalogAsset[];
}

// ── User assets ───────────────────────────────────────────────────────────────

export interface UserAsset {
  id: string;
  name: string;
  asset_type: "video" | "music" | "ambient";
  local_path: string;
  file_size_bytes?: number;
  cached_at: number;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  name: string;
  description: string | null;
  video_id: string | null;
  music_ids: string[];
  ambient_id: string | null;
  source_url: string | null;
  is_builtin: boolean;
  created_at: number;
}

export interface ShareableManifest {
  version: number;
  name: string;
  description: string | null;
  preset: {
    video_id: string | null;
    music_ids: string[];
    ambient_id: string | null;
  };
  custom_assets: Array<{
    id: string;
    asset_type: string;
    name: string;
    url: string;
    license: string;
  }>;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  video_bitrate: string;
  audio_bitrate: string;
  frame_rate: number;
  encoding_preset: string;
  default_platform: string;
  music_volume: number;
  ambient_volume: number;
}

export interface CacheStats {
  total_bytes: number;
  music_bytes: number;
  ambient_bytes: number;
  video_bytes: number;
  total_files: number;
}

// ── Stream ────────────────────────────────────────────────────────────────────

export type Platform = "youtube" | "twitch";

export interface StreamConfig {
  video_path: string;
  music_path: string;
  music_playlist: string[];
  ambient_path?: string;
  music_volume: number;
  ambient_volume: number;
  platform: Platform;
  stream_key: string;
  duration_seconds?: number;
}

export type AudioMode = "library" | "synthetic";

export interface RenderJob {
  id: string;
  label: string;
  progress: number; // 0..1
}

export interface StreamStatus {
  is_running: boolean;
  elapsed_seconds: number;
  current_track_index: number;
}

export interface TrackChangedPayload {
  track_index: number;
  music_path: string;
}

export interface Preferences {
  default_platform: string;
  music_volume: number;
  ambient_volume: number;
}
