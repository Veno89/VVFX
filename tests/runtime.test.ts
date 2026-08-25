import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
  loadVvfxAssets,
  validateRuntimeDefinition,
  VvfxEffect,
} from "../packages/phaser-runtime/src";
import { resolveRuntimeRenderingAssetFrame } from "../packages/phaser-runtime/src/VvfxEffect";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { createRuntimeDefinition } from "../src/vfx/exporters";
import type { VfxAsset } from "../src/vfx/types";

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
}

class FakeSprite {
  texture: { key: string };
  frame: { name: string | number };
  destroyed = false;
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  alpha = 1;
  angle = 0;

  constructor(key: string, frame: string | number = "__BASE") {
    this.texture = { key };
    this.frame = { name: frame };
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
  setDepth() {
    return this;
  }
  setTint() {
    return this;
  }
  clearTint() {
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

describe("Phaser runtime package", () => {
  it("updates Beam layers from world-space endpoints", () => {
    const project = createEmptyProject("Runtime beam");
    project.preview.duration = 500;
    const beam = createLayer("beam", "Lightning", "builtin-spark");
    beam.behavior.flicker.enabled = false;
    beam.transform.startOpacity = 1;
    beam.transform.endOpacity = 1;
    project.layers.push(beam);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      "vvfx-missing",
      ...definition.assets.map((asset) => asset.id),
    ]);
    const effect = new VvfxEffect(fake.scene, definition, {
      originX: 10,
      originY: 20,
      autoDestroy: false,
    });

    effect.setEndpoints(100, 200, 400, 600);

    expect(fake.sprites[0]?.x).toBeCloseTo(250);
    expect(fake.sprites[0]?.y).toBeCloseTo(400);
    expect(fake.sprites[0]?.scaleX).toBeCloseTo(500 / 128);
    expect(fake.sprites[0]?.scaleY).toBeCloseTo(1);
    expect(fake.sprites[0]?.angle).toBeCloseTo(53.1301, 3);

    effect.clearEndpoints();
    expect(fake.sprites[0]?.x).toBeCloseTo(130);
    expect(fake.sprites[0]?.y).toBeCloseTo(20);
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
      dataUrl: "data:image/png;base64,bWFzaw==",
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
    project.layers.push(sparks);
    const definition = createRuntimeDefinition(project);
    const result = validateRuntimeDefinition(JSON.stringify(definition));

    expect(result.ok).toBe(true);
    expect(result.definition?.formatVersion).toBe(15);
    expect(result.definition?.format).toBe("vvfx-runtime");
    expect(result.definition?.layers[0].name).toBe("Sparks");
    expect(
      result.definition?.layers[0].appearance.effects.directionalDissolve,
    ).toMatchObject({ pattern: "noise", noiseScale: 9 });
    expect(
      validateRuntimeDefinition({ ...definition, formatVersion: 1 }).definition
        ?.formatVersion,
    ).toBe(15);
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
    expect(migratedSeven?.formatVersion).toBe(15);
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
    expect(migratedTwelve?.formatVersion).toBe(15);
    expect(
      migratedTwelve?.layers[0].appearance.effects.directionalDissolve,
    ).toMatchObject({ pattern: "directional", noiseScale: 6 });
    expect(
      validateRuntimeDefinition({ ...definition, formatVersion: 99 }).ok,
    ).toBe(false);
  });

  it("preserves effects in current runtime JSON and warns once on Canvas fallback", () => {
    const project = createEmptyProject("Canvas glow");
    const glow = createLayer("animated", "Glow", "builtin-ring");
    glow.appearance.effects.outerGlow.enabled = true;
    project.layers = [glow];
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene([
      "vvfx-missing",
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
      "vvfx-missing",
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
      dataUrl: "data:image/png;base64,AAAA",
      width: 128,
      height: 32,
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
    });
    const flame = createLayer("animated", "Flame", "flame-sheet");
    flame.frameAnimation.framesPerSecond = 10;
    project.layers.push(flame);
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();

    await loadVvfxAssets(fake.scene, definition);
    const effect = new VvfxEffect(fake.scene, definition, {
      autoDestroy: false,
    });
    effect.update(120);

    expect(fake.sprites[0]?.frame.name).toBe(1);
  });

  it("uses named frames from a preloaded Phaser texture atlas", () => {
    const project = createEmptyProject("Atlas sparks");
    project.assets.push({
      id: "atlas-spark",
      name: "Atlas spark",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
      atlasFrame: "vfx/spark-01",
    });
    project.layers.push(createLayer("animated", "Atlas spark", "atlas-spark"));
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene(["vvfx-missing", "game-vfx"]);
    fake.addTextureFrame("game-vfx", "vfx/spark-01");

    const effect = new VvfxEffect(fake.scene, definition, {
      assetKeys: { "atlas-spark": "game-vfx" },
      autoDestroy: false,
    });
    effect.update(100);

    expect(definition.formatVersion).toBe(15);
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
      "vvfx-missing",
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
      "vvfx-missing",
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
      "vvfx-missing",
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
      "vvfx-missing",
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
      dataUrl: "data:image/png;base64,AAAA",
      transparency: "yes",
    });
    const definition = createRuntimeDefinition(project);
    const fake = createFakeScene();

    await loadVvfxAssets(fake.scene, definition);

    expect(fake.textureKeys.has("builtin-ring")).toBe(true);
    expect(fake.textureKeys.has("uploaded-spark")).toBe(true);
    expect(fake.textureKeys.has("vvfx-missing")).toBe(true);
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
      "vvfx-missing",
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
      "vvfx-missing",
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
});
