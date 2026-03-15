import { useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Platform, UserAsset } from "../types";

interface Props {
  platform: Platform;
  streamKey: string;
  musicVolume: number;
  ambientVolume: number;
  durationSeconds: number | undefined;
  isStreaming: boolean;
  selectedVideo: UserAsset | null;
  selectedMusic: UserAsset[];
  selectedAmbient: UserAsset | null;
  onPlatformChange: (p: Platform) => void;
  onStreamKeyChange: (key: string) => void;
  onMusicVolumeChange: (v: number) => void;
  onAmbientVolumeChange: (v: number) => void;
  onDurationChange: (s: number | undefined) => void;
  onStart: () => void;
  onStop: () => void;
  onClearSelection: () => void;
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

function isImagePath(path: string | undefined | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M3 5.5l5 5 5-5H3z" />
    </svg>
  );
}

export default function StreamConfig({
  platform,
  streamKey,
  musicVolume,
  ambientVolume,
  durationSeconds,
  isStreaming,
  selectedVideo,
  selectedMusic,
  selectedAmbient,
  onPlatformChange,
  onStreamKeyChange,
  onMusicVolumeChange,
  onAmbientVolumeChange,
  onDurationChange,
  onStart,
  onStop,
  onClearSelection,
}: Props) {
  const durationHours = durationSeconds ? Math.floor(durationSeconds / 3600) : "";
  const durationMins  = durationSeconds ? Math.floor((durationSeconds % 3600) / 60) : "";

  const [selectionOpen, setSelectionOpen]     = useState(false);
  const [previewing, setPreviewing]           = useState(false);
  const [previewTrackIdx, setPreviewTrackIdx] = useState(0);
  const [clearConfirm, setClearConfirm]       = useState(false);

  const musicAudioRef     = useRef<HTMLAudioElement | null>(null);
  const ambientAudioRef   = useRef<HTMLAudioElement | null>(null);
  const videoRef          = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  const popOutPreview = async () => {
    if (!selectedVideo?.local_path) return;
    const currentTrack = selectedMusic[previewTrackIdx] ?? selectedMusic[0] ?? null;
    stopPreview();
    try {
      await invoke("set_preview_config", {
        config: {
          video_path:    selectedVideo.local_path,
          music_path:    currentTrack?.local_path ?? null,
          ambient_path:  selectedAmbient?.local_path ?? null,
          music_volume:  musicVolume,
          ambient_volume: ambientVolume,
        },
      });
      await invoke("open_preview_window");
    } catch (_) {}
  };

  // Keep audio volumes in sync with sliders while previewing
  useEffect(() => {
    if (musicAudioRef.current)   musicAudioRef.current.volume   = musicVolume;
    if (ambientAudioRef.current) ambientAudioRef.current.volume = ambientVolume;
  }, [musicVolume, ambientVolume]);

  // Stop preview when stream starts
  useEffect(() => {
    if (isStreaming) stopPreview();
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Advance to next track when current one ends
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio || !previewing) return;
    const onEnded = () => {
      const next = (previewTrackIdx + 1) % selectedMusic.length;
      setPreviewTrackIdx(next);
      const nextTrack = selectedMusic[next];
      if (nextTrack?.local_path) {
        audio.src = convertFileSrc(nextTrack.local_path);
        audio.play().catch(() => {});
      }
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [previewing, previewTrackIdx, selectedMusic]);

  function startPreview() {
    if (!selectedVideo?.local_path) return;

    // Open the selection panel so the video is visible
    setSelectionOpen(true);

    // Music (optional)
    const track = selectedMusic[previewTrackIdx] ?? selectedMusic[0];
    if (track?.local_path) {
      const mAudio = new Audio(convertFileSrc(track.local_path));
      mAudio.volume = musicVolume;
      mAudio.play().catch(() => {});
      musicAudioRef.current = mAudio;
    }

    // Ambient (optional)
    if (selectedAmbient?.local_path) {
      const aAudio = new Audio(convertFileSrc(selectedAmbient.local_path));
      aAudio.loop   = true;
      aAudio.volume = ambientVolume;
      aAudio.play().catch(() => {});
      ambientAudioRef.current = aAudio;
    }

    if (!isImagePath(selectedVideo.local_path)) {
      videoRef.current?.play().catch(() => {});
    }
    setPreviewing(true);
  }

  function stopPreview() {
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current.src = "";
      musicAudioRef.current = null;
    }
    if (ambientAudioRef.current) {
      ambientAudioRef.current.pause();
      ambientAudioRef.current.src = "";
      ambientAudioRef.current = null;
    }
    if (!isImagePath(selectedVideo?.local_path)) {
      videoRef.current?.pause();
    }
    setPreviewing(false);
    setPreviewTrackIdx(0);
  }

  const togglePreview = () => (previewing ? stopPreview() : startPreview());

  const handleDurationChange = (hours: string, mins: string) => {
    const h = parseInt(hours) || 0;
    const m = parseInt(mins) || 0;
    const total = h * 3600 + m * 60;
    onDurationChange(total > 0 ? total : undefined);
  };

  const currentPreviewTrack = previewing ? (selectedMusic[previewTrackIdx] ?? null) : null;
  const hasAudio   = selectedMusic.length > 0 || !!selectedAmbient;
  const canPreview = !!selectedVideo?.local_path && hasAudio;

  return (
    <div className="flex flex-col gap-5 p-4">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        Stream Configuration
      </h2>

      {/* ── Selection summary ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <button
          onClick={() => setSelectionOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 transition-colors"
        >
          <span className="text-xs font-medium text-zinc-300">Selection</span>
          <div className="flex items-center gap-2">
            {/* Compact status badges */}
            <span className={`text-[10px] ${selectedVideo ? "text-blue-400" : "text-zinc-600"}`}>
              {selectedVideo ? "video ✓" : "no video"}
            </span>
            <span className={`text-[10px] ${selectedMusic.length > 0 ? "text-purple-400" : "text-zinc-600"}`}>
              {selectedMusic.length > 0 ? `${selectedMusic.length} track${selectedMusic.length !== 1 ? "s" : ""}` : "no music"}
            </span>
            <span className={`text-[10px] ${selectedAmbient ? "text-green-400" : "text-zinc-600"}`}>
              {selectedAmbient ? "ambient ✓" : "no ambient"}
            </span>
            <ChevronIcon open={selectionOpen} />
          </div>
        </button>

        {selectionOpen && (
          <div className="px-3 py-3 bg-zinc-950 border-t border-zinc-800 space-y-3">
            {/* Video preview */}
            <div ref={videoContainerRef} className="relative rounded-md overflow-hidden bg-zinc-900 aspect-video group">
              {selectedVideo?.local_path ? (
                <>
                  {isImagePath(selectedVideo.local_path) ? (
                    <img
                      src={convertFileSrc(selectedVideo.local_path)}
                      className="w-full h-full object-cover"
                      alt={selectedVideo.name}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      key={selectedVideo.id}
                      src={convertFileSrc(selectedVideo.local_path)}
                      muted
                      loop
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    onClick={popOutPreview}
                    disabled={!hasAudio}
                    title={hasAudio ? "Open in separate window" : "Select music or ambient first"}
                    className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-zinc-900/70 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M6 2H2v12h12V9.5h-1.5V12.5h-9v-9H6V2zm4.5 0H14v3.5h-1.5V3.56l-5.47 5.47-1.06-1.06L11.44 2.5H9.5V1H14v4.5h-1.5V2z"/>
                    </svg>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                  No video selected
                </div>
              )}
            </div>

            {/* Video name */}
            <div>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-1">Video</p>
              {selectedVideo ? (
                <p className="text-xs text-zinc-200 truncate">{selectedVideo.name}</p>
              ) : (
                <p className="text-xs text-zinc-600 italic">None selected</p>
              )}
            </div>

            {/* Music tracks */}
            <div>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-1">
                Music · {selectedMusic.length} track{selectedMusic.length !== 1 ? "s" : ""}
              </p>
              {selectedMusic.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">None selected</p>
              ) : (
                <ol className="space-y-1">
                  {selectedMusic.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-600 tabular-nums w-3 shrink-0">{i + 1}.</span>
                      <span className={`text-xs truncate ${
                        currentPreviewTrack?.id === m.id ? "text-purple-400 font-medium" : "text-zinc-300"
                      }`}>
                        {m.name}
                      </span>
                      {currentPreviewTrack?.id === m.id && (
                        <span className="text-[9px] text-purple-400 shrink-0 animate-pulse">▶</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Ambient */}
            <div>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-1">Ambient</p>
              {selectedAmbient ? (
                <p className="text-xs text-zinc-200 truncate">{selectedAmbient.name}</p>
              ) : (
                <p className="text-xs text-zinc-600 italic">None</p>
              )}
            </div>

            {/* Preview button */}
            <button
              onClick={togglePreview}
              disabled={!canPreview}
              className={`w-full py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                previewing
                  ? "bg-purple-700 hover:bg-purple-800 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              {previewing ? (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <rect x="3" y="2" width="4" height="12" rx="1" />
                    <rect x="9" y="2" width="4" height="12" rx="1" />
                  </svg>
                  Stop Preview
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                  </svg>
                  Preview Mix
                </>
              )}
            </button>

            {/* Clear selection */}
            <div className="border-t border-zinc-800 pt-2">
              {clearConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 flex-1">Clear all selections?</span>
                  <button
                    onClick={() => {
                      stopPreview();
                      onClearSelection();
                      setClearConfirm(false);
                    }}
                    className="px-2.5 py-1 text-xs bg-red-800 hover:bg-red-700 rounded text-red-200 transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="px-2.5 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setClearConfirm(true)}
                  disabled={isStreaming}
                  className="w-full py-1.5 rounded text-xs text-zinc-600 hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/50 transition-colors disabled:opacity-40"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        )}
      </div>

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
        <VolumeSlider label="Music Volume"   value={musicVolume}   onChange={onMusicVolumeChange} />
        <VolumeSlider label="Ambient Volume" value={ambientVolume} onChange={onAmbientVolumeChange} />
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
            onChange={(e) => handleDurationChange(e.target.value, String(durationMins))}
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
            onChange={(e) => handleDurationChange(String(durationHours), e.target.value)}
            className="w-16 bg-surface text-zinc-100 text-xs rounded px-2 py-2 border border-zinc-700 focus:outline-none focus:border-purple-500 disabled:opacity-40 tabular-nums text-center"
          />
          <span className="text-xs text-zinc-500">m</span>
          {durationSeconds && (
            <button onClick={() => onDurationChange(undefined)} className="text-xs text-zinc-600 hover:text-zinc-400 ml-1">
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
            disabled={!hasAudio}
            title={!hasAudio ? "Select music or ambient audio first" : undefined}
            className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            Start Stream
          </button>
        )}
      </div>
    </div>
  );
}
