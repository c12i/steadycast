import * as Tone from "tone";
import { audioBufferToWav, arrayBufferToBase64 } from "./audioUtils";

export type Vibe =
  | "Melancholy"
  | "Warm"
  | "Jazzy"
  | "Dreamy"
  | "Nostalgic"
  | "Rainy"
  | "Chill"
  | "Electric";

export type Density = "Sparse" | "Medium" | "Lush";
export type Instrument = "Piano" | "Rhodes" | "Guitar" | "Vibraphone" | "Pad";
export type DrumPattern = "boom-bap" | "four-on-floor" | "half-time" | "trap" | "breakbeat";

/** Character of the high melodic voice layered over the chords. */
export type MelodyStyle = "off" | "flute" | "whistle" | "bell" | "pluck";

export interface MelodyStyleMeta {
  id: MelodyStyle;
  label: string;
  desc: string;
}
export const MELODY_STYLES: MelodyStyleMeta[] = [
  { id: "off", label: "Off", desc: "No melody line" },
  { id: "flute", label: "Flute", desc: "Soft sine, gentle filter" },
  { id: "whistle", label: "Whistle", desc: "Triangle, bright & airy" },
  { id: "bell", label: "Bell", desc: "Percussive, fast decay" },
  { id: "pluck", label: "Pluck", desc: "Short sawtooth, bright pluck" },
];

export interface DrumConfig {
  enabled: boolean;
  pattern: DrumPattern;
  kick: boolean;
  snare: boolean;
  hihat: boolean;
}

export interface SynthConfig {
  vibe: Vibe;
  bpm: number;
  density: Density;
  instrument: Instrument;
  drums: DrumConfig;
  /** Melodic voice character. Default: "flute". */
  melody: MelodyStyle;
  /** Reverb wetness 0–1. Default: 0.5 → ~35% wet. */
  reverbAmount: number;
  /** Tone color / filter brightness 0–1. Default: 0.5 → neutral. */
  warmth: number;
}

// Chord system

interface ChordDef {
  rootOffset: number; // semitones above vibe root
  ints: number[]; // chord intervals from chord root (semitones)
  next: number[]; // Markov transitions
}

const Q = {
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  maj9s11: [0, 4, 7, 11, 14, 18], // Lydian #11
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
  dom13: [0, 4, 7, 10, 14, 21],
  hdim: [0, 3, 6, 10],
};

// Melancholy — A natural minor
const CHORDS_MELANCHOLY: ChordDef[] = [
  { rootOffset: 0, ints: Q.min9, next: [1, 3, 5] }, // Am9
  { rootOffset: 3, ints: Q.maj7, next: [0, 2, 4] }, // Cmaj7
  { rootOffset: 5, ints: Q.min9, next: [4, 0, 1] }, // Dm9
  { rootOffset: 8, ints: Q.maj7, next: [0, 4, 2] }, // Fmaj7
  { rootOffset: 10, ints: Q.dom7, next: [0, 2] }, // G7
  { rootOffset: 7, ints: Q.hdim, next: [0, 2] }, // Em7b5
];

// Warm — C major
const CHORDS_WARM: ChordDef[] = [
  { rootOffset: 0, ints: Q.maj9, next: [1, 3, 4] }, // Cmaj9
  { rootOffset: 9, ints: Q.min9, next: [0, 2, 3] }, // Am9
  { rootOffset: 5, ints: Q.maj9, next: [0, 4, 1] }, // Fmaj9
  { rootOffset: 7, ints: Q.dom13, next: [0, 1] }, // G13
  { rootOffset: 2, ints: Q.min9, next: [0, 3, 2] }, // Dm9
  { rootOffset: 4, ints: Q.min7, next: [1, 3, 0] }, // Em7
];

