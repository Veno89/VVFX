import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
  canRecordWebm,
  selectWebmMimeType,
} from "../src/editor/previewRecording";
import {
  createPreviewAssetTextureState,
  previewDisplayState,
  resolvePreviewRenderingAssetFrame,
  syncPreviewAssetTextures,
  syncPreviewRenderingEffects,
} from "../src/preview/PhaserPreview";
import { createEmptyProject } from "../src/vfx/defaults";
import { VVFX_INTERNAL_MISSING_TEXTURE_KEY } from "../src/vfx/inputLimits";
import type { VfxAsset } from "../src/vfx/types";
import {
  createDefaultRenderingEffects,
  evaluateRenderingEffects,
} from "../src/vfx/renderingEffects";
import {
  TINY_PNG_DATA_URL,
  TINY_WEBP_DATA_URL,
} from "./fixtures/portableImages";

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
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
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

  it("uses independent keyed listeners for concurrent preview texture loads", () => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new Map<string, Set<Listener>>();
    const makeTexture = () => {
      const frames: Record<string, unknown> = { __BASE: {} };
      return {
        frames,
        add: (name: string | number) => {
          frames[String(name)] = {};
        },
        remove: (name: string) => delete frames[name],
        has: (name: string) => name in frames,
        get: (name: string | number) => frames[String(name)],
      };
    };
    const textures = new Map<string, ReturnType<typeof makeTexture>>();
    const on = (event: string, listener: Listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
    };
    const off = (event: string, listener: Listener) =>
      listeners.get(event)?.delete(listener);
    const emit = (event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])])
        listener(...args);
    };
    const manager = {
      exists: (key: string) => textures.has(key),
      get: (key: string) => textures.get(key),
      once: vi.fn(on),
      on: vi.fn(on),
      off: vi.fn(off),
      addBase64: vi.fn(),
      remove: vi.fn((key: string) => textures.delete(key)),
    };
    const scene = { textures: manager } as unknown as Phaser.Scene;
    const project = createEmptyProject("Concurrent preview sheets");
    const sheets: VfxAsset[] = ["sheet-a", "sheet-b"].map((id) => ({
      id,
      name: id,
      mimeType: "image/png" as const,
      dataUrl: TINY_PNG_DATA_URL,
      width: 64,
      height: 32,
      transparency: "yes" as const,
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 2 },
    }));
    let currentAssets = [...project.assets, ...sheets];
    const state = createPreviewAssetTextureState(() => currentAssets);
    const revision = vi.fn();
    let displayedFrame: unknown = null;
    const beforeRemove = vi.fn((assetId: string) => {
      if (assetId === "sheet-a") displayedFrame = "missing-frame";
    });

    syncPreviewAssetTextures(
      scene,
      currentAssets,
      state,
      revision,
      beforeRemove,
    );

    expect(manager.once).toHaveBeenCalledWith(
      "addtexture-sheet-a",
      expect.any(Function),
    );
    expect(manager.once).toHaveBeenCalledWith(
      "addtexture-sheet-b",
      expect.any(Function),
    );
    expect(state.pending.size).toBe(2);

    const second = makeTexture();
    textures.set("sheet-b", second);
    emit("addtexture-sheet-b", second as unknown as Phaser.Textures.Texture);
    expect(second.has("0")).toBe(true);
    expect(state.pending.has("sheet-a")).toBe(true);
    expect(state.pending.has("sheet-b")).toBe(false);

    const first = makeTexture();
    textures.set("sheet-a", first);
    emit("addtexture-sheet-a", first as unknown as Phaser.Textures.Texture);
    expect(first.has("1")).toBe(true);
    expect(state.pending.size).toBe(0);
    expect(revision).toHaveBeenCalledTimes(2);

    const oldFrameZero = first.frames["0"];
    displayedFrame = oldFrameZero;
    currentAssets = currentAssets.map((asset) =>
      asset.id === "sheet-a"
        ? {
            ...asset,
            spriteSheet: {
              frameWidth: 16,
              frameHeight: 32,
              frameCount: 4,
            },
          }
        : asset,
    );
    syncPreviewAssetTextures(
      scene,
      currentAssets,
      state,
      revision,
      beforeRemove,
    );

    expect(beforeRemove).toHaveBeenCalledWith("sheet-a");
    expect(displayedFrame).toBe("missing-frame");
    expect(textures.has("sheet-a")).toBe(false);
    expect(manager.addBase64).toHaveBeenCalledTimes(3);

    const replacement = makeTexture();
    textures.set("sheet-a", replacement);
    emit(
      "addtexture-sheet-a",
      replacement as unknown as Phaser.Textures.Texture,
    );
    expect(replacement.frames["0"]).not.toBe(oldFrameZero);
    expect(replacement.has("3")).toBe(true);
  });

  it("loads a legacy vvfx-missing asset beside the internal fallback", () => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new Map<string, Set<Listener>>();
    const fallbackTexture = {} as Phaser.Textures.Texture;
    const textures = new Map<string, Phaser.Textures.Texture>([
      [VVFX_INTERNAL_MISSING_TEXTURE_KEY, fallbackTexture],
    ]);
    const on = (event: string, listener: Listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
    };
    const manager = {
      exists: (key: string) => textures.has(key),
      get: (key: string) => textures.get(key),
      once: vi.fn(on),
      on: vi.fn(on),
      off: vi.fn((event: string, listener: Listener) =>
        listeners.get(event)?.delete(listener),
      ),
      addBase64: vi.fn(),
      remove: vi.fn((key: string) => textures.delete(key)),
    };
    const scene = { textures: manager } as unknown as Phaser.Scene;
    const project = createEmptyProject("Legacy preview image");
    const legacyAsset: VfxAsset = {
      id: "vvfx-missing",
      name: "Legacy preview image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    const assets = [...project.assets, legacyAsset];
    const state = createPreviewAssetTextureState(() => assets);

    syncPreviewAssetTextures(scene, assets, state, vi.fn());

    expect(manager.addBase64).toHaveBeenCalledWith(
      legacyAsset.id,
      legacyAsset.dataUrl,
    );
    expect(state.pending.has(legacyAsset.id)).toBe(true);
    expect(textures.get(VVFX_INTERNAL_MISSING_TEXTURE_KEY)).toBe(
      fallbackTexture,
    );
    expect(manager.remove).not.toHaveBeenCalledWith(
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
    );
  });

  it("retries a replacement after the superseded preview decode fails", () => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new Map<string, Set<Listener>>();
    const on = (event: string, listener: Listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
    };
    const emit = (event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])])
        listener(...args);
    };
    const manager = {
      exists: vi.fn(() => false),
      get: vi.fn(),
      once: vi.fn(on),
      on: vi.fn(on),
      off: vi.fn((event: string, listener: Listener) =>
        listeners.get(event)?.delete(listener),
      ),
      addBase64: vi.fn(),
      remove: vi.fn(),
    };
    const scene = { textures: manager } as unknown as Phaser.Scene;
    const original: VfxAsset = {
      id: "replace-pending-preview",
      name: "Pending preview",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    let currentAssets = [original];
    const state = createPreviewAssetTextureState(() => currentAssets);
    const revision = vi.fn();

    syncPreviewAssetTextures(scene, currentAssets, state, revision);
    currentAssets = [
      {
        ...original,
        mimeType: "image/webp",
        dataUrl: TINY_WEBP_DATA_URL,
      },
    ];
    syncPreviewAssetTextures(scene, currentAssets, state, revision);
    expect(manager.addBase64).toHaveBeenCalledTimes(1);

    emit("onerror", original.id);
    expect(revision).toHaveBeenCalledOnce();
    expect(state.pending.has(original.id)).toBe(false);

    syncPreviewAssetTextures(scene, currentAssets, state, revision);
    expect(manager.addBase64).toHaveBeenLastCalledWith(
      original.id,
      TINY_WEBP_DATA_URL,
    );
    expect(manager.addBase64).toHaveBeenCalledTimes(2);

    emit("onerror", original.id);
    expect(revision).toHaveBeenCalledOnce();
    expect(state.pending.has(original.id)).toBe(false);
  });

  it("removes a preview texture that finishes after its asset was removed", () => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new Map<string, Set<Listener>>();
    const textures = new Map<string, Phaser.Textures.Texture>();
    const on = (event: string, listener: Listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
    };
    const off = (event: string, listener: Listener) =>
      listeners.get(event)?.delete(listener);
    const manager = {
      exists: (key: string) => textures.has(key),
      get: (key: string) => textures.get(key),
      once: on,
      on,
      off,
      addBase64: vi.fn(),
      remove: vi.fn((key: string) => textures.delete(key)),
    };
    const scene = { textures: manager } as unknown as Phaser.Scene;
    const project = createEmptyProject("Late preview image");
    const lateAsset: VfxAsset = {
      id: "late-preview-image",
      name: "Late preview image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    let currentAssets = [...project.assets, lateAsset];
    const state = createPreviewAssetTextureState(() => currentAssets);
    const revision = vi.fn();
    const beforeRemove = vi.fn();

    syncPreviewAssetTextures(
      scene,
      currentAssets,
      state,
      revision,
      beforeRemove,
    );
    currentAssets = project.assets;
    syncPreviewAssetTextures(
      scene,
      currentAssets,
      state,
      revision,
      beforeRemove,
    );

    const lateTexture = {} as Phaser.Textures.Texture;
    textures.set(lateAsset.id, lateTexture);
    for (const listener of [
      ...(listeners.get(`addtexture-${lateAsset.id}`) ?? []),
    ])
      listener(lateTexture);

    expect(manager.remove).toHaveBeenCalledWith(lateAsset.id);
    expect(beforeRemove).toHaveBeenCalledWith(lateAsset.id);
    expect(textures.has(lateAsset.id)).toBe(false);
    expect(state.installed.has(lateAsset.id)).toBe(false);
    expect(state.pending.has(lateAsset.id)).toBe(false);
    expect(revision).toHaveBeenCalledOnce();
  });
});
