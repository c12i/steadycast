import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AssetManifest, AmbientAsset, MusicAsset, VideoAsset } from "../types";

type Tab = "video" | "music" | "ambient";

interface Props {
  manifest: AssetManifest;
  loading: boolean;
  selectedVideo: VideoAsset | null;
  selectedMusic: MusicAsset[];
  selectedAmbient: AmbientAsset | null;
  currentTrackIndex: number;
  isStreaming: boolean;
  onSelectVideo: (v: VideoAsset) => void;
  onToggleMusic: (m: MusicAsset) => void;
  onSelectAmbient: (a: AmbientAsset | null) => void;
  onLoadManifest: (url: string) => void;
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PlayIcon({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
      <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
    </svg>
  );
}

function PauseIcon({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

export default function AssetPicker({
  manifest,
  loading,
  selectedVideo,
  selectedMusic,
  selectedAmbient,
  currentTrackIndex,
  isStreaming,
  onSelectVideo,
  onToggleMusic,
  onSelectAmbient,
  onLoadManifest,
}: Props) {
  const [tab, setTab] = useState<Tab>("video");
  const [manifestUrl, setManifestUrl] = useState("");

  // ── Audio preview ─────────────────────────────────────────────────────────
  const [audioPreviewId, setAudioPreviewId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Video preview ─────────────────────────────────────────────────────────
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});

  // Create the shared audio element once.
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setAudioProgress(audio.currentTime / audio.duration);
        setAudioCurrentTime(audio.currentTime);
      }
    };
    const onEnded = () => {
      setAudioPreviewId(null);
      setIsAudioPlaying(false);
      setAudioProgress(0);
      setAudioCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", () => setIsAudioPlaying(true));
    audio.addEventListener("pause", () => setIsAudioPlaying(false));
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Eagerly load audio metadata for all tracks.
  useEffect(() => {
    const tracks = [...manifest.music, ...manifest.ambients].filter((t) => t.local_path);
    tracks.forEach((t) => {
      const el = new Audio();
      el.preload = "metadata";
      el.src = convertFileSrc(t.local_path!);
      el.addEventListener("loadedmetadata", () => {
        if (isFinite(el.duration) && el.duration > 0) {
          setAudioDurations((prev) => ({ ...prev, [t.id]: el.duration }));
        }
        el.src = "";
      });
      el.load();
    });
  }, [manifest]);

  // Eagerly load video metadata for all video tracks.
  useEffect(() => {
    manifest.videos.filter((v) => v.local_path).forEach((v) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.src = convertFileSrc(v.local_path!);
      el.addEventListener("loadedmetadata", () => {
        if (isFinite(el.duration) && el.duration > 0) {
          setVideoDurations((prev) => ({ ...prev, [v.id]: el.duration }));
        }
        el.src = "";
      });
      el.load();
    });
  }, [manifest]);

  // Stop all previews when streaming starts.
  useEffect(() => {
    if (isStreaming) {
      audioRef.current?.pause();
      setAudioPreviewId(null);
      setIsAudioPlaying(false);
      setAudioProgress(0);
      setAudioCurrentTime(0);
      setVideoPreviewId(null);
      setVideoCurrentTime(0);
    }
  }, [isStreaming]);

  const toggleAudioPreview = useCallback(
    (e: React.MouseEvent, id: string, localPath?: string) => {
      e.stopPropagation();
      if (!localPath || !audioRef.current) return;
      const audio = audioRef.current;

      if (audioPreviewId === id) {
        audio.paused ? audio.play() : audio.pause();
        return;
      }

      audio.src = convertFileSrc(localPath);
      audio.currentTime = 0;
      audio.play().catch(() => {});
      setAudioPreviewId(id);
      setAudioProgress(0);
      setAudioCurrentTime(0);
    },
    [audioPreviewId]
  );