// Jazzy — D Dorian (ii–V–I walks)
const CHORDS_JAZZY: ChordDef[] = [
  { rootOffset: 0, ints: Q.min9, next: [1, 3] }, // Dm9   (ii)
  { rootOffset: 5, ints: Q.dom13, next: [2, 4] }, // G13   (V)
  { rootOffset: 10, ints: Q.maj9, next: [0, 3, 4] }, // Cmaj9 (I)
  { rootOffset: 7, ints: Q.min9, next: [0, 1] }, // Am9   (vi)
  { rootOffset: 8, ints: Q.maj7, next: [0, 1] }, // Bbmaj7
  { rootOffset: 2, ints: Q.hdim, next: [0, 1] }, // Em7b5
];

// Dreamy — G Lydian (#11 chord is the signature sound)
const CHORDS_DREAMY: ChordDef[] = [
  { rootOffset: 0, ints: Q.maj9s11, next: [1, 3, 4] }, // Gmaj9#11
  { rootOffset: 2, ints: Q.maj9, next: [0, 2, 4] }, // Amaj9 (II major — the Lydian magic)
  { rootOffset: 4, ints: Q.min9, next: [3, 0] }, // Bm9
  { rootOffset: 7, ints: Q.maj7, next: [0, 1, 4] }, // Dmaj7
  { rootOffset: 9, ints: Q.min9, next: [0, 3] }, // Em9
];

// Nostalgic — E natural minor (bittersweet, slower)
// E=0, F#=2, G=3, A=5, B=7, C=8, D=10
const CHORDS_NOSTALGIC: ChordDef[] = [
  { rootOffset: 0, ints: Q.min9, next: [1, 2, 4] }, // Em9   (i)
  { rootOffset: 8, ints: Q.maj7, next: [0, 3, 4] }, // Cmaj7 (VI)
  { rootOffset: 3, ints: Q.maj9, next: [0, 1, 4] }, // Gmaj9 (III)
  { rootOffset: 10, ints: Q.dom9, next: [0, 2] }, // D9    (bVII)
  { rootOffset: 5, ints: Q.min9, next: [0, 3] }, // Am9   (iv)
];

// Rainy — B natural minor (darker, more introspective)
// B=0, C#=2, D=3, E=5, F#=7, G=8, A=10
const CHORDS_RAINY: ChordDef[] = [
  { rootOffset: 0, ints: Q.min9, next: [1, 2, 4] }, // Bm9   (i)
  { rootOffset: 5, ints: Q.min9, next: [0, 3, 4] }, // Em9   (iv)
  { rootOffset: 8, ints: Q.maj7, next: [0, 1, 4] }, // Gmaj7 (VI)
  { rootOffset: 3, ints: Q.dom9, next: [0, 2] }, // D9    (III7 — adds warmth)
  { rootOffset: 7, ints: Q.min7, next: [0, 1] }, // F#m7  (v)
];

// Chill — F major (relaxed, pentatonic-friendly)
// F=0, G=2, A=4, Bb=5, C=7, D=9, E=11
const CHORDS_CHILL: ChordDef[] = [
  { rootOffset: 0, ints: Q.maj9, next: [1, 2, 4] }, // Fmaj9  (I)
  { rootOffset: 9, ints: Q.min9, next: [0, 2, 3] }, // Dm9    (vi)
  { rootOffset: 5, ints: Q.maj9, next: [0, 3, 4] }, // Bbmaj9 (IV)
  { rootOffset: 7, ints: Q.dom13, next: [0, 1] }, // C13    (V)
  { rootOffset: 2, ints: Q.min9, next: [0, 3] }, // Gm9    (ii)
];

// Electric — Bb Mixolydian (funky bVII chord is the signature)
// Bb=0, C=2, D=4, Eb=5, F=7, G=9, Ab=10
const CHORDS_ELECTRIC: ChordDef[] = [
  { rootOffset: 0, ints: Q.maj9, next: [1, 2, 4] }, // Bbmaj9 (I)
  { rootOffset: 9, ints: Q.min9, next: [0, 3, 4] }, // Gm9    (vi)
  { rootOffset: 5, ints: Q.maj9, next: [0, 3] }, // Ebmaj9 (IV)
  { rootOffset: 10, ints: Q.maj7, next: [0, 1] }, // Abmaj7 (bVII — the Mixolydian colour)
  { rootOffset: 2, ints: Q.dom9, next: [0, 3] }, // C9     (II dom — blue note feel)
];

