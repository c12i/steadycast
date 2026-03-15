import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Density, DrumConfig, DrumPattern, Instrument, MelodyStyle, MELODY_STYLES, SynthConfig, Vibe, randomizeConfig } from "../lib/SyntheticEngine";
import { UserAsset } from "../types";

interface Props {
  config: SynthConfig;
  isStreaming: boolean;
  isPreviewing: boolean;
  synthTracks: UserAsset[];
  selectedMusicIds: Set<string>;
  onChange: (partial: Partial<SynthConfig>) => void;
  onTogglePreview: () => void;
  onGenerate: (durationSeconds: number) => void;
  onToggleTrack: (asset: UserAsset) => void;
  onDeleteTrack: (id: string) => void;
  onRandomize: (config: SynthConfig) => void;
  onRenameTrack: (id: string, name: string) => void;
  hideTracks?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DRUM_PATTERNS: { id: DrumPattern; label: string; desc: string }[] = [
  { id: "boom-bap",      label: "Boom Bap",      desc: "Classic hip-hop — punchy kick, snare on 2 & 4" },
  { id: "four-on-floor", label: "4-on-the-Floor", desc: "Kick every beat, steady and energetic" },
  { id: "half-time",     label: "Half-time",      desc: "Snare only on beat 3 — spacious and heavy" },
  { id: "trap",          label: "Trap",           desc: "Fast hi-hats, sparse kick, modern feel" },
  { id: "breakbeat",     label: "Breakbeat",      desc: "Syncopated kick & snare, funky groove" },
];

const ELEMENTS: { key: keyof Pick<DrumConfig, "kick" | "snare" | "hihat">; label: string }[] = [
  { key: "kick",  label: "Kick" },
  { key: "snare", label: "Snare" },
  { key: "hihat", label: "Hi-hat" },
];

const VIBES: Vibe[] = ["Melancholy", "Warm", "Jazzy", "Dreamy", "Nostalgic", "Rainy", "Chill", "Electric"];
const DENSITIES: Density[] = ["Sparse", "Medium", "Lush"];
const INSTRUMENTS: Instrument[] = ["Piano", "Rhodes", "Guitar", "Vibraphone", "Pad"];

const VIBE_DESC: Record<Vibe, string> = {
  Melancholy: "Minor key, introspective",
  Warm:       "Major key, uplifting",
  Jazzy:      "Dorian mode, groovy",
  Dreamy:     "Lydian mode, ethereal",
  Nostalgic:  "Natural minor, bittersweet",
  Rainy:      "Minor, dark & moody",
  Chill:      "Major, relaxed & sunny",
  Electric:   "Mixolydian, funky vibes",
};

// ── Mini audio player for a generated track ───────────────────────────────────

function formatDur(s: number) {
  if (!isFinite(s) || s <= 0) return "";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function TrackPlayer({ asset, isInPlaylist, onToggle, onDelete, onRename }: {
  asset: UserAsset;
  isInPlaylist: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(asset.name);
  const src = convertFileSrc(asset.local_path);

  useEffect(() => { setNameInput(asset.name); }, [asset.name]);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => {
      if (isFinite(audio.duration) && audio.duration > 0)
        setProgress(audio.currentTime / audio.duration);
    });
    audio.addEventListener("play",  () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => { setPlaying(false); setProgress(0); });
    return () => { audio.pause(); audio.src = ""; };
  }, [src]);

  useEffect(() => {
    if (editing) renameRef.current?.select();
  }, [editing]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  };

