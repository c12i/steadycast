import { Platform } from "../types";

interface Props {
  platform: Platform;
  streamKey: string;
  musicVolume: number;
  ambientVolume: number;
  durationSeconds: number | undefined;
  isStreaming: boolean;
  onPlatformChange: (p: Platform) => void;
  onStreamKeyChange: (key: string) => void;
  onMusicVolumeChange: (v: number) => void;
  onAmbientVolumeChange: (v: number) => void;
  onDurationChange: (s: number | undefined) => void;
  onStart: () => void;
  onStop: () => void;
}

function VolumeSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs text-zinc-500 tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-purple-500 disabled:opacity-40"
      />
    </div>
  );
}

export default function StreamConfig({
  platform,
  streamKey,
  musicVolume,
  ambientVolume,
  durationSeconds,
  isStreaming,
  onPlatformChange,
  onStreamKeyChange,
  onMusicVolumeChange,
  onAmbientVolumeChange,
  onDurationChange,
  onStart,
  onStop,
}: Props) {
  const durationHours = durationSeconds ? Math.floor(durationSeconds / 3600) : "";
  const durationMins = durationSeconds
    ? Math.floor((durationSeconds % 3600) / 60)
    : "";

  const handleDurationChange = (hours: string, mins: string) => {
    const h = parseInt(hours) || 0;
    const m = parseInt(mins) || 0;
    const total = h * 3600 + m * 60;
    onDurationChange(total > 0 ? total : undefined);
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        Stream Configuration
      </h2>

      {/* Platform selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-400">Platform</label>
        <div className="grid grid-cols-2 gap-2">
          {(["youtube", "twitch"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => onPlatformChange(p)}
              disabled={isStreaming}
              className={`py-2 rounded-lg text-xs font-medium capitalize transition-all border ${
                platform === p
                  ? "bg-purple-700 border-purple-600 text-white"
                  : "bg-surface-overlay border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
              } disabled:opacity-40`}
            >
              {p === "youtube" ? "YouTube" : "Twitch"}
            </button>
          ))}
        </div>
      </div>

      {/* Stream key */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-400">Stream Key</label>
        <input
          type="password"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          value={streamKey}
          disabled={isStreaming}
          onChange={(e) => onStreamKeyChange(e.target.value)}
          className="bg-surface text-zinc-100 text-xs rounded-lg px-3 py-2.5 border border-zinc-700 focus:outline-none focus:border-purple-500 placeholder-zinc-600 disabled:opacity-40 font-mono"
        />
        <p className="text-[10px] text-zinc-600">
          {platform === "youtube"
            ? "Found in YouTube Studio → Go Live → Stream Key"
            : "Found in Twitch Dashboard → Settings → Stream Key"}
        </p>
      </div>

      {/* Volume controls */}
      <div className="flex flex-col gap-4 py-2">
        <VolumeSlider
          label="Music Volume"
          value={musicVolume}
          onChange={onMusicVolumeChange}
          disabled={false}
        />
        <VolumeSlider
          label="Ambient Volume"
          value={ambientVolume}
          onChange={onAmbientVolumeChange}
          disabled={false}
        />
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-400">Duration (optional)</label>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={0}
            placeholder="0"
            value={durationHours}
            disabled={isStreaming}
            onChange={(e) =>
              handleDurationChange(e.target.value, String(durationMins))
            }
            className="w-16 bg-surface text-zinc-100 text-xs rounded px-2 py-2 border border-zinc-700 focus:outline-none focus:border-purple-500 disabled:opacity-40 tabular-nums text-center"
          />
          <span className="text-xs text-zinc-500">h</span>
          <input
            type="number"
            min={0}
            max={59}
            placeholder="0"
            value={durationMins}
            disabled={isStreaming}
            onChange={(e) =>
              handleDurationChange(String(durationHours), e.target.value)
            }
            className="w-16 bg-surface text-zinc-100 text-xs rounded px-2 py-2 border border-zinc-700 focus:outline-none focus:border-purple-500 disabled:opacity-40 tabular-nums text-center"
          />
          <span className="text-xs text-zinc-500">m</span>
          {durationSeconds && (
            <button
              onClick={() => onDurationChange(undefined)}
              className="text-xs text-zinc-600 hover:text-zinc-400 ml-1"
            >
              ✕
            </button>
          )}
        </div>
        <p className="text-[10px] text-zinc-600">Leave blank to stream indefinitely</p>
      </div>

      {/* Start / Stop */}
      <div className="mt-auto pt-4 border-t border-zinc-800">
        {isStreaming ? (
          <button
            onClick={onStop}
            className="w-full py-3 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
          >
            Stop Stream
          </button>
        ) : (
          <button
            onClick={onStart}
            className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold transition-colors"
          >
            Start Stream
          </button>
        )}
      </div>
    </div>
  );
}