const VIBE_CHORDS: Record<Vibe, ChordDef[]> = {
  Melancholy: CHORDS_MELANCHOLY,
  Warm: CHORDS_WARM,
  Jazzy: CHORDS_JAZZY,
  Dreamy: CHORDS_DREAMY,
  Nostalgic: CHORDS_NOSTALGIC,
  Rainy: CHORDS_RAINY,
  Chill: CHORDS_CHILL,
  Electric: CHORDS_ELECTRIC,
};

const VIBE_ROOT: Record<Vibe, number> = {
  Melancholy: Tone.Frequency("A3").toMidi(), // 57
  Warm: Tone.Frequency("C3").toMidi(), // 48
  Jazzy: Tone.Frequency("D3").toMidi(), // 50
  Dreamy: Tone.Frequency("G3").toMidi(), // 55
  Nostalgic: Tone.Frequency("E3").toMidi(), // 52
  Rainy: Tone.Frequency("B2").toMidi(), // 47
  Chill: Tone.Frequency("F3").toMidi(), // 53
  Electric: Tone.Frequency("Bb2").toMidi(), // 46
};

const VIBE_SCALE: Record<Vibe, number[]> = {
  Melancholy: [0, 2, 3, 5, 7, 8, 10], // natural minor
  Warm: [0, 2, 4, 5, 7, 9, 11], // major
  Jazzy: [0, 2, 3, 5, 7, 9, 10], // dorian
  Dreamy: [0, 2, 4, 6, 7, 9, 11], // lydian
  Nostalgic: [0, 2, 3, 5, 7, 8, 10], // natural minor (E)
  Rainy: [0, 2, 3, 5, 7, 8, 10], // natural minor (B)
  Chill: [0, 2, 4, 5, 7, 9, 11], // major (F)
  Electric: [0, 2, 4, 5, 7, 9, 10], // mixolydian
};

export const VIBE_DEFAULT_BPM: Record<Vibe, number> = {
  Melancholy: 70,
  Warm: 80,
  Jazzy: 85,
  Dreamy: 72,
  Nostalgic: 68,
  Rainy: 63,
  Chill: 76,
  Electric: 88,
};

const VIBE_CHORD_INTERVAL: Record<Vibe, string> = {
  Melancholy: "1m",
  Warm: "2n",
  Jazzy: "2n",
  Dreamy: "1m",
  Nostalgic: "1m",
  Rainy: "1m",
  Chill: "2n",
  Electric: "2n",
};

// Drums

const NAMED_DRUM_PATTERNS: Record<
  DrumPattern,
  { kick: number[]; snare: number[]; hihat: number[] }
