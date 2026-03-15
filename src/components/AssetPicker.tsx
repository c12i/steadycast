import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Preset, UserAsset } from "../types";
import SyntheticPanel from "./SyntheticPanel";
import { SynthConfig } from "../lib/SyntheticEngine";
import { AmbientType, AMBIENT_PRESETS } from "../lib/AmbientEngine";

type Tab = "presets" | "music" | "ambient" | "video";
type MusicSubTab = "synthesizer" | "library";
type LibraryFilter = "all" | "synthesized" | "uploaded";

interface Props {
  presets: Preset[];
  userAssets: UserAsset[];
  selectedVideo: UserAsset | null;
  selectedMusic: UserAsset[];
  selectedAmbient: UserAsset | null;
  currentTrackIndex: number;
  isStreaming: boolean;
  onSelectVideo: (v: UserAsset) => void;
  onToggleMusic: (m: UserAsset) => void;
  onSelectAmbient: (a: UserAsset | null) => void;
  onApplyPreset: (p: Preset) => void;
  onSavePreset: (name: string) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  onImportPresetUrl: (url: string) => void;
  onUploadAsset: (type: "video" | "music" | "ambient") => void;
  onDeleteUserAsset: (id: string) => void;
  // Ambient synthesis
  ambientPreviewingType: AmbientType | null;
  ambientRenderingType: AmbientType | null;
  ambientPreviewError: string | null;
  onToggleAmbientPreview: (type: AmbientType) => void;
  onUseAmbientPreset: (type: AmbientType) => void;
  // Synth music
  synthConfig: SynthConfig;
  synthPreviewing: boolean;
  onSynthConfigChange: (partial: Partial<SynthConfig>) => void;
  onToggleSynthPreview: () => void;
  onGenerateTrack: (durationSeconds: number) => void;
  onToggleSynthTrack: (asset: UserAsset) => void;
  onRandomizeSynth: (config: SynthConfig) => void;
  onRenameSynthTrack: (id: string, name: string) => void;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

export default function AssetPicker({
  presets,
  userAssets,
  selectedVideo,
  selectedMusic,
  selectedAmbient,
  currentTrackIndex,
  isStreaming,
  onSelectVideo,
  onToggleMusic,
  onSelectAmbient,
  onApplyPreset,
  onSavePreset,
  onRenamePreset,
  onDeletePreset,
  onImportPresetUrl,
  onUploadAsset,
  onDeleteUserAsset,
  ambientPreviewingType,
  ambientRenderingType,
  ambientPreviewError,
  onToggleAmbientPreview,
  onUseAmbientPreset,
  synthConfig,
  synthPreviewing,
  onSynthConfigChange,
  onToggleSynthPreview,
  onGenerateTrack,
  onToggleSynthTrack,
  onRandomizeSynth,
  onRenameSynthTrack,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("music");
  const [musicSubTab, setMusicSubTab] = useState<MusicSubTab>("library");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("lofi-fav-music");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  const [audioPreviewId, setAudioPreviewId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);
  const [savePresetName, setSavePresetName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteVideoId, setConfirmDeleteVideoId] = useState<string | null>(null);
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.addEventListener("timeupdate", () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setAudioProgress(audio.currentTime / audio.duration);
      }
    });
    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration)) setAudioDuration(audio.duration);
    });
    audio.addEventListener("play", () => setIsAudioPlaying(true));
    audio.addEventListener("pause", () => setIsAudioPlaying(false));
    audio.addEventListener("ended", () => {
      setAudioPreviewId(null);
      setIsAudioPlaying(false);
      setAudioProgress(0);
      setAudioDuration(0);
    });
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    if (isStreaming) {
      audioRef.current?.pause();
      setAudioPreviewId(null);
      setIsAudioPlaying(false);
      setAudioProgress(0);
      setVideoPreviewId(null);
    }
  }, [isStreaming]);

  const toggleAudio = useCallback(
    (e: React.MouseEvent, id: string, localPath?: string, previewUrl?: string | null) => {
      e.stopPropagation();
      const src = localPath ? convertFileSrc(localPath) : (previewUrl ?? null);
      if (!src || !audioRef.current) return;
      const audio = audioRef.current;
      if (audioPreviewId === id) {
        audio.paused ? audio.play() : audio.pause();
        return;
      }
      audio.src = src;
      audio.currentTime = 0;
      audio.play().catch(() => {});
      setAudioPreviewId(id);
      setAudioProgress(0);
      setAudioDuration(0);
    },
    [audioPreviewId]
  );

  const handleSeek = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration) || audio.duration === 0) return;
    audio.currentTime = fraction * audio.duration;
  }, []);

  const nowPlayingId =
    isStreaming && selectedMusic[currentTrackIndex] ? selectedMusic[currentTrackIndex].id : null;

  const musicPlaylistPos = (id: string): number | null => {
    const idx = selectedMusic.findIndex((m) => m.id === id);
    return idx === -1 ? null : idx + 1;
  };

  const userAssetsOfType = (type: "video" | "music" | "ambient") =>
    userAssets.filter((u) => u.asset_type === type);

  const popOutPresetPreview = useCallback(
    async (p: Preset) => {
      const videoAsset = p.video_id ? userAssets.find((a) => a.id === p.video_id) : null;
      const ambientAsset = p.ambient_id ? userAssets.find((a) => a.id === p.ambient_id) : null;
      if (!videoAsset?.local_path) return;
      const musicAssets = p.music_ids
        .map((id) => userAssets.find((a) => a.id === id))
        .filter((a): a is (typeof userAssets)[0] => !!a?.local_path);
      try {
        await invoke("set_preview_config", {
          config: {
            video_path: videoAsset.local_path,
            music_path: musicAssets[0]?.local_path ?? null,
            music_playlist: musicAssets.map((a) => a.local_path!),
            ambient_path: ambientAsset?.local_path ?? null,
            music_volume: 0.8,
            ambient_volume: 0.5,
          },
        });
        await invoke("open_preview_window");
      } catch (_) {}
    },
    [userAssets]
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem("lofi-fav-music", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 border-b border-zinc-800">
        {(["presets", "music", "ambient", "video"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`relative px-4 py-2.5 text-xs font-medium capitalize transition-colors ${
              activeTab === t
                ? "bg-zinc-800 text-zinc-100"
                : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
            {t === "music" && selectedMusic.length > 0 && (
              <span className="ml-1.5 rounded bg-purple-900 px-1 text-[10px] text-purple-300">
                {selectedMusic.length}
              </span>
            )}
          </button>
        ))}
        {isStreaming && (
          <div className="ml-auto flex items-center px-3">
            <span className="text-[10px] font-medium text-green-400">Stream running</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* ── Presets tab ─────────────────────────────────────────────────── */}
        {activeTab === "presets" && (
          <>
            {/* Import URL */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Preset manifest URL…"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (importUrl.trim()) {
                    onImportPresetUrl(importUrl.trim());
                    setImportUrl("");
                  }
                }}
                disabled={!importUrl.trim()}
                className="whitespace-nowrap rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
              >
                Import URL
              </button>
            </div>

            {/* Preset grid */}
            {presets.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-600">No presets yet.</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {presets.map((p) => {
                const videoAsset = p.video_id ? userAssets.find((a) => a.id === p.video_id) : null;
                const ambientAsset = p.ambient_id
                  ? userAssets.find((a) => a.id === p.ambient_id)
                  : null;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {renamingPresetId === p.id ? (
                            <input
                              autoFocus
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onBlur={() => setRenamingPresetId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const t = renameInput.trim();
                                  if (t && t !== p.name) onRenamePreset(p.id, t);
                                  setRenamingPresetId(null);
                                }
                                if (e.key === "Escape") setRenamingPresetId(null);
                              }}
                              className="min-w-0 flex-1 rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-purple-500"
                            />
                          ) : (
                            <span
                              className={`truncate text-sm font-medium text-zinc-200 ${!p.is_builtin ? "cursor-text hover:text-white" : ""}`}
                              title={!p.is_builtin ? "Click to rename" : undefined}
                              onClick={() => {
                                if (!p.is_builtin) {
                                  setRenamingPresetId(p.id);
                                  setRenameInput(p.name);
                                }
                              }}
                            >
                              {p.name}
                            </span>
                          )}
                          {p.is_builtin && (
                            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                              built-in
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                            {p.description}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {videoAsset && (
                            <span className="rounded bg-blue-950 px-1.5 py-0.5 text-[10px] text-blue-400">
                              vid: {videoAsset.name}
                            </span>
                          )}
                          {p.music_ids.length > 0 && (
                            <span className="rounded bg-purple-950 px-1.5 py-0.5 text-[10px] text-purple-400">
                              {p.music_ids.length} track{p.music_ids.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {ambientAsset && (
                            <span className="rounded bg-green-950 px-1.5 py-0.5 text-[10px] text-green-400">
                              amb: {ambientAsset.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => popOutPresetPreview(p)}
                          disabled={
                            !p.video_id || !userAssets.find((a) => a.id === p.video_id)?.local_path
                          }
                          title="Preview in separate window"
                          className="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:opacity-40"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => onApplyPreset(p)}
                          disabled={isStreaming}
                          className="rounded bg-purple-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-40"
                        >
                          Apply
                        </button>
                        {!p.is_builtin &&
                          (confirmDeleteId === p.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-zinc-400">Delete?</span>
                              <button
                                onClick={() => {
                                  onDeletePreset(p.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="rounded bg-red-800 px-2 py-1 text-xs text-red-200 transition-colors hover:bg-red-700"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-red-900 hover:text-red-400"
                            >
                              ✕
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save preset */}
            <div className="mt-1 border-t border-zinc-800 pt-3">
              <p className="mb-2 text-[11px] text-zinc-500">Save current selection as preset</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Preset name…"
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (savePresetName.trim()) {
                      onSavePreset(savePresetName.trim());
                      setSavePresetName("");
                    }
                  }}
                  disabled={!savePresetName.trim()}
                  className="rounded bg-purple-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Music tab ───────────────────────────────────────────────────── */}
        {activeTab === "music" && (
          <>
            {/* Sub-tab navigation */}
            <div className="mb-2 flex gap-1">
              {(["library", "synthesizer"] as MusicSubTab[]).map((st) => (
                <button
                  key={st}
                  onClick={() => setMusicSubTab(st)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    musicSubTab === st
                      ? "bg-zinc-700 text-zinc-100"
                      : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {st === "library"
                    ? `Library${userAssetsOfType("music").length > 0 ? ` (${userAssetsOfType("music").length})` : ""}`
                    : "Synthesizer (beta)"}
                </button>
              ))}
            </div>

            {/* Synthesizer sub-tab */}
            {musicSubTab === "synthesizer" && (
              <SyntheticPanel
                config={synthConfig}
                isStreaming={isStreaming}
                isPreviewing={synthPreviewing}
                synthTracks={userAssetsOfType("music").filter((a) => a.id.startsWith("synth-"))}
                selectedMusicIds={new Set(selectedMusic.map((m) => m.id))}
                onChange={onSynthConfigChange}
                onTogglePreview={onToggleSynthPreview}
                onGenerate={onGenerateTrack}
                onToggleTrack={onToggleSynthTrack}
                onDeleteTrack={onDeleteUserAsset}
                onRandomize={onRandomizeSynth}
                onRenameTrack={onRenameSynthTrack}
                hideTracks
              />
            )}

            {/* Library sub-tab */}
            {musicSubTab === "library" && (
              <>
                {/* Filter pills */}
                <div className="mb-2 flex gap-1.5">
                  {(["all", "synthesized", "uploaded"] as LibraryFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setLibraryFilter(f)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                        libraryFilter === f
                          ? "bg-purple-700 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {/* Track list — favorites float to top */}
                {(() => {
                  const allMusic = userAssetsOfType("music");
                  const filtered = allMusic.filter((a) => {
                    if (libraryFilter === "synthesized") return a.id.startsWith("synth-");
                    if (libraryFilter === "uploaded") return !a.id.startsWith("synth-");
                    return true;
                  });
                  const sorted = [
                    ...filtered.filter((a) => favoritedIds.has(a.id)),
                    ...filtered.filter((a) => !favoritedIds.has(a.id)),
                  ];
                  if (sorted.length === 0)
                    return (
                      <p className="py-8 text-center text-xs text-zinc-600">
                        {libraryFilter === "synthesized"
                          ? "No synthesized tracks yet — generate some in the Synthesizer tab."
                          : libraryFilter === "uploaded"
                            ? "No uploaded tracks yet."
                            : "No tracks yet."}
                      </p>
                    );
                  return (
                    <div className="space-y-2">
                      {sorted.map((ua) => {
                        const isSynth = ua.id.startsWith("synth-");
                        const pos = musicPlaylistPos(ua.id);
                        const isPrev = audioPreviewId === ua.id;
                        return (
                          <LibraryTrackRow
                            key={ua.id}
                            asset={ua}
                            isSynth={isSynth}
                            isInPlaylist={pos !== null}
                            isFavorited={favoritedIds.has(ua.id)}
                            isPreviewing={isPrev}
                            isPreviewPlaying={isPrev && isAudioPlaying}
                            previewProgress={isPrev ? audioProgress : 0}
                            duration={isPrev ? audioDuration : 0}
                            isNowPlaying={nowPlayingId === ua.id}
                            isStreaming={isStreaming}
                            onTogglePlaylist={() =>
                              isSynth ? onToggleSynthTrack(ua) : onToggleMusic(ua)
                            }
                            onPreview={(e) => toggleAudio(e, ua.id, ua.local_path)}
                            onSeek={handleSeek}
                            onFavorite={() => toggleFavorite(ua.id)}
                            onDelete={() => onDeleteUserAsset(ua.id)}
                            onRename={
                              isSynth ? (name) => onRenameSynthTrack(ua.id, name) : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })()}

                <button
                  onClick={() => onUploadAsset("music")}
                  className="mt-2 w-full rounded border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                >
                  + Upload Music
                </button>
              </>
            )}
          </>
        )}

        {/* ── Ambient tab ─────────────────────────────────────────────────── */}
        {activeTab === "ambient" && (
          <>
            {/* None */}
            <div
              onClick={() => !isStreaming && onSelectAmbient(null)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${
                isStreaming ? "cursor-default opacity-60" : "cursor-pointer"
              } ${
                selectedAmbient === null
                  ? "border-purple-500 bg-purple-950/20"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-sm">🔇</span>
              <span className="flex-1 text-xs font-medium text-zinc-300">None</span>
              {selectedAmbient === null && (
                <span className="text-[10px] font-bold text-purple-400">✓</span>
              )}
            </div>

            {/* Error banner */}
            {ambientPreviewError && (
              <p className="rounded border border-red-800 bg-red-950/40 px-2.5 py-1.5 text-[11px] text-red-400">
                {ambientPreviewError}
              </p>
            )}

            {/* Built-in presets */}
            <p className="mt-1 text-[11px] font-medium text-zinc-500">Built-in Sounds</p>
            {AMBIENT_PRESETS.map((preset) => {
              const isPreviewing = ambientPreviewingType === preset.id;
              const isRendering = ambientRenderingType === preset.id;
              return (
                <div
                  key={preset.id}
                  className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
                >
                  <button
                    onClick={() => onToggleAmbientPreview(preset.id)}
                    disabled={isStreaming}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30"
                  >
                    {isPreviewing ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200">{preset.label}</p>
                    <p className="text-[10px] text-zinc-500">{preset.description}</p>
                  </div>
                  <button
                    onClick={() => !isStreaming && !isRendering && onUseAmbientPreset(preset.id)}
                    disabled={isStreaming || !!ambientRenderingType}
                    className="shrink-0 rounded bg-purple-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-40"
                  >
                    {isRendering ? "…" : "Use"}
                  </button>
                </div>
              );
            })}

            {/* Rendered / uploaded ambient files */}
            {userAssetsOfType("ambient").length > 0 && (
              <>
                <p className="mt-2 text-[11px] font-medium text-zinc-500">My Files</p>
                {userAssetsOfType("ambient").map((ua) => {
                  const isSelected = selectedAmbient?.id === ua.id;
                  const isPreviewing = audioPreviewId === ua.id;
                  return (
                    <UserAssetRow
                      key={ua.id}
                      asset={ua}
                      isSelected={isSelected}
                      badge={isSelected ? "✓" : undefined}
                      isPreviewing={isPreviewing}
                      isPreviewPlaying={isPreviewing && isAudioPlaying}
                      previewProgress={isPreviewing ? audioProgress : 0}
                      isNowPlaying={false}
                      isStreaming={isStreaming}
                      onClick={() => onSelectAmbient(ua)}
                      onPreview={(e) => toggleAudio(e, ua.id, ua.local_path)}
                      onDelete={() => onDeleteUserAsset(ua.id)}
                    />
                  );
                })}
              </>
            )}

            <button
              onClick={() => onUploadAsset("ambient")}
              className="mt-2 w-full rounded border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300"
            >
              + Upload Ambient
            </button>
          </>
        )}

        {/* ── Video tab ───────────────────────────────────────────────────── */}
        {activeTab === "video" && (
          <>
            {userAssetsOfType("video").length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-600">
                No videos yet. Upload a video loop or still image to get started.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {userAssetsOfType("video").map((ua) => {
                const isSelected = selectedVideo?.id === ua.id;
                const isPreviewing = videoPreviewId === ua.id;
                return (
                  <div
                    key={ua.id}
                    className={`cursor-pointer overflow-hidden rounded-lg border transition-all ${
                      isSelected
                        ? "border-purple-500 bg-purple-950/20"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                    onClick={() => !isStreaming && onSelectVideo(ua)}
                  >
                    <div className="relative aspect-video bg-zinc-950">
                      {isImagePath(ua.local_path) ? (
                        <img
                          src={convertFileSrc(ua.local_path)}
                          className="h-full w-full object-cover"
                          alt={ua.name}
                        />
                      ) : (
                        <video
                          key={ua.id}
                          src={convertFileSrc(ua.local_path)}
                          muted
                          loop
                          preload="metadata"
                          autoPlay={isPreviewing}
                          className="h-full w-full object-cover"
                          ref={(el) => {
                            if (!el) return;
                            if (isPreviewing) {
                              el.play().catch(() => {});
                            } else {
                              el.pause();
                              el.currentTime = 0.1;
                            }
                          }}
                        />
                      )}
                      {isSelected && (
                        <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple-700">
                          <span className="text-[10px] font-bold text-white">✓</span>
                        </div>
                      )}
                      {!isImagePath(ua.local_path) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setVideoPreviewId(isPreviewing ? null : ua.id);
                          }}
                          className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/80 text-zinc-300 transition-colors hover:bg-zinc-800"
                        >
                          {isPreviewing ? <PauseIcon /> : <PlayIcon />}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-200">{ua.name}</p>
                        <p className="text-[10px] text-zinc-500">uploaded</p>
                      </div>
                      {confirmDeleteVideoId === ua.id ? (
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              onDeleteUserAsset(ua.id);
                              setConfirmDeleteVideoId(null);
                            }}
                            className="rounded bg-red-800 px-1.5 py-0.5 text-[10px] text-red-200 transition-colors hover:bg-red-700"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteVideoId(null)}
                            className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition-colors hover:bg-zinc-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteVideoId(ua.id);
                          }}
                          className="shrink-0 text-xs text-zinc-600 transition-colors hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => onUploadAsset("video")}
              className="mt-1 w-full rounded border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300"
            >
              + Upload Video / Image
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// LibraryTrackRow

function fmtDuration(s: number) {
  if (!s || !isFinite(s) || s <= 0) return "";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function isImagePath(path: string | undefined | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

function parseTrackName(name: string): { title: string; artist: string | null } {
  const sep = name.indexOf(" - ");
  if (sep !== -1) return { artist: name.slice(0, sep).trim(), title: name.slice(sep + 3).trim() };
  return { title: name, artist: null };
}

interface LibraryTrackRowProps {
  asset: UserAsset;
  isSynth: boolean;
  isInPlaylist: boolean;
  isFavorited: boolean;
  isPreviewing: boolean;
  isPreviewPlaying: boolean;
  previewProgress: number;
  duration: number;
  isNowPlaying: boolean;
  isStreaming: boolean;
  onTogglePlaylist: () => void;
  onPreview: (e: React.MouseEvent) => void;
  onSeek: (fraction: number) => void;
  onFavorite: () => void;
  onDelete: () => void;
  onRename?: (name: string) => void;
}

function LibraryTrackRow({
  asset,
  isSynth,
  isInPlaylist,
  isFavorited,
  isPreviewing,
  isPreviewPlaying,
  previewProgress,
  duration,
  isNowPlaying,
  isStreaming,
  onTogglePlaylist,
  onPreview,
  onSeek,
  onFavorite,
  onDelete,
  onRename,
}: LibraryTrackRowProps) {
  const renameRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(asset.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setNameInput(asset.name);
  }, [asset.name]);
  useEffect(() => {
    if (editing) renameRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== asset.name) onRename?.(trimmed);
    else setNameInput(asset.name);
  };

  const { title, artist } = parseTrackName(asset.name);
  const elapsed = duration > 0 ? fmtDuration(previewProgress * duration) : "";
  const total = fmtDuration(duration);

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek((e.clientX - rect.left) / rect.width);
  };

  return (
    <div
      className={`rounded-lg border transition-all ${
        isInPlaylist
          ? "border-purple-500 bg-purple-950/20"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Play / pause */}
        <button
          onClick={onPreview}
          disabled={isStreaming}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30"
        >
          {isPreviewing && isPreviewPlaying ? <PauseIcon /> : <PlayIcon />}
          {isNowPlaying && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-green-500" />
          )}
        </button>

        {/* Name + artist + badge */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={renameRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setNameInput(asset.name);
                }
              }}
              className="w-full rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-purple-500"
            />
          ) : (
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <p
                  className={`truncate text-xs font-medium text-zinc-200 ${onRename ? "cursor-text hover:text-white" : ""}`}
                  title={onRename ? "Click to rename" : undefined}
                  onClick={() => onRename && setEditing(true)}
                >
                  {title}
                </p>
                <span
                  className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                    isSynth ? "bg-purple-900/60 text-purple-400" : "bg-blue-900/60 text-blue-400"
                  }`}
                >
                  {isSynth ? "synth" : "upload"}
                </span>
              </div>
              {artist && <p className="mt-0.5 truncate text-[10px] text-zinc-500">{artist}</p>}
            </div>
          )}
        </div>

        {/* Duration */}
        {total && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
            {isPreviewing && elapsed ? `${elapsed} / ${total}` : total}
          </span>
        )}

        {/* Favorite */}
        <button
          onClick={onFavorite}
          title={isFavorited ? "Unfavorite" : "Favorite"}
          className={`shrink-0 text-sm transition-colors ${
            isFavorited ? "text-yellow-400" : "text-zinc-600 hover:text-yellow-400"
          }`}
        >
          {isFavorited ? "★" : "☆"}
        </button>

        {/* +Playlist toggle */}
        <button
          onClick={() => !isStreaming && onTogglePlaylist()}
          disabled={isStreaming}
          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 ${
            isInPlaylist
              ? "bg-purple-700/40 text-purple-300 hover:bg-red-900/40 hover:text-red-300"
              : "bg-zinc-700 text-zinc-300 hover:bg-purple-700 hover:text-white"
          }`}
        >
          {isInPlaylist ? "In playlist ✓" : "+ Playlist"}
        </button>

        {/* Delete */}
        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              className="rounded bg-red-800 px-1.5 py-0.5 text-[10px] text-red-200 transition-colors hover:bg-red-700"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="ml-1 shrink-0 text-xs text-zinc-600 transition-colors hover:text-red-400"
          >
            ✕
          </button>
        )}
      </div>

      {/* Seek bar */}
      {isPreviewing && (
        <div
          className="group mx-3 mb-2 h-1.5 cursor-pointer rounded-full bg-zinc-700"
          onClick={handleSeekClick}
        >
          <div
            className="h-full rounded-full bg-purple-500 transition-colors group-hover:bg-purple-400"
            style={{ width: `${previewProgress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

// UserAssetRow

interface UserAssetRowProps {
  asset: UserAsset;
  isSelected: boolean;
  badge?: string;
  isPreviewing: boolean;
  isPreviewPlaying: boolean;
  previewProgress: number;
  isNowPlaying: boolean;
  isStreaming: boolean;
  onClick: () => void;
  onPreview: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

function UserAssetRow({
  asset,
  isSelected,
  badge,
  isPreviewing,
  isPreviewPlaying,
  previewProgress,
  isNowPlaying,
  isStreaming,
  onClick,
  onPreview,
  onDelete,
}: UserAssetRowProps) {
  return (
    <div
      className={`rounded-lg border transition-all ${
        isSelected
          ? "border-purple-500 bg-purple-950/20"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <button
          onClick={onPreview}
          disabled={isStreaming}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30"
        >
          {isPreviewing && isPreviewPlaying ? <PauseIcon /> : <PlayIcon />}
          {isNowPlaying && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-green-500" />
          )}
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => !isStreaming && onClick()}>
          <p className="truncate text-xs font-medium text-zinc-200">{asset.name}</p>
          <p className="text-[10px] text-zinc-500">user upload</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 opacity-70" />
          {badge !== undefined && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-700">
              <span className="text-[10px] font-bold text-white">{badge}</span>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="ml-1 text-xs text-zinc-600 transition-colors hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>
      {isPreviewing && (
        <div className="mx-3 mb-2 h-1 rounded-full bg-zinc-700">
          <div
            className="h-full rounded-full bg-purple-500 transition-all"
            style={{ width: `${previewProgress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
