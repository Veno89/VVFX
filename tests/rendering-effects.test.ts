import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import {
  MAX_RENDERING_EFFECT_PADDING,
  VVFX_RENDERING_NOISE_TEXTURE,
  clearPhaserRenderingEffects,
  createDefaultRenderingEffects,
  enabledRenderingEffects,
  ensureRenderingNoiseTexture,
  evaluateRenderingEffects,
  hasEnabledRenderingEffects,
  normalizeRenderingEffects,
  renderingEffectPadding,
  renderingEffectPassCost,
  syncPhaserRenderingEffects,
} from "../src/vfx/renderingEffects";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";

function evaluatedSettings() {
  const settings = createDefaultRenderingEffects();
  settings.blur.enabled = true;
  settings.blur.steps = 3;
  settings.outerGlow.enabled = true;
  settings.brightnessExposure.enabled = true;
  settings.animatedShine.enabled = true;
  settings.spatialGradient.enabled = true;
  settings.directionalDissolve.enabled = true;
  settings.spriteWarp.enabled = true;
  settings.spriteWarp.mode = "barrel";
  return evaluateRenderingEffects(settings, {
    lifetimeProgress: 0.25,
    elapsedMs: 250,
    seed: 8421,
  });
}

class FakeRectangle {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}

  setTo(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }
}

interface FakeFilterController {
  active: boolean;
  renderNode: string;
  destroy: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
}

function disposableFilter(
  renderNode: string,
  values: Record<string, unknown> = {},
): FakeFilterController {
  const filter: FakeFilterController = {
    active: true,
    renderNode,
    ...values,
    destroy: vi.fn(() => {
      filter.active = false;
    }),
  };
  return filter;
}

function fakeScene(
  webgl: boolean,
  options: { failRegistration?: boolean; failConstruction?: boolean } = {},
) {
  let stored = false;
  let pixels: Uint8ClampedArray | null = null;
  const texture = {
    context: {
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        pixels = new Uint8ClampedArray(image.data);
      },
    },
    refresh: vi.fn(),
  };
  const uniforms = new Map<string, unknown>();
  const setUniform = vi.fn((name: string, value: unknown) => {
    uniforms.set(name, value);
  });

  class FakeBaseFilterShader {
    programManager = { setUniform };

    constructor(
      public name: string,
      public manager: unknown,
      public fragmentShaderKey?: string,
      public fragmentShaderSource?: string,
    ) {}
  }

  class FakeWipeNode extends FakeBaseFilterShader {
    constructor(manager: unknown) {
      super("FilterWipe", manager);
    }
  }

  const constructors = new Map<string, new (owner: unknown) => unknown>();
  const nodes = new Map<string, unknown>();
  const managerValue = {
    hasNode: vi.fn((name: string) => nodes.has(name) || constructors.has(name)),
    addNodeConstructor: vi.fn(
      (name: string, constructor: new (owner: unknown) => unknown) => {
        if (options.failRegistration)
          throw new Error("render node registration failed");
        constructors.set(name, constructor);
      },
    ),
    getNode: vi.fn((name: string) => {
      const existing = nodes.get(name);
      if (existing) return existing;
      if (name === "FilterWipe") {
        const wipe = new FakeWipeNode(managerValue);
        nodes.set(name, wipe);
        return wipe;
      }
      const constructor = constructors.get(name);
      if (!constructor) return null;
      if (options.failConstruction)
        throw new Error("render node construction failed");
      const node = new constructor(managerValue);
      nodes.set(name, node);
      return node;
    }),
  };
  const sceneValue = {
    sys: {
      game: { loop: { time: 1_250 } },
      renderer: webgl ? { renderNodes: managerValue } : {},
    },
    textures: {
      exists: vi.fn(() => stored),
      createCanvas: vi.fn(() => {
        stored = true;
        return texture;
      }),
    },
  };
  const camera = {
    scene: sceneValue,
    worldView: new FakeRectangle(),
  } as unknown as Phaser.Cameras.Scene2D.Camera;
  return {
    scene: sceneValue as unknown as Phaser.Scene,
    camera,
    manager: managerValue,
    nodes,
    constructors,
    setUniform,
    uniforms,
    texture,
    getPixels: () => pixels,
  };
}

