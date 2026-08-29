import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
  loadVvfxAssets,
  playVvfx,
  validateRuntimeDefinition,
  VvfxEffect,
} from "../packages/phaser-runtime/src";
import { resolveRuntimeRenderingAssetFrame } from "../packages/phaser-runtime/src/VvfxEffect";
import { runtimeAssetTextureKey } from "../packages/phaser-runtime/src/textures";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  IMAGE_DECODE_TIMEOUT_MS,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_LAYERS,
  VVFX_INTERNAL_MISSING_TEXTURE_KEY,
  VVFX_INTERNAL_TEXTURE_PREFIX,
} from "../src/vfx/inputLimits";
import { createRuntimeDefinition } from "../src/vfx/exporters";
import { applySpriteSheetFrames } from "../src/vfx/phaserFrames";
import { createRenderingEffectClip } from "../src/vfx/renderingEffects";
import { validateProject } from "../src/vfx/serialization";
import type { VfxAsset } from "../src/vfx/types";
import { TINY_PNG_DATA_URL, validPngDataUrl } from "./fixtures/portableImages";

class FakeEvents {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void) {
    const onceListener = (...args: unknown[]) => {
      this.off(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }

  off(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of [...(this.listeners.get(event) ?? [])])
      listener(...args);
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0;
  }
}

class FakeSprite {
  texture: { key: string };
  frame: { name: string | number; realWidth: number; realHeight: number };
  destroyed = false;
  isCropped = false;
  crop: { x: number; y: number; width: number; height: number } | null = null;
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  alpha = 1;
  angle = 0;
  depth = 0;

  constructor(key: string, frame: string | number = "__BASE") {
    this.texture = { key };
    this.frame = { name: frame, realWidth: 128, realHeight: 128 };
  }

