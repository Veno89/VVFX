import { describe, expect, it } from "vitest";
import {
  isSafeImageDimensions,
  isSafeVfxId,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_BYTES,
  MAX_VFX_ID_LENGTH,
  utf8ByteLength,
} from "../src/vfx/inputLimits";
import {
  inspectPortableImageDataUrl,
  inspectPortableImageHeader,
} from "../src/vfx/portableImage";
import {
  extendedWebpBytes,
  pngWithAnimationControl,
  pngWithDimensions,
  pngWithIhdrLength,
  pngWithIhdrMethod,
  portableImageBytes,
  portableImageDataUrl,
  TINY_PNG_BASE64,
  TINY_PNG_DATA_URL,
  TINY_WEBP_BASE64,
  TINY_WEBP_DATA_URL,
  webpWithChunkSize,
  webpWithRiffSize,
} from "./fixtures/portableImages";

describe("portable embedded images", () => {
  it.each([
    ["PNG", TINY_PNG_DATA_URL, "image/png" as const, 68],
    ["WebP", TINY_WEBP_DATA_URL, "image/webp" as const, 38],
  ])("accepts a canonical tiny %s", (_label, dataUrl, mimeType, byteLength) => {
    expect(inspectPortableImageDataUrl(dataUrl, mimeType)).toEqual({
      ok: true,
      mimeType,
      byteLength,
      width: 1,
      height: 1,
    });
  });

  it.each([
    "data:image/png,AAAA",
    `DATA:image/png;base64,${TINY_PNG_BASE64}`,
    `data:image/png;charset=utf-8;base64,${TINY_PNG_BASE64}`,
    `data:image/png;base64,${TINY_PNG_BASE64}\n`,
    `data:image/png;base64,${TINY_PNG_BASE64.replace("+", "-")}`,
    "data:image/png;base64,",
    "data:image/png;base64,AAA",
    "data:image/png;base64,AAAA=",
    "data:image/jpeg;base64,AAAA",
  ])("rejects a non-canonical data URL: %s", (dataUrl) => {
    expect(inspectPortableImageDataUrl(dataUrl).ok).toBe(false);
  });

  it("rejects nonzero unused pad bits for one- and two-padding forms", () => {
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const withNonzeroPadBits = (encoded: string) => {
      const padding = encoded.endsWith("==") ? 2 : 1;
      const index = encoded.length - padding - 1;
      const alias = alphabet[alphabet.indexOf(encoded[index]) | 1];
      return `${encoded.slice(0, index)}${alias}${encoded.slice(index + 1)}`;
    };
    const onePadding = TINY_PNG_BASE64;
    const twoPadding = Buffer.from(
      portableImageBytes("image/png").slice(0, -1),
    ).toString("base64");

    expect(onePadding.endsWith("=")).toBe(true);
    expect(twoPadding.endsWith("==")).toBe(true);
    expect(
      Buffer.from(withNonzeroPadBits(onePadding), "base64").equals(
        Buffer.from(onePadding, "base64"),
      ),
    ).toBe(true);
    expect(
      Buffer.from(withNonzeroPadBits(twoPadding), "base64").equals(
        Buffer.from(twoPadding, "base64"),
      ),
    ).toBe(true);
    expect(
      inspectPortableImageDataUrl(
        `data:image/png;base64,${withNonzeroPadBits(onePadding)}`,
      ).ok,
    ).toBe(false);
    expect(
      inspectPortableImageDataUrl(
        `data:image/png;base64,${withNonzeroPadBits(twoPadding)}`,
      ).ok,
    ).toBe(false);
  });

  it("rejects declared MIME types that disagree with the expected type or bytes", () => {
    expect(
      inspectPortableImageDataUrl(TINY_PNG_DATA_URL, "image/webp").ok,
    ).toBe(false);
    expect(
      inspectPortableImageDataUrl(`data:image/webp;base64,${TINY_PNG_BASE64}`)
        .ok,
    ).toBe(false);
    expect(
      inspectPortableImageDataUrl(`data:image/png;base64,${TINY_WEBP_BASE64}`)
        .ok,
    ).toBe(false);
  });

  it("rejects truncated PNG and WebP payloads", () => {
    const png = portableImageBytes("image/png").slice(0, 24);
    const webp = portableImageBytes("image/webp").slice(0, 24);

    expect(
      inspectPortableImageDataUrl(portableImageDataUrl("image/png", png)).ok,
    ).toBe(false);
    expect(
      inspectPortableImageDataUrl(portableImageDataUrl("image/webp", webp)).ok,
    ).toBe(false);
  });

  it("rejects a header-only PNG without image data and an end chunk", () => {
    const headerOnly = portableImageBytes("image/png").slice(0, 33);
    expect(
      inspectPortableImageHeader(headerOnly, "image/png", headerOnly.length).ok,
    ).toBe(true);
    expect(
      inspectPortableImageDataUrl(portableImageDataUrl("image/png", headerOnly))
        .ok,
    ).toBe(false);
  });

  it("rejects animated PNG and illegal IHDR decoding methods", () => {
    expect(
      inspectPortableImageDataUrl(
        portableImageDataUrl("image/png", pngWithAnimationControl()),
      ).ok,
    ).toBe(false);
    for (const field of ["compression", "filter", "interlace"] as const)
      expect(
        inspectPortableImageDataUrl(
          portableImageDataUrl("image/png", pngWithIhdrMethod(field, 2)),
        ).ok,
      ).toBe(false);
  });

  it("rejects files over the compressed byte budget without allocating them", () => {
    const png = portableImageBytes("image/png");
    expect(
      inspectPortableImageHeader(
        png.subarray(0, 32),
        "image/png",
        MAX_IMAGE_FILE_BYTES + 1,
      ).ok,
    ).toBe(false);
    expect(
      inspectPortableImageDataUrl(
        TINY_PNG_DATA_URL,
        "image/png",
        png.length - 1,
      ).ok,
    ).toBe(false);
  });

  it("enforces PNG dimensions and IHDR structure", () => {
    const maximum = pngWithDimensions(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
    const oversized = pngWithDimensions(MAX_IMAGE_DIMENSION + 1, 1);

    expect(
      inspectPortableImageHeader(maximum, "image/png", maximum.length).ok,
    ).toBe(true);
    expect(
      inspectPortableImageHeader(oversized, "image/png", oversized.length).ok,
    ).toBe(false);
    const malformedIhdr = pngWithIhdrLength(12);
    expect(
      inspectPortableImageHeader(
        malformedIhdr,
        "image/png",
        malformedIhdr.length,
      ).ok,
    ).toBe(false);
  });

  it("enforces the WebP RIFF and first-chunk sizes", () => {
    const webp = portableImageBytes("image/webp");
    expect(inspectPortableImageHeader(webp, "image/webp", webp.length).ok).toBe(
      true,
    );

    const badRiff = webpWithRiffSize(webp.length - 9);
    expect(
      inspectPortableImageHeader(badRiff, "image/webp", badRiff.length).ok,
    ).toBe(false);

    const oversizedChunk = webpWithChunkSize(webp.length);
    expect(
      inspectPortableImageHeader(
        oversizedChunk,
        "image/webp",
        oversizedChunk.length,
      ).ok,
    ).toBe(false);

    const undersizedChunk = webpWithChunkSize(4);
    expect(
      inspectPortableImageHeader(
        undersizedChunk,
        "image/webp",
        undersizedChunk.length,
      ).ok,
    ).toBe(false);

    const trailingFragment = webpWithChunkSize(16);
    expect(
      inspectPortableImageDataUrl(
        portableImageDataUrl("image/webp", trailingFragment),
        "image/webp",
      ).ok,
    ).toBe(false);
  });

  it("rejects animated WebP and VP8X canvas/payload dimension mismatches", () => {
    const matching = extendedWebpBytes(1, 1, 1, 1);
    const mismatched = extendedWebpBytes(1, 1, 2, 1);
    const animated = extendedWebpBytes(1, 1, 1, 1, true);

    expect(
      inspectPortableImageDataUrl(portableImageDataUrl("image/webp", matching))
        .ok,
    ).toBe(true);
    expect(
      inspectPortableImageDataUrl(
        portableImageDataUrl("image/webp", mismatched),
      ).ok,
    ).toBe(false);
    expect(
      inspectPortableImageDataUrl(portableImageDataUrl("image/webp", animated))
        .ok,
    ).toBe(false);
  });
});

describe("input limits", () => {
  it("accepts only bounded positive integer image dimensions", () => {
    expect(isSafeImageDimensions(1, 1)).toBe(true);
    expect(
      isSafeImageDimensions(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION),
    ).toBe(true);

    for (const [width, height] of [
      [0, 1],
      [-1, 1],
      [1.5, 1],
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 1],
      [MAX_IMAGE_DIMENSION + 1, 1],
      [1, MAX_IMAGE_DIMENSION + 1],
    ] as const) {
      expect(isSafeImageDimensions(width, height)).toBe(false);
    }
  });

  it("accepts safe portable IDs and rejects reserved or unsafe IDs", () => {
    expect(isSafeVfxId("asset-1.frame_2")).toBe(true);
    expect(isSafeVfxId("A")).toBe(true);
    expect(isSafeVfxId("a".repeat(MAX_VFX_ID_LENGTH))).toBe(true);

    for (const id of [
      "",
      "-leading-dash",
      ".leading-dot",
      "under score",
      "path/segment",
      "lightning⚡",
      "constructor",
      "CONSTRUCTOR",
      "prototype",
      "__proto__",
      "a".repeat(MAX_VFX_ID_LENGTH + 1),
    ]) {
      expect(isSafeVfxId(id)).toBe(false);
    }
    expect(isSafeVfxId(null)).toBe(false);
    expect(isSafeVfxId(42)).toBe(false);
  });

  it("counts UTF-8 bytes rather than JavaScript code units", () => {
    expect(utf8ByteLength("Vvfx")).toBe(4);
    expect(utf8ByteLength("⚡")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
  });
});