function fakeTextureFrame({
  key = "target",
  name = "__BASE",
  sourceWidth = 512,
  sourceHeight = 256,
  realWidth = 100,
  realHeight = 50,
  x = 10,
  y = 5,
  cutWidth = 80,
  cutHeight = 40,
  u0 = 0.1,
  v0 = 0.2,
  u1 = 0.3,
  v1 = 0.6,
}: Partial<{
  key: string;
  name: string;
  sourceWidth: number;
  sourceHeight: number;
  realWidth: number;
  realHeight: number;
  x: number;
  y: number;
  cutWidth: number;
  cutHeight: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}> = {}) {
  const glTexture = { webGLTexture: {} };
  return {
    texture: { key },
    name,
    sourceIndex: 0,
    source: { width: sourceWidth, height: sourceHeight, glTexture },
    realWidth,
    realHeight,
    x,
    y,
    cutWidth,
    cutHeight,
    u0,
    v0,
    u1,
    v1,
    glTexture,
  } as unknown as Phaser.Textures.Frame;
}

function fakeSprite(
  camera: Phaser.Cameras.Scene2D.Camera,
  frame = fakeTextureFrame(),
  initialFilters: FakeFilterController[] = [],
) {
  const colorMatrix = { reset: vi.fn(), brightness: vi.fn() };
  const controllers = {
    colorMatrix: disposableFilter("FilterColorMatrix", { colorMatrix }),
    barrel: disposableFilter("FilterBarrel", { amount: 0 }),
    displacement: disposableFilter("FilterDisplacement", { x: 0, y: 0 }),
    wipe: disposableFilter("FilterWipe", { progress: 0 }),
    blur: disposableFilter("FilterBlur"),
    glow: disposableFilter("FilterGlow"),
  };
  const list = [...initialFilters];
  const addController = <T extends FakeFilterController>(controller: T): T => {
    list.push(controller);
    return controller;
  };
  const filterList = {
    camera,
    list,
    add: vi.fn((filter: FakeFilterController) => addController(filter)),
    remove: vi.fn((filter: FakeFilterController, forceDestroy?: boolean) => {
      const index = list.indexOf(filter);
      if (index >= 0) list.splice(index, 1);
      if (forceDestroy) (filter.destroy as () => void)();
      return filterList;
    }),
    addColorMatrix: vi.fn(() => addController(controllers.colorMatrix)),
    addBarrel: vi.fn(() => addController(controllers.barrel)),
    addDisplacement: vi.fn(() => addController(controllers.displacement)),
    addWipe: vi.fn(() => addController(controllers.wipe)),
    addBlur: vi.fn(() => addController(controllers.blur)),
    addGlow: vi.fn(() => addController(controllers.glow)),
  };
  const spriteValue = {
    frame,
    filters: null as { internal: typeof filterList } | null,
    enableFilters: vi.fn(() => {
      spriteValue.filters = { internal: filterList };
      return spriteValue;
    }),
  };
  return {
    sprite: spriteValue as unknown as Phaser.GameObjects.Image,
    filterList,
    controllers,
    colorMatrix,
    list,
    enableFilters: spriteValue.enableFilters,
  };
}

