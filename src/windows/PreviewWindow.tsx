import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { TrackChangedPayload } from "../types";

interface StreamInfo {
  video_path: string;
  music_path: string;
  ambient_path: string | null;
  music_volume: number;
  ambient_volume: number;
  is_running: boolean;
  current_track_index: number;
  elapsed_seconds: number;
}

export default function PreviewWindow() {
  const [info, setInfo] = useState<StreamInfo | null>(null);
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

  // Initial load — capture elapsed for seeking, then poll for updates
  useEffect(() => {
    loadInfo().then((i) => {
      if (i) seekOnLoadRef.current = i.elapsed_seconds;
    });
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

  // Sync video src; on first load seek to elapsed % duration to resume in-loop position
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !info?.video_path) return;
    const src = convertFileSrc(info.video_path);
    if (vid.src !== src) {
      const seekTarget = seekOnLoadRef.current;
      seekOnLoadRef.current = null; // only seek once on open

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
    vid.volume = 0; // video muted in preview (audio comes from separate elements)
  }, [info?.video_path]);

  // Sync music src + volume
  useEffect(() => {
    const aud = musicRef.current;
    if (!aud || !info?.music_path) return;
    const src = convertFileSrc(info.music_path);
    if (aud.src !== src) {
      aud.src = src;
      aud.load();
      aud.play().catch(() => {});
    }
    aud.volume = Math.min(1, Math.max(0, info.music_volume ?? 0.8));
  }, [info?.music_path, info?.music_volume]);

  // Sync ambient src + volume
  useEffect(() => {
    const aud = ambientRef.current;
    if (!aud) return;
    if (!info?.ambient_path) {
      aud.pause();
      aud.src = "";
      return;
    }
    const src = convertFileSrc(info.ambient_path);
    if (aud.src !== src) {
      aud.src = src;
      aud.load();
      aud.play().catch(() => {});
    }
    aud.volume = Math.min(1, Math.max(0, info.ambient_volume ?? 0.5));
  }, [info?.ambient_path, info?.ambient_volume]);

  if (!info || !info.is_running) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-500 gap-3">
        <div className="w-3 h-3 rounded-full bg-zinc-700" />
        <p className="text-sm">No stream running</p>
        <p className="text-xs text-zinc-600">Start a stream from the main window</p>
      </div>
    );
  }

  const trackName = info.music_path.split(/[\\/]/).pop() ?? "";

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

      {/* Track name overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span className="text-white text-xs font-medium truncate">{trackName}</span>
        </div>
      </div>
    </div>
  );
}
