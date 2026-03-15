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
