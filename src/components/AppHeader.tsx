import { invoke } from "@tauri-apps/api/core";
import StatusBar from "./StatusBar";
import { StreamStatus } from "../types";

interface Props {
  status: StreamStatus;
  onStart: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

export default function AppHeader({ status, onStart, onStop, onOpenSettings }: Props) {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-surface-raised shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="font-semibold text-sm tracking-wide text-zinc-100">Lofi Stream Studio</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => invoke("open_preview_window").catch(() => {})}
          title="Open stream preview window"
          className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
        >
          Preview
        </button>
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
