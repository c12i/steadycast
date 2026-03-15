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
  status, renderJobs, completedRenders, onClearCompleted,
  onStart, onStop, onOpenSettings,
}: Props) {
  const [queueOpen, setQueueOpen]   = useState(false);
  const [playingId, setPlayingId]   = useState<string | null>(null);
  const audioRef                    = useRef<HTMLAudioElement | null>(null);
  const dropdownRef                 = useRef<HTMLDivElement>(null);

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
    return () => { audio.pause(); audio.src = ""; };
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
    <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-surface-raised shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="font-semibold text-sm tracking-wide text-zinc-100">Lofi Stream Studio</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Render queue button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setQueueOpen((o) => !o)}
            title="Render queue"
            className={`relative px-2.5 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${
              queueOpen
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2 3h12v1.5H2zm0 4h12v1.5H2zm0 4h8v1.5H2z"/>
            </svg>
            {renderJobs.length > 0 && (
              <span className="flex items-center gap-0.5 text-purple-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                {renderJobs.length}
              </span>
            )}
            {renderJobs.length === 0 && completedRenders.length > 0 && (
              <span className="text-zinc-400">{completedRenders.length}</span>
            )}
          </button>

          {queueOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
              {totalCount === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">No renders yet.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {/* In-progress */}
                  {renderJobs.length > 0 && (
                    <div className="px-3 py-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Generating</p>
                      {renderJobs.map((job) => (
                        <div key={job.id} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-300 truncate pr-2">{job.label}</span>
                            <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                              {job.progress < 0.05 ? "queued" : `${Math.round(job.progress * 100)}%`}
                            </span>
                          </div>
                          <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all duration-300"
                              style={{ width: `${job.progress * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Completed */}
                  {completedRenders.length > 0 && (
                    <div className="px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Completed</p>
                        <button
                          onClick={() => completedRenders.forEach((a) => onClearCompleted(a.id))}
                          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
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
                              className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-300 shrink-0 transition-colors"
                            >
                              {isPlaying ? (
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                  <rect x="3" y="2" width="4" height="12" rx="1"/>
                                  <rect x="9" y="2" width="4" height="12" rx="1"/>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                  <path d="M3 2.5l10 5.5-10 5.5V2.5z"/>
                                </svg>
                              )}
                            </button>
                            <span className="flex-1 text-xs text-zinc-300 truncate">{asset.name}</span>
                            <button
                              onClick={() => {
                                if (playingId === asset.id) {
                                  audioRef.current?.pause();
                                  setPlayingId(null);
                                }
                                onClearCompleted(asset.id);
                              }}
                              className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors shrink-0"
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
          className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
        >
          Logs
        </button>
        <button
          onClick={onOpenSettings}
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
        <StatusBar status={status} onStart={onStart} onStop={onStop} />
      </div>
    </header>
  );
}