describe("experimental rendering values", () => {
  it("normalizes the complete visual-mask contract and counts one pass", () => {
    const normalized = normalizeRenderingEffects({
      visualMask: {
        enabled: true,
        maskAssetId: "  soft-mask  ",
        channel: "luminance",
        invert: true,
        fit: "cover",
        offsetX: 9,
        offsetY: -9,
        scale: 0,
        rotation: 270,
        strength: -1,
      },
    });

    expect(normalized.visualMask).toEqual({
      enabled: true,
      maskAssetId: "soft-mask",
      channel: "luminance",
      invert: true,
      fit: "cover",
      offsetX: 2,
      offsetY: -2,
      scale: 0.1,
      rotation: 180,
      strength: 0,
    });
    expect(enabledRenderingEffects(normalized)).toEqual(["visual-mask"]);
    expect(renderingEffectPassCost(normalized)).toBe(1);
  });

  it("defaults legacy dissolve data to a directional wipe and bounds noise scale", () => {
    const defaults = createDefaultRenderingEffects();
    expect(defaults.directionalDissolve).toMatchObject({
      pattern: "directional",
      noiseScale: 6,
    });

    const legacy = normalizeRenderingEffects({
      directionalDissolve: { enabled: true },
    });
    expect(legacy.directionalDissolve).toMatchObject({
      enabled: true,
      pattern: "directional",
      noiseScale: 6,
    });

    const noisy = normalizeRenderingEffects({
      directionalDissolve: {
        enabled: true,
        pattern: "noise",
        noiseScale: 99,
      },
    });
    expect(noisy.directionalDissolve.pattern).toBe("noise");
    expect(noisy.directionalDissolve.noiseScale).toBe(16);
  });

  it("starts completely disabled and reports bounded pass costs", () => {
    const settings = createDefaultRenderingEffects();
    expect(hasEnabledRenderingEffects(settings)).toBe(false);
    expect(enabledRenderingEffects(settings)).toEqual([]);
    expect(renderingEffectPassCost(settings)).toBe(0);

    const evaluated = evaluatedSettings();
    expect(enabledRenderingEffects(evaluated.settings)).toEqual([
      "blur",
      "outer-glow",
      "brightness-exposure",
      "animated-shine",
      "spatial-gradient",
      "directional-dissolve",
      "sprite-warp",
    ]);
    expect(renderingEffectPassCost(evaluated.settings)).toBe(12);
    evaluated.settings.directionalDissolve.pattern = "noise";
    expect(renderingEffectPassCost(evaluated.settings)).toBe(12);
    evaluated.settings.blur.offsetX = 1_000;
    evaluated.settings.blur.offsetY = 1_000;
    expect(renderingEffectPadding(evaluated.settings)).toBe(
      MAX_RENDERING_EFFECT_PADDING,
    );
  });

  it("uses canonical lifetime progress for the directional dissolve", () => {
    const settings = createDefaultRenderingEffects();
    settings.directionalDissolve.enabled = true;
    settings.directionalDissolve.start = 0.2;
    settings.directionalDissolve.end = 0.8;

    const result = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.25,
      elapsedMs: 250,
      seed: 7,
    });
    expect(result.controllers.directionalDissolveProgress).toBeCloseTo(1 / 12);
  });

  it("keeps noise erosion static on direct seek and varies it per copy seed", () => {
    const settings = createDefaultRenderingEffects();
    settings.directionalDissolve.enabled = true;
    settings.directionalDissolve.pattern = "noise";
    const first = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.45,
      elapsedMs: 450,
      seed: 91,
    });
    const directSeek = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.45,
      elapsedMs: 12_450,
      seed: 91,
    });
    const anotherCopy = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.45,
      elapsedMs: 450,
      seed: 92,
    });

    expect(directSeek.controllers.dissolveNoiseOffsetX).toBe(
      first.controllers.dissolveNoiseOffsetX,
    );
    expect(directSeek.controllers.dissolveNoiseOffsetY).toBe(
      first.controllers.dissolveNoiseOffsetY,
    );
    expect([
      anotherCopy.controllers.dissolveNoiseOffsetX,
      anotherCopy.controllers.dissolveNoiseOffsetY,
    ]).not.toEqual([
      first.controllers.dissolveNoiseOffsetX,
      first.controllers.dissolveNoiseOffsetY,
    ]);
  });

  it("keeps sprite-local heat shimmer deterministic while moving over time", () => {
    const settings = createDefaultRenderingEffects();
    settings.spriteWarp.enabled = true;
    settings.spriteWarp.mode = "heat-shimmer";
    const first = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 350,
      seed: 91,
    });
    const replay = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 350,
      seed: 91,
    });
    const later = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 650,
      seed: 91,
    });

    expect(replay.controllers).toEqual(first.controllers);
    expect(later.controllers.displacementX).not.toBe(
      first.controllers.displacementX,
    );
    expect(Math.abs(first.controllers.displacementX)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(first.controllers.displacementY)).toBeLessThanOrEqual(0.1);
  });

  it("evaluates exposure as a bounded linear brightness multiplier", () => {
    const settings = createDefaultRenderingEffects();
    settings.brightnessExposure.enabled = true;
    settings.brightnessExposure.brightness = 0.75;
    settings.brightnessExposure.exposure = 1;
    settings.animatedShine.enabled = true;
    settings.animatedShine.speed = 1.25;
    const result = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 500,
      seed: 1,
    });
    expect(result.controllers.brightnessMultiplier).toBe(1.5);
    expect(result.controllers.shineSpeed).toBe(1.25);
  });

  it("evaluates authored effects on every engine instance", () => {
    const project = createEmptyProject("Dissolving ring");
    const ring = createLayer("animated", "Ring", "builtin-ring");
    ring.timing.duration = 1_000;
    ring.timing.easing = "constant";
    ring.appearance.effects.directionalDissolve = {
      ...ring.appearance.effects.directionalDissolve,
      enabled: true,
      start: 0.2,
      end: 0.8,
    };
    ring.appearance.effects.brightnessExposure = {
      enabled: true,
      brightness: 0.75,
      exposure: 1,
    };
    project.layers = [ring];

    const [instance] = evaluateProject(project, 500, null);

    expect(
      instance.effects.controllers.directionalDissolveProgress,
    ).toBeCloseTo(0.5);
    expect(instance.effects.controllers.brightnessMultiplier).toBe(1.5);
  });
});

