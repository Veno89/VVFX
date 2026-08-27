import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPortableImageDataUrl } from "../src/editor/alphaMaskImport";
import { IMAGE_DECODE_TIMEOUT_MS } from "../src/vfx/inputLimits";
import { TINY_PNG_DATA_URL } from "./fixtures/portableImages";

type ImageHandler = ((event: Event) => void) | null;

class ControlledImage {
  static created: ControlledImage[] = [];

  naturalWidth = 1;
  naturalHeight = 1;
  decoding = "auto";
  onload: ImageHandler = null;
  onerror: ImageHandler = null;
  assignedSources: string[] = [];
  protected currentSource = "";

  constructor() {
    ControlledImage.created.push(this);
  }

  get src() {
    return this.currentSource;
  }

  set src(value: string) {
    this.assignedSources.push(value);
    this.currentSource = value;
  }
}

function installControlledImage() {
  vi.stubGlobal("Image", ControlledImage);
}

function trigger(handler: ImageHandler) {
  handler?.(new Event("image"));
}

function expectReleased(image: ControlledImage) {
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(image.src).toBe("");
  expect(image.assignedSources.at(-1)).toBe("");
}

beforeEach(() => {
  ControlledImage.created = [];
  installControlledImage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("portable image browser verification", () => {
  it("decodes a matching portable image without allocating a canvas", async () => {
    const createElement = vi.spyOn(document, "createElement");
    const pending = verifyPortableImageDataUrl(TINY_PNG_DATA_URL);
    const image = ControlledImage.created[0];

    trigger(image.onload);

    await expect(pending).resolves.toMatchObject({
      ok: true,
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
    expect(createElement).not.toHaveBeenCalledWith("canvas");
    expectReleased(image);
  });

  it("rejects structural damage before constructing an Image", async () => {
    await expect(
      verifyPortableImageDataUrl("data:image/png;base64,AAAA"),
    ).rejects.toThrow(/PNG|image|damaged|container/i);
    expect(ControlledImage.created).toHaveLength(0);
  });

  it("rejects a structurally valid image when browser decoding fails", async () => {
    const pending = verifyPortableImageDataUrl(TINY_PNG_DATA_URL);
    const image = ControlledImage.created[0];

    trigger(image.onerror);

    await expect(pending).rejects.toThrow(/could not be decoded/i);
    expectReleased(image);
  });

  it("rejects decoded dimensions that differ from the inspected header", async () => {
    const pending = verifyPortableImageDataUrl(TINY_PNG_DATA_URL);
    const image = ControlledImage.created[0];
    image.naturalWidth = 2;

    trigger(image.onload);

    await expect(pending).rejects.toThrow(/dimensions do not match/i);
    expectReleased(image);
  });

  it("times out, releases the Image, and ignores a captured late callback", async () => {
    vi.useFakeTimers();
    const pending = verifyPortableImageDataUrl(TINY_PNG_DATA_URL);
    const image = ControlledImage.created[0];
    const lateLoad = image.onload;
    const rejection = expect(pending).rejects.toThrow(/too long/i);

    await vi.advanceTimersByTimeAsync(IMAGE_DECODE_TIMEOUT_MS);
    await rejection;
    expectReleased(image);

    trigger(lateLoad);
    expectReleased(image);
  });

  it("aborts active decoding and releases the owned Image", async () => {
    const controller = new AbortController();
    const pending = verifyPortableImageDataUrl(
      TINY_PNG_DATA_URL,
      controller.signal,
    );
    const image = ControlledImage.created[0];

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expectReleased(image);
  });

  it("reports a synchronous Image-constructor failure", async () => {
    let attempts = 0;
    class ThrowingImage {
      constructor() {
        attempts += 1;
        throw new Error("Image constructor failed");
      }
    }
    vi.stubGlobal("Image", ThrowingImage);

    await expect(verifyPortableImageDataUrl(TINY_PNG_DATA_URL)).rejects.toThrow(
      /constructor failed/i,
    );
    expect(attempts).toBe(1);
  });

  it("cleans up after a synchronous src setter failure", async () => {
    class ThrowingSourceImage extends ControlledImage {
      override get src() {
        return this.currentSource;
      }

      override set src(value: string) {
        this.assignedSources.push(value);
        if (value) throw new Error("Image src failed");
        this.currentSource = value;
      }
    }
    vi.stubGlobal("Image", ThrowingSourceImage);
    const pending = verifyPortableImageDataUrl(TINY_PNG_DATA_URL);
    const image = ControlledImage.created[0];

    await expect(pending).rejects.toThrow(/src failed/i);
    expectReleased(image);
    expect(image.assignedSources).toEqual([TINY_PNG_DATA_URL, ""]);
  });
});
