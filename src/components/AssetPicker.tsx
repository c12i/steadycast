import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CatalogAsset, LibraryResponse, Preset, UserAsset } from "../types";

type Tab = "presets" | "music" | "ambient" | "video";

const MUSIC_GENRES = ["all", "lofi-hiphop", "chillhop", "cafe-jazz", "piano", "synthwave", "lofi-ambient"];
const AMBIENT_CATS = ["all", "rain", "thunderstorm", "forest", "ocean", "city", "white-noise"];
const VIDEO_CATS = ["all", "cozy-room", "nature", "city", "abstract"];

interface Props {
  library: LibraryResponse;
  libraryLoading: boolean;
  presets: Preset[];
  userAssets: UserAsset[];
  selectedVideo: CatalogAsset | UserAsset | null;
  selectedMusic: (CatalogAsset | UserAsset)[];
  selectedAmbient: CatalogAsset | UserAsset | null;
  currentTrackIndex: number;
  isStreaming: boolean;
  onSelectVideo: (v: CatalogAsset | UserAsset) => void;
  onToggleMusic: (m: CatalogAsset | UserAsset) => void;
  onSelectAmbient: (a: CatalogAsset | UserAsset | null) => void;
  onApplyPreset: (p: Preset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onImportPresetUrl: (url: string) => void;
  onUploadAsset: (type: "video" | "music" | "ambient") => void;
  onDeleteUserAsset: (id: string) => void;
  onDownloadAsset: (id: string) => Promise<string>; // returns local_path
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

function Spinner() {
  return <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />;
}

function isUserAsset(a: CatalogAsset | UserAsset): a is UserAsset {
  return "cached_at" in a;
}


function getArtistOrGenre(a: CatalogAsset | UserAsset): string | null {
  if (isUserAsset(a)) return null;
  return a.artist ?? a.genre ?? a.category ?? null;
}

function getAssetDuration(a: CatalogAsset | UserAsset): number | null {
  if (isUserAsset(a)) return null;
  return a.duration_seconds ?? null;
}

function FilterPills({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
            value === opt
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function AssetPicker({
  library,
  libraryLoading,
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
  onDownloadAsset,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("music");
  const [genreFilter, setGenreFilter] = useState("all");
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [audioPreviewId, setAudioPreviewId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);
  const [savePresetName, setSavePresetName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  useEffect(() => {
    setGenreFilter("all");
  }, [activeTab]);

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

  const handleDownloadThenSelect = useCallback(
    async (
      asset: CatalogAsset,
      selectFn: (a: CatalogAsset) => void
    ) => {
      if (isStreaming) return;
      if (asset.local_path) {
        selectFn(asset);
        return;
      }
      setDownloadingIds((prev) => new Set(prev).add(asset.id));
      setDownloadError(null);
      try {
        const localPath = await onDownloadAsset(asset.id);
        selectFn({ ...asset, local_path: localPath });
      } catch (e) {
        setDownloadError(`Download failed: ${e}`);
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(asset.id);
          return next;
        });
      }
    },
    [isStreaming, onDownloadAsset]
  );

  const nowPlayingId =
    isStreaming && selectedMusic[currentTrackIndex]
      ? selectedMusic[currentTrackIndex].id
      : null;

  const musicPlaylistPos = (id: string): number | null => {
    const idx = selectedMusic.findIndex((m) => m.id === id);
    return idx === -1 ? null : idx + 1;
  };

  const filterAssets = (assets: CatalogAsset[]): CatalogAsset[] => {
    if (genreFilter === "all") return assets;
    return assets.filter(
      (a) => a.genre === genreFilter || a.category === genreFilter
    );
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

      {downloadError && (
        <div className="px-4 py-2 bg-red-950 border-b border-red-800 text-red-300 text-xs flex items-center justify-between shrink-0">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}
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
                  ? [...library.video, ...userAssets].find((a) => a.id === p.video_id)
                  : null;
                const ambientAsset = p.ambient_id
                  ? [...library.ambient, ...userAssets].find((a) => a.id === p.ambient_id)
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
                          <button
                            onClick={() => onDeletePreset(p.id)}
                            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-red-900 rounded text-zinc-400 hover:text-red-400 transition-colors"
                          >
                            ✕
                          </button>
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
            <FilterPills options={MUSIC_GENRES} value={genreFilter} onChange={setGenreFilter} />
            <p className="text-[10px] text-zinc-500">
              Click tracks to build a playlist. They play in order and loop.
            </p>
            {filterAssets(library.music).map((asset) => {
              const pos = musicPlaylistPos(asset.id);
              const isDownloading = downloadingIds.has(asset.id);
              const isNowPlaying = nowPlayingId === asset.id;
              const isPreviewing = audioPreviewId === asset.id;
              return (
                <AssetRow
                  key={asset.id}
                  name={asset.name}
                  sub={getArtistOrGenre(asset)}
                  duration={getAssetDuration(asset)}
                  isDownloaded={!!asset.local_path}
                  isDownloading={isDownloading}
                  isSelected={pos !== null}
                  isPreviewing={isPreviewing}
                  isPreviewPlaying={isPreviewing && isAudioPlaying}
                  previewProgress={isPreviewing ? audioProgress : 0}
                  isNowPlaying={isNowPlaying}
                  badge={pos !== null ? String(pos) : undefined}
                  isStreaming={isStreaming}
                  onClick={() =>
                    handleDownloadThenSelect(asset, (a) => onToggleMusic(a))
                  }
                  onPreview={(e) => toggleAudio(e, asset.id, asset.local_path, asset.preview_url ?? asset.url)}
                />
              );
            })}

            {/* User uploads */}
            {userAssetsOfType("music").length > 0 && (
              <>
                <p className="text-[11px] text-zinc-500 mt-2 font-medium">My Files</p>
                {userAssetsOfType("music").map((ua) => {
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
              className="mt-1 w-full py-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              + Upload Music
            </button>
          </>
        )}

        {/* ── Ambient tab ─────────────────────────────────────────────────── */}
        {activeTab === "ambient" && (
          <>
            <FilterPills options={AMBIENT_CATS} value={genreFilter} onChange={setGenreFilter} />
            {/* None option */}
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
              <div className="w-6 h-6 flex items-center justify-center shrink-0 text-sm">🔇</div>
              <span className="flex-1 text-xs font-medium text-zinc-300">None</span>
              {selectedAmbient === null && (
                <span className="text-[10px] text-purple-400 font-bold">✓</span>
              )}
            </div>

            {filterAssets(library.ambient).map((asset) => {
              const isDownloading = downloadingIds.has(asset.id);
              const isSelected = selectedAmbient?.id === asset.id;
              const isPreviewing = audioPreviewId === asset.id;
              return (
                <AssetRow
                  key={asset.id}
                  name={asset.name}
                  sub={getArtistOrGenre(asset)}
                  duration={getAssetDuration(asset)}
                  isDownloaded={!!asset.local_path}
                  isDownloading={isDownloading}
                  isSelected={isSelected}
                  isPreviewing={isPreviewing}
                  isPreviewPlaying={isPreviewing && isAudioPlaying}
                  previewProgress={isPreviewing ? audioProgress : 0}
                  isNowPlaying={false}
                  badge={isSelected ? "✓" : undefined}
                  isStreaming={isStreaming}
                  onClick={() =>
                    handleDownloadThenSelect(asset, (a) => onSelectAmbient(a))
                  }
                  onPreview={(e) => toggleAudio(e, asset.id, asset.local_path, asset.preview_url ?? asset.url)}
                />
              );
            })}

            {userAssetsOfType("ambient").length > 0 && (
              <>
                <p className="text-[11px] text-zinc-500 mt-2 font-medium">My Files</p>
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
              className="mt-1 w-full py-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              + Upload Ambient
            </button>
          </>
        )}

        {/* ── Video tab ───────────────────────────────────────────────────── */}
        {activeTab === "video" && (
          <>
            <FilterPills options={VIDEO_CATS} value={genreFilter} onChange={setGenreFilter} />
            <div className="grid grid-cols-2 gap-2">
              {filterAssets(library.video).map((asset) => {
                const isDownloading = downloadingIds.has(asset.id);
                const isSelected = selectedVideo?.id === asset.id;
                const isPreviewing = videoPreviewId === asset.id;
                return (
                  <VideoCard
                    key={asset.id}
                    asset={asset}
                    isDownloaded={!!asset.local_path}
                    isDownloading={isDownloading}
                    isSelected={isSelected}
                    isPreviewing={isPreviewing}
                    isStreaming={isStreaming}
                    onClick={() =>
                      handleDownloadThenSelect(asset, (a) => onSelectVideo(a))
                    }
                    onTogglePreview={(e) => {
                      e.stopPropagation();
                      if (!asset.local_path) return;
                      setVideoPreviewId(isPreviewing ? null : asset.id);
                    }}
                  />
                );
              })}
            </div>

            {userAssetsOfType("video").length > 0 && (
              <>
                <p className="text-[11px] text-zinc-500 mt-2 font-medium">My Files</p>
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
                            <p className="text-[10px] text-zinc-500">user upload</p>
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
              </>
            )}
            <button
              onClick={() => onUploadAsset("video")}
              className="mt-1 w-full py-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              + Upload Video
            </button>
          </>
        )}

        {libraryLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
            <Spinner />
            Loading library…
          </div>
        )}
      </div>
    </div>
  );
}

// ── AssetRow ──────────────────────────────────────────────────────────────────

interface AssetRowProps {
  name: string;
  sub: string | null;
  duration: number | null;
  isDownloaded: boolean;
  isDownloading: boolean;
  isSelected: boolean;
  isPreviewing: boolean;
  isPreviewPlaying: boolean;
  previewProgress: number;
  isNowPlaying: boolean;
  badge?: string;
  isStreaming: boolean;
  onClick: () => void;
  onPreview: (e: React.MouseEvent) => void;
}

function AssetRow({
  name,
  sub,
  duration,
  isDownloaded,
  isDownloading,
  isSelected,
  isPreviewing,
  isPreviewPlaying,
  previewProgress,
  isNowPlaying,
  badge,
  isStreaming,
  onClick,
  onPreview,
}: AssetRowProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? "border-purple-500 bg-purple-950/20"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      } ${isStreaming ? "cursor-default" : ""}`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Preview button */}
        <button
          onClick={onPreview}
          disabled={isStreaming}
          title={isStreaming ? "Stop stream to preview" : "Preview"}
          className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded-full flex items-center justify-center text-zinc-300 transition-colors shrink-0 relative"
        >
          {isPreviewing && isPreviewPlaying ? <PauseIcon /> : <PlayIcon />}
          {isNowPlaying && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </button>

        {/* Name + sub */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-200 truncate">{name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {sub && <span className="text-[10px] text-zinc-500 truncate">{sub}</span>}
            {duration !== null && (
              <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
                {formatDuration(duration)}
              </span>
            )}
            {isNowPlaying && (
              <span className="text-[10px] text-green-400 font-medium">Now playing</span>
            )}
          </div>
        </div>

        {/* Right indicators */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isDownloading ? (
            <Spinner />
          ) : isDownloaded ? (
            <span className="w-2 h-2 rounded-full bg-green-500 opacity-70" />
          ) : (
            <span className="text-[10px] text-zinc-600">↓</span>
          )}
          {badge !== undefined && (
            <div className="w-5 h-5 bg-purple-700 rounded-full flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">{badge}</span>
            </div>
          )}
        </div>
      </div>

      {/* Seek bar while previewing */}
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

// ── VideoCard ─────────────────────────────────────────────────────────────────

interface VideoCardProps {
  asset: CatalogAsset;
  isDownloaded: boolean;
  isDownloading: boolean;
  isSelected: boolean;
  isPreviewing: boolean;
  isStreaming: boolean;
  onClick: () => void;
  onTogglePreview: (e: React.MouseEvent) => void;
}

function VideoCard({
  asset,
  isDownloaded,
  isDownloading,
  isSelected,
  isPreviewing,
  isStreaming,
  onClick,
  onTogglePreview,
}: VideoCardProps) {
  return (
    <div
      className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
        isSelected
          ? "border-purple-500 bg-purple-950/20"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      } ${isStreaming ? "cursor-default" : ""}`}
      onClick={onClick}
    >
      {/* Thumbnail / preview area */}
      <div className="relative aspect-video bg-zinc-950">
        {isPreviewing && asset.local_path ? (
          <video
            src={convertFileSrc(asset.local_path)}
            autoPlay
            muted
            loop
            className="w-full h-full object-cover"
          />
        ) : asset.thumbnail_url ? (
          <img
            src={asset.thumbnail_url}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
            No preview
          </div>
        )}

        {/* Download status */}
        <div className="absolute top-1.5 right-1.5">
          {isDownloading ? (
            <div className="bg-zinc-900/80 rounded-full p-1"><Spinner /></div>
          ) : isDownloaded ? (
            <span className="w-2 h-2 block rounded-full bg-green-500" />
          ) : (
            <span className="bg-zinc-900/80 rounded text-[10px] text-zinc-400 px-1 py-0.5">↓</span>
          )}
        </div>

        {/* Selected badge */}
        {isSelected && (
          <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-purple-700 rounded-full flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">✓</span>
          </div>
        )}

        {/* Preview toggle */}
        <button
          onClick={onTogglePreview}
          disabled={!isDownloaded || isStreaming}
          title={!isDownloaded ? "Download to preview" : "Preview"}
          className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-zinc-900/80 hover:bg-zinc-800 disabled:opacity-30 rounded-full flex items-center justify-center text-zinc-300 transition-colors"
        >
          {isPreviewing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      {/* Name row */}
      <div className="px-2.5 py-2">
        <p className="text-xs font-medium text-zinc-200 truncate">{asset.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {asset.category && (
            <span className="text-[10px] text-zinc-500">{asset.category}</span>
          )}
          {asset.duration_seconds != null && (
            <span className="text-[10px] text-zinc-600 tabular-nums">
              {formatDuration(asset.duration_seconds)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