> = {
  "boom-bap": {
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  "four-on-floor": {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  "half-time": {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  trap: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  },
  breakbeat: {
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    hihat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
  },
};

// Randomizer

const ALL_VIBES: Vibe[] = [
  "Melancholy",
  "Warm",
  "Jazzy",
  "Dreamy",
  "Nostalgic",
  "Rainy",
  "Chill",
  "Electric",
];
const ALL_INSTRUMENTS: Instrument[] = ["Piano", "Rhodes", "Guitar", "Vibraphone", "Pad"];
const ALL_DENSITIES: Density[] = ["Sparse", "Medium", "Lush"];
const ALL_PATTERNS: DrumPattern[] = ["boom-bap", "four-on-floor", "half-time", "trap", "breakbeat"];
const ALL_MELODIES: MelodyStyle[] = ["off", "flute", "whistle", "bell", "pluck"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randRange(lo: number, hi: number, step = 0.1) {
  const steps = Math.round((hi - lo) / step);
  return lo + Math.round(Math.random() * steps) * step;
}

export function randomizeConfig(_current: SynthConfig): SynthConfig {
  const vibe = pick(ALL_VIBES);
  const bpmBase = VIBE_DEFAULT_BPM[vibe];
  return {
    vibe,
    bpm: bpmBase + Math.round(Math.random() * 10 - 5),
    density: pick(ALL_DENSITIES),
    instrument: pick(ALL_INSTRUMENTS),
    drums: {
      enabled: Math.random() > 0.2,
      pattern: pick(ALL_PATTERNS),
      kick: Math.random() > 0.15,
      snare: Math.random() > 0.15,
      hihat: Math.random() > 0.3,
    },
    melody: pick(ALL_MELODIES),
    reverbAmount: randRange(0.2, 0.8),
    warmth: randRange(0.2, 0.8),
  };
}

// Helpers

function buildProgression(chords: ChordDef[], startIdx: number, length: number): number[] {
  const seq: number[] = [startIdx];
  for (let i = 1; i < length; i++) {
    const cur = chords[seq[i - 1]];
    seq.push(cur.next[Math.floor(Math.random() * cur.next.length)]);
  }
  return seq;
}

function pickVoicing(rootMidi: number, ints: number[], density: Density): string[] {
  const size = density === "Sparse" ? 3 : density === "Medium" ? 4 : 5;
  const actual = Math.min(size, ints.length);
  if (actual <= 3)
    return ints.slice(0, 3).map((i) => Tone.Frequency(rootMidi + i, "midi").toNote());
  const inner = [...ints.slice(1)]
    .sort(() => Math.random() - 0.5)
    .slice(0, actual - 1)
    .sort((a, b) => a - b);
  for (let i = 1; i < inner.length; i++) while (inner[i] <= inner[i - 1]) inner[i] += 12;
  return [0, ...inner].map((i) => Tone.Frequency(rootMidi + i, "midi").toNote());
}

function scaleMidi(rootMidi: number, scale: number[], degree: number): number {
  const len = scale.length;
  const octShift = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + scale[idx] + octShift * 12;
}

function jitter(max = 0.015) {
  return Math.random() * max;
}
function randVel(c: number, s = 0.07) {
  return Math.min(1, Math.max(0.01, c + (Math.random() * 2 - 1) * s));
}

function makeMelodySynth(style: MelodyStyle): Tone.MonoSynth | null {
  switch (style) {
    case "off":
      return null;
    case "flute":
      // Sine wave, subtle filter sweep — breathy and soft, no whistle
      return new Tone.MonoSynth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.08, decay: 0.3, sustain: 0.2, release: 1.8 },
        filterEnvelope: {
          attack: 0.1,
          decay: 0.4,
          sustain: 0.3,
          release: 1.2,
          baseFrequency: 400,
          octaves: 1.5,
        },
        volume: -15,
      });
    case "bell":
      // Fast decay, no sustain — percussive metallic ping
      return new Tone.MonoSynth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 1.5 },
        filterEnvelope: {
          attack: 0.001,
          decay: 0.4,
          sustain: 0,
          release: 0.6,
          baseFrequency: 600,
          octaves: 2.5,
        },
        volume: -14,
      });
    case "pluck":
      // Sawtooth + very fast decay — bright, short pluck
      return new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0.01, release: 0.4 },
        filterEnvelope: {
          attack: 0.001,
          decay: 0.12,
          sustain: 0,
          release: 0.3,
          baseFrequency: 300,
          octaves: 2.5,
        },
        volume: -13,
      });
    default: // "whistle" — original triangle tone
      return new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.05, decay: 0.35, sustain: 0.25, release: 1.4 },
        filterEnvelope: {
          attack: 0.06,
          decay: 0.2,
          sustain: 0.4,
          release: 0.8,
          baseFrequency: 200,
          octaves: 3,
        },
        volume: -12,
      });
  }
}

