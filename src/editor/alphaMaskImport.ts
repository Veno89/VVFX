import {
  assetAlphaMaskFromRgba,
  MAX_ALPHA_MASK_DIMENSION,
  type AssetAlphaMask,
} from "../vfx/alphaMask";
import {
  IMAGE_DECODE_TIMEOUT_MS,
  isSafeImageDimensions,
} from "../vfx/inputLimits";
import {
  inspectPortableImageDataUrl,
  type PortableImageInspection,
} from "../vfx/portableImage";

export interface PreparedImageAlphaMask {
  width: number;
  height: number;
  transparency: "yes" | "no";
  alphaMask: AssetAlphaMask;
}

export type VerifiedPortableImage = Extract<
  PortableImageInspection,
  { ok: true }
>;

export function isSupportedAlphaMaskDataUrl(dataUrl: string): boolean {
  return inspectPortableImageDataUrl(dataUrl).ok;
}

/** Computes an aspect-preserving, bounded grid before canvas allocation. */
export function alphaMaskGridDimensions(
  sourceWidth: number,
  sourceHeight: number,
): { columns: number; rows: number } {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  )
    throw new Error("The image has invalid dimensions.");
  const scale = Math.min(
    1,
    MAX_ALPHA_MASK_DIMENSION / Math.max(sourceWidth, sourceHeight),
  );
  return {
    columns: Math.max(1, Math.round(sourceWidth * scale)),
    rows: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function prepareAlphaMaskFromImageData(
  columns: number,
  rows: number,
  rgba: ArrayLike<number>,
): AssetAlphaMask {
  const mask = assetAlphaMaskFromRgba(columns, rows, rgba);
  if (!mask) throw new Error("The sampled image pixels are invalid.");
  return mask;
}

export function prepareAlphaMaskFromLoadedImage(
  image: HTMLImageElement,
): PreparedImageAlphaMask {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!isSafeImageDimensions(width, height))
    throw new Error("The decoded image dimensions exceed Vvfx's safety limit.");
  const { columns, rows } = alphaMaskGridDimensions(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("This browser could not inspect the image pixels.");
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, columns, rows);
  context.drawImage(image, 0, 0, columns, rows);
  const pixels = context.getImageData(0, 0, columns, rows).data;
  const alphaMask = prepareAlphaMaskFromImageData(columns, rows, pixels);
  return {
    width,
    height,
    transparency: alphaMask.alpha.some((alpha) => alpha < 250) ? "yes" : "no",
    alphaMask,
  };
}

const imageAbortError = () =>
  new DOMException("Image decoding was cancelled.", "AbortError");

const asImageError = (error: unknown, fallback: string) =>
  error instanceof Error ? error : new Error(fallback);

function decodePortableImageDataUrl<T>(
  dataUrl: string,
  signal: AbortSignal | undefined,
  consumeImage: (
    image: HTMLImageElement,
    inspection: VerifiedPortableImage,
  ) => T,
): Promise<T> {
  const inspection = inspectPortableImageDataUrl(dataUrl);
  if (!inspection.ok) return Promise.reject(new Error(inspection.error));
  if (signal?.aborted) return Promise.reject(imageAbortError());

  return new Promise<T>((resolve, reject) => {
    let candidate: HTMLImageElement;
    try {
      candidate = new Image();
    } catch (error) {
      reject(asImageError(error, "This image could not be decoded."));
      return;
    }

    let settled = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let listeningForAbort = false;

    const clearSource = () => {
      try {
        candidate.src = "";
      } catch {
        // Some browser/test image implementations expose a read-only source.
      }
    };
    const cleanup = () => {
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      try {
        candidate.onload = null;
      } catch {
        // Continue tearing down the remaining owned image state.
      }
      try {
        candidate.onerror = null;
      } catch {
        // Continue tearing down the remaining owned image state.
      }
      if (listeningForAbort) {
        try {
          signal?.removeEventListener("abort", abort);
        } catch {
          // A non-standard signal must not prevent image teardown.
        }
        listeningForAbort = false;
      }
      clearSource();
    };
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    function abort() {
      fail(imageAbortError());
    }
    const loaded = () => {
      if (settled) return;
      if (
        candidate.naturalWidth !== inspection.width ||
        candidate.naturalHeight !== inspection.height
      ) {
        fail(
          new Error("The decoded image dimensions do not match its header."),
        );
        return;
      }
      let result: T;
      try {
        result = consumeImage(candidate, inspection);
      } catch (error) {
        fail(asImageError(error, "This image could not be prepared."));
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    try {
      candidate.onload = loaded;
      candidate.onerror = () =>
        fail(new Error("This PNG or WebP image could not be decoded."));
      if (signal) {
        signal.addEventListener("abort", abort, { once: true });
        listeningForAbort = true;
        if (signal.aborted) {
          abort();
          return;
        }
      }
      candidate.decoding = "async";
      timeout = globalThis.setTimeout(
        () => fail(new Error("Image decoding took too long.")),
        IMAGE_DECODE_TIMEOUT_MS,
      );
      candidate.src = dataUrl;
    } catch (error) {
      fail(asImageError(error, "This image could not be decoded."));
    }
  });
}

/**
 * Verifies that a structurally valid embedded PNG/WebP also decodes in the
 * browser. The owned Image is fully released and no canvas is allocated.
 */
export function verifyPortableImageDataUrl(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<VerifiedPortableImage> {
  return decodePortableImageDataUrl(
    dataUrl,
    signal,
    (_image, inspection) => inspection,
  );
}

/** Only local PNG/WebP data URLs are decoded; remote/CORS URLs are rejected. */
export async function prepareAlphaMaskFromDataUrl(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<PreparedImageAlphaMask> {
  return decodePortableImageDataUrl(dataUrl, signal, (image) =>
    prepareAlphaMaskFromLoadedImage(image),
  );
}