  const handleAudioSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!audioRef.current?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = frac * audioRef.current.duration;
  }, []);

  const toggleVideoPreview = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (videoPreviewId === id) {
        setVideoPreviewId(null);
        setVideoCurrentTime(0);
      } else {
        setVideoPreviewId(id);
        setVideoCurrentTime(0);
      }
    },
    [videoPreviewId]
  );

  const handleVideoSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string) => {
      e.stopPropagation();
      const videoEl = document.querySelector<HTMLVideoElement>(`video[data-preview-id="${id}"]`);
      if (!videoEl?.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      videoEl.currentTime = frac * videoEl.duration;
    },
    []
  );

  const hasAssets =
    manifest.videos.length > 0 || manifest.music.length > 0 || manifest.ambients.length > 0;

  const playlistPosition = (track: MusicAsset): number | null => {
    const idx = selectedMusic.findIndex((m) => m.id === track.id);
    return idx === -1 ? null : idx + 1;
  };

  const nowPlayingId =
    isStreaming && selectedMusic[currentTrackIndex]
      ? selectedMusic[currentTrackIndex].id
      : null;

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Manifest loader */}
      {!hasAssets && (
        <div className="bg-surface-overlay rounded-lg p-4 border border-zinc-800">
          <p className="text-xs text-zinc-400 mb-2">
            Enter your asset manifest URL to load the library:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://your-r2-bucket.example.com/manifest.json"
              value={manifestUrl}
              onChange={(e) => setManifestUrl(e.target.value)}
              className="flex-1 bg-surface text-zinc-100 text-xs rounded px-3 py-2 border border-zinc-700 focus:outline-none focus:border-purple-500 placeholder-zinc-600"
            />
            <button
              onClick={() => onLoadManifest(manifestUrl)}
              disabled={!manifestUrl.trim() || loading}
              className="px-3 py-2 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded font-medium transition-colors"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        </div>
      )}

      {hasAssets && (
        <>
          {/* Tabs + refresh */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-surface-overlay rounded-lg p-1 w-fit">
              {(["video", "music", "ambient"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                    tab === t ? "bg-purple-700 text-white" : "text-zinc-400 hover:text-zinc-200"
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
            </div>
            <button
              onClick={() => onLoadManifest(manifestUrl)}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-purple-400 transition-colors"
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {/* ── Video grid ──────────────────────────────────────────────────── */}
          {tab === "video" && (
            <div className="grid grid-cols-2 gap-3">
              {manifest.videos.map((v) => {
                const isPreviewing = videoPreviewId === v.id;
                const dur = videoDurations[v.id];
                const isSelected = selectedVideo?.id === v.id;
                // Video progress for seekbar: derived from videoCurrentTime + dur
                const videoFrac =
                  isPreviewing && dur ? videoCurrentTime / dur : 0;

                return (
                  // Use div so we can nest a button inside for the preview control.
                  <div
                    key={v.id}
                    onClick={() => onSelectVideo(v)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-purple-500 ring-2 ring-purple-500/30"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {/* Thumbnail / inline video */}
                    <div className="aspect-video bg-zinc-900 relative overflow-hidden group">
                      {isPreviewing && v.local_path ? (
                        <video
                          data-preview-id={v.id}
                          src={convertFileSrc(v.local_path)}
                          autoPlay
                          muted
                          loop
                          className="w-full h-full object-cover"
                          onTimeUpdate={(e) => {
                            const el = e.currentTarget;
                            if (isFinite(el.duration) && el.duration > 0) {
                              setVideoCurrentTime(el.currentTime);
                              // Also store duration if not yet cached
                              if (!videoDurations[v.id]) {
                                setVideoDurations((prev) => ({ ...prev, [v.id]: el.duration }));
                              }
                            }
                          }}
                        />
                      ) : v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt={v.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl">🎬</span>
                        </div>
                      )}

                      {/* Play / pause overlay — shown on hover or while previewing */}
                      {v.local_path && !isStreaming && (
                        <button
                          onClick={(e) => toggleVideoPreview(e, v.id)}
                          className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                            isPreviewing
                              ? "opacity-0 hover:opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          } bg-black/40`}
                          title={isPreviewing ? "Stop preview" : "Preview"}
                        >
                          <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30">
                            {isPreviewing ? <PauseIcon size="md" /> : <PlayIcon size="md" />}
                          </div>
                        </button>
                      )}
                    </div>

                    {/* Footer: name + time */}
                    <div className="px-2 pt-2 pb-1.5 bg-surface-overlay">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-medium text-zinc-200 truncate">{v.name}</p>
                        <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                          {isPreviewing
                            ? `${formatDuration(videoCurrentTime)}${dur ? ` / ${formatDuration(dur)}` : ""}`
                            : dur !== undefined
                            ? formatDuration(dur)
                            : ""}
                        </span>
                      </div>
                    </div>

                    {/* Seekable progress bar — shown while previewing */}
                    {isPreviewing && (
                      <div
                        className="mx-2 mb-2 h-1 bg-zinc-700 rounded-full cursor-pointer relative group/seek"
                        onClick={(e) => handleVideoSeek(e, v.id)}
                      >
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${videoFrac * 100}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover/seek:opacity-100 transition-opacity"
                          style={{ left: `calc(${videoFrac * 100}% - 5px)` }}
                        />
                      </div>
                    )}

                    {/* Selection check */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Music list ──────────────────────────────────────────────────── */}
          {tab === "music" && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-zinc-500">
                Click tracks to build a playlist — they play in order, then loop.
              </p>
              {manifest.music.map((m) => {
                const pos = playlistPosition(m);
                return (
                  <AudioTrackRow
                    key={m.id}
                    name={m.name}
                    duration={audioDurations[m.id]}
                    isSelected={pos !== null}
                    isNowPlaying={nowPlayingId === m.id}
                    isPreviewing={audioPreviewId === m.id}
                    isPreviewPlaying={audioPreviewId === m.id && isAudioPlaying}
                    previewProgress={audioPreviewId === m.id ? audioProgress : 0}
                    previewCurrentTime={audioPreviewId === m.id ? audioCurrentTime : 0}
                    hasLocalPath={!!m.local_path}
                    badge={pos !== null ? String(pos) : undefined}
                    isStreamingActive={isStreaming}
                    onClick={() => onToggleMusic(m)}
                    onPreview={(e) => toggleAudioPreview(e, m.id, m.local_path)}
                    onSeek={handleAudioSeek}
                  />
                );
              })}
            </div>
          )}

          {/* ── Ambient list ─────────────────────────────────────────────────── */}
          {tab === "ambient" && (
            <div className="flex flex-col gap-2">
              {/* None option */}
              <div
                onClick={() => onSelectAmbient(null)}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedAmbient === null
                    ? "border-purple-500 bg-purple-950/30"
                    : "border-zinc-800 bg-surface-overlay hover:border-zinc-600"
                }`}
              >
                <div className="w-9 h-9 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0 text-lg">
                  🔇
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">None</p>
                  <p className="text-xs text-zinc-500">No ambient audio</p>
                </div>
                {selectedAmbient === null && (
                  <span className="text-purple-400 text-xs font-bold shrink-0">✓</span>
                )}
              </div>

              {manifest.ambients.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">
                  No ambient tracks in this manifest.
                </p>
              )}

              {manifest.ambients.map((a) => (
                <AudioTrackRow
                  key={a.id}
                  name={a.name}
                  duration={audioDurations[a.id]}
                  isSelected={selectedAmbient?.id === a.id}
                  isNowPlaying={false}
                  isPreviewing={audioPreviewId === a.id}
                  isPreviewPlaying={audioPreviewId === a.id && isAudioPlaying}
                  previewProgress={audioPreviewId === a.id ? audioProgress : 0}
                  previewCurrentTime={audioPreviewId === a.id ? audioCurrentTime : 0}
                  hasLocalPath={!!a.local_path}
                  badge={selectedAmbient?.id === a.id ? "✓" : undefined}
                  isStreamingActive={isStreaming}
                  emoji="🌧️"
                  onClick={() => onSelectAmbient(a)}
                  onPreview={(e) => toggleAudioPreview(e, a.id, a.local_path)}
                  onSeek={handleAudioSeek}
                />
              ))}
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />
          Downloading assets…
        </div>
      )}
    </div>
  );
}

// ─── AudioTrackRow ────────────────────────────────────────────────────────────

interface AudioTrackRowProps {
  name: string;
  duration?: number;
  isSelected: boolean;
  isNowPlaying: boolean;
  isPreviewing: boolean;
  isPreviewPlaying: boolean;
  previewProgress: number;
  previewCurrentTime: number;
  hasLocalPath: boolean;
  badge?: string;
  emoji?: string;
  isStreamingActive: boolean;
  onClick: () => void;
  onPreview: (e: React.MouseEvent) => void;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function AudioTrackRow({
  name,
  duration,
  isSelected,
  isNowPlaying,
  isPreviewing,
  isPreviewPlaying,
  previewProgress,
  previewCurrentTime,
  hasLocalPath,
  badge,
  emoji = "🎵",
  isStreamingActive,
  onClick,
  onPreview,
  onSeek,
}: AudioTrackRowProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? "border-purple-500 bg-purple-950/30"
          : "border-zinc-800 bg-surface-overlay hover:border-zinc-600"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Play / pause preview button */}
        <button
          onClick={onPreview}
          disabled={!hasLocalPath || isStreamingActive}
          title={isStreamingActive ? "Stop streaming to preview" : "Preview"}
          className="w-9 h-9 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg flex items-center justify-center shrink-0 text-zinc-300 transition-colors relative"
        >
          {isPreviewing && isPreviewPlaying ? (
            <PauseIcon />
          ) : hasLocalPath ? (
            <PlayIcon />
          ) : (
            <span className="text-base">{emoji}</span>
          )}
          {isNowPlaying && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          )}
        </button>

        {/* Name + time */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{name}</p>
          <div className="mt-0.5">
            {isNowPlaying ? (
              <span className="text-xs text-green-400 font-medium">Now playing</span>
            ) : isPreviewing ? (
              <span className="text-xs text-purple-400 tabular-nums font-mono">
                {formatDuration(previewCurrentTime)}
                {duration !== undefined && (
                  <span className="text-zinc-600"> / {formatDuration(duration)}</span>
                )}
              </span>
            ) : duration !== undefined ? (
              <span className="text-xs text-zinc-500 tabular-nums">{formatDuration(duration)}</span>
            ) : (
              <span className="text-xs text-zinc-600">—</span>
            )}
          </div>
        </div>

        {/* Playlist position or selection badge */}
        {badge !== undefined && (
          <div className="w-5 h-5 bg-purple-700 rounded-full flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">{badge}</span>
          </div>
        )}
      </div>

      {/* Seekable progress bar */}
      {isPreviewing && (
        <div
          className="mx-3 mb-3 h-1 bg-zinc-700 rounded-full cursor-pointer relative group"
          onClick={onSeek}
        >
          <div
            className="h-full bg-purple-500 rounded-full"
            style={{ width: `${previewProgress * 100}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${previewProgress * 100}% - 5px)` }}
          />
        </div>
      )}
    </div>
  );
}
