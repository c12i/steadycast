import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AmbientEngine,
  AmbientType,
  AMBIENT_PRESETS,
  fetchAmbientAsBase64,
} from "../lib/AmbientEngine";
import { UserAsset } from "../types";

interface Callbacks {
  onAmbientSaved: (asset: UserAsset) => void;
  onAssetsChanged: () => Promise<void>;
}

export function useAmbient({ onAmbientSaved, onAssetsChanged }: Callbacks) {
  const engineRef = useRef<AmbientEngine | null>(null);
  const [previewingType, setPreviewingType] = useState<AmbientType | null>(null);
  const [renderingType, setRenderingType] = useState<AmbientType | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const togglePreview = useCallback(
    async (type: AmbientType) => {
      setPreviewError(null);
      if (previewingType === type) {
        engineRef.current?.stop();
        engineRef.current = null;
        setPreviewingType(null);
      } else {
        engineRef.current?.stop();
        engineRef.current = null;
        const engine = new AmbientEngine(type);
        // Set state optimistically so the UI shows "previewing" immediately
        engineRef.current = engine;
        setPreviewingType(type);
        try {
          await engine.start();
        } catch (e) {
          console.error("[useAmbient] preview failed:", e);
          engineRef.current = null;
          setPreviewingType(null);
          setPreviewError(
            `Could not load ${type}.mp3 — ensure the file is in public/assets/ambient/`
          );
        }
      }
    },
    [previewingType]
  );

  const stopPreview = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setPreviewingType(null);
  }, []);

  /** Fetch the bundled MP3, save it as a user ambient asset for FFmpeg streaming. */
  const renderAndSave = useCallback(
    async (type: AmbientType): Promise<UserAsset | null> => {
      if (renderingType) return null;
      setRenderingType(type);
      try {
        const label = AMBIENT_PRESETS.find((p) => p.id === type)?.label ?? type;
        const b64 = await fetchAmbientAsBase64(type);
        const asset = await invoke<UserAsset>("save_ambient_file", {
          b64,
          name: `Ambient — ${label}`,
          ext: "mp3",
        });
        await onAssetsChanged();
        onAmbientSaved(asset);
        return asset;
      } catch (e) {
        console.error("Ambient save failed:", e);
        return null;
      } finally {
        setRenderingType(null);
      }
    },
    [renderingType, onAmbientSaved, onAssetsChanged]
  );

  return { previewingType, renderingType, previewError, togglePreview, stopPreview, renderAndSave };
}
