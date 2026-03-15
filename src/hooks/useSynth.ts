import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SyntheticEngine,
  SynthConfig,
  renderSynthTrack,
  VIBE_DEFAULT_BPM,
} from "../lib/SyntheticEngine";
import { RenderJob, UserAsset } from "../types";

interface Callbacks {
  /** Called with the newly saved asset so the caller can add it to the playlist. */
  onTrackSaved: (asset: UserAsset) => void;
  /** Called after any operation that changes user assets (generate, rename). */
  onAssetsChanged: () => Promise<void>;
}

export function useSynth({ onTrackSaved, onAssetsChanged }: Callbacks) {
  const [config, setConfig] = useState<SynthConfig>({
    vibe: "Melancholy",
    bpm: VIBE_DEFAULT_BPM["Melancholy"],
    density: "Medium",
    instrument: "Piano",
    drums: { enabled: true, pattern: "boom-bap", kick: true, snare: true, hihat: true },
    melody: "flute",
    reverbAmount: 0.5,
    warmth: 0.5,
  });

  const engineRef    = useRef<SyntheticEngine | null>(null);
  const regenTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [renderJobs, setRenderJobs]           = useState<RenderJob[]>([]);
  const [completedRenders, setCompletedRenders] = useState<UserAsset[]>([]);

  const clearCompletedRender = useCallback((id: string) => {
    setCompletedRenders((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Auto-regenerate 350 ms after any config change while previewing
  const scheduleRegenerate = useCallback(() => {
    if (!engineRef.current) return;
    if (regenTimer.current) clearTimeout(regenTimer.current);
    regenTimer.current = setTimeout(() => { engineRef.current?.regenerate(); }, 350);
  }, []);

  // Clear pending timer if preview stops
  useEffect(() => {
    if (!previewing && regenTimer.current) {
      clearTimeout(regenTimer.current);
      regenTimer.current = null;
    }
  }, [previewing]);
  const queueRef   = useRef<Array<() => Promise<void>>>([]);
  const runningRef = useRef(false);

  // ── Config ────────────────────────────────────────────────────────────────

  const updateConfig = useCallback((partial: Partial<SynthConfig>) => {
    setConfig((prev) => {
      let next: SynthConfig;
      if (partial.drums) {
        next = { ...prev, drums: { ...prev.drums, ...partial.drums } };
      } else {
        next = partial.vibe
          ? { ...prev, ...partial, bpm: VIBE_DEFAULT_BPM[partial.vibe] }
          : { ...prev, ...partial };
      }
      engineRef.current?.updateConfig(partial);
      return next;
    });
    scheduleRegenerate();
  }, [scheduleRegenerate]);

  /** Replace the entire config at once (used by Randomize). Stops preview — user hits Play again. */
  const applyConfig = useCallback((newConfig: SynthConfig) => {
    if (regenTimer.current) { clearTimeout(regenTimer.current); regenTimer.current = null; }
    setConfig(newConfig);
    if (engineRef.current) {
      engineRef.current.stopPreview().finally(() => {
        engineRef.current = null;
        setPreviewing(false);
      });
    }
  }, []);

  // ── Preview engine ────────────────────────────────────────────────────────

  const regenerate = useCallback(() => {
    engineRef.current?.regenerate();
  }, []);

  const togglePreview = useCallback(async () => {
    if (previewing) {
      await engineRef.current?.stopPreview();
      engineRef.current = null;
      setPreviewing(false);
    } else {
      const engine = new SyntheticEngine(config);
      engineRef.current = engine;
      await engine.startPreview();
      setPreviewing(true);
    }
  }, [previewing, config]);

  /** Stop the preview without toggling — called before stream starts. */
  const stopPreview = useCallback(async () => {
    if (!previewing) return;
    await engineRef.current?.stopPreview();
    engineRef.current = null;
    setPreviewing(false);
  }, [previewing]);

  // ── Render queue ──────────────────────────────────────────────────────────

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    while (queueRef.current.length > 0) {
      const task = queueRef.current.shift()!;
      await task();
    }
    runningRef.current = false;
  }, []);

  const generateTrack = useCallback((durationSeconds: number) => {
    const jobId    = `render-${Date.now()}-${Math.random()}`;
    const name     = `Synth ${config.vibe}`;
    const snapshot = { ...config, drums: { ...config.drums } };

    setRenderJobs((prev) => [...prev, { id: jobId, label: name, progress: 0 }]);

    queueRef.current.push(async () => {
      try {
        const { b64 } = await renderSynthTrack(snapshot, durationSeconds, (p) => {
          setRenderJobs((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, progress: p } : j))
          );
        });
        const asset = await invoke<UserAsset>("save_synth_track", { wavB64: b64, name });
        await onAssetsChanged();
        onTrackSaved(asset);
        setCompletedRenders((prev) => [...prev, asset]);
      } catch (e) {
        console.error("Track generation failed:", e);
      } finally {
        setRenderJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    });

    drain();
  }, [config, onAssetsChanged, onTrackSaved, drain]);

  const renameTrack = useCallback(async (id: string, name: string) => {
    try {
      await invoke("rename_user_asset", { id, name });
      await onAssetsChanged();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  }, [onAssetsChanged]);

  return {
    config,
    previewing,
    renderJobs,
    completedRenders,
    clearCompletedRender,
    updateConfig,
    applyConfig,
    regenerate,
    togglePreview,
    stopPreview,
    generateTrack,
    renameTrack,
  };
}
