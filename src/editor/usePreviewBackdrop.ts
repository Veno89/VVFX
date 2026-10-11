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
 * The game-screenshot backdrop behind the preview. It belongs to this browser
 * rather than the project, and storage failures only cost persistence.
 */
export function usePreviewBackdrop(
  measure: typeof readImageSize = readImageSize,
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
  const url = image?.url ?? null;

  // Each image gets its own object URL; release it once it is replaced.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    loadPreviewBackdrop()
      .then((stored) => {
        // A screenshot picked while storage was loading wins.
        if (cancelled || !stored || chosenRef.current) return;
        const { pixelScale, opacity, ...storedImage } = stored;
        setImage({ image: storedImage, url: imageUrl(storedImage) });
        setSettings({ pixelScale, opacity });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Store settings once they settle, not on every slider step.
  const { pixelScale, opacity } = settings;
  const hasImage = image !== null;
  useEffect(() => {
    if (!hasImage) return;
    const timer = window.setTimeout(() => {
      savePreviewBackdropSettings({ pixelScale, opacity }).catch(
        () => undefined,
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hasImage, pixelScale, opacity]);

  const choose = useCallback(
    async (file: File) => {
      setError(null);
      if (!BACKDROP_TYPES.includes(file.type)) {
        setError("Choose a PNG, JPEG, or WebP screenshot.");
        return;
      }
      if (file.size > BACKDROP_MAX_BYTES) {
        setError("Choose a screenshot under 25 MB.");
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
          setError("Choose a screenshot up to 8192 pixels on each side.");
          return;
        }
        const next: PreviewBackdropImage = {
          name: file.name.slice(0, 120) || "Screenshot",
          type: file.type,
          data: await file.arrayBuffer(),
          width: size.width,
          height: size.height,
        };
        chosenRef.current = true;
        setImage({ image: next, url: imageUrl(next) });
        savePreviewBackdropImage(next).catch(() => undefined);
      } catch {
        setError("This image could not be opened.");
      }
    },
    [measure],
  );

  const update = useCallback((patch: Partial<PreviewBackdropSettings>) => {
    setSettings((current) =>
      normalizeBackdropSettings(
        patch.pixelScale ?? current.pixelScale,
        patch.opacity ?? current.opacity,
      ),
    );
  }, []);

  const remove = useCallback(() => {
    setError(null);
    setImage(null);
    clearPreviewBackdrop().catch(() => undefined);
  }, []);

  return {
    backdrop: image ? { ...image.image, ...settings } : null,
    url,
    error,
    choose,
    update,
    remove,
  };
}
