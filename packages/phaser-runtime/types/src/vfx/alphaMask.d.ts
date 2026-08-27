export declare const MAX_ALPHA_MASK_DIMENSION = 64;
export declare const MAX_ALPHA_MASK_CELLS: number;
export declare const MAX_ALPHA_MASK_OVERLAY_SAMPLES = 256;
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
/** Safely normalizes untrusted project/runtime mask data. */
export declare function normalizeAssetAlphaMask(
  value: unknown,
): AssetAlphaMask | null;
/** Builds a bounded mask from RGBA pixels that already match the mask grid. */
export declare function assetAlphaMaskFromRgba(
  columns: number,
  rows: number,
  rgba: ArrayLike<number>,
): AssetAlphaMask | null;
export declare function alphaMaskThresholdByte(threshold: number): number;
/** Returns one cached row-major list per mask and quantized threshold. */
export declare function eligibleAlphaMaskIndices(
  mask: AssetAlphaMask,
  threshold: number,
): readonly number[];
export declare function maximumAlphaMaskValue(mask: AssetAlphaMask): number;
/** Preserves the sampled image aspect ratio using size as its longest side. */
export declare function alphaMaskWorldDimensions(
  mask: Pick<AssetAlphaMask, "columns" | "rows">,
  size: number,
): AlphaMaskWorldDimensions;
/**
 * Samples uniformly among eligible cells, then adds stable sub-cell jitter.
 * The stored alpha grid—not a runtime texture—is the source of truth.
 */
export declare function sampleAlphaMaskOffset(
  mask: AssetAlphaMask,
  threshold: number,
  size: number,
  seed: number,
): SampledAlphaMaskOffset | null;
/** A bounded, non-jittered sample cloud for the selected-layer overlay. */
export declare function alphaMaskOverlaySamples(
  mask: AssetAlphaMask,
  threshold: number,
  size: number,
  limit?: number,
): AlphaMaskOverlaySample[];
