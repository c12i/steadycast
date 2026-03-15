import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LogEvent {
  line: string;
  is_stderr: boolean;
}

export default function LogsWindow() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Poll for all logs every 2s — covers any events missed before this window opened
  useEffect(() => {
    const load = () =>
      invoke<LogEvent[]>("get_ffmpeg_logs")
        .then((all) => setLogs(all))
        .catch(() => {});
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  // Also listen for live log events for immediate append
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<LogEvent>("ffmpeg-log", () => {
      // A new line arrived — just re-fetch the full buffer so we stay in sync
      invoke<LogEvent[]>("get_ffmpeg_logs")
        .then((all) => setLogs(all))
        .catch(() => {});
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const handleClear = async () => {
    await invoke("clear_ffmpeg_logs").catch(() => {});
    setLogs([]);
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 font-mono text-xs text-zinc-100">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="font-sans text-sm font-semibold text-zinc-400">FFmpeg Logs</span>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer select-none items-center gap-1.5 font-sans text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-purple-500"
            />
            Auto-scroll
          </label>
          <button
            onClick={handleClear}
            className="rounded bg-zinc-800 px-2 py-1 font-sans text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-0.5 overflow-y-auto p-3"
      >
        {logs.length === 0 && (
          <div className="pt-4 text-center font-sans text-zinc-600">
            No logs yet — start a stream to see FFmpeg output.
          </div>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all leading-relaxed ${
              log.is_stderr ? "text-amber-400" : "text-zinc-300"
            }`}
          >
            {log.line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