describe("shared Phaser 4 filter adapter", () => {
  it("warns once and becomes a safe no-op on Canvas", () => {
    const { scene, camera } = fakeScene(false);
    const { sprite, filterList, enableFilters } = fakeSprite(camera);
    const warnings: string[] = [];
    const effects = evaluatedSettings();

    const first = syncPhaserRenderingEffects({
      scene,
      sprite,
      effects,
      onWarning: (message) => warnings.push(message),
    });
    const second = syncPhaserRenderingEffects({
      scene,
      sprite,
      effects,
      onWarning: (message) => warnings.push(message),
    });

    expect(first).toMatchObject({ supported: false, applied: false });
    expect(second).toMatchObject({ supported: false, applied: false });
    expect(warnings).toHaveLength(1);
    expect(enableFilters).not.toHaveBeenCalled();
    expect(filterList.addBlur).not.toHaveBeenCalled();
  });

  it("caches its controller signature and updates values without stacking", () => {
    const { scene, camera, manager } = fakeScene(true);
    const { sprite, filterList, controllers, colorMatrix, list } =
      fakeSprite(camera);
    const first = evaluatedSettings();
    syncPhaserRenderingEffects({ scene, sprite, effects: first });

    const replay = evaluateRenderingEffects(first.settings, {
      lifetimeProgress: 0.75,
      elapsedMs: 750,
      seed: 8421,
    });
    syncPhaserRenderingEffects({ scene, sprite, effects: replay });

    expect(manager.addNodeConstructor).toHaveBeenCalledTimes(4);
    expect(filterList.add).toHaveBeenCalledTimes(2);
    expect(filterList.addColorMatrix).toHaveBeenCalledTimes(1);
    expect(filterList.addBarrel).toHaveBeenCalledTimes(1);
    expect(filterList.addWipe).toHaveBeenCalledTimes(1);
    expect(filterList.addBlur).toHaveBeenCalledTimes(1);
    expect(filterList.addGlow).toHaveBeenCalledTimes(1);
    expect(list).toHaveLength(7);
    expect(controllers.wipe.progress).toBeCloseTo(0.75);
    expect(colorMatrix.brightness).toHaveBeenLastCalledWith(1);
    const shine = list.find(
      (filter) => filter.renderNode === "VvfxAnimatedShineFilter",
    );
    expect(shine).toMatchObject({ speed: 0.5 });
    expect(filterList.remove).not.toHaveBeenCalled();

    const changed = createDefaultRenderingEffects();
    Object.assign(changed, first.settings);
    changed.blur = { ...first.settings.blur, strength: 2 };
    syncPhaserRenderingEffects({
      scene,
      sprite,
      effects: evaluateRenderingEffects(changed, {
        lifetimeProgress: 0.5,
        elapsedMs: 500,
        seed: 8421,
      }),
    });
    expect(filterList.remove).toHaveBeenCalledTimes(7);
    expect(filterList.addBlur).toHaveBeenCalledTimes(2);
    expect(list).toHaveLength(7);

    clearPhaserRenderingEffects(sprite);
    expect(filterList.remove).toHaveBeenCalledTimes(14);
    expect(list).toHaveLength(0);
  });

  it("registers and configures a resolved visual mask before authored filters", () => {
    const { scene, camera, manager, nodes, setUniform } = fakeScene(true);
    const targetFrame = fakeTextureFrame();
    const maskFrame = fakeTextureFrame({
      key: "soft-mask",
      name: "atlas-mask",
      sourceWidth: 1024,
      sourceHeight: 512,
      realWidth: 200,
      realHeight: 100,
      x: 20,
      y: 10,
      cutWidth: 160,
      cutHeight: 80,
      u0: 0.25,
      v0: 0.1,
      u1: 0.45,
      v1: 0.3,
    });
    const maskedSprite = fakeSprite(camera, targetFrame);
    const settings = createDefaultRenderingEffects();
    settings.visualMask = {
      enabled: true,
      maskAssetId: "soft-mask",
      channel: "luminance",
      invert: true,
      fit: "contain",
      offsetX: 0.25,
      offsetY: -0.5,
      scale: 1.5,
      rotation: 90,
      strength: 0.65,
    };
    settings.brightnessExposure.enabled = true;
    settings.spatialGradient.enabled = true;
    settings.spriteWarp.enabled = true;
    settings.spriteWarp.mode = "barrel";
    settings.directionalDissolve.enabled = true;
    settings.directionalDissolve.pattern = "noise";
    settings.animatedShine.enabled = true;
    settings.blur.enabled = true;
    settings.outerGlow.enabled = true;
    const resolveAssetFrame = vi.fn(() => maskFrame);

    const result = syncPhaserRenderingEffects({
      scene,
      sprite: maskedSprite.sprite,
      effects: evaluateRenderingEffects(settings, {
        lifetimeProgress: 0.4,
        elapsedMs: 400,
        seed: 51,
      }),
      resolveAssetFrame,
    });

    expect(result).toMatchObject({
      supported: true,
      applied: true,
      passCost: 11,
    });
    expect(resolveAssetFrame).toHaveBeenCalledWith("soft-mask");
    expect(manager.addNodeConstructor).toHaveBeenCalledTimes(4);
    expect(
      maskedSprite.list.map((controller) => controller.renderNode),
    ).toEqual([
      "VvfxVisualMaskFilter",
      "FilterColorMatrix",
      "VvfxSpatialGradientFilter",
      "FilterBarrel",
      "VvfxNoiseErosionFilter",
      "VvfxAnimatedShineFilter",
      "FilterBlur",
      "FilterGlow",
    ]);

    const maskController = maskedSprite.list[0] as FakeFilterController & {
      active: boolean;
      gameObject: unknown;
      maskFrame: Phaser.Textures.Frame | null;
    };
    const visualMaskNode = nodes.get("VvfxVisualMaskFilter") as {
      fragmentShaderSource: string;
      setupTextures: (
        controller: unknown,
        textures: unknown[],
        context: unknown,
      ) => void;
      setupUniforms: (controller: unknown, context: unknown) => void;
    };
    expect(visualMaskNode.fragmentShaderSource).toContain("* maskColor.a");
    const textures = [{ source: true }, null];
    visualMaskNode.setupTextures(maskController, textures, {});
    expect(textures[1]).toBe(maskFrame.source.glTexture);
    visualMaskNode.setupUniforms(maskController, {});
    expect(setUniform).toHaveBeenCalledWith("vvfxMaskSampler", 1);
    expect(setUniform).toHaveBeenCalledWith(
      "vvfxMaskLogical",
      [0.1, 0.1, 0.8, 0.8],
    );
    expect(setUniform).toHaveBeenCalledWith(
      "vvfxMaskTransform",
      [0.5, -0.5, 3, 1.5],
    );
    expect(setUniform).toHaveBeenCalledWith("vvfxTargetScale", [2, 1]);
    expect(setUniform).toHaveBeenCalledWith("vvfxMaskRotation", [
      expect.closeTo(0, 10),
      1,
    ]);
    expect(setUniform).toHaveBeenCalledWith("vvfxMaskOptions", [0.65, 1, 1, 0]);

    clearPhaserRenderingEffects(maskedSprite.sprite);
    expect(maskController.active).toBe(false);
    expect(maskController.gameObject).toBeNull();
    expect(maskController.maskFrame).toBeNull();
  });

  it("omits a missing visual-mask source safely and warns once per scene", () => {
    const { scene, camera, manager } = fakeScene(true);
    const settings = createDefaultRenderingEffects();
    settings.visualMask.enabled = true;
    settings.visualMask.maskAssetId = "missing-mask";
    const effects = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 500,
      seed: 8,
    });
    const warnings: string[] = [];
    const firstSprite = fakeSprite(camera);
    const secondSprite = fakeSprite(camera);

    const first = syncPhaserRenderingEffects({
      scene,
      sprite: firstSprite.sprite,
      effects,
      resolveAssetFrame: () => null,
      onWarning: (message) => warnings.push(message),
    });
    const second = syncPhaserRenderingEffects({
      scene,
      sprite: secondSprite.sprite,
      effects,
      resolveAssetFrame: () => null,
      onWarning: (message) => warnings.push(message),
    });

    expect(first).toMatchObject({ supported: false, applied: false });
    expect(second).toMatchObject({ supported: false, applied: false });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("visual-mask texture");
    expect(manager.addNodeConstructor).not.toHaveBeenCalled();
    expect(firstSprite.filterList.add).not.toHaveBeenCalled();
  });

  it("registers custom render nodes once and keeps erosion in authored order", () => {
    const { scene, camera, manager, nodes, setUniform } = fakeScene(true);
    const firstSprite = fakeSprite(camera);
    const secondSprite = fakeSprite(camera);
    const settings = createDefaultRenderingEffects();
    settings.spriteWarp.enabled = true;
    settings.spriteWarp.mode = "barrel";
    settings.directionalDissolve.enabled = true;
    settings.directionalDissolve.pattern = "noise";
    settings.animatedShine.enabled = true;
    settings.blur.enabled = true;
    settings.outerGlow.enabled = true;

    const first = syncPhaserRenderingEffects({
      scene,
      sprite: firstSprite.sprite,
      effects: evaluateRenderingEffects(settings, {
        lifetimeProgress: 0.25,
        elapsedMs: 250,
        seed: 71,
      }),
    });
    syncPhaserRenderingEffects({
      scene,
      sprite: secondSprite.sprite,
      effects: evaluateRenderingEffects(settings, {
        lifetimeProgress: 0.5,
        elapsedMs: 500,
        seed: 72,
      }),
    });

    expect(first).toMatchObject({ supported: true, applied: true });
    expect(manager.addNodeConstructor).toHaveBeenCalledTimes(4);
    expect(firstSprite.filterList.addWipe).not.toHaveBeenCalled();
    expect(firstSprite.list.map((controller) => controller.renderNode)).toEqual(
      [
        "FilterBarrel",
        "VvfxNoiseErosionFilter",
        "VvfxAnimatedShineFilter",
        "FilterBlur",
        "FilterGlow",
      ],
    );

    const noiseController = firstSprite.list[1] as FakeFilterController & {
      active: boolean;
      gameObject: unknown;
      progress: number;
      softness: number;
      noiseScale: number;
      noiseOffsetX: number;
      noiseOffsetY: number;
    };
    const noiseNode = nodes.get("VvfxNoiseErosionFilter") as {
      fragmentShaderSource: string;
      setupUniforms: (
        controller: unknown,
        context: { width: number; height: number },
      ) => void;
    };
    expect(noiseNode.fragmentShaderSource).toContain("vvfxDissolve");
    noiseNode.setupUniforms(noiseController, { width: 128, height: 64 });
    expect(setUniform).toHaveBeenCalledWith("vvfxDissolve", [0.25, 0.1, 6, 0]);
    expect(setUniform).toHaveBeenCalledWith("vvfxTargetToSprite", [1, 0.5]);

    const replay = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.75,
      elapsedMs: 750,
      seed: 71,
    });
    syncPhaserRenderingEffects({
      scene,
      sprite: firstSprite.sprite,
      effects: replay,
    });
    expect(manager.addNodeConstructor).toHaveBeenCalledTimes(4);
    expect(firstSprite.filterList.add).toHaveBeenCalledTimes(2);
    expect(noiseController.progress).toBe(0.75);
    expect(noiseController.noiseOffsetX).toBe(
      replay.controllers.dissolveNoiseOffsetX,
    );
    expect(noiseController.noiseOffsetY).toBe(
      replay.controllers.dissolveNoiseOffsetY,
    );

    clearPhaserRenderingEffects(firstSprite.sprite);
    expect(noiseController.active).toBe(false);
    expect(noiseController.gameObject).toBeNull();
  });

  it("omits custom filters safely when render-node registration fails", () => {
    const { scene, camera, manager } = fakeScene(true, {
      failRegistration: true,
    });
    const firstSprite = fakeSprite(camera);
    const secondSprite = fakeSprite(camera);
    const settings = createDefaultRenderingEffects();
    settings.directionalDissolve.enabled = true;
    settings.directionalDissolve.pattern = "noise";
    const effects = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 500,
      seed: 3,
    });
    const warnings: string[] = [];

    const first = syncPhaserRenderingEffects({
      scene,
      sprite: firstSprite.sprite,
      effects,
      onWarning: (message) => warnings.push(message),
    });
    const second = syncPhaserRenderingEffects({
      scene,
      sprite: secondSprite.sprite,
      effects,
      onWarning: (message) => warnings.push(message),
    });

    expect(first).toMatchObject({ supported: false, applied: false });
    expect(second).toMatchObject({ supported: false, applied: false });
    expect(manager.addNodeConstructor).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Phaser 4 rendering filters");
    expect(firstSprite.filterList.add).not.toHaveBeenCalled();
  });

  it("omits custom filters safely when render-node construction fails", () => {
    const { scene, camera, manager } = fakeScene(true, {
      failConstruction: true,
    });
    const { sprite, filterList } = fakeSprite(camera);
    const settings = createDefaultRenderingEffects();
    settings.directionalDissolve.enabled = true;
    settings.directionalDissolve.pattern = "noise";
    const warnings: string[] = [];

    const result = syncPhaserRenderingEffects({
      scene,
      sprite,
      effects: evaluateRenderingEffects(settings, {
        lifetimeProgress: 0.5,
        elapsedMs: 500,
        seed: 4,
      }),
      onWarning: (message) => warnings.push(message),
    });

    expect(result).toMatchObject({ supported: false, applied: false });
    expect(manager.addNodeConstructor).toHaveBeenCalledTimes(4);
    expect(filterList.add).not.toHaveBeenCalled();
    expect(warnings).toHaveLength(1);
  });

  it("maps native Phaser 4 filters and preserves unrelated host filters", () => {
    const { scene, camera } = fakeScene(true);
    const hostFilter = disposableFilter("HostFilter");
    const { sprite, filterList, list, controllers } = fakeSprite(
      camera,
      fakeTextureFrame(),
      [hostFilter],
    );
    const settings = createDefaultRenderingEffects();
    settings.spriteWarp.enabled = true;
    settings.spriteWarp.mode = "heat-shimmer";
    settings.directionalDissolve.enabled = true;
    settings.blur.enabled = true;
    settings.outerGlow.enabled = true;

    const evaluated = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.6,
      elapsedMs: 600,
      seed: 9,
    });
    syncPhaserRenderingEffects({ scene, sprite, effects: evaluated });

    expect(filterList.addDisplacement).toHaveBeenCalledWith(
      VVFX_RENDERING_NOISE_TEXTURE,
      evaluated.controllers.displacementX,
      evaluated.controllers.displacementY,
    );
    expect(filterList.addWipe).toHaveBeenCalledWith(0.1, 0, 0, 0);
    expect(filterList.addGlow).toHaveBeenCalledWith(0x7de9ff, 3, 0, 1, false);
    expect(controllers.wipe.progress).toBeCloseTo(0.6);
    expect(list[0]).toBe(hostFilter);

    clearPhaserRenderingEffects(sprite);
    expect(list).toEqual([hostFilter]);
    expect(hostFilter.destroy).not.toHaveBeenCalled();
  });

  it("creates one deterministic scene noise texture for sprite warp", () => {
    const firstScene = fakeScene(true);
    const secondScene = fakeScene(true);
    expect(ensureRenderingNoiseTexture(firstScene.scene)).toBe(
      VVFX_RENDERING_NOISE_TEXTURE,
    );
    expect(ensureRenderingNoiseTexture(firstScene.scene)).toBe(
      VVFX_RENDERING_NOISE_TEXTURE,
    );
    expect(firstScene.scene.textures.createCanvas).toHaveBeenCalledTimes(1);

    ensureRenderingNoiseTexture(secondScene.scene);
    expect(firstScene.getPixels()).toEqual(secondScene.getPixels());
    expect(firstScene.texture.refresh).toHaveBeenCalledTimes(1);
  });
});
