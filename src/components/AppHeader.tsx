import { useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import StatusBar from "./StatusBar";
import { RenderJob, StreamStatus, UserAsset } from "../types";

interface Props {
  status: StreamStatus;
  renderJobs: RenderJob[];
  completedRenders: UserAsset[];
  onClearCompleted: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

export default function AppHeader({
  status,
  renderJobs,
  completedRenders,
  onClearCompleted,
  onStart,
  onStop,
  onOpenSettings,
}: Props) {
  const [queueOpen, setQueueOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const totalCount = renderJobs.length + completedRenders.length;

  // Close dropdown on outside click
  useEffect(() => {
    if (!queueOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setQueueOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [queueOpen]);

  // Single shared audio element for playback in the dropdown
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.addEventListener("ended", () => setPlayingId(null));
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const togglePlay = (asset: UserAsset) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === asset.id) {
      audio.pause();
      setPlayingId(null);
    } else {
      audio.src = convertFileSrc(asset.local_path);
      audio.play().catch(() => {});
      setPlayingId(asset.id);
    }
  };

  // Stop playback when dropdown closes
  useEffect(() => {
    if (!queueOpen && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
  }, [queueOpen]);

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-surface-raised px-5 py-3">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-purple-500" />
        <span className="text-sm font-semibold tracking-wide text-zinc-100">Steadycast</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Render queue button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setQueueOpen((o) => !o)}
            title="Render queue"
            className={`relative flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
              queueOpen
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2 3h12v1.5H2zm0 4h12v1.5H2zm0 4h8v1.5H2z" />
            </svg>
            {renderJobs.length > 0 && (
              <span className="flex items-center gap-0.5 text-purple-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
                {renderJobs.length}
              </span>
            )}
            {renderJobs.length === 0 && completedRenders.length > 0 && (
              <span className="text-zinc-400">{completedRenders.length}</span>
            )}
          </button>

          {queueOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
              {totalCount === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">No renders yet.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {/* In-progress */}
                  {renderJobs.length > 0 && (
                    <div className="space-y-2.5 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Generating
                      </p>
                      {renderJobs.map((job) => (
                        <div key={job.id} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="truncate pr-2 text-xs text-zinc-300">{job.label}</span>
                            <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                              {job.progress < 0.05
                                ? "queued"
                                : `${Math.round(job.progress * 100)}%`}
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-zinc-700">
                            <div
                              className="h-full rounded-full bg-purple-500 transition-all duration-300"
                              style={{ width: `${job.progress * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Completed */}
                  {completedRenders.length > 0 && (
                    <div className="space-y-1.5 px-3 py-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Completed
                        </p>
                        <button
                          onClick={() => completedRenders.forEach((a) => onClearCompleted(a.id))}
                          className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
                        >
                          Clear all
                        </button>
                      </div>
                      {completedRenders.map((asset) => {
                        const isPlaying = playingId === asset.id;
                        return (
                          <div key={asset.id} className="flex items-center gap-2">
                            <button
                              onClick={() => togglePlay(asset)}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700"
                            >
                              {isPlaying ? (
                                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                  <rect x="3" y="2" width="4" height="12" rx="1" />
                                  <rect x="9" y="2" width="4" height="12" rx="1" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                  <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                                </svg>
                              )}
                            </button>
                            <span className="flex-1 truncate text-xs text-zinc-300">
                              {asset.name}
                            </span>
                            <button
                              onClick={() => {
                                if (playingId === asset.id) {
                                  audioRef.current?.pause();
                                  setPlayingId(null);
                                }
                                onClearCompleted(asset.id);
                              }}
                              className="shrink-0 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
                              title="Dismiss"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => invoke("open_logs_window").catch(() => {})}
          title="Open FFmpeg logs window"
          className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Logs
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <StatusBar status={status} onStart={onStart} onStop={onStop} />
      </div>
    </header>
  );
}
