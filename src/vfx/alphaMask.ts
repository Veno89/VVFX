import { seededRandom } from "./random";

export const MAX_ALPHA_MASK_DIMENSION = 64;
export const MAX_ALPHA_MASK_CELLS =
  MAX_ALPHA_MASK_DIMENSION * MAX_ALPHA_MASK_DIMENSION;
export const MAX_ALPHA_MASK_OVERLAY_SAMPLES = 256;

const MASK_CELL_SALT = 5301;
const MASK_JITTER_X_SALT = 5302;
const MASK_JITTER_Y_SALT = 5303;

export interface AssetAlphaMask {
  columns: number;
  rows: number;
  /** Row-major 8-bit alpha values. Its length is exactly columns * rows. */
  alpha: number[];
}

export interface AlphaMaskWorldDimensions {
  width: number;
  height: number;
}

export interface SampledAlphaMaskOffset extends AlphaMaskWorldDimensions {
  x: number;
  y: number;
  angle: number;
  cellIndex: number;
  column: number;
  row: number;
  alpha: number;
}

export interface AlphaMaskOverlaySample {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  cellIndex: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : null;

function validDimensions(columns: number, rows: number): boolean {
  return (
    columns >= 1 &&
    columns <= MAX_ALPHA_MASK_DIMENSION &&
    rows >= 1 &&
    rows <= MAX_ALPHA_MASK_DIMENSION &&
    columns * rows <= MAX_ALPHA_MASK_CELLS
  );
}

/** Safely normalizes untrusted project/runtime mask data. */
export function normalizeAssetAlphaMask(value: unknown): AssetAlphaMask | null {
  if (!isRecord(value)) return null;
  const columns = finiteInteger(value.columns);
  const rows = finiteInteger(value.rows);
  if (
    columns === null ||
    rows === null ||
    !validDimensions(columns, rows) ||
    !Array.isArray(value.alpha) ||
    value.alpha.length !== columns * rows
  )
    return null;

  const alpha: number[] = [];
  for (const candidate of value.alpha) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate))
      return null;
    alpha.push(Math.max(0, Math.min(255, Math.round(candidate))));
  }
  return { columns, rows, alpha };
}

/** Builds a bounded mask from RGBA pixels that already match the mask grid. */
export function assetAlphaMaskFromRgba(
  columns: number,
  rows: number,
  rgba: ArrayLike<number>,
): AssetAlphaMask | null {
  const normalizedColumns = finiteInteger(columns);
  const normalizedRows = finiteInteger(rows);
  if (
    normalizedColumns === null ||
    normalizedRows === null ||
    !validDimensions(normalizedColumns, normalizedRows) ||
    rgba.length < normalizedColumns * normalizedRows * 4
  )
    return null;

  const alpha = Array.from(
    { length: normalizedColumns * normalizedRows },
    (_unused, index) => {
      const candidate = Number(rgba[index * 4 + 3]);
      return Number.isFinite(candidate)
        ? Math.max(0, Math.min(255, Math.round(candidate)))
        : 0;
    },
  );
  return { columns: normalizedColumns, rows: normalizedRows, alpha };
}

export function alphaMaskThresholdByte(threshold: number): number {
  const normalized = Number.isFinite(threshold) ? threshold : 0.2;
  return Math.max(1, Math.min(255, Math.round(normalized * 255)));
}

const eligibleCache = new WeakMap<AssetAlphaMask, Map<number, number[]>>();
const MAX_CACHED_THRESHOLDS_PER_MASK = 16;

/** Returns one cached row-major list per mask and quantized threshold. */
export function eligibleAlphaMaskIndices(
  mask: AssetAlphaMask,
  threshold: number,
): readonly number[] {
  const thresholdByte = alphaMaskThresholdByte(threshold);
  let byThreshold = eligibleCache.get(mask);
  if (!byThreshold) {
    byThreshold = new Map();
    eligibleCache.set(mask, byThreshold);
  }
  const cached = byThreshold.get(thresholdByte);
  if (cached) {
    byThreshold.delete(thresholdByte);
    byThreshold.set(thresholdByte, cached);
    return cached;
  }
  const indices = mask.alpha.flatMap((alpha, index) =>
    alpha >= thresholdByte ? [index] : [],
  );
  byThreshold.set(thresholdByte, indices);
  if (byThreshold.size > MAX_CACHED_THRESHOLDS_PER_MASK) {
    const oldestThreshold = byThreshold.keys().next().value;
    if (oldestThreshold !== undefined) byThreshold.delete(oldestThreshold);
  }
  return indices;
}

