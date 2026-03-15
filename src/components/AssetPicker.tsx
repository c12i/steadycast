import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Preset, RenderJob, UserAsset } from "../types";
import SyntheticPanel from "./SyntheticPanel";
import { SynthConfig } from "../lib/SyntheticEngine";
import { AmbientType, AMBIENT_PRESETS } from "../lib/AmbientEngine";

type Tab = "presets" | "music" | "ambient" | "video";


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
  renderJobs: RenderJob[];
  onSynthConfigChange: (partial: Partial<SynthConfig>) => void;
  onSynthRegenerate: () => void;
  onToggleSynthPreview: () => void;
  onGenerateTrack: (durationSeconds: number) => void;
  onToggleSynthTrack: (asset: UserAsset) => void;
  onRandomizeSynth: (config: SynthConfig) => void;
  onRenameSynthTrack: (id: string, name: string) => void;
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
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
  renderJobs,
  onSynthConfigChange,
  onSynthRegenerate,
  onToggleSynthPreview,
  onGenerateTrack,
  onToggleSynthTrack,
  onRandomizeSynth,
  onRenameSynthTrack,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("music");
  const [audioPreviewId, setAudioPreviewId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);
  const [savePresetName, setSavePresetName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.addEventListener("timeupdate", () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setAudioProgress(audio.currentTime / audio.duration);
      }
    });
    audio.addEventListener("play", () => setIsAudioPlaying(true));
    audio.addEventListener("pause", () => setIsAudioPlaying(false));
    audio.addEventListener("ended", () => {
      setAudioPreviewId(null);
      setIsAudioPlaying(false);
      setAudioProgress(0);
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
      const src = localPath ? convertFileSrc(localPath) : previewUrl ?? null;
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
    },
    [audioPreviewId]
  );

  const nowPlayingId =
    isStreaming && selectedMusic[currentTrackIndex]
      ? selectedMusic[currentTrackIndex].id
      : null;

  const musicPlaylistPos = (id: string): number | null => {
    const idx = selectedMusic.findIndex((m) => m.id === id);
    return idx === -1 ? null : idx + 1;
  };

  const userAssetsOfType = (type: "video" | "music" | "ambient") =>
    userAssets.filter((u) => u.asset_type === type);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800 shrink-0">
        {(["presets", "music", "ambient", "video"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-xs font-medium capitalize transition-colors relative ${
              activeTab === t
                ? "bg-zinc-800 text-zinc-100"
                : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
            {t === "music" && selectedMusic.length > 0 && (
              <span className="ml-1.5 bg-purple-900 text-purple-300 text-[10px] px-1 rounded">
                {selectedMusic.length}
              </span>
            )}
          </button>
        ))}
        {isStreaming && (
          <div className="ml-auto flex items-center px-3">
            <span className="text-[10px] text-green-400 font-medium">Stream running</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
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
                className="flex-1 bg-zinc-900 text-zinc-100 text-xs rounded px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-purple-500 placeholder-zinc-600"
              />
              <button
                onClick={() => {
                  if (importUrl.trim()) {
                    onImportPresetUrl(importUrl.trim());
                    setImportUrl("");
                  }
                }}
                disabled={!importUrl.trim()}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded border border-zinc-700 text-zinc-300 transition-colors whitespace-nowrap"
              >
                Import URL
              </button>
            </div>

            {/* Preset grid */}
            {presets.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-8">No presets yet.</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {presets.map((p) => {
                const videoAsset = p.video_id
                  ? userAssets.find((a) => a.id === p.video_id)
                  : null;
                const ambientAsset = p.ambient_id
                  ? userAssets.find((a) => a.id === p.ambient_id)
                  : null;
                return (
                  <div
                    key={p.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200 truncate">{p.name}</span>
                          {p.is_builtin && (
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">
                              built-in
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{p.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {videoAsset && (
                            <span className="text-[10px] bg-blue-950 text-blue-400 px-1.5 py-0.5 rounded">
                              vid: {videoAsset.name}
                            </span>
                          )}
                          {p.music_ids.length > 0 && (
                            <span className="text-[10px] bg-purple-950 text-purple-400 px-1.5 py-0.5 rounded">
                              {p.music_ids.length} track{p.music_ids.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {ambientAsset && (
                            <span className="text-[10px] bg-green-950 text-green-400 px-1.5 py-0.5 rounded">
                              amb: {ambientAsset.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onApplyPreset(p)}
                          disabled={isStreaming}
                          className="px-2.5 py-1 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded text-white font-medium transition-colors"
                        >
                          Apply
                        </button>
                        {!p.is_builtin && (
                          confirmDeleteId === p.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-zinc-400">Delete?</span>
                              <button
                                onClick={() => { onDeletePreset(p.id); setConfirmDeleteId(null); }}
                                className="px-2 py-1 text-xs bg-red-800 hover:bg-red-700 rounded text-red-200 transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="px-2 py-1 text-xs bg-zinc-800 hover:bg-red-900 rounded text-zinc-400 hover:text-red-400 transition-colors"
                            >
                              ✕
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save preset */}
            <div className="border-t border-zinc-800 pt-3 mt-1">
              <p className="text-[11px] text-zinc-500 mb-2">Save current selection as preset</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Preset name…"
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  className="flex-1 bg-zinc-900 text-zinc-100 text-xs rounded px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-purple-500 placeholder-zinc-600"
                />
                <button
                  onClick={() => {
                    if (savePresetName.trim()) {
                      onSavePreset(savePresetName.trim());
                      setSavePresetName("");
                    }
                  }}
                  disabled={!savePresetName.trim()}
                  className="px-3 py-1.5 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded text-white font-medium transition-colors"
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
            <SyntheticPanel
              config={synthConfig}
              isStreaming={isStreaming}
              isPreviewing={synthPreviewing}
              renderJobs={renderJobs}
              synthTracks={userAssetsOfType("music").filter(a => a.id.startsWith("synth-"))}
              selectedMusicIds={new Set(selectedMusic.map(m => m.id))}
              onChange={onSynthConfigChange}
              onRegenerate={onSynthRegenerate}
              onTogglePreview={onToggleSynthPreview}
              onGenerate={onGenerateTrack}
              onToggleTrack={onToggleSynthTrack}
              onDeleteTrack={onDeleteUserAsset}
              onRandomize={onRandomizeSynth}
              onRenameTrack={onRenameSynthTrack}
            />

            {/* User-uploaded music */}
            {userAssetsOfType("music").filter(a => !a.id.startsWith("synth-")).length > 0 && (
              <>
                <p className="text-[11px] text-zinc-500 mt-3 font-medium">My Uploads</p>
                {userAssetsOfType("music").filter(a => !a.id.startsWith("synth-")).map((ua) => {
                  const pos = musicPlaylistPos(ua.id);
                  const isPreviewing = audioPreviewId === ua.id;
                  return (
                    <UserAssetRow
                      key={ua.id}
                      asset={ua}
                      isSelected={pos !== null}
                      badge={pos !== null ? String(pos) : undefined}
                      isPreviewing={isPreviewing}
                      isPreviewPlaying={isPreviewing && isAudioPlaying}
                      previewProgress={isPreviewing ? audioProgress : 0}
                      isNowPlaying={nowPlayingId === ua.id}
                      isStreaming={isStreaming}
                      onClick={() => onToggleMusic(ua)}
                      onPreview={(e) => toggleAudio(e, ua.id, ua.local_path)}
                      onDelete={() => onDeleteUserAsset(ua.id)}
                    />
                  );
                })}
              </>
            )}
            <button
              onClick={() => onUploadAsset("music")}
              className="mt-2 w-full py-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              + Upload Music
            </button>
          </>
        )}

        {/* ── Ambient tab ─────────────────────────────────────────────────── */}
        {activeTab === "ambient" && (
          <>
            {/* None */}
            <div
              onClick={() => !isStreaming && onSelectAmbient(null)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                isStreaming ? "cursor-default opacity-60" : "cursor-pointer"
              } ${
                selectedAmbient === null
                  ? "border-purple-500 bg-purple-950/20"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center shrink-0 text-sm">🔇</span>
              <span className="flex-1 text-xs font-medium text-zinc-300">None</span>
              {selectedAmbient === null && <span className="text-[10px] text-purple-400 font-bold">✓</span>}
            </div>

            {/* Error banner */}
            {ambientPreviewError && (
              <p className="text-[11px] text-red-400 bg-red-950/40 border border-red-800 rounded px-2.5 py-1.5">
                {ambientPreviewError}
              </p>
            )}

            {/* Built-in presets */}
            <p className="text-[11px] text-zinc-500 font-medium mt-1">Built-in Sounds</p>
            {AMBIENT_PRESETS.map((preset) => {
              const isPreviewing = ambientPreviewingType === preset.id;
              const isRendering  = ambientRenderingType === preset.id;
              return (
                <div
                  key={preset.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900"
                >
                  <button
                    onClick={() => onToggleAmbientPreview(preset.id)}
                    disabled={isStreaming}
                    className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded-full flex items-center justify-center text-zinc-300 shrink-0 transition-colors"
                  >
                    {isPreviewing ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200">{preset.label}</p>
                    <p className="text-[10px] text-zinc-500">{preset.description}</p>
                  </div>
                  <button
                    onClick={() => !isStreaming && !isRendering && onUseAmbientPreset(preset.id)}
                    disabled={isStreaming || !!ambientRenderingType}
                    className="px-2.5 py-1 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded text-white font-medium transition-colors shrink-0"
                  >
                    {isRendering ? "…" : "Use"}
                  </button>
                </div>
              );
            })}

            {/* Rendered / uploaded ambient files */}
            {userAssetsOfType("ambient").length > 0 && (
              <>
                <p className="text-[11px] text-zinc-500 font-medium mt-2">My Files</p>
                {userAssetsOfType("ambient").map((ua) => {
                  const isSelected   = selectedAmbient?.id === ua.id;
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
              className="mt-2 w-full py-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              + Upload Ambient
            </button>
          </>
        )}

        {/* ── Video tab ───────────────────────────────────────────────────── */}
        {activeTab === "video" && (
          <>
            {userAssetsOfType("video").length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-8">No videos yet. Upload a video loop to get started.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {userAssetsOfType("video").map((ua) => {
                const isSelected = selectedVideo?.id === ua.id;
                const isPreviewing = videoPreviewId === ua.id;
                return (
                  <div
                    key={ua.id}
                    className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
                      isSelected
                        ? "border-purple-500 bg-purple-950/20"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                    onClick={() => !isStreaming && onSelectVideo(ua)}
                  >
                    <div className="relative aspect-video bg-zinc-950">
                      {isPreviewing ? (
                        <video
                          src={convertFileSrc(ua.local_path)}
                          autoPlay
                          muted
                          loop
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">No preview</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-purple-700 rounded-full flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">✓</span>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setVideoPreviewId(isPreviewing ? null : ua.id); }}
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-zinc-900/80 hover:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-300 transition-colors"
                      >
                        {isPreviewing ? <PauseIcon /> : <PlayIcon />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate">{ua.name}</p>
                        <p className="text-[10px] text-zinc-500">uploaded</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteUserAsset(ua.id); }}
                        className="text-zinc-600 hover:text-red-400 text-xs transition-colors shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => onUploadAsset("video")}
              className="mt-1 w-full py-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              + Upload Video
            </button>
          </>
        )}

      </div>
    </div>
  );
}

// ── UserAssetRow ──────────────────────────────────────────────────────────────

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
          className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded-full flex items-center justify-center text-zinc-300 transition-colors shrink-0 relative"
        >
          {isPreviewing && isPreviewPlaying ? <PauseIcon /> : <PlayIcon />}
          {isNowPlaying && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </button>
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => !isStreaming && onClick()}
        >
          <p className="text-xs font-medium text-zinc-200 truncate">{asset.name}</p>
          <p className="text-[10px] text-zinc-500">user upload</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-green-500 opacity-70" />
          {badge !== undefined && (
            <div className="w-5 h-5 bg-purple-700 rounded-full flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">{badge}</span>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-1"
          >
            ✕
          </button>
        </div>
      </div>
      {isPreviewing && (
        <div className="mx-3 mb-2 h-1 bg-zinc-700 rounded-full">
          <div
            className="h-full bg-purple-500 rounded-full transition-all"
            style={{ width: `${previewProgress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

