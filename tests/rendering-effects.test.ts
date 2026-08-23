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

function fakeScene(webgl: boolean) {
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
  const scene = {
    sys: { game: {}, renderer: webgl ? { pipelines: {} } : {} },
    textures: {
      exists: vi.fn(() => stored),
      createCanvas: vi.fn(() => {
        stored = true;
        return texture;
      }),
    },
  } as unknown as Phaser.Scene;
  return { scene, texture, getPixels: () => pixels };
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

function fakeSprite(frame = fakeTextureFrame()) {
  const disposable = (type: number) => ({
    type,
    active: true,
    destroy: vi.fn(),
  });
  const controllers = {
    colorMatrix: {
      ...disposable(14),
      reset: vi.fn(),
      brightness: vi.fn(),
    },
    shine: { ...disposable(8), speed: 0, lineWidth: 0, gradient: 0 },
    barrel: { ...disposable(16), amount: 0 },
    displacement: { ...disposable(17), x: 0, y: 0 },
    wipe: { ...disposable(18), progress: 0 },
    gradient: disposable(12),
    blur: disposable(9),
    glow: disposable(4),
  };
  const list: Array<{ type: number; destroy?: () => void }> = [];
  const addController = <T extends { type: number }>(controller: T) => {
    list.push(controller);
    return controller;
  };
  const preFX = {
    list,
    disable: vi.fn((clear?: boolean) => {
      if (!clear) return;
      list.forEach((controller) => controller.destroy?.());
      list.length = 0;
    }),
    setPadding: vi.fn(),
    add: vi.fn((controller: { type: number }) => addController(controller)),
    addGradient: vi.fn(() => addController(controllers.gradient)),
    addColorMatrix: vi.fn(() => addController(controllers.colorMatrix)),
    addShine: vi.fn(() => addController(controllers.shine)),
    addBarrel: vi.fn(() => addController(controllers.barrel)),
    addDisplacement: vi.fn(() => addController(controllers.displacement)),
    addWipe: vi.fn(() => addController(controllers.wipe)),
    addBlur: vi.fn(() => addController(controllers.blur)),
    addGlow: vi.fn(() => addController(controllers.glow)),
  };
  const spriteValue: {
    preFX: typeof preFX;
    frame: Phaser.Textures.Frame;
    pipeline: unknown;
    setPipeline: ReturnType<typeof vi.fn>;
  } = {
    preFX,
    frame,
    pipeline: null,
    setPipeline: vi.fn(),
  };
  spriteValue.setPipeline.mockImplementation((pipeline: unknown) => {
    spriteValue.pipeline = pipeline;
    return spriteValue;
  });
  return {
    sprite: spriteValue as unknown as Phaser.GameObjects.Image,
    preFX,
    controllers,
    list,
    setPipeline: spriteValue.setPipeline,
  };
}

function fakeNoisePipelineScene(
  failRegistration = false,
  failShaderInstall = false,
) {
  const game = {} as Phaser.Game;
  const createdPipelines: FakeFxPipeline[] = [];
  const baseShaderConfigs = Array.from({ length: 20 }, (_, index) => ({
    name: `Base${index}`,
    fragShader: "void main () {}",
  }));

  class FakeFxPipeline {
    config: Phaser.Types.Renderer.WebGL.WebGLPipelineConfig;
    shaders: Array<Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig> = [];
    fxHandlers: Array<
      ((controller: unknown, width: number, height: number) => void) | undefined
    > = [];
    spriteBounds = { width: 64, height: 32 };
    renderer = { projectionWidth: 820, projectionHeight: 470 };
    projectionMatrix = { val: [1, 0, 0, 1] };
    drawSpriteShader?: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig;
    copyShader?: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig;
    gameShader?: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig;
    colorMatrixShader?: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig;
    currentShader?: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig;
    setShader = vi.fn(
      (shader: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig) => {
        this.currentShader = shader;
        return this;
      },
    );
    set4f = vi.fn(() => this);
    set2f = vi.fn(() => this);
    set1i = vi.fn(() => this);
    setMatrix4fv = vi.fn(() => this);
    bindTexture = vi.fn(() => this);
    runDraw = vi.fn();
    destroy = vi.fn();
    setProjectionMatrix = vi.fn(() => this);
    private shaderBuildCount = 0;

    constructor(config: Phaser.Types.Renderer.WebGL.WebGLPipelineConfig) {
      this.config = {
        ...config,
        shaders: baseShaderConfigs.map((shader) => ({ ...shader })),
      };
      createdPipelines.push(this);
      this.setShadersFromConfig(this.config);
    }

    setShadersFromConfig = vi.fn(
      (config: Phaser.Types.Renderer.WebGL.WebGLPipelineConfig) => {
        this.shaderBuildCount += 1;
        if (failShaderInstall && this.shaderBuildCount > 1)
          throw new Error("shader compilation failed");
        this.shaders = (config.shaders ?? []).map((shader) => ({ ...shader }));
        this.currentShader = this.shaders[0];
        return this;
      },
    );
  }

  const stored = new Map<string, unknown>();
  const basePipeline = new FakeFxPipeline({ game });
  const managerValue = {
    FX_PIPELINE: basePipeline,
    get: vi.fn((key: unknown) =>
      typeof key === "string" ? stored.get(key) : undefined,
    ),
    add: vi.fn((key: string, pipeline: unknown) => {
      if (failRegistration) throw new Error("shader registration failed");
      stored.set(key, pipeline);
      return pipeline;
    }),
    remove: vi.fn((key: string) => stored.delete(key)),
  };
  const manager =
    managerValue as unknown as Phaser.Renderer.WebGL.PipelineManager;
  const scene = {
    sys: { game, renderer: { pipelines: manager } },
    textures: {
      exists: vi.fn(() => false),
      createCanvas: vi.fn(() => null),
    },
  } as unknown as Phaser.Scene;

  return {
    scene,
    manager: managerValue,
    createdPipelines,
    getRegisteredPipeline: () => [...stored.values()][0],
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

describe("shared Phaser Pre FX adapter", () => {
  it("warns once and becomes a safe no-op on Canvas", () => {
    const { scene } = fakeScene(false);
    const { sprite, preFX } = fakeSprite();
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
    expect(preFX.addBlur).not.toHaveBeenCalled();
  });

  it("caches its controller signature and updates values without stacking", () => {
    const { scene } = fakeScene(true);
    const { sprite, preFX, controllers } = fakeSprite();
    const first = evaluatedSettings();
    syncPhaserRenderingEffects({ scene, sprite, effects: first });

    const replay = evaluateRenderingEffects(first.settings, {
      lifetimeProgress: 0.75,
      elapsedMs: 750,
      seed: 8421,
    });
    syncPhaserRenderingEffects({ scene, sprite, effects: replay });

    expect(preFX.addGradient).toHaveBeenCalledTimes(1);
    expect(preFX.addColorMatrix).toHaveBeenCalledTimes(1);
    expect(preFX.addShine).toHaveBeenCalledTimes(1);
    expect(preFX.addBarrel).toHaveBeenCalledTimes(1);
    expect(preFX.addWipe).toHaveBeenCalledTimes(1);
    expect(preFX.addBlur).toHaveBeenCalledTimes(1);
    expect(preFX.addGlow).toHaveBeenCalledTimes(1);
    expect(controllers.wipe.progress).toBeCloseTo(0.75);
    expect(controllers.colorMatrix.brightness).toHaveBeenLastCalledWith(1);
    expect(controllers.shine.speed).toBe(0.5);
    expect(preFX.disable).not.toHaveBeenCalled();

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
    expect(preFX.disable).toHaveBeenCalledWith(true);
    expect(preFX.addBlur).toHaveBeenCalledTimes(2);

    clearPhaserRenderingEffects(sprite);
    expect(preFX.disable).toHaveBeenCalledTimes(2);
  });

  it("samples a resolved full-texture mask before every authored FX pass", () => {
    const { scene, manager, getRegisteredPipeline } = fakeNoisePipelineScene();
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
    const maskedSprite = fakeSprite(targetFrame);
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
    expect(manager.add).toHaveBeenCalledTimes(1);
    expect(maskedSprite.list.map((controller) => controller.type)).toEqual([
      20, 14, 12, 16, 21, 8, 9, 4,
    ]);

    const maskController = maskedSprite.preFX.add.mock.calls[0][0] as {
      active: boolean;
      gameObject: unknown;
      maskFrame: Phaser.Textures.Frame | null;
      type: number;
    };
    const pipeline = getRegisteredPipeline() as {
      config: Phaser.Types.Renderer.WebGL.WebGLPipelineConfig;
      fxHandlers: Array<((...args: unknown[]) => void) | undefined>;
      shaders: Phaser.Types.Renderer.WebGL.WebGLPipelineShaderConfig[];
      onDrawSprite: (sprite: Phaser.GameObjects.Image) => void;
      runDraw: ReturnType<typeof vi.fn>;
      set1i: ReturnType<typeof vi.fn>;
      setMatrix4fv: ReturnType<typeof vi.fn>;
      set2f: ReturnType<typeof vi.fn>;
      set4f: ReturnType<typeof vi.fn>;
      bindTexture: ReturnType<typeof vi.fn>;
      vvfxVisualMaskType: number;
      vvfxNoiseErosionType: number;
    };
    expect(pipeline.vvfxVisualMaskType).toBe(20);
    expect(pipeline.vvfxNoiseErosionType).toBe(21);
    expect(pipeline.config.shaders?.[20]).toMatchObject({
      name: "VvfxVisualMask",
    });
    expect(pipeline.config.shaders?.[20]?.fragShader).toContain(
      "* maskColor.a",
    );

    pipeline.onDrawSprite(maskedSprite.sprite);
    expect(pipeline.setMatrix4fv).toHaveBeenCalledWith(
      "uProjectionMatrix",
      false,
      [1, 0, 0, 1],
    );
    expect(pipeline.set1i).toHaveBeenCalledWith("uMainSampler", 0);
    expect(pipeline.set1i).toHaveBeenCalledWith("vvfxMaskSampler", 1);
    expect(pipeline.bindTexture).toHaveBeenCalledWith(
      maskFrame.source.glTexture,
      1,
    );
    expect(pipeline.set4f).toHaveBeenCalledWith(
      "vvfxSourceLogical",
      0.1,
      0.1,
      0.8,
      0.8,
    );
    expect(pipeline.set4f).toHaveBeenCalledWith(
      "vvfxMaskLogical",
      0.1,
      0.1,
      0.8,
      0.8,
    );
    expect(pipeline.set4f).toHaveBeenCalledWith(
      "vvfxMaskTransform",
      0.5,
      -0.5,
      3,
      1.5,
    );
    expect(pipeline.set2f).toHaveBeenCalledWith("vvfxTargetScale", 2, 1);
    expect(pipeline.set2f).toHaveBeenCalledWith(
      "vvfxMaskRotation",
      expect.closeTo(0, 10),
      1,
    );
    expect(pipeline.set4f).toHaveBeenCalledWith(
      "vvfxMaskOptions",
      0.65,
      1,
      1,
      0,
    );
    pipeline.fxHandlers[maskController.type]?.call(pipeline, maskController);
    expect(pipeline.runDraw).not.toHaveBeenCalled();

    clearPhaserRenderingEffects(maskedSprite.sprite);
    expect(maskController.active).toBe(false);
    expect(maskController.gameObject).toBeNull();
    expect(maskController.maskFrame).toBeNull();
  });

  it("omits a missing visual-mask source safely and warns once per scene", () => {
    const { scene, manager } = fakeNoisePipelineScene();
    const settings = createDefaultRenderingEffects();
    settings.visualMask.enabled = true;
    settings.visualMask.maskAssetId = "missing-mask";
    const effects = evaluateRenderingEffects(settings, {
      lifetimeProgress: 0.5,
      elapsedMs: 500,
      seed: 8,
    });
    const warnings: string[] = [];
    const firstSprite = fakeSprite();
    const secondSprite = fakeSprite();

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
    expect(manager.add).not.toHaveBeenCalled();
    expect(firstSprite.preFX.add).not.toHaveBeenCalled();
    expect(firstSprite.setPipeline).not.toHaveBeenCalled();
  });

  it("registers one custom PreFX pipeline and keeps erosion in the authored FX order", () => {
    const { scene, manager, getRegisteredPipeline } = fakeNoisePipelineScene();
    const firstSprite = fakeSprite();
    const secondSprite = fakeSprite();
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
    expect(manager.add).toHaveBeenCalledTimes(1);
    expect(firstSprite.preFX.addWipe).not.toHaveBeenCalled();
    expect(firstSprite.list.map((controller) => controller.type)).toEqual([
      16, 21, 8, 9, 4,
    ]);
    expect(firstSprite.setPipeline).toHaveBeenCalledTimes(1);
    expect(secondSprite.setPipeline).toHaveBeenCalledTimes(1);

    const noiseController = firstSprite.preFX.add.mock.calls[0][0] as {
      active: boolean;
      gameObject: unknown;
      progress: number;
      softness: number;
      noiseScale: number;
      noiseOffsetX: number;
      noiseOffsetY: number;
      type: number;
    };
    const pipeline = getRegisteredPipeline() as {
      config: Phaser.Types.Renderer.WebGL.WebGLPipelineConfig;
      fxHandlers: Array<
        | ((
            controller: typeof noiseController,
            width: number,
            height: number,
          ) => void)
        | undefined
      >;
      runDraw: ReturnType<typeof vi.fn>;
      set2f: ReturnType<typeof vi.fn>;
      set4f: ReturnType<typeof vi.fn>;
      setProjectionMatrix: ReturnType<typeof vi.fn>;
      vvfxNoiseErosionType: number;
    };
    expect(pipeline.vvfxNoiseErosionType).toBe(21);
    expect(pipeline.config.shaders).toHaveLength(22);
    expect(pipeline.config.shaders?.[20]).toMatchObject({
      name: "VvfxVisualMask",
    });
    expect(pipeline.config.shaders?.[21]).toMatchObject({
      name: "VvfxNoiseErosion",
    });
    expect(pipeline.setProjectionMatrix).toHaveBeenCalledWith(820, 470);

    const handler = pipeline.fxHandlers[noiseController.type];
    expect(handler).toBeTypeOf("function");
    handler?.call(pipeline, noiseController, 128, 128);
    expect(pipeline.set4f).toHaveBeenCalledWith(
      "vvfxDissolve",
      0.25,
      0.1,
      6,
      0,
    );
    expect(pipeline.set2f).toHaveBeenCalledWith("vvfxTargetToSprite", 2, 2);
    expect(pipeline.runDraw).toHaveBeenCalledTimes(1);

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
    expect(manager.add).toHaveBeenCalledTimes(1);
    expect(firstSprite.preFX.add).toHaveBeenCalledTimes(1);
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

  it("omits noise erosion safely when custom pipeline registration fails", () => {
    const { scene, manager } = fakeNoisePipelineScene(true);
    const firstSprite = fakeSprite();
    const secondSprite = fakeSprite();
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
    expect(manager.add).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("noise-erosion shader");
    expect(firstSprite.preFX.add).not.toHaveBeenCalled();
    expect(firstSprite.setPipeline).not.toHaveBeenCalled();
    const failedPipeline = manager.add.mock.calls[0][1] as {
      destroy: ReturnType<typeof vi.fn>;
    };
    expect(failedPipeline.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys a partially built pipeline when shader installation fails", () => {
    const { scene, manager, createdPipelines } = fakeNoisePipelineScene(
      false,
      true,
    );
    const { sprite, preFX, setPipeline } = fakeSprite();
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
    expect(createdPipelines).toHaveLength(2);
    expect(createdPipelines[1].destroy).toHaveBeenCalledTimes(1);
    expect(manager.add).not.toHaveBeenCalled();
    expect(preFX.add).not.toHaveBeenCalled();
    expect(setPipeline).not.toHaveBeenCalled();
    expect(warnings).toHaveLength(1);
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
