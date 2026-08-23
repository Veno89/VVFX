import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
  canRecordWebm,
  selectWebmMimeType,
} from "../src/editor/previewRecording";
import {
  previewDisplayState,
  resolvePreviewRenderingAssetFrame,
  syncPreviewRenderingEffects,
} from "../src/preview/PhaserPreview";
import { createEmptyProject } from "../src/vfx/defaults";
import type { VfxAsset } from "../src/vfx/types";
import {
  createDefaultRenderingEffects,
  evaluateRenderingEffects,
} from "../src/vfx/renderingEffects";

describe("preview video export", () => {
  it("prefers VP9 and falls back through compatible WebM encoders", () => {
    expect(selectWebmMimeType(() => true)).toBe("video/webm;codecs=vp9");
    expect(
      selectWebmMimeType((mimeType) => mimeType === "video/webm;codecs=vp8"),
    ).toBe("video/webm;codecs=vp8");
    expect(selectWebmMimeType(() => false)).toBeNull();
  });

  it("reports unsupported recording environments safely", () => {
    expect(canRecordWebm()).toBe(false);
  });

  it("removes authoring guides and workspace zoom while recording", () => {
    expect(previewDisplayState(true, 2.5, true, "selected-layer")).toEqual({
      zoom: 1,
      showGrid: false,
      selectedId: null,
    });
    expect(previewDisplayState(false, 2.5, true, "selected-layer")).toEqual({
      zoom: 2.5,
      showGrid: true,
      selectedId: "selected-layer",
    });
    expect(previewDisplayState(false, 2.5, true, "selected-layer", 25)).toEqual(
      {
        zoom: 2.5,
        showGrid: true,
        selectedId: null,
      },
    );
  });

  it("uses the shared Canvas-safe adapter for preview sprites", () => {
    const settings = createDefaultRenderingEffects();
    settings.blur.enabled = true;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = syncPreviewRenderingEffects(
      { sys: { renderer: {} } } as unknown as Phaser.Scene,
      {} as Phaser.GameObjects.Image,
      evaluateRenderingEffects(settings, {
        lifetimeProgress: 0.5,
        elapsedMs: 500,
        seed: 1,
      }),
    );

    expect(result).toMatchObject({ supported: false, applied: false });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("resolves a still mask's full preview texture and rejects sprite sheets", () => {
    const frame = { name: "__BASE" } as Phaser.Textures.Frame;
    const texture = {
      has: vi.fn((name: string) => name === "__BASE"),
      get: vi.fn(() => frame),
    };
    const scene = {
      textures: {
        exists: vi.fn((key: string) => key === "preview-mask"),
        get: vi.fn(() => texture),
      },
    } as unknown as Phaser.Scene;
    const project = createEmptyProject("Preview mask resolver");
    const stillMask: VfxAsset = {
      ...project.assets[0],
      id: "preview-mask",
      name: "Preview mask",
      mimeType: "image/png" as const,
      dataUrl: "data:image/png;base64,bWFzaw==",
      spriteSheet: null,
      atlasFrame: "host-only-atlas-frame",
      alphaMask: { columns: 1, rows: 1, alpha: [0] },
    };
    project.assets.push(stillMask);

    expect(
      resolvePreviewRenderingAssetFrame(scene, project.assets, stillMask.id),
    ).toBe(frame);
    expect(texture.get).toHaveBeenCalledWith("__BASE");

    stillMask.spriteSheet = {
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 4,
    };
    expect(
      resolvePreviewRenderingAssetFrame(scene, project.assets, stillMask.id),
    ).toBeNull();
  });
});
