import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Platform, UserAsset } from "../types";

/** Must match CROSSFADE_SECS in stream.rs */
const XFADE_SECS = 3;
const XFADE_STEPS = 40;

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
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs tabular-nums text-zinc-500">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-purple-500 disabled:opacity-40"
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
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
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
  const durationMins = durationSeconds ? Math.floor((durationSeconds % 3600) / 60) : "";

  const [selectionOpen, setSelectionOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewTrackIdx, setPreviewTrackIdx] = useState(0);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Audio elements
  // Two slots for crossfading; ambient and video are separate.
  const audA = useRef<HTMLAudioElement | null>(null);
  const audB = useRef<HTMLAudioElement | null>(null);
  const activeSlot = useRef<"a" | "b">("a");
  const ambientAudRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs so crossfade timer never captures stale prop values
  const trackIdxRef = useRef(0);
  const xfadingRef = useRef(false);
  const xfadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedMusicRef = useRef(selectedMusic);
  const musicVolRef = useRef(musicVolume);

  useEffect(() => {
    selectedMusicRef.current = selectedMusic;
  }, [selectedMusic]);
  useEffect(() => {
    musicVolRef.current = musicVolume;
  }, [musicVolume]);

  // Initialise persistent audio elements once
  useEffect(() => {
    audA.current = new Audio();
    audB.current = new Audio();
    return () => {
      audA.current?.pause();
      audB.current?.pause();
    };
  }, []);

  // Keep ambient volume in sync while previewing
  useEffect(() => {
    if (ambientAudRef.current) ambientAudRef.current.volume = ambientVolume;
  }, [ambientVolume]);

  // Sync music volume to whichever slot is active (when not mid-crossfade)
  useEffect(() => {
    if (xfadingRef.current) return;
    const aud = activeSlot.current === "a" ? audA.current : audB.current;
    if (aud) aud.volume = musicVolume;
  }, [musicVolume]);

  // Crossfade logic

  const crossfadeToNext = useCallback(() => {
    if (xfadingRef.current) return;
    const music = selectedMusicRef.current;
    if (music.length <= 1) return; // single track loops via audio.loop

    xfadingRef.current = true;
    const nextIdx = (trackIdxRef.current + 1) % music.length;

    const outSlot = activeSlot.current;
    const inSlot: "a" | "b" = outSlot === "a" ? "b" : "a";
    const outAud = outSlot === "a" ? audA.current : audB.current;
    const inAud = inSlot === "a" ? audA.current : audB.current;
    if (!outAud || !inAud) {
      xfadingRef.current = false;
      return;
    }

    const nextTrack = music[nextIdx];
    if (!nextTrack?.local_path) {
      xfadingRef.current = false;
      return;
    }

    inAud.src = convertFileSrc(nextTrack.local_path);
    inAud.volume = 0;
    inAud.play().catch(() => {});

    activeSlot.current = inSlot;
    trackIdxRef.current = nextIdx;
    setPreviewTrackIdx(nextIdx);

    let step = 0;
    const stepMs = (XFADE_SECS * 1000) / XFADE_STEPS;
    if (xfadeTimer.current) clearInterval(xfadeTimer.current);
    xfadeTimer.current = setInterval(() => {
      step++;
      const t = Math.min(step / XFADE_STEPS, 1);
      const vol = musicVolRef.current;
      outAud.volume = (1 - t) * vol;
      inAud.volume = t * vol;
      if (step >= XFADE_STEPS) {
        clearInterval(xfadeTimer.current!);
        xfadeTimer.current = null;
        outAud.pause();
        outAud.src = "";
        outAud.volume = vol;
        xfadingRef.current = false;
      }
    }, stepMs);
  }, []);

  // Attach timeupdate / ended listeners to both audio elements
  useEffect(() => {
    const handleTimeUpdate = (aud: HTMLAudioElement) => () => {
      const isActive =
        (activeSlot.current === "a" && aud === audA.current) ||
        (activeSlot.current === "b" && aud === audB.current);
      if (!isActive || xfadingRef.current) return;
      if (!isFinite(aud.duration) || aud.duration <= 0) return;
      if (selectedMusicRef.current.length <= 1) return;
      const remaining = aud.duration - aud.currentTime;
      if (remaining > 0 && remaining <= XFADE_SECS) crossfadeToNext();
    };
    const handleEnded = () => {
      if (!xfadingRef.current) crossfadeToNext();
    };

    const a = audA.current;
    const b = audB.current;
    if (!a || !b) return;

    const tuA = handleTimeUpdate(a);
    const tuB = handleTimeUpdate(b);
    a.addEventListener("timeupdate", tuA);
    a.addEventListener("ended", handleEnded);
    b.addEventListener("timeupdate", tuB);
    b.addEventListener("ended", handleEnded);
    return () => {
      a.removeEventListener("timeupdate", tuA);
      a.removeEventListener("ended", handleEnded);
      b.removeEventListener("timeupdate", tuB);
      b.removeEventListener("ended", handleEnded);
    };
  }, [crossfadeToNext]);

  // Stop preview when stream starts
  useEffect(() => {
    if (isStreaming) stopPreview(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview start / stop

  function startPreview() {
    if (!selectedVideo?.local_path) return;
    setSelectionOpen(true);

    // Reset crossfade state
    if (xfadeTimer.current) {
      clearInterval(xfadeTimer.current);
      xfadeTimer.current = null;
    }
    xfadingRef.current = false;
    trackIdxRef.current = 0;
    activeSlot.current = "a";
    setPreviewTrackIdx(0);

    // Load first track into slot A
    const track = selectedMusic[0];
    const a = audA.current!;
    if (track?.local_path) {
      a.src = convertFileSrc(track.local_path);
      a.volume = musicVolume;
      a.loop = selectedMusic.length === 1;
      a.play().catch(() => {});
    }

    // Ambient
    if (selectedAmbient?.local_path) {
      const amb = new Audio(convertFileSrc(selectedAmbient.local_path));
      amb.loop = true;
      amb.volume = ambientVolume;
      amb.play().catch(() => {});
      ambientAudRef.current = amb;
    }

    if (!isImagePath(selectedVideo.local_path)) {
      videoRef.current?.play().catch(() => {});
    }
    setPreviewing(true);
  }

  function stopPreview() {
    if (xfadeTimer.current) {
      clearInterval(xfadeTimer.current);
      xfadeTimer.current = null;
    }
    xfadingRef.current = false;

    [audA.current, audB.current].forEach((a) => {
      if (!a) return;
      a.pause();
      a.src = "";
      a.loop = false;
      a.volume = 1;
    });
    if (ambientAudRef.current) {
      ambientAudRef.current.pause();
      ambientAudRef.current.src = "";
      ambientAudRef.current = null;
    }
    if (!isImagePath(selectedVideo?.local_path)) videoRef.current?.pause();
    setPreviewing(false);
    setPreviewTrackIdx(0);
    trackIdxRef.current = 0;
  }

  const togglePreview = () => (previewing ? stopPreview() : startPreview());

  // Pop-out preview

  const popOutPreview = async () => {
    if (!selectedVideo?.local_path) return;
    stopPreview();
    try {
      await invoke("set_preview_config", {
        config: {
          video_path: selectedVideo.local_path,
          music_path: selectedMusic[0]?.local_path ?? null,
          music_playlist: selectedMusic.map((m) => m.local_path!).filter(Boolean),
          ambient_path: selectedAmbient?.local_path ?? null,
          music_volume: musicVolume,
          ambient_volume: ambientVolume,
        },
      });
      await invoke("open_preview_window");
    } catch (_) {}
  };

  const handleDurationChange = (hours: string, mins: string) => {
    const h = parseInt(hours) || 0;
    const m = parseInt(mins) || 0;
    const total = h * 3600 + m * 60;
    onDurationChange(total > 0 ? total : undefined);
  };

  const currentPreviewTrack = previewing ? (selectedMusic[previewTrackIdx] ?? null) : null;
  const hasAudio = selectedMusic.length > 0 || !!selectedAmbient;
  const canPreview = !!selectedVideo?.local_path && hasAudio;

  return (
    <div className="flex flex-col gap-5 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Stream Configuration
      </h2>

      {/* ── Selection summary ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <button
          onClick={() => setSelectionOpen((o) => !o)}
          className="flex w-full items-center justify-between bg-zinc-900 px-3 py-2.5 transition-colors hover:bg-zinc-800"
        >
          <span className="text-xs font-medium text-zinc-300">Selection</span>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${selectedVideo ? "text-blue-400" : "text-zinc-600"}`}>
              {selectedVideo ? "video ✓" : "no video"}
            </span>
            <span
              className={`text-[10px] ${selectedMusic.length > 0 ? "text-purple-400" : "text-zinc-600"}`}
            >
              {selectedMusic.length > 0
                ? `${selectedMusic.length} track${selectedMusic.length !== 1 ? "s" : ""}`
                : "no music"}
            </span>
            <span className={`text-[10px] ${selectedAmbient ? "text-green-400" : "text-zinc-600"}`}>
              {selectedAmbient ? "ambient ✓" : "no ambient"}
            </span>
            <ChevronIcon open={selectionOpen} />
          </div>
        </button>

        {selectionOpen && (
          <div className="space-y-3 border-t border-zinc-800 bg-zinc-950 px-3 py-3">
            {/* Video preview */}
            <div
              ref={videoContainerRef}
              className="group relative aspect-video overflow-hidden rounded-md bg-zinc-900"
            >
              {selectedVideo?.local_path ? (
                <>
                  {isImagePath(selectedVideo.local_path) ? (
                    <img
                      src={convertFileSrc(selectedVideo.local_path)}
                      className="h-full w-full object-cover"
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
                      className="h-full w-full object-cover"
                    />
                  )}
                  <button
                    onClick={popOutPreview}
                    disabled={!hasAudio}
                    title={hasAudio ? "Open in separate window" : "Select music or ambient first"}
                    className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded bg-zinc-900/70 text-zinc-400 opacity-0 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M6 2H2v12h12V9.5h-1.5V12.5h-9v-9H6V2zm4.5 0H14v3.5h-1.5V3.56l-5.47 5.47-1.06-1.06L11.44 2.5H9.5V1H14v4.5h-1.5V2z" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                  No video selected
                </div>
              )}
            </div>

            {/* Video name */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Video
              </p>
              {selectedVideo ? (
                <p className="truncate text-xs text-zinc-200">{selectedVideo.name}</p>
              ) : (
                <p className="text-xs italic text-zinc-600">None selected</p>
              )}
            </div>

            {/* Music tracks */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Music · {selectedMusic.length} track{selectedMusic.length !== 1 ? "s" : ""}
              </p>
              {selectedMusic.length === 0 ? (
                <p className="text-xs italic text-zinc-600">None selected</p>
              ) : (
                <ol className="space-y-1">
                  {selectedMusic.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-1.5">
                      <span className="w-3 shrink-0 text-[10px] tabular-nums text-zinc-600">
                        {i + 1}.
                      </span>
                      <span
                        className={`truncate text-xs ${
                          currentPreviewTrack?.id === m.id
                            ? "font-medium text-purple-400"
                            : "text-zinc-300"
                        }`}
                      >
                        {m.name}
                      </span>
                      {currentPreviewTrack?.id === m.id && (
                        <span className="shrink-0 animate-pulse text-[9px] text-purple-400">▶</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Ambient */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Ambient
              </p>
              {selectedAmbient ? (
                <p className="truncate text-xs text-zinc-200">{selectedAmbient.name}</p>
              ) : (
                <p className="text-xs italic text-zinc-600">None</p>
              )}
            </div>

            {/* Preview button */}
            <button
              onClick={togglePreview}
              disabled={!canPreview}
              className={`flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                previewing
                  ? "bg-purple-700 text-white hover:bg-purple-800"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {previewing ? (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <rect x="3" y="2" width="4" height="12" rx="1" />
                    <rect x="9" y="2" width="4" height="12" rx="1" />
                  </svg>
                  Stop Preview
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
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
                  <span className="flex-1 text-xs text-zinc-400">Clear all selections?</span>
                  <button
                    onClick={() => {
                      stopPreview();
                      onClearSelection();
                      setClearConfirm(false);
                    }}
                    className="rounded bg-red-800 px-2.5 py-1 text-xs text-red-200 transition-colors hover:bg-red-700"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="rounded bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setClearConfirm(true)}
                  disabled={isStreaming}
                  className="w-full rounded border border-transparent py-1.5 text-xs text-zinc-600 transition-colors hover:border-red-900/50 hover:bg-red-950/30 hover:text-red-400 disabled:opacity-40"
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
              className={`rounded-lg border py-2 text-xs font-medium capitalize transition-all ${
                platform === p
                  ? "border-purple-600 bg-purple-700 text-white"
                  : "border-zinc-700 bg-surface-overlay text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
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
          className="rounded-lg border border-zinc-700 bg-surface px-3 py-2.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-purple-500 focus:outline-none disabled:opacity-40"
        />
        <p className="text-[10px] text-zinc-600">
          {platform === "youtube"
            ? "Found in YouTube Studio → Go Live → Stream Key"
            : "Found in Twitch Dashboard → Settings → Stream Key"}
        </p>
      </div>

      {/* Volume controls */}
      <div className="flex flex-col gap-4 py-2">
        <VolumeSlider label="Music Volume" value={musicVolume} onChange={onMusicVolumeChange} />
        <VolumeSlider
          label="Ambient Volume"
          value={ambientVolume}
          onChange={onAmbientVolumeChange}
        />
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-400">Duration (optional)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="0"
            value={durationHours}
            disabled={isStreaming}
            onChange={(e) => handleDurationChange(e.target.value, String(durationMins))}
            className="w-16 rounded border border-zinc-700 bg-surface px-2 py-2 text-center text-xs tabular-nums text-zinc-100 focus:border-purple-500 focus:outline-none disabled:opacity-40"
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
            className="w-16 rounded border border-zinc-700 bg-surface px-2 py-2 text-center text-xs tabular-nums text-zinc-100 focus:border-purple-500 focus:outline-none disabled:opacity-40"
          />
          <span className="text-xs text-zinc-500">m</span>
          {durationSeconds && (
            <button
              onClick={() => onDurationChange(undefined)}
              className="ml-1 text-xs text-zinc-600 hover:text-zinc-400"
            >
              ✕
            </button>
          )}
        </div>
        <p className="text-[10px] text-zinc-600">Leave blank to stream indefinitely</p>
      </div>

      {/* Start / Stop */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        {isStreaming ? (
          <button
            onClick={onStop}
            className="w-full rounded-lg bg-red-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            Stop Stream
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={!hasAudio}
            title={!hasAudio ? "Select music or ambient audio first" : undefined}
            className="w-full rounded-lg bg-purple-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start Stream
          </button>
        )}
      </div>
    </div>
  );
}