function makeSynth(instrument: Instrument): Tone.PolySynth {
  switch (instrument) {
    case "Rhodes":
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.5,
        modulationIndex: 10,
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.4, release: 2.0 },
        modulation: { type: "square" },
        modulationEnvelope: {
          attack: 0.002,
          decay: 0.25,
          sustain: 0.1,
          release: 0.3,
        },
        volume: -8,
      } as never);

    case "Guitar":
      // Plucked string: sawtooth + fast decay + near-zero sustain
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.002, decay: 0.25, sustain: 0.02, release: 0.9 },
        volume: -6,
      } as never);

    case "Vibraphone":
      // Bell-like FM — metallic but warm, perfect for lofi
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.1,
        modulationIndex: 1.2,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 1.0, sustain: 0, release: 1.5 },
        modulation: { type: "sine" },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.5,
          sustain: 0,
          release: 0.5,
        },
        volume: -7,
      } as never);

    case "Pad":
      // Soft swell — triangle is far gentler than sawtooth, lower sustain keeps it from dominating
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.9, decay: 0.4, sustain: 0.35, release: 4.0 },
        volume: -15,
      } as never);

    default: // Piano
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 2.5,
        oscillator: { type: "sine" },
        envelope: { attack: 0.025, decay: 0.5, sustain: 0.25, release: 2.5 },
        modulation: { type: "triangle" },
        modulationEnvelope: {
          attack: 0.01,
          decay: 0.35,
          sustain: 0.05,
          release: 1.5,
        },
        volume: -8,
      } as never);
  }
}

// Graph builder

interface Graph {
  progRef: { current: number[] };
  dispose: () => void;
}

