import { useCallback, useEffect, useRef, useState } from "react";
import {
  BACKDROP_MAX_BYTES,
  BACKDROP_MAX_DIMENSION,
  BACKDROP_TYPES,
  clearPreviewBackdrop,
  loadPreviewBackdrop,
  normalizeBackdropSettings,
  savePreviewBackdropImage,
  savePreviewBackdropSettings,
  type BackdropSlot,
  type PreviewBackdrop,
  type PreviewBackdropImage,
  type PreviewBackdropSettings,
} from "../persistence/previewBackdrop";

/** Decodes an image only to learn its pixel size. */
export function readImageSize(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened."));
    };
    image.src = url;
  });
}

function imageUrl(image: PreviewBackdropImage) {
  return URL.createObjectURL(new Blob([image.data], { type: image.type }));
}

export interface PreviewBackdropState {
  backdrop: PreviewBackdrop | null;
  /** Object URL for the current image, or null. */
  url: string | null;
  error: string | null;
  choose: (file: File) => Promise<void>;
  update: (patch: Partial<PreviewBackdropSettings>) => void;
  remove: () => void;
}

/**
 * An editor-only image in the preview: the game-screenshot backdrop or a
 * stand-in character. It belongs to this browser rather than the project,
 * and storage failures only cost persistence.
 */
export function usePreviewBackdrop(
  measure: typeof readImageSize = readImageSize,
  slot: BackdropSlot = "backdrop",
): PreviewBackdropState {
  const [image, setImage] = useState<{
    image: PreviewBackdropImage;
    url: string;
  } | null>(null);
  const [settings, setSettings] = useState<PreviewBackdropSettings>(() =>
    normalizeBackdropSettings(undefined, undefined),
  );
  const [error, setError] = useState<string | null>(null);
  const chosenRef = useRef(false);
  const noun = slot === "backdrop" ? "screenshot" : "image";
  const url = image?.url ?? null;

  // Each image gets its own object URL; release it once it is replaced.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    loadPreviewBackdrop(slot)
      .then((stored) => {
        // An image picked while storage was loading wins.
        if (cancelled || !stored || chosenRef.current) return;
        const { pixelScale, opacity, x, y, ...storedImage } = stored;
        setImage({ image: storedImage, url: imageUrl(storedImage) });
        setSettings({ pixelScale, opacity, x, y });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slot]);

  // Store settings once they settle, not on every slider step.
  const { pixelScale, opacity, x, y } = settings;
  const hasImage = image !== null;
  useEffect(() => {
    if (!hasImage) return;
    const timer = window.setTimeout(() => {
      savePreviewBackdropSettings({ pixelScale, opacity, x, y }, slot).catch(
        () => undefined,
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hasImage, pixelScale, opacity, x, y, slot]);

  const choose = useCallback(
    async (file: File) => {
      setError(null);
      if (!BACKDROP_TYPES.includes(file.type)) {
        setError(`Choose a PNG, JPEG, or WebP ${noun}.`);
        return;
      }
      if (file.size > BACKDROP_MAX_BYTES) {
        setError(`Choose a ${noun} under 25 MB.`);
        return;
      }
      try {
        const size = await measure(file);
        if (
          size.width < 1 ||
          size.height < 1 ||
          size.width > BACKDROP_MAX_DIMENSION ||
          size.height > BACKDROP_MAX_DIMENSION
        ) {
          setError(`Choose a ${noun} up to 8192 pixels on each side.`);
          return;
        }
        const next: PreviewBackdropImage = {
          name: file.name.slice(0, 120) || "Image",
          type: file.type,
          data: await file.arrayBuffer(),
          width: size.width,
          height: size.height,
        };
        chosenRef.current = true;
        setImage({ image: next, url: imageUrl(next) });
        savePreviewBackdropImage(next, slot).catch(() => undefined);
      } catch {
        setError("This image could not be opened.");
      }
    },
    [measure, noun, slot],
  );

  const update = useCallback((patch: Partial<PreviewBackdropSettings>) => {
    setSettings((current) =>
      normalizeBackdropSettings(
        patch.pixelScale ?? current.pixelScale,
        patch.opacity ?? current.opacity,
        patch.x ?? current.x,
        patch.y ?? current.y,
      ),
    );
  }, []);

  const remove = useCallback(() => {
    setError(null);
    setImage(null);
    clearPreviewBackdrop(slot).catch(() => undefined);
  }, [slot]);

  return {
    backdrop: image ? { ...image.image, ...settings } : null,
    url,
    error,
    choose,
    update,
    remove,
  };
}