  setTexture(key: string, frame: string | number = "__BASE") {
    this.texture.key = key;
    this.frame.name = frame;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setScale(x: number, y = x) {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setAlpha(alpha: number) {
    this.alpha = alpha;
    return this;
  }
  setAngle(angle: number) {
    this.angle = angle;
    return this;
  }
  setBlendMode() {
    return this;
  }
  setDepth(depth: number) {
    this.depth = depth;
    return this;
  }
  setTint() {
    return this;
  }
  clearTint() {
    return this;
  }
  setCrop(x?: number, y?: number, width?: number, height?: number) {
    this.isCropped = x !== undefined;
    this.crop =
      x === undefined
        ? null
        : { x, y: y ?? 0, width: width ?? 0, height: height ?? 0 };
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

function createFakeScene(initialTextureKeys: string[] = []) {
  const textureKeys = new Set(initialTextureKeys);
  const textures = new Map(
    initialTextureKeys.map((key) => [
      key,
      {
        frames: { __BASE: { name: "__BASE", textureKey: key } } as Record<
          string,
          unknown
        >,
        add(name: number | string) {
          this.frames[String(name)] = { name, textureKey: key };
        },
        remove(name: string) {
          delete this.frames[name];
          return true;
        },
        has(name: string) {
          return name in this.frames;
        },
        get(name: number | string) {
          return this.frames[String(name)];
        },
      },
    ]),
  );
  const addTexture = (key: string) => {
    textureKeys.add(key);
    if (!textures.has(key))
      textures.set(key, {
        frames: { __BASE: { name: "__BASE", textureKey: key } },
        add(name: number | string) {
          this.frames[String(name)] = { name, textureKey: key };
        },
        remove(name: string) {
          delete this.frames[name];
          return true;
        },
        has(name: string) {
          return name in this.frames;
        },
        get(name: number | string) {
          return this.frames[String(name)];
        },
      });
  };
  const addTextureFrame = (key: string, frame: string | number) => {
    addTexture(key);
    textures.get(key)?.add(frame);
  };
  const textureEvents = new FakeEvents();
  const sceneEvents = new FakeEvents();
  const sprites: FakeSprite[] = [];
  const graphics = {
    setVisible: () => graphics,
    fillStyle: () => graphics,
    fillCircle: () => graphics,
    lineStyle: () => graphics,
    strokeCircle: () => graphics,
    fillRoundedRect: () => graphics,
    strokeRoundedRect: () => graphics,
    lineBetween: () => graphics,
    generateTexture: (key: string) => {
      addTexture(key);
      return graphics;
    },
    destroy: () => undefined,
  };
  const scene = {
    sys: { renderer: {} },
    events: sceneEvents,
    textures: {
      exists: (key: string) => textureKeys.has(key),
      get: (key: string) => textures.get(key),
      on: (event: string, listener: (...args: unknown[]) => void) => {
        textureEvents.on(event, listener);
      },
      off: (event: string, listener: (...args: unknown[]) => void) => {
        textureEvents.off(event, listener);
      },
      addBase64: (key: string) => {
        addTexture(key);
        textureEvents.emit("onload", key, { key });
      },
      addImage: (key: string) => {
        addTexture(key);
        return textures.get(key);
      },
      remove: (key: string) => {
        const texture = textures.get(key);
        textureKeys.delete(key);
        textures.delete(key);
        return texture;
      },
    },
    add: {
      graphics: () => graphics,
      image: (_x: number, _y: number, key: string, frame?: string | number) => {
        const sprite = new FakeSprite(key, frame);
        sprites.push(sprite);
        return sprite;
      },
    },
  };
  return {
    scene: scene as unknown as Phaser.Scene,
    sceneEvents,
    sprites,
    textureKeys,
    addTextureFrame,
  };
}

function managedTextureKey(
  definition: ReturnType<typeof createRuntimeDefinition>,
  assetId: string,
) {
  const asset = definition.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Missing runtime test asset: ${assetId}`);
  return runtimeAssetTextureKey(asset);
}

async function withDecodedImage(
  width: number,
  height: number,
  action: () => Promise<void>,
) {
  const OriginalImage = globalThis.Image;
  class DecodedImage {
    decoding = "auto";
    naturalWidth = width;
    naturalHeight = height;
    onerror: OnErrorEventHandler | null = null;
    onload: ((this: GlobalEventHandlers, event: Event) => unknown) | null =
      null;
    private source = "";

    get src() {
      return this.source;
    }

    set src(value: string) {
      this.source = value;
      if (value)
        queueMicrotask(() =>
          this.onload?.call(this as never, new Event("load")),
        );
    }
  }

  vi.stubGlobal("Image", DecodedImage);
  try {
    await action();
  } finally {
    vi.stubGlobal("Image", OriginalImage);
  }
}

describe("Phaser runtime package", () => {
  it("removes numeric Phaser frames when sprite-sheet treatment is disabled", () => {
    const frames: Record<string, unknown> = { __BASE: {} };
    const texture = {
      frames,
      add: (name: number | string) => {
        frames[String(name)] = {};
      },
      remove: (name: string) => delete frames[name],
      has: (name: string) => name in frames,
    };

    applySpriteSheetFrames(
      texture,
      {
        width: 64,
        spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 2 },
      },
      true,
    );
    expect(Object.keys(frames)).toEqual(["0", "1", "__BASE"].sort());

    applySpriteSheetFrames(texture, { width: 64, spriteSheet: null }, true);
    expect(Object.keys(frames)).toEqual(["__BASE"]);
  });

  it("updates Beam layers from world-space endpoints", async () => {
    const project = createEmptyProject("Runtime beam");
    project.preview.duration = 500;
    const beam = createLayer("beam", "Lightning", "builtin-spark");
    beam.behavior.flicker.enabled = false;
    beam.transform.startOpacity = 1;
    beam.transform.endOpacity = 1;
    project.layers.push(beam);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      originX: 10,
      originY: 20,
      autoDestroy: false,
    });

    effect.setEndpoints(100, 200, 400, 600);
    await Promise.resolve();

    expect(fake.sprites[0]?.x).toBeCloseTo(250);
    expect(fake.sprites[0]?.y).toBeCloseTo(400);
    expect(fake.sprites[0]?.scaleX).toBeCloseTo(500 / 128);
    expect(fake.sprites[0]?.scaleY).toBeCloseTo(1);
    expect(fake.sprites[0]?.angle).toBeCloseTo(53.1301, 3);
    expect(fake.sprites[0]?.crop).toBeNull();

    effect.clearEndpoints();
    await Promise.resolve();
    expect(fake.sprites[0]?.x).toBeCloseTo(130);
    expect(fake.sprites[0]?.y).toBeCloseTo(20);
  });

  it("crops short Beam sources, scales only thickness, and resets crop for longer links", async () => {
    const project = createEmptyProject("Runtime cropped beam");
    project.preview.duration = 500;
    const beam = createLayer("beam", "Lightning", "builtin-spark");
    beam.behavior.flicker.enabled = false;
    beam.transform.startScale = 2;
    beam.transform.endScale = 2;
    beam.transform.startOpacity = 1;
    beam.transform.endOpacity = 1;
    beam.beam = { endX: 240, endY: 0 };
    project.layers.push(beam);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
      beamFit: "crop",
      beamThicknessScale: 0.5,
    });

    effect.setEndpoints(0, 0, 60, 0);
    await Promise.resolve();

    expect(fake.sprites[0]).toMatchObject({
      x: 30,
      scaleY: 1,
      isCropped: true,
      crop: { x: 48, y: 0, width: 32, height: 128 },
    });
    expect(fake.sprites[0]?.scaleX).toBeCloseTo(240 / 128);

    effect.setEndpoints(0, 0, 300, 0);
    await Promise.resolve();

    expect(fake.sprites[0]?.scaleX).toBeCloseTo(300 / 128);
    expect(fake.sprites[0]?.scaleY).toBeCloseTo(1);
    expect(fake.sprites[0]?.isCropped).toBe(false);
    expect(fake.sprites[0]?.crop).toBeNull();
    effect.destroy();
  });

  it("coalesces same-turn host setters and cancels stale queued renders", async () => {
    const project = createEmptyProject("Coalesced runtime setters");
    project.preview.duration = 1_000;
    project.layers.push(
      createLayer("animated", "Moving flash", "builtin-flash"),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });
    const sprite = fake.sprites[0];
    const positionUpdates = vi.spyOn(sprite, "setPosition");

    effect.setPosition(10, 20);
    effect.setPosition(30, 40);
    effect.setPosition(50, 60);
    expect(positionUpdates).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(positionUpdates).toHaveBeenCalledTimes(1);
    expect(sprite).toMatchObject({ x: 50, y: 60 });

    effect.setPosition(70, 80);
    effect.update(16);
    expect(positionUpdates).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(positionUpdates).toHaveBeenCalledTimes(2);
    effect.destroy();
  });

  it("caps one-shot playback duration and performs normal completion cleanup", () => {
    const project = createEmptyProject("Runtime duration cap");
    project.preview.duration = 3_000;
    project.layers.push(
      createLayer("animated", "Long authored effect", "builtin-flash"),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const onComplete = vi.fn();
    const effect = new VvfxEffect(fake.scene, definition, {
      maxDurationMs: 420,
      onComplete,
    });

    effect.update(419);
    expect(effect.isPlaying).toBe(true);
    expect(effect.isDestroyed).toBe(false);

    effect.update(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(effect.currentTime).toBe(420);
    expect(effect.isPlaying).toBe(false);
    expect(effect.isDestroyed).toBe(true);
    expect(fake.sceneEvents.listenerCount("update")).toBe(0);
    expect(fake.sprites.every((sprite) => sprite.destroyed)).toBe(true);
  });

  it("does not apply the one-shot duration cap to looping playback", () => {
    const project = createEmptyProject("Loop ignores duration cap");
    project.preview.duration = 500;
    project.layers.push(createLayer("animated", "Loop", "builtin-flash"));
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      loop: true,
      maxDurationMs: 10,
    });

    effect.update(10);
    expect(effect.isPlaying).toBe(true);
    expect(effect.isDestroyed).toBe(false);
    expect(effect.currentTime).toBe(10);
    effect.destroy();
  });

  it("ignores inherited, accessor, and invalid runtime presentation options", async () => {
    const project = createEmptyProject("Hostile runtime options");
    project.preview.duration = 500;
    const beam = createLayer("beam", "Safe defaults", "builtin-spark");
    beam.behavior.flicker.enabled = false;
    beam.transform.startScale = 2;
    beam.transform.endScale = 2;
    project.layers.push(beam);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const hostileOptions = Object.create({
      beamFit: "crop",
      beamThicknessScale: 0,
      maxDurationMs: 1,
    }) as Record<string, unknown>;
    Object.defineProperties(hostileOptions, {
      beamFit: { get: () => "crop" },
      beamThicknessScale: { value: -4 },
      maxDurationMs: { value: Number.NaN },
    });
    const effect = new VvfxEffect(
      fake.scene,
      definition,
      hostileOptions as never,
    );

    effect.setEndpoints(0, 0, 60, 0);
    await Promise.resolve();

    expect(fake.sprites[0]?.scaleX).toBeCloseTo(60 / 128);
    expect(fake.sprites[0]?.scaleY).toBeCloseTo(2);
    expect(fake.sprites[0]?.crop).toBeNull();
    effect.update(499);
    expect(effect.isDestroyed).toBe(false);
    effect.update(1);
    expect(effect.isDestroyed).toBe(true);
  });

  it("resolves mapped and unchanged-key atlas mask frames without CPU mask data", () => {
    const fake = createFakeScene(["runtime-mask", "host-atlas"]);
    fake.addTextureFrame("runtime-mask", "definition-mask-frame");
    fake.addTextureFrame("host-atlas", "mapped-mask-frame");
    const project = createEmptyProject("Runtime mask resolver");
    const asset: VfxAsset = {
      ...project.assets[0],
      id: "runtime-mask",
      name: "Runtime mask",
      mimeType: "image/png" as const,
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      spriteSheet: null,
      atlasFrame: "definition-mask-frame",
      alphaMask: { columns: 1, rows: 1, alpha: [0] },
    };

    expect(
      resolveRuntimeRenderingAssetFrame(fake.scene, asset, {}, {}),
    ).toMatchObject({
      name: "definition-mask-frame",
      textureKey: "runtime-mask",
    });
    expect(
      resolveRuntimeRenderingAssetFrame(
        fake.scene,
        asset,
        { [asset.id]: "host-atlas" },
        { [asset.id]: "mapped-mask-frame" },
      ),
    ).toMatchObject({
      name: "mapped-mask-frame",
      textureKey: "host-atlas",
    });

    asset.spriteSheet = {
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 4,
    };
    expect(
      resolveRuntimeRenderingAssetFrame(fake.scene, asset, {}, {}),
    ).toBeNull();
  });

  it("validates and normalizes the versioned runtime contract", () => {
    const project = createEmptyProject("Runtime impact");
    const sparks = createLayer("burst", "Sparks", "builtin-spark");
    sparks.appearance.effects.directionalDissolve = {
      ...sparks.appearance.effects.directionalDissolve,
      enabled: true,
      pattern: "noise",
      noiseScale: 9,
    };
    sparks.appearance.effectClips = [
      {
        ...createRenderingEffectClip("directionalDissolve", "runtime-dissolve"),
        start: 0.2,
        end: 0.8,
      },
    ];
    project.layers.push(sparks);
    const definition = createRuntimeDefinition(project);
    const result = validateRuntimeDefinition(JSON.stringify(definition));

    expect(result.ok).toBe(true);
    expect(result.definition?.formatVersion).toBe(16);
    expect(result.definition?.format).toBe("vvfx-runtime");
    expect(result.definition?.layers[0].name).toBe("Sparks");
    expect(
      result.definition?.layers[0].appearance.effects.directionalDissolve,
    ).toMatchObject({ pattern: "noise", noiseScale: 9 });
    expect(result.definition?.layers[0].appearance.effectClips).toEqual(
      sparks.appearance.effectClips,
    );
    const markerlessVersionSixteen = JSON.parse(
      JSON.stringify(definition),
    ) as Record<string, unknown>;
    const markerlessLayer = (
      markerlessVersionSixteen.layers as Array<Record<string, unknown>>
    )[0];
    const markerlessAppearance = markerlessLayer.appearance as Record<
      string,
      unknown
    >;
    const markerlessClip = (
      markerlessAppearance.effectClips as Array<Record<string, unknown>>
    )[0];
    delete markerlessClip.progressMode;
    expect(
      validateRuntimeDefinition(markerlessVersionSixteen).definition?.layers[0]
        .appearance.effectClips[0].progressMode,
    ).toBe("chronological");
    const versionSixteenWithoutClips = JSON.parse(
      JSON.stringify(definition),
    ) as Record<string, unknown>;
    for (const layer of versionSixteenWithoutClips.layers as Array<
      Record<string, unknown>
    >) {
      delete (layer.appearance as Record<string, unknown>).effectClips;
    }
    expect(
      validateRuntimeDefinition(
        versionSixteenWithoutClips,
      ).definition?.layers[0].appearance.effectClips.map((clip) => ({
        effect: clip.effect,
        progressMode: clip.progressMode,
      })),
    ).toEqual([
      {
        effect: "directionalDissolve",
        progressMode: "chronological",
      },
    ]);
    expect(
      validateRuntimeDefinition({ ...definition, formatVersion: 1 }).definition
        ?.formatVersion,
    ).toBe(16);
    const versionFifteen = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    versionFifteen.formatVersion = 15;
    for (const layer of versionFifteen.layers as Array<
      Record<string, unknown>
    >) {
      delete (layer.appearance as Record<string, unknown>).effectClips;
    }
    const migratedFifteen =
      validateRuntimeDefinition(versionFifteen).definition;
    expect(
      migratedFifteen?.layers[0].appearance.effectClips.map((clip) => ({
        effect: clip.effect,
        progressMode: clip.progressMode,
      })),
    ).toEqual([
      {
        effect: "directionalDissolve",
        progressMode: "legacy-transform",
      },
    ]);
    const versionThree = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    versionThree.formatVersion = 3;
    (versionThree.layers as Array<Record<string, unknown>>).forEach(
      (layer) => delete layer.motionPath,
    );
    expect(
      validateRuntimeDefinition(versionThree).definition?.layers[0].motionPath
        .enabled,
    ).toBe(false);
    const versionSix = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    versionSix.formatVersion = 6;
    (versionSix.assets as Array<Record<string, unknown>>).forEach(
      (asset) => delete asset.atlasFrame,
    );
    expect(
      validateRuntimeDefinition(versionSix).definition?.assets.every(
        (asset) => asset.atlasFrame === null,
      ),
    ).toBe(true);
    const versionSeven = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    versionSeven.formatVersion = 7;
    (versionSeven.layers as Array<Record<string, unknown>>).forEach((layer) => {
      delete layer.behavior;
      const appearance = layer.appearance as Record<string, unknown>;
      delete appearance.colorOverLifetime;
      if (layer.spawn && typeof layer.spawn === "object")
        delete (layer.spawn as Record<string, unknown>).distribution;
    });
    const migratedSeven = validateRuntimeDefinition(versionSeven).definition;
    expect(migratedSeven?.formatVersion).toBe(16);
    expect(migratedSeven?.layers[0].behavior.physics).toEqual({
      gravity: 0,
      drag: 0,
      gravityEnvelope: {
        enabled: false,
        start: 0,
        attackEnd: 0,
        releaseStart: 1,
        end: 1,
      },
    });
    expect(migratedSeven?.layers[0].appearance.colorOverLifetime.enabled).toBe(
      false,
    );
    expect(migratedSeven?.layers[0].spawn?.distribution).toBe("random");
    const versionNine = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    versionNine.formatVersion = 9;
    (versionNine.layers as Array<Record<string, unknown>>).forEach(
      (layer) => delete (layer.appearance as Record<string, unknown>).effects,
    );
    expect(
      validateRuntimeDefinition(versionNine).definition?.layers[0].appearance
        .effects.blur.enabled,
    ).toBe(false);
    const versionTwelve = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    versionTwelve.formatVersion = 12;
    for (const layer of versionTwelve.layers as Array<
      Record<string, unknown>
    >) {
      const effects = (layer.appearance as Record<string, unknown>)
        .effects as Record<string, unknown>;
      const dissolve = effects.directionalDissolve as Record<string, unknown>;
      delete dissolve.pattern;
      delete dissolve.noiseScale;
    }
    const migratedTwelve = validateRuntimeDefinition(versionTwelve).definition;
    expect(migratedTwelve?.formatVersion).toBe(16);
    expect(
      migratedTwelve?.layers[0].appearance.effects.directionalDissolve,
    ).toMatchObject({ pattern: "directional", noiseScale: 6 });
    expect(
      validateRuntimeDefinition({ ...definition, formatVersion: 99 }).ok,
    ).toBe(false);
  });

  it("rejects duplicate and malformed effect clips in runtime v16", () => {
    const project = createEmptyProject("Runtime clip validation");
    const layer = createLayer("animated", "Glow", "builtin-ring");
    layer.appearance.effectClips = [
      createRenderingEffectClip("outerGlow", "runtime-glow"),
    ];
    project.layers.push(layer);
    const definition = createRuntimeDefinition(project);
    const cloneDefinition = () =>
      JSON.parse(JSON.stringify(definition)) as Record<string, unknown>;
    const effectClips = (candidate: Record<string, unknown>) => {
      const rawLayer = (candidate.layers as Array<Record<string, unknown>>)[0];
      const appearance = rawLayer.appearance as Record<string, unknown>;
      return appearance.effectClips as Array<Record<string, unknown>>;
    };

    const invalidProgressMode = cloneDefinition();
    effectClips(invalidProgressMode)[0].progressMode = "eased";
    expect(validateRuntimeDefinition(invalidProgressMode)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/progress mode/i),
    });

    const duplicateEffect = cloneDefinition();
    effectClips(duplicateEffect).push({
      ...effectClips(duplicateEffect)[0],
      id: "second-runtime-glow",
    });
    expect(validateRuntimeDefinition(duplicateEffect)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/same effect/i),
    });

    const invalidType = cloneDefinition();
    effectClips(invalidType)[0].start = "0";
    expect(validateRuntimeDefinition(invalidType)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/finite number/i),
    });

    const invalidRange = cloneDefinition();
    effectClips(invalidRange)[0].end = 1.1;
    expect(validateRuntimeDefinition(invalidRange)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/between 0 and 1/i),
    });
  });

  it("does not trust mutable definitions returned by the public validator", () => {
    const project = createEmptyProject("Mutable validated runtime");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    const validated = validateRuntimeDefinition(
      createRuntimeDefinition(project),
    );
    expect(validated.ok).toBe(true);
    expect(validated.definition).toBeDefined();

    validated.definition!.layers[0].timing.duration = Number.POSITIVE_INFINITY;

    expect(validateRuntimeDefinition(validated.definition).ok).toBe(false);
    const fake = createFakeScene();
    expect(
      () =>
        new VvfxEffect(fake.scene, validated.definition!, { autoplay: false }),
    ).toThrow(/outside the supported range/i);
  });

  it("bounds direct runtime input and rejects unsafe or non-finite values", () => {
    const project = createEmptyProject("Runtime boundary");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    const definition = createRuntimeDefinition(project);

    expect(
      validateRuntimeDefinition({ ...definition, seed: Infinity }).ok,
    ).toBe(false);
    const extreme = JSON.parse(JSON.stringify(definition)) as typeof definition;
    extreme.layers[0].random.startScale = Number.MAX_VALUE;
    expect(validateRuntimeDefinition(extreme)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/outside the supported range/i),
    });
    expect(
      validateRuntimeDefinition({
        ...definition,
        layers: Array.from(
          { length: MAX_PROJECT_LAYERS + 1 },
          () => definition.layers[0],
        ),
      }).ok,
    ).toBe(false);
    expect(
      validateRuntimeDefinition({
        ...definition,
        assets: Array.from(
          { length: MAX_PROJECT_ASSETS + 1 },
          () => definition.assets[0],
        ),
      }).ok,
    ).toBe(false);

    const unsafe = JSON.parse(JSON.stringify(definition)) as typeof definition;
    unsafe.layers[0].id = "__proto__";
    expect(validateRuntimeDefinition(unsafe).ok).toBe(false);

    const circular = { ...definition } as typeof definition & {
      circular?: unknown;
    };
    circular.circular = circular;
    expect(validateRuntimeDefinition(circular).ok).toBe(false);
  });

  it("does not invoke hostile direct-object array methods or accessors", () => {
    const project = createEmptyProject("Hostile runtime object");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    const iterator = vi.fn(() => {
      throw new Error("hostile iterator ran");
    });
    const accessor = vi.fn(() => {
      throw new Error("hostile accessor ran");
    });
    const withIterator = JSON.parse(
      JSON.stringify(createRuntimeDefinition(project)),
    ) as ReturnType<typeof createRuntimeDefinition>;
    Object.defineProperty(withIterator.layers, Symbol.iterator, {
      configurable: true,
      value: iterator,
    });

    expect(validateRuntimeDefinition(withIterator).ok).toBe(false);
    expect(iterator).not.toHaveBeenCalled();

    const withAccessor = JSON.parse(
      JSON.stringify(createRuntimeDefinition(project)),
    ) as ReturnType<typeof createRuntimeDefinition>;
    Object.defineProperty(withAccessor.layers[0].transform, "x", {
      configurable: true,
      enumerable: false,
      get: accessor,
    });

    expect(validateRuntimeDefinition(withAccessor).ok).toBe(false);
    expect(accessor).not.toHaveBeenCalled();
  });

  it("normalizes authored numeric domains and suppresses unsafe evaluated output", () => {
    const project = createEmptyProject("Semantic numeric bounds");
    const layer = createLayer("burst", "Extreme", "builtin-spark");
    layer.transform.x = 500_000;
    layer.transform.startScale = 500_000;
    layer.transform.startOpacity = 500_000;
    layer.transform.rotationDuring = 500_000;
    layer.transform.movementX = 500_000;
    layer.random.startScale = 500_000;
    layer.random.opacity = 500_000;
    layer.timing.duration = 500_000;
    layer.spawn.width = 500_000;
    layer.spawn.directionAngle = 500_000;
    layer.keyframes.frames[0].scaleX = 500_000;
    layer.keyframes.frames[0].opacity = 500_000;
    layer.keyframes.frames[0].rotation = 500_000;
    project.layers.push(layer);

    const normalized = validateProject(project).project?.layers[0];
    expect(normalized?.transform).toMatchObject({
      x: 5_000,
      startScale: 4,
      startOpacity: 1,
      rotationDuring: 1_080,
      movementX: 5_000,
    });
    expect(normalized?.random).toMatchObject({ startScale: 4, opacity: 1 });
    expect(normalized?.timing.duration).toBe(30_000);
    expect(normalized?.spawn).toMatchObject({
      width: 1_000,
      directionAngle: 360,
    });
    expect(normalized?.keyframes.frames[0]).toMatchObject({
      scaleX: 4,
      opacity: 1,
      rotation: 1_080,
    });

    const unsafeProject = createEmptyProject("Unsafe evaluator output");
    const unsafeLayer = createLayer("animated", "Unsafe", "builtin-flash");
    unsafeLayer.transform.startScale = Number.MAX_VALUE;
    unsafeLayer.transform.endScale = Number.MAX_VALUE;
    unsafeProject.layers.push(unsafeLayer);
    expect(evaluateProject(unsafeProject, 0, null)).toEqual([]);
  });

  it("accepts renamed canonical built-ins but rejects identity spoofing", () => {
    const project = createEmptyProject("Canonical built-ins");
    project.layers.push(
      createLayer("animated", "Canonical flash", "builtin-flash"),
    );
    const definition = createRuntimeDefinition(project);
    const renamed = JSON.parse(JSON.stringify(definition)) as typeof definition;
    renamed.assets[0].name = "My flash";
    const renamedResult = validateRuntimeDefinition(renamed);

    expect(renamedResult.ok).toBe(true);
    expect(
      renamedResult.definition?.assets.find(
        (asset) => asset.id === renamed.assets[0].id,
      )?.name,
    ).toBe("My flash");

    const spoofed = JSON.parse(JSON.stringify(definition)) as typeof definition;
    spoofed.assets[0].source = "builtin:ring";
    expect(validateRuntimeDefinition(spoofed).ok).toBe(false);

    const customSpoof = JSON.parse(
      JSON.stringify(definition),
    ) as typeof definition;
    delete customSpoof.assets[0].builtIn;
    customSpoof.assets[0].source = TINY_PNG_DATA_URL;
    customSpoof.assets[0].width = 1;
    customSpoof.assets[0].height = 1;
    expect(validateRuntimeDefinition(customSpoof).ok).toBe(false);
  });

  it("checks portable image contents, dimensions, and aggregate pixels", () => {
    const definition = createRuntimeDefinition(
      createEmptyProject("Portable runtime images"),
    );
    const malformed = JSON.parse(
      JSON.stringify(definition),
    ) as typeof definition;
    malformed.assets.push({
      id: "bad-image",
      name: "Bad image",
      source: "data:image/png;base64,AAAA",
    });
    expect(validateRuntimeDefinition(malformed).ok).toBe(false);

    const mismatched = JSON.parse(
      JSON.stringify(definition),
    ) as typeof definition;
    mismatched.assets.push({
      id: "wrong-size",
      name: "Wrong size",
      source: TINY_PNG_DATA_URL,
      width: 2,
      height: 1,
    });
    expect(validateRuntimeDefinition(mismatched).ok).toBe(false);

    const pixelHeavy = JSON.parse(
      JSON.stringify(definition),
    ) as typeof definition;
    for (let index = 0; index < 3; index += 1)
      pixelHeavy.assets.push({
        id: `large-image-${index}`,
        name: `Large image ${index}`,
        source: validPngDataUrl(4096, 4096),
        width: 4096,
        height: 4096,
      });
    expect(validateRuntimeDefinition(pixelHeavy).ok).toBe(false);
  });

  it("uses normalized ordering and ignores inherited host mappings", async () => {
    const project = createEmptyProject("Runtime ordering");
    const flash = createLayer("animated", "Flash", "builtin-flash");
    const ring = createLayer("animated", "Ring", "builtin-ring");
    project.layers.push(flash, ring);
    const definition = createRuntimeDefinition(project);
    definition.layers[0].depth = 10;
    definition.layers[1].depth = 0;
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const inheritedMappings = Object.create({
      "builtin-flash": "missing-host-texture",
    }) as Record<string, string>;

    await loadVvfxAssets(fake.scene, definition, inheritedMappings);
    const effect = new VvfxEffect(fake.scene, definition, {
      assetKeys: inheritedMappings,
      autoDestroy: false,
    });

    expect(
      fake.sprites.find(
        (sprite) =>
          sprite.texture.key === managedTextureKey(definition, "builtin-ring"),
      )?.depth,
    ).toBe(0);
    expect(
      fake.sprites.find(
        (sprite) =>
          sprite.texture.key === managedTextureKey(definition, "builtin-flash"),
      )?.depth,
    ).toBe(1);
    effect.destroy();
  });

  it("keeps playback finite for prototype-named beams and invalid deltas", () => {
    const project = createEmptyProject("Finite runtime playback");
    const beam = createLayer("beam", "Beam", "builtin-spark");
    beam.id = "toString";
    project.layers.push(beam);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      originX: Infinity,
      originY: Number.NaN,
      baseDepth: Infinity,
      autoDestroy: false,
    });

    effect.update(Number.NaN);
    effect.update(Infinity);
    effect.setPosition(Infinity, 10);

    expect(effect.currentTime).toBe(0);
    expect(fake.sprites[0]?.x).toSatisfy(Number.isFinite);
    expect(fake.sprites[0]?.y).toSatisfy(Number.isFinite);
    expect(fake.sprites[0]?.depth).toSatisfy(Number.isFinite);
    effect.destroy();
  });

  it("preserves effects in current runtime JSON and warns once on Canvas fallback", () => {
    const project = createEmptyProject("Canvas glow");
    const glow = createLayer("animated", "Glow", "builtin-ring");
    glow.appearance.effects.outerGlow.enabled = true;
    project.layers = [glow];
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const onWarning = vi.fn();
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
      onWarning,
    });

    effect.update(100);
    effect.update(100);

    expect(definition.layers[0].appearance.effects.outerGlow.enabled).toBe(
      true,
    );
    expect(onWarning).toHaveBeenCalledOnce();
    expect(fake.sprites.some((sprite) => !sprite.destroyed)).toBe(true);
  });

  it("plays copy-finish sub-effects at each source copy's exact endpoint", () => {
    const project = createEmptyProject("Runtime spatial impacts");
    const source = createLayer("burst", "Traveling sparks", "builtin-spark");
    source.timing.duration = 100;
    source.timing.easing = "constant";
    source.spawn.count = 2;
    source.spawn.shape = "line";
    source.spawn.distribution = "even";
    source.spawn.lineLength = 100;
    source.spawn.lineAngle = 0;
    source.spawn.direction = "fixed";
    source.spawn.directionAngle = 0;
    source.spawn.directionSpread = 0;
    source.transform.movementX = 100;
    const target = createLayer("animated", "Impact", "builtin-flash");
    target.startMode = "triggered";
    target.transform.x = 5;
    source.events = [
      {
        id: "copy-impact",
        enabled: true,
        trigger: "copy-finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: target.id,
        chance: 1,
        maxTriggers: 32,
      },
    ];
    project.layers.push(source, target);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });

    effect.update(100);

    expect(
      fake.sprites
        .filter(
          (sprite) =>
            !sprite.destroyed && sprite.texture.key === "builtin-flash",
        )
        .map((sprite) => sprite.x)
        .sort((left, right) => left - right),
    ).toEqual([55, 155]);
  });

  it("slices embedded sprite sheets and advances their runtime frames", async () => {
    const project = createEmptyProject("Animated flame");
    project.assets.push({
      id: "flame-sheet",
      name: "Flame sheet",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(128, 32),
      width: 128,
      height: 32,
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
    });
    const flame = createLayer("animated", "Flame", "flame-sheet");
    flame.frameAnimation.framesPerSecond = 10;
    project.layers.push(flame);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();

    await withDecodedImage(128, 32, async () => {
      await loadVvfxAssets(fake.scene, definition);
      const effect = new VvfxEffect(fake.scene, definition, {
        autoDestroy: false,
      });
      effect.update(120);

      expect(fake.sprites[0]?.frame.name).toBe(1);
    });
  });

  it("uses named frames from a preloaded Phaser texture atlas", () => {
    const project = createEmptyProject("Atlas sparks");
    project.assets.push({
      id: "atlas-spark",
      name: "Atlas spark",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      atlasFrame: "vfx/spark-01",
    });
    project.layers.push(createLayer("animated", "Atlas spark", "atlas-spark"));
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      "game-vfx",
    ]);
    fake.addTextureFrame("game-vfx", "vfx/spark-01");

    const effect = new VvfxEffect(fake.scene, definition, {
      assetKeys: { "atlas-spark": "game-vfx" },
      autoDestroy: false,
    });
    effect.update(100);

    expect(definition.formatVersion).toBe(16);
    expect(
      definition.assets.find((asset) => asset.id === "atlas-spark"),
    ).toMatchObject({ atlasFrame: "vfx/spark-01" });
    expect(fake.sprites[0]?.texture.key).toBe("game-vfx");
    expect(fake.sprites[0]?.frame.name).toBe("vfx/spark-01");
  });

  it("plays motion trails through the runtime evaluator", () => {
    const project = createEmptyProject("Runtime comet");
    project.preview.duration = 1500;
    const comet = createLayer("animated", "Comet", "builtin-spark");
    comet.timing.duration = 1000;
    comet.transform.movementX = 180;
    comet.trail.enabled = true;
    comet.trail.count = 4;
    project.layers.push(comet);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });

    effect.update(300);

    expect(fake.sprites.filter((sprite) => !sprite.destroyed).length).toBe(5);
  });

  it("plays curved motion paths through the runtime evaluator", () => {
    const project = createEmptyProject("Runtime curve");
    project.preview.duration = 1200;
    const orb = createLayer("animated", "Orb", "builtin-ring");
    orb.timing.duration = 1000;
    orb.timing.easing = "constant";
    orb.transform.movementX = 100;
    orb.motionPath = {
      ...orb.motionPath,
      enabled: true,
      controlX: 50,
      controlY: 100,
    };
    project.layers.push(orb);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      originX: 10,
      originY: 20,
      autoDestroy: false,
    });

    effect.update(500);

    expect(fake.sprites[0]?.x).toBeCloseTo(60);
    expect(fake.sprites[0]?.y).toBeCloseTo(70);
  });

  it("plays custom easing curves through the runtime evaluator", () => {
    const project = createEmptyProject("Runtime custom easing");
    project.preview.duration = 1200;
    const flash = createLayer("animated", "Flash", "builtin-flash");
    flash.timing.duration = 1000;
    flash.timing.easing = "custom";
    flash.timing.customEasing = { x1: 0, y1: 0, x2: 1, y2: 1 };
    flash.transform.movementX = 100;
    project.layers.push(flash);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });

    effect.update(250);

    expect(fake.sprites[0]?.x).toBeCloseTo(25, 3);
  });

  it("plays multiple transform keyframes through the runtime evaluator", () => {
    const project = createEmptyProject("Runtime pulse");
    const pulse = createLayer("animated", "Pulse", "builtin-ring");
    pulse.timing.duration = 1000;
    pulse.timing.easing = "constant";
    pulse.keyframes = {
      enabled: true,
      initialized: true,
      frames: [
        { time: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
        { time: 0.5, scaleX: 2, scaleY: 1.5, opacity: 0.4, rotation: 90 },
        { time: 1, scaleX: 1, scaleY: 1, opacity: 0, rotation: 180 },
      ],
    };
    project.layers.push(pulse);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });

    effect.update(500);

    expect(fake.sprites[0]?.scaleX).toBeCloseTo(2);
    expect(fake.sprites[0]?.scaleY).toBeCloseTo(1.5);
    expect(fake.sprites[0]?.alpha).toBeCloseTo(0.4);
    expect(fake.sprites[0]?.angle).toBeCloseTo(90);
  });

  it("loads embedded and built-in images without a game server", async () => {
    const project = createEmptyProject("Texture loading");
    project.assets.push({
      id: "uploaded-spark",
      name: "Uploaded spark",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
    });
    project.layers.push(
      createLayer("animated", "Built-in ring", "builtin-ring"),
      createLayer("animated", "Uploaded spark", "uploaded-spark"),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();

    await withDecodedImage(1, 1, async () => {
      await loadVvfxAssets(fake.scene, definition);

      expect(
        fake.textureKeys.has(managedTextureKey(definition, "builtin-ring")),
      ).toBe(true);
      expect(
        fake.textureKeys.has(managedTextureKey(definition, "uploaded-spark")),
      ).toBe(true);
      expect(fake.textureKeys.has(VVFX_INTERNAL_MISSING_TEXTURE_KEY)).toBe(
        true,
      );
    });
  });

  it("keeps the legacy vvfx-missing asset distinct from the internal fallback", async () => {
    const project = createEmptyProject("Legacy missing-key image");
    const asset: VfxAsset = {
      id: "vvfx-missing",
      name: "Legacy missing-key image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    project.assets.push(asset);
    project.layers.push(createLayer("animated", "Legacy image", asset.id));
    const fake = createFakeScene();
    const definition = createRuntimeDefinition(project);
    const textureKey = managedTextureKey(definition, asset.id);

    await withDecodedImage(1, 1, async () => {
      const effect = await playVvfx(fake.scene, definition, {
        autoDestroy: false,
      });

      expect(fake.textureKeys.has(VVFX_INTERNAL_MISSING_TEXTURE_KEY)).toBe(
        true,
      );
      expect(fake.textureKeys.has(textureKey)).toBe(true);
      expect(fake.sprites[0]?.texture.key).toBe(textureKey);

      effect.destroy();
      expect(fake.textureKeys.has(textureKey)).toBe(false);
      expect(fake.textureKeys.has(VVFX_INTERNAL_MISSING_TEXTURE_KEY)).toBe(
        true,
      );
    });
  });

  it("does not reuse or remove a host texture that matches an asset id", async () => {
    const project = createEmptyProject("Host texture collision");
    const asset: VfxAsset = {
      id: "host-owned-image",
      name: "Portable replacement",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    project.assets.push(asset);
    project.layers.push(createLayer("animated", "Portable", asset.id));
    const definition = createRuntimeDefinition(project);
    const textureKey = managedTextureKey(definition, asset.id);
    const fake = createFakeScene([asset.id]);

    await withDecodedImage(1, 1, async () => {
      const effect = await playVvfx(fake.scene, definition, {
        autoDestroy: false,
      });

      expect(textureKey).toMatch(
        new RegExp(`^${VVFX_INTERNAL_TEXTURE_PREFIX}`),
      );
      expect(fake.textureKeys.has(asset.id)).toBe(true);
      expect(fake.textureKeys.has(textureKey)).toBe(true);
      expect(fake.sprites[0]?.texture.key).toBe(textureKey);

      effect.destroy();
      expect(fake.textureKeys.has(textureKey)).toBe(false);
      expect(fake.textureKeys.has(asset.id)).toBe(true);
    });
  });

  it("rejects explicit mappings to the internal missing-texture key", async () => {
    const project = createEmptyProject("Reserved runtime texture mapping");
    project.layers.push(createLayer("animated", "Mapped ring", "builtin-ring"));
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([VVFX_INTERNAL_MISSING_TEXTURE_KEY]);
    const assetKeys = {
      "builtin-ring": VVFX_INTERNAL_MISSING_TEXTURE_KEY,
    };

    await expect(
      loadVvfxAssets(fake.scene, definition, assetKeys),
    ).rejects.toThrow(/mapped Phaser texture key.*invalid/i);
    expect(
      () =>
        new VvfxEffect(fake.scene, definition, {
          assetKeys,
          autoDestroy: false,
        }),
    ).toThrow(/mapped Phaser texture key.*invalid/i);
    await expect(
      playVvfx(fake.scene, definition, { assetKeys }),
    ).rejects.toThrow(/mapped Phaser texture key.*invalid/i);
    expect(fake.sprites).toHaveLength(0);
    expect([...fake.textureKeys]).toEqual([VVFX_INTERNAL_MISSING_TEXTURE_KEY]);

    await expect(
      loadVvfxAssets(fake.scene, definition, {
        "builtin-ring": `${VVFX_INTERNAL_TEXTURE_PREFIX}spoofed`,
      }),
    ).rejects.toThrow(/mapped Phaser texture key.*invalid/i);
  });

  it("does not install an embedded image after its decode times out", async () => {
    const project = createEmptyProject("Late texture decode");
    project.assets.push({
      id: "late-texture",
      name: "Late texture",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
    });
    project.layers.push(
      createLayer("animated", "Late texture", "late-texture"),
    );
    const definition = createRuntimeDefinition(project);
    const textureKey = managedTextureKey(definition, "late-texture");
    const fake = createFakeScene();
    const OriginalImage = globalThis.Image;
    let lateOnload: (() => void) | null = null;
    class LateImage {
      decoding = "auto";
      naturalWidth = 1;
      naturalHeight = 1;
      onerror: OnErrorEventHandler | null = null;
      onload: (() => void) | null = null;
      private source = "";

      get src() {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
        if (value) lateOnload = this.onload;
      }
    }

    vi.useFakeTimers();
    vi.stubGlobal("Image", LateImage);
    try {
      const loading = loadVvfxAssets(fake.scene, definition);
      const rejection = expect(loading).rejects.toThrow(
        /timed out while decoding/i,
      );
      await vi.advanceTimersByTimeAsync(IMAGE_DECODE_TIMEOUT_MS);
      await rejection;

      (lateOnload as (() => void) | null)?.();
      await Promise.resolve();
      expect(fake.textureKeys.has(textureKey)).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.stubGlobal("Image", OriginalImage);
    }
  });

  it("cancels decode and skips effect construction when the scene shuts down", async () => {
    const project = createEmptyProject("Shutdown texture decode");
    project.assets.push({
      id: "shutdown-texture",
      name: "Shutdown texture",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
    });
    project.layers.push(
      createLayer("animated", "Shutdown sprite", "shutdown-texture"),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();
    const OriginalImage = globalThis.Image;
    const callbacks: { lateOnload?: () => void } = {};
    const images: Array<{ src: string }> = [];
    class HangingImage {
      decoding = "auto";
      naturalWidth = 1;
      naturalHeight = 1;
      onerror: OnErrorEventHandler | null = null;
      onload: (() => void) | null = null;
      private source = "";

      constructor() {
        images.push(this);
      }

      get src() {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
        if (value && this.onload) callbacks.lateOnload = this.onload;
      }
    }

    vi.stubGlobal("Image", HangingImage);
    try {
      const loading = playVvfx(fake.scene, definition, {
        autoDestroy: false,
      });
      const rejection = expect(loading).rejects.toMatchObject({
        name: "AbortError",
      });
      fake.sceneEvents.emit("shutdown");
      await rejection;

      expect(images).toHaveLength(1);
      expect(images[0].src).toBe("");
      callbacks.lateOnload?.();
      await Promise.resolve();
      expect(fake.textureKeys.has("shutdown-texture")).toBe(false);
      expect(fake.sprites).toHaveLength(0);
    } finally {
      vi.stubGlobal("Image", OriginalImage);
    }
  });

  it("honors a caller AbortSignal before playback mutates the scene", async () => {
    const project = createEmptyProject("Cancelled playback");
    project.assets.push({
      id: "cancelled-texture",
      name: "Cancelled texture",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
    });
    project.layers.push(
      createLayer("animated", "Cancelled sprite", "cancelled-texture"),
    );
    const fake = createFakeScene();
    const controller = new AbortController();
    controller.abort();

    await expect(
      playVvfx(fake.scene, createRuntimeDefinition(project), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.textureKeys.size).toBe(0);
    expect(fake.sprites).toHaveLength(0);
  });

  it("rejects loading and playback on an already terminated scene", async () => {
    const definition = createRuntimeDefinition(
      createEmptyProject("Terminated scene"),
    );
    const fake = createFakeScene();
    (fake.scene.sys as unknown as { settings: { status: number } }).settings = {
      status: 8,
    };

    await expect(loadVvfxAssets(fake.scene, definition)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(playVvfx(fake.scene, definition)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fake.textureKeys.size).toBe(0);
    expect(fake.sprites).toHaveLength(0);
  });

  it("uses bounded concurrent decodes under one aggregate deadline", async () => {
    const project = createEmptyProject("Bounded texture decoding");
    for (let index = 0; index < 5; index += 1)
      project.assets.push({
        id: `pending-texture-${index}`,
        name: `Pending texture ${index}`,
        mimeType: "image/png",
        dataUrl: TINY_PNG_DATA_URL,
        width: 1,
        height: 1,
        transparency: "yes",
      });
    project.layers.push(
      ...Array.from({ length: 5 }, (_, index) =>
        createLayer(
          "animated",
          `Pending texture ${index}`,
          `pending-texture-${index}`,
        ),
      ),
    );
    const definition = createRuntimeDefinition(project);
    const firstTextureKey = managedTextureKey(definition, "pending-texture-0");
    const fake = createFakeScene();
    const OriginalImage = globalThis.Image;
    const images: Array<{ src: string }> = [];
    class PendingImage {
      decoding = "auto";
      naturalWidth = 1;
      naturalHeight = 1;
      onerror: OnErrorEventHandler | null = null;
      onload: (() => void) | null = null;
      private source = "";

      constructor() {
        images.push(this);
      }

      get src() {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
      }
    }

    vi.useFakeTimers();
    vi.stubGlobal("Image", PendingImage);
    try {
      const loading = loadVvfxAssets(fake.scene, definition);
      const rejection = expect(loading).rejects.toThrow(
        /timed out while decoding/i,
      );
      expect(images).toHaveLength(4);

      await vi.advanceTimersByTimeAsync(IMAGE_DECODE_TIMEOUT_MS);
      await rejection;

      expect(images).toHaveLength(4);
      expect(images.every((image) => image.src === "")).toBe(true);
      expect(fake.textureKeys.has(firstTextureKey)).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.stubGlobal("Image", OriginalImage);
    }
  });

  it("plays deterministic emitters and cleans up after completion", () => {
    const project = createEmptyProject("Runtime smoke");
    project.preview.duration = 500;
    const emitter = createLayer("emitter", "Smoke", "builtin-cloud");
    emitter.spawn.intervalMin = 30;
    emitter.spawn.intervalMax = 30;
    emitter.spawn.count = 2;
    emitter.timing.duration = 220;
    project.layers.push(emitter);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const onComplete = vi.fn();
    const effect = new VvfxEffect(fake.scene, definition, {
      originX: 100,
      originY: 80,
      onComplete,
    });

    effect.update(120);
    expect(fake.sprites.length).toBeGreaterThan(0);
    expect(
      fake.sprites.some((sprite) => sprite.x !== 0 || sprite.y !== 0),
    ).toBe(true);

    effect.update(500);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(effect.isDestroyed).toBe(true);
    expect(fake.sprites.every((sprite) => sprite.destroyed)).toBe(true);
  });

  it("destroys a superseded target when a layer event restarts it", () => {
    const project = createEmptyProject("Runtime event restart");
    project.preview.duration = 500;
    const source = createLayer("animated", "Clock", "builtin-ring");
    source.timing.duration = 100;
    source.timing.repeat = 1;
    const target = createLayer("animated", "Flash", "builtin-flash");
    target.startMode = "triggered";
    target.timing.duration = 300;
    source.events = [
      {
        id: "start-flash",
        enabled: true,
        trigger: "start",
        percentage: 0.5,
        action: "restart",
        targetLayerId: target.id,
        chance: 1,
        maxTriggers: 32,
      },
      {
        id: "restart-flash",
        enabled: true,
        trigger: "repeat",
        percentage: 0.5,
        action: "restart",
        targetLayerId: target.id,
        chance: 1,
        maxTriggers: 32,
      },
    ];
    project.layers.push(source, target);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });
    const originalTarget = fake.sprites.find(
      (sprite) => sprite.texture.key === "builtin-flash" && !sprite.destroyed,
    );

    expect(originalTarget).toBeDefined();
    effect.update(110);

    expect(originalTarget?.destroyed).toBe(true);
    expect(
      fake.sprites.some(
        (sprite) =>
          sprite !== originalTarget &&
          sprite.texture.key === "builtin-flash" &&
          !sprite.destroyed,
      ),
    ).toBe(true);
  });

  it("rebuilds Phaser sprites from canonical state on restart", () => {
    const project = createEmptyProject("Runtime restart cleanup");
    project.preview.duration = 1_000;
    project.layers.push(
      createLayer("animated", "Restarted ring", "builtin-ring"),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });
    const beforeRestart = fake.sprites.find((sprite) => !sprite.destroyed);

    expect(beforeRestart).toBeDefined();
    effect.update(120);
    effect.restart();

    expect(beforeRestart?.destroyed).toBe(true);
    expect(effect.currentTime).toBe(0);
    expect(
      fake.sprites.some(
        (sprite) => sprite !== beforeRestart && !sprite.destroyed,
      ),
    ).toBe(true);
    effect.destroy();
  });

  it("auto-destroys even when the host completion callback throws", () => {
    const project = createEmptyProject("Throwing completion callback");
    project.preview.duration = 500;
    project.layers.push(
      createLayer("animated", "Short flash", "builtin-flash"),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      VVFX_INTERNAL_MISSING_TEXTURE_KEY,
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      onComplete: () => {
        throw new Error("Host completion failed");
      },
    });

    expect(() => effect.update(500)).toThrow("Host completion failed");
    expect(effect.isDestroyed).toBe(true);
    expect(effect.isPlaying).toBe(false);
    expect(fake.sceneEvents.listenerCount("update")).toBe(0);
    expect(fake.sprites.every((sprite) => sprite.destroyed)).toBe(true);
  });

  it("shares leased embedded textures and releases the final playback owner", async () => {
    const project = createEmptyProject("Shared runtime image");
    const asset: VfxAsset = {
      id: "leased-image",
      name: "Leased image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    project.assets.push(asset);
    project.layers.push(createLayer("animated", "Leased", asset.id));
    const definition = createRuntimeDefinition(project);
    const textureKey = managedTextureKey(definition, asset.id);
    const fake = createFakeScene();

    await withDecodedImage(1, 1, async () => {
      const first = await playVvfx(fake.scene, definition, {
        autoDestroy: false,
      });
      const second = await playVvfx(fake.scene, definition, {
        autoDestroy: false,
      });

      expect(fake.textureKeys.has(textureKey)).toBe(true);
      first.destroy();
      expect(fake.textureKeys.has(textureKey)).toBe(true);
      second.destroy();
      expect(fake.textureKeys.has(textureKey)).toBe(false);
    });
  });

  it("shares embedded texture leases across scenes using one TextureManager", async () => {
    const project = createEmptyProject("Cross-scene runtime image");
    const asset: VfxAsset = {
      id: "cross-scene-image",
      name: "Cross-scene image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    project.assets.push(asset);
    project.layers.push(
      createLayer("animated", "Shared scene image", asset.id),
    );
    const definition = createRuntimeDefinition(project);
    const textureKey = managedTextureKey(definition, asset.id);
    const firstScene = createFakeScene();
    const secondScene = createFakeScene();
    secondScene.scene.textures = firstScene.scene.textures;

    await withDecodedImage(1, 1, async () => {
      const creator = await playVvfx(firstScene.scene, definition, {
        autoDestroy: false,
      });
      const borrower = await playVvfx(secondScene.scene, definition, {
        autoDestroy: false,
      });

      expect(firstScene.textureKeys.has(textureKey)).toBe(true);
      creator.destroy();
      expect(firstScene.textureKeys.has(textureKey)).toBe(true);
      expect(secondScene.sprites.some((sprite) => !sprite.destroyed)).toBe(
        true,
      );

      borrower.destroy();
      expect(firstScene.textureKeys.has(textureKey)).toBe(false);
    });
  });

  it("retains provisional ownership until a persistent preload commits", async () => {
    const acquiredProject = createEmptyProject("Acquired runtime image");
    const sharedAsset: VfxAsset = {
      id: "persistent-race-image",
      name: "Persistent race image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    acquiredProject.assets.push(sharedAsset);
    acquiredProject.layers.push(
      createLayer("animated", "Acquired shared image", sharedAsset.id),
    );
    const fake = createFakeScene();
    let acquiredEffect!: VvfxEffect;
    await withDecodedImage(1, 1, async () => {
      acquiredEffect = await playVvfx(
        fake.scene,
        createRuntimeDefinition(acquiredProject),
        { autoDestroy: false },
      );
    });

    const persistentProject = createEmptyProject("Persistent runtime images");
    const delayedAsset: VfxAsset = {
      ...sharedAsset,
      id: "persistent-race-delayed-image",
      name: "Delayed persistent image",
    };
    persistentProject.assets.push(sharedAsset, delayedAsset);
    persistentProject.layers.push(
      createLayer("animated", "Persistent shared image", sharedAsset.id),
      createLayer("animated", "Persistent delayed image", delayedAsset.id),
    );
    const persistentDefinition = createRuntimeDefinition(persistentProject);
    const sharedTextureKey = managedTextureKey(
      persistentDefinition,
      sharedAsset.id,
    );
    const delayedTextureKey = managedTextureKey(
      persistentDefinition,
      delayedAsset.id,
    );
    const OriginalImage = globalThis.Image;
    const pendingImages: Array<{
      onload: ((this: GlobalEventHandlers, event: Event) => unknown) | null;
    }> = [];
    class DeferredImage {
      decoding = "auto";
      naturalWidth = 1;
      naturalHeight = 1;
      onerror: OnErrorEventHandler | null = null;
      onload: ((this: GlobalEventHandlers, event: Event) => unknown) | null =
        null;
      private source = "";

      constructor() {
        pendingImages.push(this);
      }

      get src() {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
      }
    }

    vi.stubGlobal("Image", DeferredImage);
    try {
      const preload = loadVvfxAssets(fake.scene, persistentDefinition);
      expect(pendingImages).toHaveLength(1);

      acquiredEffect.destroy();
      expect(fake.textureKeys.has(sharedTextureKey)).toBe(true);

      pendingImages[0].onload?.call(
        pendingImages[0] as never,
        new Event("load"),
      );
      await preload;
      expect(fake.textureKeys.has(sharedTextureKey)).toBe(true);
      expect(fake.textureKeys.has(delayedTextureKey)).toBe(true);
    } finally {
      vi.stubGlobal("Image", OriginalImage);
    }
  });

  it("rolls back an image when addImage synchronously shuts down the scene", async () => {
    const project = createEmptyProject("Synchronous shutdown image");
    const asset: VfxAsset = {
      id: "sync-shutdown-image",
      name: "Synchronous shutdown image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
      spriteSheet: null,
    };
    project.assets.push(asset);
    project.layers.push(createLayer("animated", "Shutdown image", asset.id));
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();
    const originalAddImage = fake.scene.textures.addImage.bind(
      fake.scene.textures,
    );
    fake.scene.textures.addImage = (key, source) => {
      const texture = originalAddImage(key, source);
      fake.sceneEvents.emit("shutdown");
      return texture;
    };

    await withDecodedImage(1, 1, async () => {
      await expect(
        playVvfx(fake.scene, definition, { autoDestroy: false }),
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    expect(fake.textureKeys.has(asset.id)).toBe(false);
    expect(fake.sprites).toHaveLength(0);
  });

  it("rolls back embedded textures installed before a later decode fails", async () => {
    const project = createEmptyProject("Partial runtime image failure");
    const assets: VfxAsset[] = [0, 1].map((index) => ({
      id: `transaction-image-${index}`,
      name: `Transaction image ${index}`,
      mimeType: "image/png" as const,
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes" as const,
      spriteSheet: null,
    }));
    project.assets.push(...assets);
    project.layers.push(
      ...assets.map((asset, index) =>
        createLayer("animated", `Transaction ${index}`, asset.id),
      ),
    );
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();
    const OriginalImage = globalThis.Image;
    let imageIndex = 0;
    class PartiallyFailingImage {
      readonly index = imageIndex++;
      decoding = "auto";
      naturalWidth = 1;
      naturalHeight = 1;
      onerror: OnErrorEventHandler | null = null;
      onload: ((this: GlobalEventHandlers, event: Event) => unknown) | null =
        null;
      private source = "";

      get src() {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
        if (!value) return;
        queueMicrotask(() => {
          if (this.index === 0)
            this.onload?.call(this as never, new Event("load"));
          else this.onerror?.call(this as never, new Event("error"));
        });
      }
    }

    vi.stubGlobal("Image", PartiallyFailingImage);
    try {
      await expect(playVvfx(fake.scene, definition)).rejects.toThrow(
        /could not load/i,
      );
      expect(fake.textureKeys.has(assets[0].id)).toBe(false);
      expect(fake.textureKeys.has(assets[1].id)).toBe(false);
      expect(fake.sprites).toHaveLength(0);
    } finally {
      vi.stubGlobal("Image", OriginalImage);
    }
  });
});
