/**
 * AmbientEngine — plays bundled ambient MP3 recordings.
 *
 * Files live at public/assets/ambient/{type}.mp3 and are served by Vite in
 * development and by Tauri's asset protocol in production.
 *
 * Preview: HTML Audio element (instant, no encoding overhead).
 * "Use":   fetch the MP3, base64-encode it, send to Rust via save_ambient_file
 *          so it becomes a UserAsset that FFmpeg can loop during a stream.
 */

import { arrayBufferToBase64 } from "./audioUtils";

export type AmbientType =
  | "rain"
  | "ocean"
  | "wind"
  | "fire"
  | "forest"
  | "night"
  | "cafe"
  | "space";

export interface AmbientPreset {
  id: AmbientType;
  label: string;
  description: string;
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: "rain", label: "Rain", description: "Steady rainfall" },
  { id: "ocean", label: "Ocean", description: "Waves on the shore" },
  { id: "wind", label: "Wind", description: "Breeze through trees" },
  { id: "fire", label: "Fireplace", description: "Warm crackling fire" },
  { id: "forest", label: "Forest", description: "Birds and rustling leaves" },
  { id: "night", label: "Night", description: "Crickets and stillness" },
  { id: "cafe", label: "Café", description: "Background chatter" },
  { id: "space", label: "Deep Space", description: "Cosmic ambient haze" },
];

export function ambientSrcUrl(type: AmbientType): string {
  return `/assets/ambient/${type}.mp3`;
}

// Preview engine

export class AmbientEngine {
  private audio: HTMLAudioElement | null = null;
  private type: AmbientType;

  constructor(type: AmbientType) {
    this.type = type;
  }

  /** Starts playback. Resolves immediately after issuing play(); rejects if the
   *  file cannot be loaded at all (404, decode error, etc.). */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.audio = audio;
      audio.loop = true;
      audio.volume = 0.7;

      const onCanPlay = () => {
        audio.removeEventListener("error", onError);
        // Fire play() but don't hold the caller hostage waiting for it
        audio.play().catch((e) => console.error("[AmbientEngine] play() failed:", e));
        resolve();
      };

      const onError = () => {
        audio.removeEventListener("canplay", onCanPlay);
        reject(new Error(`Failed to load ambient audio: ${ambientSrcUrl(this.type)}`));
      };

      audio.addEventListener("canplay", onCanPlay, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.src = ambientSrcUrl(this.type);
      audio.load();
    });
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
  }
}

// File fetcher for "Use"

/** Fetches the ambient MP3 and returns it as a base64 string for IPC transfer. */
export async function fetchAmbientAsBase64(type: AmbientType): Promise<string> {
  const resp = await fetch(ambientSrcUrl(type));
  if (!resp.ok) throw new Error(`Failed to load ambient file (${type}): HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return arrayBufferToBase64(buf);
}
