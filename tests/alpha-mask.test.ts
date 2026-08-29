import { describe, expect, it } from "vitest";
import {
  alphaMaskOverlaySamples,
  alphaMaskThresholdByte,
  alphaMaskWorldDimensions,
  assetAlphaMaskFromRgba,
  eligibleAlphaMaskIndices,
  MAX_ALPHA_MASK_CELLS,
  MAX_ALPHA_MASK_OVERLAY_SAMPLES,
  maximumAlphaMaskValue,
  normalizeAssetAlphaMask,
  sampleAlphaMaskOffset,
} from "../src/vfx/alphaMask";
import {
  alphaMaskGridDimensions,
  isSupportedAlphaMaskDataUrl,
  prepareAlphaMaskFromImageData,
} from "../src/editor/alphaMaskImport";
import {
  TINY_PNG_DATA_URL,
  TINY_WEBP_DATA_URL,
} from "./fixtures/portableImages";

function rgba(...alpha: number[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(alpha.length * 4);
  alpha.forEach((value, index) => {
    pixels[index * 4] = 255;
    pixels[index * 4 + 1] = 255;
    pixels[index * 4 + 2] = 255;
    pixels[index * 4 + 3] = value;
  });
  return pixels;
}

describe("alpha-mask upload preparation primitives", () => {
  it("extracts row-major alpha bytes from sampled RGBA pixels", () => {
    expect(prepareAlphaMaskFromImageData(2, 2, rgba(0, 64, 128, 255))).toEqual({
      columns: 2,
      rows: 2,
      alpha: [0, 64, 128, 255],
    });
  });

  it("preserves source aspect while bounding the longest grid side to 64", () => {
    expect(alphaMaskGridDimensions(1024, 512)).toEqual({
      columns: 64,
      rows: 32,
    });
    expect(alphaMaskGridDimensions(100, 1000)).toEqual({
      columns: 6,
      rows: 64,
    });
    expect(alphaMaskGridDimensions(24, 12)).toEqual({
      columns: 24,
      rows: 12,
    });
    expect(() => alphaMaskGridDimensions(0, 12)).toThrow(/dimensions/i);
  });

  it("accepts only local PNG and WebP data URLs", () => {
    expect(isSupportedAlphaMaskDataUrl(TINY_PNG_DATA_URL)).toBe(true);
    expect(isSupportedAlphaMaskDataUrl(TINY_WEBP_DATA_URL)).toBe(true);
    expect(isSupportedAlphaMaskDataUrl("data:image/webp,AAAA")).toBe(false);
    expect(isSupportedAlphaMaskDataUrl("data:image/jpeg;base64,AAAA")).toBe(
      false,
    );
    expect(isSupportedAlphaMaskDataUrl("https://example.test/mask.png")).toBe(
      false,
    );
  });

  it("rejects oversized, truncated, and malformed untrusted grids", () => {
    expect(
      assetAlphaMaskFromRgba(65, 1, rgba(...Array(65).fill(255))),
    ).toBeNull();
    expect(assetAlphaMaskFromRgba(2, 2, rgba(255))).toBeNull();
    expect(
      normalizeAssetAlphaMask({ columns: 64, rows: 64, alpha: [] }),
    ).toBeNull();
    expect(
      normalizeAssetAlphaMask({
        columns: 1,
        rows: 1,
        alpha: [Number.NaN],
      }),
    ).toBeNull();
    expect(MAX_ALPHA_MASK_CELLS).toBe(4096);
  });

  it("clamps finite imported alpha values to exact bytes", () => {
    expect(
      normalizeAssetAlphaMask({
        columns: 2,
        rows: 1,
        alpha: [-20, 300.4],
      }),
    ).toEqual({ columns: 2, rows: 1, alpha: [0, 255] });
  });
});

describe("deterministic alpha-mask sampling", () => {
  const mask = {
    columns: 4,
    rows: 2,
    alpha: [0, 20, 80, 255, 10, 90, 160, 240],
  };

  it("quantizes thresholds and caches the same eligible cell list", () => {
    expect(alphaMaskThresholdByte(0)).toBe(1);
    expect(alphaMaskThresholdByte(0.5)).toBe(128);
    expect(alphaMaskThresholdByte(2)).toBe(255);
    const first = eligibleAlphaMaskIndices(mask, 0.5);
    expect(first).toEqual([3, 6, 7]);
    expect(eligibleAlphaMaskIndices(mask, 0.5)).toBe(first);
    expect(maximumAlphaMaskValue(mask)).toBe(255);
  });

  it("bounds cached threshold samples per mask", () => {
    const oldest = eligibleAlphaMaskIndices(mask, 0.01);
    for (let index = 1; index <= 16; index += 1)
      eligibleAlphaMaskIndices(mask, (index + 1) / 32);

    expect(eligibleAlphaMaskIndices(mask, 0.01)).not.toBe(oldest);
  });

  it("returns null for a fully transparent or over-threshold mask", () => {
    const empty = { columns: 2, rows: 1, alpha: [0, 0] };
    expect(sampleAlphaMaskOffset(empty, 0.01, 160, 42)).toBeNull();
    expect(sampleAlphaMaskOffset(mask, 1, 160, 42)?.alpha).toBe(255);
  });

  it("replays the same sampled cell and sub-cell jitter for the same seed", () => {
    const first = sampleAlphaMaskOffset(mask, 0.2, 200, 8421);
    const repeated = sampleAlphaMaskOffset(mask, 0.2, 200, 8421);
    expect(repeated).toEqual(first);
    expect(sampleAlphaMaskOffset(mask, 0.2, 200, 8422)).not.toEqual(first);
    expect(first?.x).toBeGreaterThanOrEqual(-100);
    expect(first?.x).toBeLessThanOrEqual(100);
    expect(first?.y).toBeGreaterThanOrEqual(-50);
    expect(first?.y).toBeLessThanOrEqual(50);
  });

  it("preserves wide and tall aspect ratios in world coordinates", () => {
    expect(alphaMaskWorldDimensions(mask, 200)).toEqual({
      width: 200,
      height: 100,
    });
    expect(alphaMaskWorldDimensions({ columns: 2, rows: 4 }, 200)).toEqual({
      width: 100,
      height: 200,
    });
    expect(alphaMaskWorldDimensions(mask, 5000).width).toBe(1000);
  });

  it("bounds the overlay cloud while sampling across the eligible list", () => {
    const full = {
      columns: 64,
      rows: 64,
      alpha: Array(MAX_ALPHA_MASK_CELLS).fill(255),
    };
    const samples = alphaMaskOverlaySamples(full, 0.2, 320, 10_000);
    expect(samples).toHaveLength(MAX_ALPHA_MASK_OVERLAY_SAMPLES);
    expect(samples[0].cellIndex).toBe(0);
    expect(samples.at(-1)?.cellIndex).toBeGreaterThan(4000);
    expect(new Set(samples.map((sample) => sample.cellIndex)).size).toBe(
      samples.length,
    );
    expect(alphaMaskOverlaySamples(full, 0.2, 320, Number.NaN)).toHaveLength(
      MAX_ALPHA_MASK_OVERLAY_SAMPLES,
    );
  });
});
