import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyEmbeddedAssetImages } from "../src/editor/embeddedImageValidation";
import { EMBEDDED_IMAGE_VALIDATION_TIMEOUT_MS } from "../src/vfx/inputLimits";
import type { VfxAsset } from "../src/vfx/types";

const imageVerifier = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("../src/editor/alphaMaskImport", () => ({
  verifyPortableImageDataUrl: imageVerifier,
}));

const embeddedAsset = (id: string, dataUrl = `data:image/png;base64,${id}`) =>
  ({
    id,
    name: `Asset ${id}`,
    mimeType: "image/png",
    dataUrl,
    width: 1,
    height: 1,
  }) as VfxAsset;

beforeEach(() => {
  imageVerifier.mockReset();
  imageVerifier.mockResolvedValue(undefined);
});

describe("embedded image validation", () => {
  it("skips built-ins and decodes duplicate sources only once", async () => {
    const builtIn = {
      ...embeddedAsset("builtin"),
      mimeType: "image/builtin",
      builtIn: "spark",
    } as VfxAsset;
    await verifyEmbeddedAssetImages([
      builtIn,
      embeddedAsset("first", "same-source"),
      embeddedAsset("second", "same-source"),
    ]);

    expect(imageVerifier).toHaveBeenCalledTimes(1);
    expect(imageVerifier).toHaveBeenCalledWith(
      "same-source",
      expect.any(AbortSignal),
    );
  });

  it("never runs more than two decoders concurrently", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    imageVerifier.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          peak = Math.max(peak, active);
          releases.push(() => {
            active -= 1;
            resolve();
          });
        }),
    );
    const validation = verifyEmbeddedAssetImages([
      embeddedAsset("one"),
      embeddedAsset("two"),
      embeddedAsset("three"),
    ]);

    await vi.waitFor(() => expect(imageVerifier).toHaveBeenCalledTimes(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(imageVerifier).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => release());
    await validation;

    expect(peak).toBe(2);
  });

  it("identifies the asset whose decode failed", async () => {
    imageVerifier.mockRejectedValueOnce(new Error("Bad compressed payload."));

    await expect(
      verifyEmbeddedAssetImages([embeddedAsset("broken")]),
    ).rejects.toThrow(/Asset broken.*Bad compressed payload/i);
  });

  it("bounds total collection validation time and cancels late work", async () => {
    imageVerifier.mockImplementation(
      (_dataUrl?: string, signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.useFakeTimers();
    try {
      const validation = verifyEmbeddedAssetImages([embeddedAsset("slow")]);
      const rejection = expect(validation).rejects.toThrow(
        /validation took too long/i,
      );
      await vi.advanceTimersByTimeAsync(EMBEDDED_IMAGE_VALIDATION_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates caller cancellation", async () => {
    imageVerifier.mockImplementation(
      (_dataUrl?: string, signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const validation = verifyEmbeddedAssetImages(
      [embeddedAsset("cancelled")],
      controller.signal,
    );
    controller.abort();

    await expect(validation).rejects.toMatchObject({ name: "AbortError" });
  });
});
