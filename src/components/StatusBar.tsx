import { StreamStatus } from "../types";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

interface Props {
  status: StreamStatus;
  onStart: () => void;
  onStop: () => void;
}

export default function StatusBar({ status }: Props) {
  return (
    <div className="flex items-center gap-3">
      {status.is_running ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
              Live
            </span>
          </div>
          <span className="text-xs text-zinc-500 tabular-nums font-mono">
            {formatElapsed(status.elapsed_seconds)}
          </span>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-zinc-600" />
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Offline</span>
        </div>
      )}
    </div>
  );
}
