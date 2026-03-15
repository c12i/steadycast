import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { TrackChangedPayload } from "../types";

/** Keep in sync with CROSSFADE_SECS in stream.rs */
const XFADE_SECS  = 3;
const XFADE_STEPS = 40;

interface StreamInfo {
  video_path: string;
  music_path: string | null;
  ambient_path: string | null;
  music_volume: number;
  ambient_volume: number;
  is_running: boolean;
  current_track_index: number;
  elapsed_seconds: number;
}

interface PreviewConfig {
  video_path: string | null;
  music_path: string | null;
  music_playlist: string[];
  ambient_path: string | null;
  music_volume: number;
  ambient_volume: number;
}

function isImagePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

export default function PreviewWindow() {
  const [info, setInfo]               = useState<StreamInfo | null>(null);
  const [previewConfig, setPreviewConfig] = useState<PreviewConfig | null>(null);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const ambientRef = useRef<HTMLAudioElement>(null);

  // Two slots for crossfading music
  const audA       = useRef<HTMLAudioElement | null>(null);
  const audB       = useRef<HTMLAudioElement | null>(null);
  const activeSlot = useRef<"a" | "b">("a");

  // Mutable refs (avoid stale closures in interval/event handlers)
  const trackIdxRef     = useRef(0);
  const xfadingRef      = useRef(false);
  const xfadeTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const playlistRef     = useRef<string[]>([]);
  const musicVolRef     = useRef(0.8);
  const isStreamingRef  = useRef(false);

  const seekOnLoadRef = useRef<number | null>(null);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadInfo = async () => {
    try {
      const i = await invoke<StreamInfo | null>("get_current_stream_info");
      setInfo(i);
      return i;
    } catch (_) { return null; }
  };

  useEffect(() => {
    loadInfo().then((i) => { if (i) seekOnLoadRef.current = i.elapsed_seconds; });
    invoke<PreviewConfig>("get_preview_config").then((cfg) => {
      setPreviewConfig(cfg);
      playlistRef.current  = cfg.music_playlist ?? [];
      musicVolRef.current  = cfg.music_volume;
    }).catch(() => {});
    const interval = setInterval(loadInfo, 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Derived source ────────────────────────────────────────────────────────

  const isStreaming = !!info?.is_running;
  const videoPath   = isStreaming ? info!.video_path    : previewConfig?.video_path    ?? null;
  const musicPath   = isStreaming ? info!.music_path    : previewConfig?.music_path    ?? null;
  const ambientPath = isStreaming ? info!.ambient_path  : previewConfig?.ambient_path  ?? null;
  const musicVol    = isStreaming ? info!.music_volume  : previewConfig?.music_volume  ?? 0.8;
  const ambientVol  = isStreaming ? info!.ambient_volume: previewConfig?.ambient_volume ?? 0.5;

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { musicVolRef.current = musicVol; }, [musicVol]);

  // ── Audio element init ────────────────────────────────────────────────────

  useEffect(() => {
    audA.current = new Audio();
    audB.current = new Audio();
    return () => { audA.current?.pause(); audB.current?.pause(); };
  }, []);

  // ── Crossfade (preview mode only) ─────────────────────────────────────────

  const crossfadeToNext = useCallback(() => {
    if (xfadingRef.current || isStreamingRef.current) return;
    const playlist = playlistRef.current;
    if (playlist.length <= 1) return;

    xfadingRef.current = true;
    const nextIdx = (trackIdxRef.current + 1) % playlist.length;

    const outSlot = activeSlot.current;
    const inSlot: "a" | "b" = outSlot === "a" ? "b" : "a";
    const outAud = outSlot === "a" ? audA.current : audB.current;
    const inAud  = inSlot  === "a" ? audA.current : audB.current;
    if (!outAud || !inAud) { xfadingRef.current = false; return; }

    inAud.src    = convertFileSrc(playlist[nextIdx]);
    inAud.volume = 0;
    inAud.play().catch(() => {});

    activeSlot.current  = inSlot;
    trackIdxRef.current = nextIdx;

    let step = 0;
    const stepMs = (XFADE_SECS * 1000) / XFADE_STEPS;
    if (xfadeTimer.current) clearInterval(xfadeTimer.current);
    xfadeTimer.current = setInterval(() => {
      step++;
      const t = Math.min(step / XFADE_STEPS, 1);
      const vol = musicVolRef.current;
      outAud.volume = (1 - t) * vol;
      inAud.volume  = t * vol;
      if (step >= XFADE_STEPS) {
        clearInterval(xfadeTimer.current!);
        xfadeTimer.current = null;
        outAud.pause(); outAud.src = ""; outAud.volume = vol;
        xfadingRef.current = false;
      }
    }, stepMs);
  }, []);

  // Attach timeupdate / ended to both slots
  useEffect(() => {
    const handleTimeUpdate = (aud: HTMLAudioElement) => () => {
      if (isStreamingRef.current) return;
      const isActive =
        (activeSlot.current === "a" && aud === audA.current) ||
        (activeSlot.current === "b" && aud === audB.current);
      if (!isActive || xfadingRef.current) return;
      if (!isFinite(aud.duration) || aud.duration <= 0) return;
      if (playlistRef.current.length <= 1) return;
      const remaining = aud.duration - aud.currentTime;
      if (remaining > 0 && remaining <= XFADE_SECS) crossfadeToNext();
    };
    const handleEnded = () => { if (!xfadingRef.current && !isStreamingRef.current) crossfadeToNext(); };

    const a = audA.current; const b = audB.current;
    if (!a || !b) return;
    const tuA = handleTimeUpdate(a);
    const tuB = handleTimeUpdate(b);
    a.addEventListener("timeupdate", tuA); a.addEventListener("ended", handleEnded);
    b.addEventListener("timeupdate", tuB); b.addEventListener("ended", handleEnded);
    return () => {
      a.removeEventListener("timeupdate", tuA); a.removeEventListener("ended", handleEnded);
      b.removeEventListener("timeupdate", tuB); b.removeEventListener("ended", handleEnded);
    };
  }, [crossfadeToNext]);

  // ── Sync music (preview mode) ─────────────────────────────────────────────

  // When musicPath changes in preview mode, (re)load slot A from scratch
  useEffect(() => {
    if (isStreaming) return; // live mode handled separately
    if (xfadeTimer.current) { clearInterval(xfadeTimer.current); xfadeTimer.current = null; }
    xfadingRef.current = false;

    [audA.current, audB.current].forEach((a) => {
      if (!a) return; a.pause(); a.src = ""; a.volume = 1;
    });
    activeSlot.current  = "a";
    trackIdxRef.current = 0;

    const playlist = previewConfig?.music_playlist ?? [];
    playlistRef.current = playlist;

    if (!musicPath) return;
    const a = audA.current;
    if (!a) return;
    a.src    = convertFileSrc(musicPath);
    a.volume = musicVol;
    a.loop   = playlist.length <= 1;
    a.play().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicPath, isStreaming]);

  // ── Sync music (live stream mode) ─────────────────────────────────────────

  // In live mode use slot A only — crossfade on track-changed event
  const liveXfadeRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<TrackChangedPayload>("track-changed", (event) => {
      setInfo((prev) =>
        prev ? { ...prev, music_path: event.payload.music_path, current_track_index: event.payload.track_index } : prev
      );
      if (!isStreamingRef.current || liveXfadeRef.current) return;
      const newPath = event.payload.music_path;
      if (!newPath) return;

      liveXfadeRef.current = true;
      const outSlot = activeSlot.current;
      const inSlot: "a" | "b" = outSlot === "a" ? "b" : "a";
      const outAud = outSlot === "a" ? audA.current : audB.current;
      const inAud  = inSlot  === "a" ? audA.current : audB.current;
      if (!outAud || !inAud) { liveXfadeRef.current = false; return; }

      inAud.src    = convertFileSrc(newPath);
      inAud.volume = 0;
      inAud.play().catch(() => {});
      activeSlot.current = inSlot;

      let step = 0;
      const stepMs = (XFADE_SECS * 1000) / XFADE_STEPS;
      const timer = setInterval(() => {
        step++;
        const t = Math.min(step / XFADE_STEPS, 1);
        const vol = musicVolRef.current;
        outAud.volume = (1 - t) * vol;
        inAud.volume  = t * vol;
        if (step >= XFADE_STEPS) {
          clearInterval(timer);
          outAud.pause(); outAud.src = ""; outAud.volume = vol;
          liveXfadeRef.current = false;
        }
      }, stepMs);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Initial live stream music load (slot A)
  useEffect(() => {
    if (!isStreaming || !musicPath) return;
    const a = audA.current;
    if (!a) return;
    const src = convertFileSrc(musicPath);
    if (a.src === src) { a.volume = musicVol; return; }
    a.src    = src;
    a.volume = musicVol;
    a.loop   = false;
    a.play().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // ── Sync ambient ──────────────────────────────────────────────────────────

  useEffect(() => {
    const aud = ambientRef.current;
    if (!aud) return;
    if (!ambientPath) { aud.pause(); aud.src = ""; return; }
    const src = convertFileSrc(ambientPath);
    if (aud.src !== src) { aud.src = src; aud.load(); aud.play().catch(() => {}); }
    aud.volume = Math.min(1, Math.max(0, ambientVol));
  }, [ambientPath, ambientVol]);

  // ── Sync video ────────────────────────────────────────────────────────────

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !videoPath || isImagePath(videoPath)) return;
    const src = convertFileSrc(videoPath);
    if (vid.src !== src) {
      const seekTarget = isStreaming ? seekOnLoadRef.current : null;
      seekOnLoadRef.current = null;
      vid.src = src;
      vid.load();
      if (seekTarget != null && seekTarget > 0) {
        const onMeta = () => {
          if (vid.duration && isFinite(vid.duration) && vid.duration > 0) {
            vid.currentTime = seekTarget % vid.duration;
          }
          vid.play().catch(() => {});
          vid.removeEventListener("loadedmetadata", onMeta);
        };
        vid.addEventListener("loadedmetadata", onMeta);
      } else {
        vid.play().catch(() => {});
      }
    }
    vid.volume = 0;
  }, [videoPath, isStreaming]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!videoPath) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-500 gap-3">
        <div className="w-3 h-3 rounded-full bg-zinc-700" />
        <p className="text-sm">No preview available</p>
        <p className="text-xs text-zinc-600">Select a video and click "Pop out" in the main window</p>
      </div>
    );
  }

  const trackName = musicPath?.split(/[\\/]/).pop() ?? "";

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {isImagePath(videoPath) ? (
        <img src={convertFileSrc(videoPath)} className="w-full h-full object-cover" alt="" />
      ) : (
        <video ref={videoRef} autoPlay muted loop playsInline className="w-full h-full object-cover" />
      )}
      <audio ref={ambientRef} autoPlay loop />

      {/* Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isStreaming ? "bg-green-400 animate-pulse" : "bg-purple-400"}`} />
          <span className="text-white text-xs font-medium truncate">
            {isStreaming ? (trackName || "Live") : (trackName || (videoPath?.split(/[\\/]/).pop() ?? "Preview"))}
          </span>
          {isStreaming && (
            <span className="ml-auto text-[10px] text-green-400 font-semibold tracking-wide">LIVE</span>
          )}
        </div>
      </div>
    </div>
  );
}
