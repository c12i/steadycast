import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { TrackChangedPayload } from "../types";

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
  ambient_path: string | null;
  music_volume: number;
  ambient_volume: number;
}

export default function PreviewWindow() {
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [previewConfig, setPreviewConfig] = useState<PreviewConfig | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const ambientRef = useRef<HTMLAudioElement>(null);

  // Keep a ref to elapsed_seconds at mount time so we can seek on first load
  const seekOnLoadRef = useRef<number | null>(null);

  const loadInfo = async () => {
    try {
      const i = await invoke<StreamInfo | null>("get_current_stream_info");
      setInfo(i);
      return i;
    } catch (_) {
      return null;
    }
  };

  // Initial load — get both stream info and preview config
  useEffect(() => {
    loadInfo().then((i) => {
      if (i) seekOnLoadRef.current = i.elapsed_seconds;
    });
    invoke<PreviewConfig>("get_preview_config").then(setPreviewConfig).catch(() => {});
    const interval = setInterval(loadInfo, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen for track changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<TrackChangedPayload>("track-changed", (event) => {
      setInfo((prev) =>
        prev
          ? { ...prev, music_path: event.payload.music_path, current_track_index: event.payload.track_index }
          : prev
      );
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Decide which source of data to use
  const isStreaming = !!info?.is_running;
  const videoPath   = isStreaming ? info!.video_path    : previewConfig?.video_path    ?? null;
  const musicPath   = isStreaming ? info!.music_path    : previewConfig?.music_path    ?? null;
  const ambientPath = isStreaming ? info!.ambient_path  : previewConfig?.ambient_path  ?? null;
  const musicVol    = isStreaming ? info!.music_volume  : previewConfig?.music_volume  ?? 0.8;
  const ambientVol  = isStreaming ? info!.ambient_volume: previewConfig?.ambient_volume ?? 0.5;

  // Sync video src; on first load seek to elapsed % duration to resume in-loop position
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !videoPath) return;
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
    vid.volume = 0; // video muted — audio from separate elements
  }, [videoPath, isStreaming]);

  // Sync music src + volume
  useEffect(() => {
    const aud = musicRef.current;
    if (!aud) return;
    if (!musicPath) {
      aud.pause();
      aud.src = "";
      return;
    }
    const src = convertFileSrc(musicPath);
    if (aud.src !== src) {
      aud.src = src;
      aud.load();
      aud.play().catch(() => {});
    }
    aud.volume = Math.min(1, Math.max(0, musicVol));
  }, [musicPath, musicVol]);

  // Sync ambient src + volume
  useEffect(() => {
    const aud = ambientRef.current;
    if (!aud) return;
    if (!ambientPath) {
      aud.pause();
      aud.src = "";
      return;
    }
    const src = convertFileSrc(ambientPath);
    if (aud.src !== src) {
      aud.src = src;
      aud.load();
      aud.play().catch(() => {});
    }
    aud.volume = Math.min(1, Math.max(0, ambientVol));
  }, [ambientPath, ambientVol]);

  const hasContent = !!videoPath;
  if (!hasContent) {
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
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-full object-cover"
      />
      <audio ref={musicRef} autoPlay />
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
