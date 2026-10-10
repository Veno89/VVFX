import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EffectThumbnail } from "../src/editor/components/EffectThumbnail";
import { ShapeLibraryDialog } from "../src/editor/components/ShapeLibraryDialog";
import {
  createThumbnailScene,
  drawThumbnailFrame,
} from "../src/editor/effectThumbnail";
import { LIBRARY_SHAPES, renderLibraryShape } from "../src/editor/shapeLibrary";
import { recordCanvasAsSpriteSheet } from "../src/editor/spriteSheetExport";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../src/vfx/presets";

/** jsdom has no canvas; record 2D calls so canvas code paths can run. */
function fakeContext() {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    { calls },
    {
      get: (target, property) => {
        if (property === "calls") return target.calls;
        if (property === "createRadialGradient") return () => gradient;
        if (property === "createLinearGradient") return () => gradient;
        if (property === "getImageData")
          return () => ({ data: new Uint8ClampedArray(4) });
        return () => {
          calls.push(String(property));
        };
      },
      set: () => true,
    },
  );
  return context as unknown as CanvasRenderingContext2D & { calls: string[] };
}

let contexts: Array<ReturnType<typeof fakeContext>> = [];

beforeEach(() => {
  contexts = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function getContext() {
      const context = fakeContext();
      contexts.push(context);
      return context as never;
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    function toBlob(callback: BlobCallback) {
      callback(
        new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
      );
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,iVBORw0KGgo=",
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("canvas-backed editor exports", () => {
  it("draws every preset thumbnail, including tinted and additive copies", () => {
    for (const layers of [
      ...COMPOSITION_PRESETS.map((preset) => preset.create()),
      ...LAYER_PRESETS.map((preset) => [preset.create()]),
    ]) {
      const scene = createThumbnailScene(layers);
      const context = fakeContext();
      drawThumbnailFrame(context, scene, scene.posterTime, 64);
      expect(context.calls).toContain("clearRect");
    }
    expect(contexts.length).toBeGreaterThan(0);
  });

  it("renders a still thumbnail at rest and animates while playing", () => {
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(performance.now() + 120);
        return 1;
      });
    const preset = COMPOSITION_PRESETS[0];
    const { rerender } = render(
      <EffectThumbnail id="test-thumb" createLayers={preset.create} />,
    );
    expect(document.querySelector("canvas.effect-thumbnail")).not.toBeNull();
    frame.mockImplementationOnce(() => 2);
    rerender(
      <EffectThumbnail id="test-thumb" createLayers={preset.create} playing />,
    );
    expect(frame).toHaveBeenCalled();
  });

  it("packs a sprite sheet ZIP with an atlas and one PNG per frame", async () => {
    const source = document.createElement("canvas");
    source.width = 320;
    source.height = 180;
    const renderFrame = vi.fn(async () => undefined);
    const progress: number[] = [];
    const recording = await recordCanvasAsSpriteSheet({
      source,
      duration: 400,
      framesPerSecond: 10,
      size: { width: 64, height: 64 },
      name: "Magic Impact!",
      renderFrame,
      onProgress: (value) => progress.push(value),
    });
    expect(renderFrame).toHaveBeenCalledTimes(4);
    expect(recording).toMatchObject({
      format: "spritesheet",
      mimeType: "application/zip",
      width: 128,
      height: 128,
    });
    expect(progress.at(-1)).toBe(1);
    const bytes = new Uint8Array(await recording.blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("magic-impact-sheet.png");
    expect(text).toContain("frames/magic-impact_003.png");

    const controller = new AbortController();
    controller.abort();
    await expect(
      recordCanvasAsSpriteSheet({
        source,
        duration: 400,
        name: "x",
        renderFrame,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("lists every library shape and hands the picked one back", async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<ShapeLibraryDialog onPick={onPick} onClose={onClose} />);
    expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(
      LIBRARY_SHAPES.length,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Star" }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "star" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close shape library" }),
    );
    expect(onClose).toHaveBeenCalled();

    const file = await renderLibraryShape(LIBRARY_SHAPES[0]);
    expect(file.type).toBe("image/png");
    expect(file.name).toBe(`${LIBRARY_SHAPES[0].name}.png`);
  });
});