  const commitRename = () => {
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== asset.name) onRename(trimmed);
    else setNameInput(asset.name);
  };

  return (
    <div className={`rounded-lg border transition-colors ${isInPlaylist ? "border-purple-500/60 bg-purple-950/15" : "border-zinc-700 bg-zinc-800/60"}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={toggle}
          className="w-6 h-6 bg-zinc-700 hover:bg-zinc-600 rounded-full flex items-center justify-center text-zinc-200 shrink-0 transition-colors"
        >
          {playing ? (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={renameRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setNameInput(asset.name); } }}
              className="w-full bg-zinc-700 text-zinc-100 text-xs rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-purple-500"
            />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <p
                className="text-xs font-medium text-zinc-200 truncate cursor-text hover:text-white"
                title="Click to rename"
                onClick={() => setEditing(true)}
              >
                {asset.name}
              </p>
              {duration > 0 && (
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">{formatDur(duration)}</span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onToggle}
          title={isInPlaylist ? "Remove from playlist" : "Add to playlist"}
          className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors shrink-0 ${
            isInPlaylist
              ? "bg-purple-700/40 text-purple-300 hover:bg-red-900/40 hover:text-red-300"
              : "bg-zinc-700 text-zinc-300 hover:bg-purple-700 hover:text-white"
          }`}
        >
          {isInPlaylist ? "In playlist ✓" : "+ Playlist"}
        </button>

        <button
          onClick={onDelete}
          className="text-zinc-600 hover:text-red-400 text-xs transition-colors shrink-0 ml-1"
          title="Delete track"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="mx-3 mb-2 h-0.5 bg-zinc-700 rounded-full">
        <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DrumSection({ drums, onChange }: { drums: DrumConfig; onChange: (d: Partial<DrumConfig>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400 font-medium">Drums</label>
        <button
          onClick={() => onChange({ enabled: !drums.enabled })}
          className={`relative w-9 h-5 rounded-full transition-colors ${drums.enabled ? "bg-purple-600" : "bg-zinc-700"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${drums.enabled ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>

      {drums.enabled && (
        <>
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Feel</label>
            <div className="space-y-1">
              {DRUM_PATTERNS.map(({ id, label, desc }) => (
                <button
                  key={id}
                  onClick={() => onChange({ pattern: id })}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    drums.pattern === id
                      ? "bg-purple-600/25 border border-purple-500/60 text-purple-200"
                      : "bg-zinc-800/60 border border-zinc-700/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] text-zinc-500 ml-2">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Elements</label>
            <div className="flex gap-2">
              {ELEMENTS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => onChange({ [key]: !drums[key] })}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    drums[key]
                      ? "bg-zinc-700 border-zinc-600 text-zinc-100"
                      : "bg-zinc-900 border-zinc-800 text-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SegmentedPicker<T extends string>({
  label, options, value, disabled, onSelect,
}: {
  label: string; options: T[]; value: T; disabled: boolean; onSelect: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-zinc-400 font-medium">{label}</label>
      <div className="flex rounded-md overflow-hidden border border-zinc-700">
        {options.map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onSelect(opt)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              value === opt
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SyntheticPanel({
  config, isStreaming, isPreviewing,
  synthTracks, selectedMusicIds,
  onChange, onTogglePreview, onGenerate,
  onToggleTrack, onDeleteTrack, onRandomize, onRenameTrack,
  hideTracks,
}: Props) {
  const [durationSeconds, setDurationSeconds] = useState(90);
  // Only block controls while streaming — rendering runs in background
  const busy = isStreaming;

  const durLabel = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4 p-4">
      {/* Vibe */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-400 font-medium">Vibe</label>
        <div className="grid grid-cols-2 gap-2">
          {VIBES.map((v) => (
            <button
              key={v}
              disabled={busy}
              onClick={() => onChange({ vibe: v })}
              className={`rounded-md px-3 py-2 text-left transition-colors ${
                config.vibe === v
                  ? "bg-purple-600/30 border border-purple-500 text-purple-200"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <div className="text-xs font-semibold">{v}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{VIBE_DESC[v]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tempo */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400 font-medium">Tempo</label>
          <span className="text-xs text-zinc-300 font-mono">{config.bpm} BPM</span>
        </div>
        <input
          type="range" min={60} max={100} step={1}
          value={config.bpm}
          disabled={busy}
          onChange={(e) => onChange({ bpm: Number(e.target.value) })}
          className="w-full accent-purple-500 disabled:opacity-40"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>60</span><span>100</span>
        </div>
      </div>

      <SegmentedPicker label="Density" options={DENSITIES} value={config.density} disabled={busy} onSelect={(v) => onChange({ density: v })} />
      <SegmentedPicker label="Instrument" options={INSTRUMENTS} value={config.instrument} disabled={busy} onSelect={(v) => onChange({ instrument: v })} />
      <DrumSection drums={config.drums} onChange={(d) => onChange({ drums: d as DrumConfig })} />

      {/* Melody style */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-400 font-medium">Melody</label>
        <div className="space-y-1">
          {MELODY_STYLES.map(({ id, label, desc }) => (
            <button
              key={id}
              disabled={busy}
              onClick={() => onChange({ melody: id as MelodyStyle })}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                config.melody === id
                  ? "bg-purple-600/25 border border-purple-500/60 text-purple-200"
                  : "bg-zinc-800/60 border border-zinc-700/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] text-zinc-500 ml-2">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sound shaping */}
      <div className="space-y-3">
        <label className="text-xs text-zinc-400 font-medium">Sound</label>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[11px] text-zinc-500">Reverb</span>
            <span className="text-[11px] text-zinc-500 font-mono">{Math.round((config.reverbAmount ?? 0.5) * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={config.reverbAmount ?? 0.5}
            disabled={busy}
            onChange={(e) => onChange({ reverbAmount: Number(e.target.value) })}
            className="w-full accent-purple-500 disabled:opacity-40"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[11px] text-zinc-500">Warmth</span>
            <span className="text-[11px] text-zinc-500 font-mono">
              {(config.warmth ?? 0.5) < 0.35 ? "Dark" : (config.warmth ?? 0.5) > 0.65 ? "Bright" : "Neutral"}
            </span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={config.warmth ?? 0.5}
            disabled={busy}
            onChange={(e) => onChange({ warmth: Number(e.target.value) })}
            className="w-full accent-purple-500 disabled:opacity-40"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>Dark</span><span>Bright</span>
          </div>
        </div>
      </div>

      {/* Preview / Randomize */}
      <div className="flex gap-2">
        <button
          onClick={onTogglePreview}
          disabled={isStreaming}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            isPreviewing
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isPreviewing ? (
            <><svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></svg>Stop Preview</>
          ) : (
            <><svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>Preview</>
          )}
        </button>
        <button
          onClick={() => onRandomize(randomizeConfig(config))}
          disabled={busy}
          className="flex-1 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M11 2h3v3l-1.3-1.3-2.1 2.1-.7-.7 2.1-2.1L11 2zM2 4h5v1H3.5l-.3.7L2 4zm0 7l1.2-1.7.3.7H7v1H2zm9 3l1.3-1.3-2.1-2.1.7-.7 2.1 2.1L14 11v3h-3zM7.5 7.5l1 1-4.2 4.2-.7-.7 3.9-4.5zm1-1l4.2-4.2.7.7-4.2 4.2-.7-.7z"/>
          </svg>
          Randomize
        </button>
      </div>

      {/* Generate section */}
      <div className="border-t border-zinc-800 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Generate Track</p>
          <span className="text-[10px] text-zinc-500 font-mono">{durLabel}</span>
        </div>

        <div className="space-y-1">
          <input
            type="range" min={60} max={600} step={30}
            value={durationSeconds}
            disabled={busy}
            onChange={(e) => setDurationSeconds(Number(e.target.value))}
            className="w-full accent-purple-500 disabled:opacity-40"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>1 min</span><span>10 min</span>
          </div>
        </div>

        <button
          onClick={() => onGenerate(durationSeconds)}
          disabled={busy}
          className="w-full py-2.5 rounded-md bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M2 2h5v5H2zm7 0h5v5H9zm-7 7h5v5H2zm7 0h5v5H9z" opacity=".4"/>
            <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
          Generate Track
        </button>

      </div>

      {/* Generated tracks */}
      {!hideTracks && synthTracks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Your Tracks</p>
          {synthTracks.map((asset) => (
            <TrackPlayer
              key={asset.id}
              asset={asset}
              isInPlaylist={selectedMusicIds.has(asset.id)}
              onToggle={() => onToggleTrack(asset)}
              onDelete={() => onDeleteTrack(asset.id)}
              onRename={(name) => onRenameTrack(asset.id, name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
