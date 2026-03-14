import { Density, DrumConfig, DrumPattern, Instrument, SynthConfig, Vibe } from "../lib/SyntheticEngine";

interface Props {
  config: SynthConfig;
  isStreaming: boolean;
  isPreviewing: boolean;
  onChange: (partial: Partial<SynthConfig>) => void;
  onRegenerate: () => void;
  onTogglePreview: () => void;
}

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

function DrumSection({ drums, onChange }: { drums: DrumConfig; onChange: (d: Partial<DrumConfig>) => void }) {
  return (
    <div className="space-y-3">
      {/* Header with master toggle */}
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
          {/* Pattern picker */}
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

          {/* Element toggles */}
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

function SegmentedPicker<T extends string>({
  label,
  options,
  value,
  disabled,
  onSelect,
}: {
  label: string;
  options: T[];
  value: T;
  disabled: boolean;
  onSelect: (v: T) => void;
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

export default function SyntheticControls({ config, isStreaming, isPreviewing, onChange, onRegenerate, onTogglePreview }: Props) {
  return (
    <div className="space-y-4 p-4">
      {/* Vibe */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-400 font-medium">Vibe</label>
        <div className="grid grid-cols-2 gap-2">
          {VIBES.map((v) => (
            <button
              key={v}
              disabled={isStreaming}
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
          type="range"
          min={60}
          max={90}
          step={1}
          value={config.bpm}
          onChange={(e) => onChange({ bpm: Number(e.target.value) })}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>60</span>
          <span>90</span>
        </div>
      </div>

      {/* Density */}
      <SegmentedPicker
        label="Density"
        options={DENSITIES}
        value={config.density}
        disabled={isStreaming}
        onSelect={(v) => onChange({ density: v })}
      />

      {/* Instrument */}
      <SegmentedPicker
        label="Instrument"
        options={INSTRUMENTS}
        value={config.instrument}
        disabled={isStreaming}
        onSelect={(v) => onChange({ instrument: v })}
      />

      {/* Drums section */}
      <DrumSection drums={config.drums} onChange={(d) => onChange({ drums: d as DrumConfig })} />

      {/* Preview / Regenerate row */}
      <div className="flex gap-2">
        <button
          onClick={onTogglePreview}
          disabled={isStreaming}
          title={isPreviewing ? "Stop preview" : "Preview sound in your headphones / speakers"}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            isPreviewing
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isPreviewing ? (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
              Stop Preview
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
              </svg>
              Preview
            </>
          )}
        </button>

        <button
          onClick={onRegenerate}
          disabled={!isStreaming && !isPreviewing}
          title="Pick a new chord progression without stopping"
          className="flex-1 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M13.5 2.5v4h-4l1.5-1.5A4.5 4.5 0 004.05 9.5H2.55A6 6 0 0111 4.586L12.5 3h1zm-11 7v-4h4L5 7l.001.001A4.5 4.5 0 0011.95 8.5h1.5A6 6 0 015 11.414L3.5 13H2.5V9.5z"/>
          </svg>
          Regenerate
        </button>
      </div>

      {/* Info note */}
      <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
        Tone.js procedural music — a never-ending lofi composition sent directly to FFmpeg
      </p>
    </div>
  );
}
