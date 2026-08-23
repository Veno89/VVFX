import {
  assetAlphaMaskFromRgba,
  MAX_ALPHA_MASK_DIMENSION,
  type AssetAlphaMask,
} from "../vfx/alphaMask";

export interface PreparedImageAlphaMask {
  width: number;
  height: number;
  transparency: "yes" | "no";
  alphaMask: AssetAlphaMask;
}

export function isSupportedAlphaMaskDataUrl(dataUrl: string): boolean {
  return /^data:image\/(?:png|webp)(?:;[^,]*)?,/i.test(dataUrl);
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

/** Only local PNG/WebP data URLs are decoded; remote/CORS URLs are rejected. */
export async function prepareAlphaMaskFromDataUrl(
  dataUrl: string,
): Promise<PreparedImageAlphaMask> {
  if (!isSupportedAlphaMaskDataUrl(dataUrl))
    throw new Error("Spawn masks must come from a local PNG or WebP upload.");
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () =>
      reject(new Error("This image could not be decoded as a spawn mask."));
    candidate.src = dataUrl;
  });
  return prepareAlphaMaskFromLoadedImage(image);
}