function buildGraph(
  config: SynthConfig,
  progRef: { current: number[] },
  patternRef: { current: { kick: number[]; snare: number[]; hihat: number[] } },
  master: Tone.ToneAudioNode,
  skipChorus = false
): Graph {
  const chords = VIBE_CHORDS[config.vibe];
  const rootMidi = VIBE_ROOT[config.vibe];
  const scale = VIBE_SCALE[config.vibe];
  const chordInt = VIBE_CHORD_INTERVAL[config.vibe];

  const disposables: Array<{ dispose(): void; stop?(): Tone.ToneAudioNode }> = [];

  const reverbTarget = skipChorus
    ? master
    : (() => {
        const c = new Tone.Chorus({
          frequency: 0.8,
          delayTime: 4,
          depth: 0.3,
          wet: 0.1,
        })
          .start()
          .connect(master);
        disposables.push(c);
        return c;
      })();

  // Warmth: tone-color filter on the wet/reverb bus. 0=dark(500Hz) → 0.5=neutral(1600Hz) → 1=bright(4000Hz)
  const warmth = config.warmth ?? 0.5;
  const colorFreq = Math.round(500 + warmth * 3500);
  const colorFilter = new Tone.Filter({
    frequency: colorFreq,
    type: "lowpass",
    rolloff: -12,
  }).connect(reverbTarget);
  disposables.push(colorFilter);

  // Reverb: wet scales 0→0.05, 0.5→0.35, 1→0.70
  const reverbWet = (config.reverbAmount ?? 0.5) * 0.7;
  const reverb = new Tone.Freeverb({
    roomSize: 0.65,
    dampening: 2500,
    wet: reverbWet,
  }).connect(colorFilter);
  const pianoLPF = new Tone.Filter({
    frequency: 1400,
    type: "lowpass",
    rolloff: -12,
  }).connect(reverb);
  disposables.push(reverb, pianoLPF);

  const synth = makeSynth(config.instrument);
  // Cap polyphony to prevent voice-stealing clicks
  (synth as Tone.PolySynth).maxPolyphony = 6;
  synth.connect(pianoLPF);
  disposables.push(synth);

  const melody = makeMelodySynth(config.melody ?? "flute");
  if (melody) {
    melody.connect(reverb);
    disposables.push(melody);
  }

  // Noise: start silent, fade in to avoid an audible click
  const noise = new Tone.Noise("pink");
  noise.volume.value = -60;
  noise.connect(master);
  noise.start(0);
  noise.volume.rampTo(-30, 0.5);
  disposables.push(noise);

  const melLen = config.density === "Sparse" ? "4n" : config.density === "Medium" ? "8n" : "16n";
  const melProb = config.density === "Sparse" ? 0.22 : config.density === "Medium" ? 0.38 : 0.58;
  const melNotes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14].map((d) =>
    Tone.Frequency(scaleMidi(rootMidi + 12, scale, d), "midi").toNote()
  );

  const chordSeq = new Tone.Sequence(
    (time, step) => {
      const idx = progRef.current[(step as number) % progRef.current.length];
      const chord = chords[idx];
      const notes = pickVoicing(rootMidi + chord.rootOffset, chord.ints, config.density);
      synth.triggerAttackRelease(notes, chordInt, time + jitter(0.004), randVel(0.45, 0.08));
    },
    [...Array(progRef.current.length).keys()],
    chordInt
  );

  chordSeq.start(0);
  disposables.push(chordSeq as never);

  if (melody) {
    const melSeq = new Tone.Sequence(
      (time) => {
        if (Math.random() > melProb) return;
        melody.triggerAttackRelease(
          melNotes[Math.floor(Math.random() * melNotes.length)],
          melLen,
          time + jitter(0.015),
          randVel(0.3, 0.1)
        );
      },
      [0, 1, 2, 3, 4, 5, 6, 7],
      "8n"
    );
    melSeq.start(0);
    disposables.push(melSeq as never);
  }

  let drumSeq: Tone.Sequence | undefined;
  if (config.drums.enabled) {
    const drumBus = new Tone.Channel({ volume: -4 }).connect(master);
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 7,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).connect(drumBus);
    const snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.04 },
    }).connect(drumBus);
    const hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(drumBus);
    disposables.push(drumBus, kick, snare, hihat);

    drumSeq = new Tone.Sequence(
      (time, step) => {
        const s = (step as number) % 16;
        const p = patternRef.current;
        if (config.drums.kick && p.kick[s])
          kick.triggerAttackRelease("C1", "8n", time + jitter(0.003), randVel(0.78, 0.06));
        if (config.drums.snare && p.snare[s])
          snare.triggerAttackRelease("8n", time + jitter(0.005), randVel(0.48, 0.1));
        if (config.drums.hihat && p.hihat[s] && Math.random() > 0.15)
          hihat.triggerAttackRelease("32n", time + jitter(0.004), randVel(0.22, 0.08));
      },
      [...Array(16).keys()],
      "16n"
    );
    drumSeq.start(0);
    disposables.push(drumSeq as never);
  }

  return {
    progRef,
    dispose() {
      for (const d of disposables) {
        try {
          (d as { stop?(): void }).stop?.();
        } catch (_) {}
        try {
          d.dispose();
        } catch (_) {}
      }
    },
  };
}

// Shared AudioContext

let _onlineCtx: AudioContext | null = null;

async function acquireOnlineContext(): Promise<void> {
  if (!_onlineCtx || _onlineCtx.state === "closed") {
    _onlineCtx = new AudioContext({ sampleRate: 44100 });
    Tone.setContext(_onlineCtx);
  }
  await Tone.start();
}

// Preview engine

export class SyntheticEngine {
  private config: SynthConfig;
  private progRef = { current: [] as number[] };
  private patternRef = { current: NAMED_DRUM_PATTERNS["boom-bap"] };
  private previewing = false;
  private masterComp: Tone.Compressor | null = null;
  private masterLPF: Tone.Filter | null = null;
  private masterLim: Tone.Limiter | null = null;
  private graph: Graph | null = null;

  constructor(config: SynthConfig) {
    this.config = { ...config, drums: { ...config.drums } };
  }

