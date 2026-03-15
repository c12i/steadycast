import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import AppHeader from "./components/AppHeader";
import AssetPicker from "./components/AssetPicker";
import StreamConfig from "./components/StreamConfig";
import SettingsPanel from "./components/SettingsPanel";
import { useSynth } from "./hooks/useSynth";

import {
  AppSettings,
  CacheStats,
  Platform,
  Preferences,
  Preset,
  StreamStatus,
  TrackChangedPayload,
  UserAsset,
} from "./types";

const POLL_INTERVAL_MS = 2000;

const DEFAULT_SETTINGS: AppSettings = {
  video_bitrate: "4500k",
  audio_bitrate: "192k",
  frame_rate: 30,
  encoding_preset: "veryfast",
  default_platform: "youtube",
  music_volume: 0.8,
  ambient_volume: 0.5,
};
const DEFAULT_CACHE: CacheStats = {
  total_bytes: 0,
  music_bytes: 0,
  ambient_bytes: 0,
  video_bytes: 0,
  total_files: 0,
};

export default function App() {
  // ── Data ───────────────────────────────────────────────────────────────────
  const [presets, setPresets]           = useState<Preset[]>([]);
  const [userAssets, setUserAssets]     = useState<UserAsset[]>([]);
  const [settings, setSettings]         = useState<AppSettings>(DEFAULT_SETTINGS);
  const [cacheStats, setCacheStats]     = useState<CacheStats>(DEFAULT_CACHE);

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedVideo, setSelectedVideo]   = useState<UserAsset | null>(null);
  const [selectedMusic, setSelectedMusic]   = useState<UserAsset[]>([]);
  const [selectedAmbient, setSelectedAmbient] = useState<UserAsset | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  // ── Stream ─────────────────────────────────────────────────────────────────
  const [status, setStatus]         = useState<StreamStatus>({ is_running: false, elapsed_seconds: 0, current_track_index: 0 });
  const [streamError, setStreamError] = useState<string | null>(null);
  const [platform, setPlatform]     = useState<Platform>("youtube");
  const [streamKey, setStreamKey]   = useState("");
  const [streamKeys, setStreamKeys] = useState<{ youtube: string; twitch: string }>({ youtube: "", twitch: "" });
  const [musicVolume, setMusicVolume]   = useState(0.8);
  const [ambientVolume, setAmbientVolume] = useState(0.5);
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(undefined);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Synthesizer ────────────────────────────────────────────────────────────
  const synth = useSynth({
    onTrackSaved: (asset) => setSelectedMusic((prev) => [...prev, asset]),
    onAssetsChanged: async () => {
      const ua = await invoke<UserAsset[]>("get_user_assets").catch(() => [] as UserAsset[]);
      setUserAssets(ua);
    },
  });

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadPresets      = useCallback(async () => {
    try { setPresets(await invoke<Preset[]>("get_presets")); } catch (_) {}
  }, []);

  const loadUserAssets   = useCallback(async () => {
    try { setUserAssets(await invoke<UserAsset[]>("get_user_assets")); } catch (_) {}
  }, []);

  const loadCacheStats   = useCallback(async () => {
    try { setCacheStats(await invoke<CacheStats>("get_cache_stats")); } catch (_) {}
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    loadPresets();
    loadUserAssets();
    loadCacheStats();

    invoke<AppSettings>("get_settings").then((s) => {
      setSettings(s);
      setMusicVolume(s.music_volume);
      setAmbientVolume(s.ambient_volume);
      setPlatform(s.default_platform as Platform);
    }).catch(() => {});

    invoke<Preferences>("get_preferences").then((prefs) => {
      setPlatform(prefs.default_platform as Platform);
      setMusicVolume(prefs.music_volume);
      setAmbientVolume(prefs.ambient_volume);
    }).catch(() => {});

    invoke<string>("get_stream_key", { platform: "youtube" }).then((key) => {
      if (key) { setStreamKey(key); setStreamKeys((p) => ({ ...p, youtube: key })); }
    }).catch(() => {});

    invoke<string>("get_stream_key", { platform: "twitch" }).then((key) => {
      if (key) setStreamKeys((p) => ({ ...p, twitch: key }));
    }).catch(() => {});
  }, [loadPresets, loadUserAssets, loadCacheStats]);

  // ── Stream status polling & events ────────────────────────────────────────

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await invoke<StreamStatus>("stream_status");
        setStatus(s);
        setCurrentTrackIndex(s.current_track_index);
      } catch (_) {}
    }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<TrackChangedPayload>("track-changed", (e) => {
      setCurrentTrackIndex(e.payload.track_index);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // ── Asset handlers ────────────────────────────────────────────────────────

  const handleToggleMusic = useCallback((asset: UserAsset) => {
    setSelectedMusic((prev) => {
      const idx = prev.findIndex((m) => m.id === asset.id);
      return idx === -1 ? [...prev, asset] : prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleUploadAsset = useCallback(async (type: "video" | "music" | "ambient") => {
    const videoFilters = [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv"] }];
    const audioFilters = [{ name: "Audio", extensions: ["mp3", "wav", "flac", "m4a", "ogg"] }];
    try {
      const selected = await open({ multiple: false, filters: type === "video" ? videoFilters : audioFilters });
      if (!selected || Array.isArray(selected)) return;
      const fileName = (selected as string).split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Untitled";
      await invoke("add_user_asset", { sourcePath: selected, assetType: type, name: fileName });
      await loadUserAssets();
    } catch (_) {}
  }, [loadUserAssets]);

  const handleDeleteUserAsset = useCallback(async (id: string) => {
    try {
      await invoke("delete_user_asset", { id });
      await loadUserAssets();
      setSelectedMusic((prev) => prev.filter((m) => m.id !== id));
      setSelectedVideo((prev) => prev?.id === id ? null : prev);
      setSelectedAmbient((prev) => prev?.id === id ? null : prev);
    } catch (_) {}
  }, [loadUserAssets]);

  // ── Preset handlers ───────────────────────────────────────────────────────

  const handleApplyPreset = useCallback((preset: Preset) => {
    setSelectedVideo(preset.video_id ? (userAssets.find((a) => a.id === preset.video_id) ?? null) : null);
    setSelectedMusic(preset.music_ids.map((id) => userAssets.find((a) => a.id === id)).filter((a): a is UserAsset => !!a));
    setSelectedAmbient(preset.ambient_id ? (userAssets.find((a) => a.id === preset.ambient_id) ?? null) : null);
  }, [userAssets]);

  const handleSavePreset = useCallback(async (name: string) => {
    try {
      await invoke("save_preset", { name, description: null, videoId: selectedVideo?.id ?? null, musicIds: selectedMusic.map((m) => m.id), ambientId: selectedAmbient?.id ?? null });
      await loadPresets();
    } catch (_) {}
  }, [selectedVideo, selectedMusic, selectedAmbient, loadPresets]);

  const handleDeletePreset = useCallback(async (id: string) => {
    try { await invoke("delete_preset", { id }); await loadPresets(); } catch (_) {}
  }, [loadPresets]);

  const handleImportPresetUrl = useCallback(async (url: string) => {
    try { await invoke("import_preset_from_url", { url }); await loadPresets(); } catch (_) {}
  }, [loadPresets]);

  // ── Settings & stream key handlers ────────────────────────────────────────

  const handleSaveSettings = useCallback(async (s: AppSettings) => {
    try {
      await invoke("save_settings", { settings: s });
      setSettings(s);
      setMusicVolume(s.music_volume);
      setAmbientVolume(s.ambient_volume);
    } catch (_) {}
  }, []);

  const handleClearCache = useCallback(async (type?: string) => {
    try {
      await invoke("clear_cache", { assetType: type ?? null });
      await loadCacheStats();
    } catch (_) {}
  }, [loadCacheStats]);

  const handleSaveStreamKey = useCallback(async (p: "youtube" | "twitch", key: string) => {
    try {
      await invoke("save_stream_key", { platform: p, key });
      setStreamKeys((prev) => ({ ...prev, [p]: key }));
      if (p === platform) setStreamKey(key);
    } catch (_) {}
  }, [platform]);

  // ── Stream control ────────────────────────────────────────────────────────

  const handleStartStream = useCallback(async () => {
    if (!selectedVideo?.local_path) { setStreamError("Select a downloaded video loop first."); return; }
    if (selectedMusic.length === 0) {
      setStreamError("Select or generate at least one music track.");
      return;
    }
    if (selectedMusic.some((m) => !m.local_path)) { setStreamError("Some music tracks are not downloaded yet."); return; }
    if (!streamKey.trim()) { setStreamError("Enter your stream key."); return; }

    setStreamError(null);
    setCurrentTrackIndex(0);
    await synth.stopPreview();

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
    } catch (e) { setStreamError(String(e)); }
  }, [selectedVideo, selectedMusic, selectedAmbient, streamKey, musicVolume, ambientVolume, platform, durationSeconds, synth]);

  const handleStopStream = useCallback(async () => {
    try { await invoke("stop_stream"); setStreamError(null); }
    catch (e) { setStreamError(String(e)); }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        status={status}
        onStart={handleStartStream}
        onStop={handleStopStream}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {streamError && (
        <div className="px-5 py-2 bg-red-950 border-b border-red-800 text-red-300 text-xs">
          {streamError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden border-r border-zinc-800 flex flex-col">
          <AssetPicker
            presets={presets}
            userAssets={userAssets}
            selectedVideo={selectedVideo}
            selectedMusic={selectedMusic}
            selectedAmbient={selectedAmbient}
            currentTrackIndex={currentTrackIndex}
            isStreaming={status.is_running}
            onSelectVideo={setSelectedVideo}
            onToggleMusic={handleToggleMusic}
            onSelectAmbient={setSelectedAmbient}
            onApplyPreset={handleApplyPreset}
            onSavePreset={handleSavePreset}
            onDeletePreset={handleDeletePreset}
            onImportPresetUrl={handleImportPresetUrl}
            onUploadAsset={handleUploadAsset}
            onDeleteUserAsset={handleDeleteUserAsset}
            synthConfig={synth.config}
            synthPreviewing={synth.previewing}
            renderJobs={synth.renderJobs}
            onSynthConfigChange={synth.updateConfig}
            onSynthRegenerate={synth.regenerate}
            onToggleSynthPreview={synth.togglePreview}
            onGenerateTrack={synth.generateTrack}
            onToggleSynthTrack={handleToggleMusic}
            onRandomizeSynth={synth.applyConfig}
            onRenameSynthTrack={synth.renameTrack}
          />
        </div>

        <div className="w-80 shrink-0 overflow-y-auto">
          <StreamConfig
            platform={platform}
            streamKey={streamKey}
            musicVolume={musicVolume}
            ambientVolume={ambientVolume}
            durationSeconds={durationSeconds}
            isStreaming={status.is_running}
            onPlatformChange={(p) => {
              setPlatform(p);
              setStreamKey(p === "youtube" ? streamKeys.youtube : streamKeys.twitch);
            }}
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

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        cacheStats={cacheStats}
        userAssets={userAssets}
        streamKeys={streamKeys}
        onSaveSettings={handleSaveSettings}
        onClearCache={handleClearCache}
        onRevealCache={() => invoke("reveal_cache_folder").catch(() => {})}
        onDeleteUserAsset={handleDeleteUserAsset}
        onSaveStreamKey={handleSaveStreamKey}
      />
    </div>
  );
}