export function maximumAlphaMaskValue(mask: AssetAlphaMask): number {
  return mask.alpha.reduce((maximum, alpha) => Math.max(maximum, alpha), 0);
}

/** Preserves the sampled image aspect ratio using size as its longest side. */
export function alphaMaskWorldDimensions(
  mask: Pick<AssetAlphaMask, "columns" | "rows">,
  size: number,
): AlphaMaskWorldDimensions {
  const longestSide = Math.max(
    0,
    Math.min(1000, Number.isFinite(size) ? size : 0),
  );
  if (mask.columns >= mask.rows) {
    return {
      width: longestSide,
      height: longestSide * (mask.rows / Math.max(1, mask.columns)),
    };
  }
  return {
    width: longestSide * (mask.columns / Math.max(1, mask.rows)),
    height: longestSide,
  };
}

/**
 * Samples uniformly among eligible cells, then adds stable sub-cell jitter.
 * The stored alpha grid—not a runtime texture—is the source of truth.
 */
export function sampleAlphaMaskOffset(
  mask: AssetAlphaMask,
  threshold: number,
  size: number,
  seed: number,
): SampledAlphaMaskOffset | null {
  const eligible = eligibleAlphaMaskIndices(mask, threshold);
  if (eligible.length === 0) return null;
  const choice = Math.min(
    eligible.length - 1,
    Math.floor(seededRandom(seed, MASK_CELL_SALT) * eligible.length),
  );
  const cellIndex = eligible[choice];
  const column = cellIndex % mask.columns;
  const row = Math.floor(cellIndex / mask.columns);
  const jitterX = seededRandom(seed, MASK_JITTER_X_SALT) - 0.5;
  const jitterY = seededRandom(seed, MASK_JITTER_Y_SALT) - 0.5;
  const dimensions = alphaMaskWorldDimensions(mask, size);
  const x = ((column + 0.5 + jitterX) / mask.columns - 0.5) * dimensions.width;
  const y = ((row + 0.5 + jitterY) / mask.rows - 0.5) * dimensions.height;
  return {
    ...dimensions,
    x,
    y,
    angle: Math.atan2(y, x),
    cellIndex,
    column,
    row,
    alpha: mask.alpha[cellIndex],
  };
}

/** A bounded, non-jittered sample cloud for the selected-layer overlay. */
export function alphaMaskOverlaySamples(
  mask: AssetAlphaMask,
  threshold: number,
  size: number,
  limit = MAX_ALPHA_MASK_OVERLAY_SAMPLES,
): AlphaMaskOverlaySample[] {
  const eligible = eligibleAlphaMaskIndices(mask, threshold);
  if (eligible.length === 0) return [];
  const requestedLimit = Number.isFinite(limit)
    ? Math.floor(limit)
    : MAX_ALPHA_MASK_OVERLAY_SAMPLES;
  const sampleCount = Math.min(
    eligible.length,
    Math.max(1, Math.min(MAX_ALPHA_MASK_OVERLAY_SAMPLES, requestedLimit)),
  );
  const dimensions = alphaMaskWorldDimensions(mask, size);
  const cellWidth = dimensions.width / mask.columns;
  const cellHeight = dimensions.height / mask.rows;
  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const eligibleIndex = Math.min(
      eligible.length - 1,
      Math.floor((sampleIndex * eligible.length) / sampleCount),
    );
    const cellIndex = eligible[eligibleIndex];
    const column = cellIndex % mask.columns;
    const row = Math.floor(cellIndex / mask.columns);
    return {
      x: (column + 0.5) * cellWidth - dimensions.width / 2,
      y: (row + 0.5) * cellHeight - dimensions.height / 2,
      width: cellWidth,
      height: cellHeight,
      alpha: mask.alpha[cellIndex],
      cellIndex,
    };
  });
}