  get isPreviewing() {
    return this.previewing;
  }

  async startPreview() {
    if (this.previewing) return;
    await acquireOnlineContext();
    this.masterLPF = new Tone.Filter({
      frequency: 2200,
      type: "lowpass",
      rolloff: -24,
    }).toDestination();
    this.masterLim = new Tone.Limiter(-2).connect(this.masterLPF);
    this.masterComp = new Tone.Compressor({
      threshold: -16,
      ratio: 3,
      attack: 0.08,
      release: 0.25,
    }).connect(this.masterLim);
    this._buildGraph();
    Tone.getTransport().bpm.value = this.config.bpm;
    Tone.getTransport().swing = 0.65;
    Tone.getTransport().start();
    this.previewing = true;
  }

  async stopPreview() {
    if (!this.previewing) return;
    this.previewing = false;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    this.graph?.dispose();
    this.graph = null;
    this.masterComp?.dispose();
    this.masterLim?.dispose();
    this.masterLPF?.dispose();
    this.masterComp = this.masterLim = this.masterLPF = null;
  }

  /** Tear down and rebuild — gives a noticeably fresh sound. */
  regenerate() {
    if (!this.previewing) return;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    this.graph?.dispose();
    this.graph = null;
    this._buildGraph();
    Tone.getTransport().start();
  }

  updateConfig(partial: Partial<SynthConfig>) {
    if (partial.drums) {
      this.config = {
        ...this.config,
        drums: { ...this.config.drums, ...partial.drums },
      };
      if (partial.drums.pattern)
        this.patternRef.current = NAMED_DRUM_PATTERNS[partial.drums.pattern];
    } else {
      this.config = { ...this.config, ...partial };
    }
    if (partial.bpm !== undefined) Tone.getTransport().bpm.value = partial.bpm;
  }

  private _buildGraph() {
    const chords = VIBE_CHORDS[this.config.vibe];
    const start = Math.floor(Math.random() * chords.length);
    this.progRef.current = buildProgression(chords, start, 8);
    this.patternRef.current = NAMED_DRUM_PATTERNS[this.config.drums.pattern];
    this.graph = buildGraph(this.config, this.progRef, this.patternRef, this.masterComp!);
  }
}

// Offline rendering

export async function renderSynthTrack(
  config: SynthConfig,
  durationSeconds: number,
  onProgress?: (fraction: number) => void
): Promise<{ blob: Blob; b64: string }> {
  onProgress?.(0.05);

  const chords = VIBE_CHORDS[config.vibe];
  const startIdx = Math.floor(Math.random() * chords.length);
  const progRef = { current: buildProgression(chords, startIdx, 8) };
  const patternRef = { current: NAMED_DRUM_PATTERNS[config.drums.pattern] };

  // 22050 Hz: half the samples → ~2× faster render.
  // The master LPF at 2200 Hz means nothing above ~10 kHz is audible — Nyquist is not a concern.
  const toneBuffer = await Tone.Offline(
    async ({ transport }) => {
      const masterLPF = new Tone.Filter({
        frequency: 2200,
        type: "lowpass",
        rolloff: -24,
      }).toDestination();
      const masterLim = new Tone.Limiter(-2).connect(masterLPF);
      const masterComp = new Tone.Compressor({
        threshold: -16,
        ratio: 3,
        attack: 0.08,
        release: 0.25,
      }).connect(masterLim);
      // skipChorus = true: removes delay-line computation with no audible loss after LPF
      buildGraph(config, progRef, patternRef, masterComp, true);
      transport.bpm.value = config.bpm;
      transport.swing = 0.65;
      transport.start();
    },
    durationSeconds,
    2,
    22050
  );

  onProgress?.(0.85);
  const wav = audioBufferToWav(toneBuffer.get()!);
  const b64 = arrayBufferToBase64(wav);
  onProgress?.(1.0);
  return { blob: new Blob([wav], { type: "audio/wav" }), b64 };
}
