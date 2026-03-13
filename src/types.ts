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
