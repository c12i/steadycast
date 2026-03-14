import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import AssetPicker from "./components/AssetPicker";
import StreamConfig from "./components/StreamConfig";
import StatusBar from "./components/StatusBar";
import SettingsPanel from "./components/SettingsPanel";
import { SyntheticEngine, SynthConfig, renderSynthTrack, VIBE_DEFAULT_BPM } from "./lib/SyntheticEngine";
import {
  AppSettings,
  AudioMode,
  CacheStats,
  CatalogAsset,
  LibraryResponse,
  Platform,
  Preferences,
  Preset,
  RenderJob,
  StreamStatus,
  TrackChangedPayload,
  UserAsset,
} from "./types";

const POLL_INTERVAL_MS = 2000;

const EMPTY_LIBRARY: LibraryResponse = { version: 0, music: [], ambient: [], video: [] };
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
  const [library, setLibrary] = useState<LibraryResponse>(EMPTY_LIBRARY);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [userAssets, setUserAssets] = useState<UserAsset[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [cacheStats, setCacheStats] = useState<CacheStats>(DEFAULT_CACHE);

  const [selectedVideo, setSelectedVideo] = useState<CatalogAsset | UserAsset | null>(null);
  const [selectedMusic, setSelectedMusic] = useState<(CatalogAsset | UserAsset)[]>([]);
  const [selectedAmbient, setSelectedAmbient] = useState<CatalogAsset | UserAsset | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  const [platform, setPlatform] = useState<Platform>("youtube");
  const [streamKey, setStreamKey] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.8);
  const [ambientVolume, setAmbientVolume] = useState(0.5);
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(undefined);

  const [audioMode, setAudioMode] = useState<AudioMode>("library");
  const [synthConfig, setSynthConfig] = useState<SynthConfig>({
    vibe: "Melancholy",
    bpm: VIBE_DEFAULT_BPM["Melancholy"],
    density: "Medium",
    instrument: "Piano",
    drums: {
      enabled: true,
      pattern: "boom-bap",
      kick: true,
      snare: true,
      hihat: true,
    },
  });
  const synthPreviewEngineRef = useRef<SyntheticEngine | null>(null);
  const [synthPreviewing, setSynthPreviewing] = useState(false);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const renderQueueRef = useRef<Array<() => Promise<void>>>([]);
  const renderRunningRef = useRef(false);

  const [status, setStatus] = useState<StreamStatus>({
    is_running: false,
    elapsed_seconds: 0,
    current_track_index: 0,
  });
  const [streamError, setStreamError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streamKeys, setStreamKeys] = useState<{ youtube: string; twitch: string }>({
    youtube: "",
    twitch: "",
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const lib = await invoke<LibraryResponse>("get_library");
      setLibrary(lib);
    } catch (_) {}
    finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      const p = await invoke<Preset[]>("get_presets");
      setPresets(p);
    } catch (_) {}
  }, []);

  const loadUserAssets = useCallback(async () => {
    try {
      const ua = await invoke<UserAsset[]>("get_user_assets");
      setUserAssets(ua);
    } catch (_) {}
  }, []);

  const loadCacheStats = useCallback(async () => {
    try {
      const cs = await invoke<CacheStats>("get_cache_stats");
      setCacheStats(cs);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadLibrary();
    loadPresets();
    loadUserAssets();
    loadCacheStats();

    invoke<AppSettings>("get_settings")
      .then((s) => {
        setSettings(s);
        setMusicVolume(s.music_volume);
        setAmbientVolume(s.ambient_volume);
        setPlatform(s.default_platform as Platform);
      })
      .catch(() => {});

    invoke<Preferences>("get_preferences")
      .then((prefs) => {
        setPlatform(prefs.default_platform as Platform);
        setMusicVolume(prefs.music_volume);
        setAmbientVolume(prefs.ambient_volume);
      })
      .catch(() => {});

    invoke<string>("get_stream_key", { platform: "youtube" })
      .then((key) => {
        if (key) {
          setStreamKey(key);
          setStreamKeys((prev) => ({ ...prev, youtube: key }));
        }
      })
      .catch(() => {});

    invoke<string>("get_stream_key", { platform: "twitch" })
      .then((key) => {
        if (key) setStreamKeys((prev) => ({ ...prev, twitch: key }));
      })
      .catch(() => {});
  }, [loadLibrary, loadPresets, loadUserAssets, loadCacheStats]);

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<TrackChangedPayload>("track-changed", (event) => {
      setCurrentTrackIndex(event.payload.track_index);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const handleDownloadAsset = useCallback(async (id: string): Promise<string> => {
    const path = await invoke<string>("download_asset", { id });
    await loadLibrary();
    return path;
  }, [loadLibrary]);

  const handleToggleMusic = useCallback((asset: CatalogAsset | UserAsset) => {
    setSelectedMusic((prev) => {
      const idx = prev.findIndex((m) => m.id === asset.id);
      if (idx === -1) return [...prev, asset];
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleApplyPreset = useCallback(
    (preset: Preset) => {
      const allAssets = [
        ...library.video,
        ...library.music,
        ...library.ambient,
        ...userAssets,
      ];

      if (preset.video_id) {
        const v = allAssets.find((a) => a.id === preset.video_id);
        if (v) setSelectedVideo(v as CatalogAsset | UserAsset);
      } else {
        setSelectedVideo(null);
      }

      const music = preset.music_ids
        .map((id) => allAssets.find((a) => a.id === id))
        .filter((a): a is CatalogAsset | UserAsset => a !== undefined);
      setSelectedMusic(music);

      if (preset.ambient_id) {
        const amb = allAssets.find((a) => a.id === preset.ambient_id);
        if (amb) setSelectedAmbient(amb as CatalogAsset | UserAsset);
        else setSelectedAmbient(null);
      } else {
        setSelectedAmbient(null);
      }
    },
    [library, userAssets]
  );

  const handleSavePreset = useCallback(
    async (name: string) => {
      try {
        await invoke("save_preset", {
          name,
          description: null,
          videoId: selectedVideo?.id ?? null,
          musicIds: selectedMusic.map((m) => m.id),
          ambientId: selectedAmbient?.id ?? null,
        });
        await loadPresets();
      } catch (_) {}
    },
    [selectedVideo, selectedMusic, selectedAmbient, loadPresets]
  );

  const handleDeletePreset = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_preset", { id });
        await loadPresets();
      } catch (_) {}
    },
    [loadPresets]
  );

  const handleImportPresetUrl = useCallback(
    async (url: string) => {
      try {
        await invoke("import_preset_from_url", { url });
        await Promise.all([loadPresets(), loadLibrary()]);
      } catch (_) {}
    },
    [loadPresets, loadLibrary]
  );

  const handleUploadAsset = useCallback(
    async (type: "video" | "music" | "ambient") => {
      const videoFilters = [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv"] }];
      const audioFilters = [{ name: "Audio", extensions: ["mp3", "wav", "flac", "m4a", "ogg"] }];
      const filters = type === "video" ? videoFilters : audioFilters;

      try {
        const selected = await open({ multiple: false, filters });
        if (!selected || Array.isArray(selected)) return;
        // Derive a human-readable name from the filename
        const fileName = (selected as string).split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Untitled";
        await invoke("add_user_asset", { sourcePath: selected, assetType: type, name: fileName });
        await loadUserAssets();
      } catch (_) {}
    },
    [loadUserAssets]
  );

  const handleDeleteUserAsset = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_user_asset", { id });
        await loadUserAssets();
        setSelectedMusic((prev) => prev.filter((m) => m.id !== id));
        setSelectedVideo((prev) => (prev?.id === id ? null : prev));
        setSelectedAmbient((prev) => (prev?.id === id ? null : prev));
      } catch (_) {}
    },
    [loadUserAssets]
  );

  const handleSaveSettings = useCallback(async (s: AppSettings) => {
    try {
      await invoke("save_settings", { settings: s });
      setSettings(s);
      setMusicVolume(s.music_volume);
      setAmbientVolume(s.ambient_volume);
    } catch (_) {}
  }, []);

  const handleClearCache = useCallback(
    async (type?: string) => {
      try {
        await invoke("clear_cache", { assetType: type ?? null });
        await Promise.all([loadCacheStats(), loadLibrary()]);
      } catch (_) {}
    },
    [loadCacheStats, loadLibrary]
  );

  const handleSaveStreamKey = useCallback(
    async (p: "youtube" | "twitch", key: string) => {
      try {
        await invoke("save_stream_key", { platform: p, key });
        setStreamKeys((prev) => ({ ...prev, [p]: key }));
        if (p === platform) setStreamKey(key);
      } catch (_) {}
    },
    [platform]
  );

  const handleStartStream = useCallback(async () => {
    if (!selectedVideo?.local_path) {
      setStreamError("Select a downloaded video loop first.");
      return;
    }
    if (selectedMusic.length === 0) {
      setStreamError(
        audioMode === "synthetic"
          ? "Generate some tracks first — use the Generate button in Synthetic Mode."
          : "Select at least one music track."
      );
      return;
    }
    const undownloaded = selectedMusic.filter((m) => !m.local_path);
    if (undownloaded.length > 0) {
      setStreamError("Some music tracks are not downloaded yet.");
      return;
    }
    if (!streamKey.trim()) {
      setStreamError("Enter your stream key.");
      return;
    }
    setStreamError(null);
    setCurrentTrackIndex(0);

    // Stop any running preview before going live
    if (synthPreviewEngineRef.current) {
      await synthPreviewEngineRef.current.stopPreview();
      synthPreviewEngineRef.current = null;
      setSynthPreviewing(false);
    }

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
  }, [
    selectedVideo,
    selectedMusic,
    selectedAmbient,
    streamKey,
    musicVolume,
    ambientVolume,
    platform,
    durationSeconds,
    audioMode,
  ]);

  const handleStopStream = useCallback(async () => {
    try {
      await invoke("stop_stream");
      setStreamError(null);
    } catch (e) {
      setStreamError(String(e));
    }
  }, []);

  const handleSynthRegenerate = useCallback(() => {
    synthPreviewEngineRef.current?.regenerate();
  }, []);

  const handleSynthConfigChange = useCallback((partial: Partial<SynthConfig>) => {
    setSynthConfig((prev) => {
      let next: SynthConfig;
      if (partial.drums) {
        next = { ...prev, drums: { ...prev.drums, ...partial.drums } };
      } else {
        // When vibe changes, snap BPM to that vibe's default feel
        next = partial.vibe
          ? { ...prev, ...partial, bpm: VIBE_DEFAULT_BPM[partial.vibe] }
          : { ...prev, ...partial };
      }
      synthPreviewEngineRef.current?.updateConfig(partial);
      return next;
    });
  }, []);

  const handleRandomizeSynth = useCallback((newConfig: SynthConfig) => {
    setSynthConfig(newConfig);
    synthPreviewEngineRef.current?.updateConfig(newConfig);
  }, []);

  const handleToggleSynthPreview = useCallback(async () => {
    if (synthPreviewing) {
      await synthPreviewEngineRef.current?.stopPreview();
      synthPreviewEngineRef.current = null;
      setSynthPreviewing(false);
    } else {
      const engine = new SyntheticEngine(synthConfig);
      synthPreviewEngineRef.current = engine;
      await engine.startPreview();
      setSynthPreviewing(true);
    }
  }, [synthPreviewing, synthConfig]);

  const _drainRenderQueue = useCallback(async () => {
    if (renderRunningRef.current) return;
    renderRunningRef.current = true;
    while (renderQueueRef.current.length > 0) {
      const task = renderQueueRef.current.shift()!;
      await task();
    }
    renderRunningRef.current = false;
  }, []);

  const handleGenerateTrack = useCallback((durationSeconds: number) => {
    const jobId = `render-${Date.now()}-${Math.random()}`;
    const name = `Synth ${synthConfig.vibe}`;
    // Snapshot config at queue time so changes don't affect in-flight renders
    const configSnapshot = { ...synthConfig, drums: { ...synthConfig.drums } };

    setRenderJobs((prev) => [...prev, { id: jobId, label: name, progress: 0 }]);

    renderQueueRef.current.push(async () => {
      try {
        const { b64 } = await renderSynthTrack(configSnapshot, durationSeconds, (p) => {
          setRenderJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, progress: p } : j));
        });
        const asset = await invoke<UserAsset>("save_synth_track", { wavB64: b64, name });
        await loadUserAssets();
        setSelectedMusic((prev) => [...prev, asset]);
      } catch (e) {
        console.error("Track generation failed:", e);
      } finally {
        setRenderJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    });

    _drainRenderQueue();
  }, [synthConfig, loadUserAssets, _drainRenderQueue]);

  const handleRenameTrack = useCallback(async (id: string, name: string) => {
    try {
      await invoke("rename_user_asset", { id, name });
      await loadUserAssets();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  }, [loadUserAssets]);

  const handleOpenPreview = useCallback(async () => {
    try { await invoke("open_preview_window"); } catch (_) {}
  }, []);

  const handleOpenLogs = useCallback(async () => {
    try { await invoke("open_logs_window"); } catch (_) {}
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
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <StatusBar status={status} onStart={handleStartStream} onStop={handleStopStream} />
        </div>
      </header>

      {/* Error banner */}
      {streamError && (
        <div className="px-5 py-2 bg-red-950 border-b border-red-800 text-red-300 text-xs">
          {streamError}
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Asset Picker */}
        <div className="flex-1 overflow-hidden border-r border-zinc-800 flex flex-col">
          <AssetPicker
            library={library}
            libraryLoading={libraryLoading}
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
            onDownloadAsset={handleDownloadAsset}
            audioMode={audioMode}
            synthConfig={synthConfig}
            synthPreviewing={synthPreviewing}
            renderJobs={renderJobs}
            onAudioModeChange={setAudioMode}
            onSynthConfigChange={handleSynthConfigChange}
            onSynthRegenerate={handleSynthRegenerate}
            onToggleSynthPreview={handleToggleSynthPreview}
            onGenerateTrack={handleGenerateTrack}
            onToggleSynthTrack={handleToggleMusic}
            onRandomizeSynth={handleRandomizeSynth}
            onRenameSynthTrack={handleRenameTrack}
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
            onPlatformChange={(p) => {
              setPlatform(p);
              const key = p === "youtube" ? streamKeys.youtube : streamKeys.twitch;
              setStreamKey(key);
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

      {/* Settings panel */}
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
