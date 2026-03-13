import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import AssetPicker from "./components/AssetPicker";
import StreamConfig from "./components/StreamConfig";
import StatusBar from "./components/StatusBar";
import {
  AssetManifest,
  Platform,
  Preferences,
  StreamStatus,
  TrackChangedPayload,
  VideoAsset,
  MusicAsset,
  AmbientAsset,
} from "./types";

const POLL_INTERVAL_MS = 2000;

const EMPTY_MANIFEST: AssetManifest = { version: 0, videos: [], music: [], ambients: [] };

export default function App() {
  const [manifest, setManifest] = useState<AssetManifest>(EMPTY_MANIFEST);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<VideoAsset | null>(null);
  // Ordered playlist — the order reflects the streaming sequence.
  const [selectedMusic, setSelectedMusic] = useState<MusicAsset[]>([]);
  const [selectedAmbient, setSelectedAmbient] = useState<AmbientAsset | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  const [platform, setPlatform] = useState<Platform>("youtube");
  const [streamKey, setStreamKey] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.8);
  const [ambientVolume, setAmbientVolume] = useState(0.5);
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(undefined);

  const [status, setStatus] = useState<StreamStatus>({
    is_running: false,
    elapsed_seconds: 0,
    current_track_index: 0,
  });
  const [streamError, setStreamError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load preferences on mount.
  useEffect(() => {
    invoke<Preferences>("get_preferences").then((prefs) => {
      setPlatform(prefs.default_platform as Platform);
      setMusicVolume(prefs.music_volume);
      setAmbientVolume(prefs.ambient_volume);
    });

    invoke<string>("get_stream_key", { platform: "youtube" })
      .then((key) => { if (key) setStreamKey(key); })
      .catch(() => {});
  }, []);

  // Poll stream status.
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await invoke<StreamStatus>("stream_status");
        setStatus(s);
        setCurrentTrackIndex(s.current_track_index);
      } catch (_) {}
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Listen for real-time track-changed events from the Rust monitor task.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<TrackChangedPayload>("track-changed", (event) => {
      setCurrentTrackIndex(event.payload.track_index);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const handleDownloadAssets = useCallback(async (manifestUrl: string) => {
    setLoadingAssets(true);
    setAssetError(null);
    try {
      const m = await invoke<AssetManifest>("download_assets", { manifestUrl });
      setManifest(m);
    } catch (e) {
      setAssetError(String(e));
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  // Toggle a music track in/out of the ordered playlist.
  const handleToggleMusic = useCallback((track: MusicAsset) => {
    setSelectedMusic((prev) => {
      const idx = prev.findIndex((m) => m.id === track.id);
      if (idx === -1) return [...prev, track];
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleStartStream = useCallback(async () => {
    if (!selectedVideo?.local_path) {
      setStreamError("Select a video loop first.");
      return;
    }
    if (selectedMusic.length === 0 || !selectedMusic[0].local_path) {
      setStreamError("Select at least one music track.");
      return;
    }
    if (!streamKey.trim()) {
      setStreamError("Enter your stream key.");
      return;
    }
    setStreamError(null);
    setCurrentTrackIndex(0);
    try {
      const playlist = selectedMusic.map((m) => m.local_path!);
      await invoke("start_stream", {
        config: {
          video_path: selectedVideo.local_path,
          music_path: playlist[0],
          music_playlist: playlist,
          ambient_path: selectedAmbient?.local_path ?? null,
          music_volume: musicVolume,
          ambient_volume: ambientVolume,
          platform,
          stream_key: streamKey,
          duration_seconds: durationSeconds ?? null,
        },
      });
    } catch (e) {
      setStreamError(String(e));
    }
  }, [selectedVideo, selectedMusic, selectedAmbient, streamKey, musicVolume, ambientVolume, platform, durationSeconds]);

  const handleStopStream = useCallback(async () => {
    try {
      await invoke("stop_stream");
      setStreamError(null);
    } catch (e) {
      setStreamError(String(e));
    }
  }, []);

  const handleOpenPreview = useCallback(async () => {
    try { await invoke("open_preview_window"); } catch (_) {}
  }, []);

  const handleOpenLogs = useCallback(async () => {
    try { await invoke("open_logs_window"); } catch (_) {}
  }, []);

  const handleSaveStreamKey = useCallback(async (p: Platform, key: string) => {
    try {
      await invoke("save_stream_key", { platform: p, key });
    } catch (_) {}
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-surface-raised shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="font-semibold text-sm tracking-wide text-zinc-100">Lofi Stream Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenPreview}
            title="Open stream preview window"
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handleOpenLogs}
            title="Open FFmpeg logs window"
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
          >
            Logs
          </button>
          <StatusBar status={status} onStart={handleStartStream} onStop={handleStopStream} />
        </div>
      </header>

      {/* Error banner */}
      {(streamError || assetError) && (
        <div className="px-5 py-2 bg-red-950 border-b border-red-800 text-red-300 text-xs">
          {streamError || assetError}
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Asset Picker */}
        <div className="flex-1 overflow-y-auto border-r border-zinc-800">
          <AssetPicker
            manifest={manifest}
            loading={loadingAssets}
            selectedVideo={selectedVideo}
            selectedMusic={selectedMusic}
            selectedAmbient={selectedAmbient}
            currentTrackIndex={currentTrackIndex}
            isStreaming={status.is_running}
            onSelectVideo={setSelectedVideo}
            onToggleMusic={handleToggleMusic}
            onSelectAmbient={setSelectedAmbient}
            onLoadManifest={handleDownloadAssets}
          />
        </div>

        {/* Stream Config */}
        <div className="w-80 shrink-0 overflow-y-auto">
          <StreamConfig
            platform={platform}
            streamKey={streamKey}
            musicVolume={musicVolume}
            ambientVolume={ambientVolume}
            durationSeconds={durationSeconds}
            isStreaming={status.is_running}
            onPlatformChange={setPlatform}
            onStreamKeyChange={(key) => {
              setStreamKey(key);
              handleSaveStreamKey(platform, key);
            }}
            onMusicVolumeChange={setMusicVolume}
            onAmbientVolumeChange={setAmbientVolume}
            onDurationChange={setDurationSeconds}
            onStart={handleStartStream}
            onStop={handleStopStream}
          />
        </div>
      </div>
    </div>
  );
}
