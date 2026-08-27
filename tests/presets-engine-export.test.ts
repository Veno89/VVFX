import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  createEmptyProject,
  createExampleProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  createRuntimeDefinition,
  generatePhaserCode,
  generateStandalonePhaserCode,
} from "../src/vfx/exporters";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../src/vfx/presets";
import { TINY_PNG_DATA_URL } from "./fixtures/portableImages";

describe("creative presets", () => {
  it("ships every promised single-layer starting point", () => {
    expect(LAYER_PRESETS.map((preset) => preset.id)).toEqual(
      expect.arrayContaining([
        "impact",
        "shockwave",
        "sparks",
        "smoke",
        "motes",
        "bubble",
        "pop",
        "arc-sparks",
      ]),
    );
    expect(LAYER_PRESETS.every((preset) => preset.create().assetId)).toBe(true);
  });

  it("ships clearly marked experimental rendering starting points", () => {
    const experimental = LAYER_PRESETS.filter(
      (preset) => preset.maturity === "experimental",
    );
    expect(experimental.map((preset) => preset.id)).toEqual([
      "neon-projectile-experimental",
      "dissolving-spirit-experimental",
      "masked-energy-ring-experimental",
      "heat-shimmer-experimental",
    ]);
    for (const preset of experimental) {
      const layer = preset.create();
      expect(
        Object.values(layer.appearance.effects).some(
          (effect) => effect.enabled,
        ),
      ).toBe(true);
    }

    const dissolvingSpirit = experimental
      .find((preset) => preset.id === "dissolving-spirit-experimental")
      ?.create();
    expect(
      dissolvingSpirit?.appearance.effects.directionalDissolve,
    ).toMatchObject({
      enabled: true,
      pattern: "noise",
      noiseScale: 6,
      start: 0.48,
      end: 1,
      softness: 0.18,
    });
    expect(dissolvingSpirit?.appearance.effects.spriteWarp.enabled).toBe(false);

    const maskedRing = experimental
      .find((preset) => preset.id === "masked-energy-ring-experimental")
      ?.create();
    expect(maskedRing?.assetId).toBe("builtin-cloud");
    expect(maskedRing?.appearance.effects.visualMask).toMatchObject({
      enabled: true,
      maskAssetId: "builtin-ring",
      channel: "alpha",
      fit: "stretch",
      strength: 1,
    });
  });

  it("includes the multi-layer poison ooze teaching recipe", () => {
    const poison = COMPOSITION_PRESETS.find(
      (preset) => preset.id === "poison-ooze",
    );
    expect(poison?.create().map((layer) => layer.name)).toEqual([
      "Ooze base",
      "Rising bubbles",
      "Toxic smoke",
      "Occasional pop",
    ]);
  });

  it("ships complete, evaluable recipes for the learning center", () => {
    expect(COMPOSITION_PRESETS.map((preset) => preset.id)).toEqual([
      "magic-impact",
      "critical-hit",
      "poison-ooze",
      "fire-impact",
      "healing-aura",
      "projectile-trail",
      "spark-to-smoke-firework",
    ]);
    for (const preset of COMPOSITION_PRESETS) {
      const project = createEmptyProject(preset.name);
      project.layers = preset.create();
      expect(preset.ingredients.length).toBeGreaterThan(0);
      expect(preset.lesson).toBeTruthy();
      expect(new Set(project.layers.map((layer) => layer.id)).size).toBe(
        project.layers.length,
      );
      expect(project.layers.every((layer) => layer.assetId)).toBe(true);
      for (const time of [0, 500, 1500, 2999])
        expect(() => evaluateProject(project, time, null)).not.toThrow();
      expect(createRuntimeDefinition(project).layers).toHaveLength(
        project.layers.length,
      );
    }
  });

  it("ships a bounded spark-to-smoke copy-finish starter", () => {
    const preset = COMPOSITION_PRESETS.find(
      (candidate) => candidate.id === "spark-to-smoke-firework",
    );
    const [sparks, smoke] = preset?.create() ?? [];
    expect(sparks?.type).toBe("burst");
    expect(smoke?.startMode).toBe("triggered");
    expect(sparks?.events[0]).toMatchObject({
      trigger: "copy-finish",
      targetLayerId: smoke?.id,
      chance: 0.65,
      maxTriggers: 8,
    });
  });
});

describe("deterministic preview evaluation", () => {
  it("returns identical instances for the same seed and playhead time", () => {
    const project = createExampleProject();
    expect(evaluateProject(project, 440, null)).toEqual(
      evaluateProject(project, 440, null),
    );
  });

  it("respects solo mode and the 500-sprite safety ceiling", () => {
    const project = createExampleProject();
    const burst = project.layers.find((layer) => layer.type === "burst");
    if (!burst || !burst.spawn) throw new Error("Example burst missing");
    burst.solo = true;
    burst.spawn.count = 250;
    burst.timing.duration = 2000;
    const instances = evaluateProject(project, 300, burst.id);
    expect(instances.length).toBeLessThanOrEqual(500);
    expect(instances.every((instance) => instance.layerId === burst.id)).toBe(
      true,
    );
  });

  it("builds deterministic afterimages from actual prior movement", () => {
    const project = createEmptyProject("Trail test");
    const layer = createLayer("animated", "Comet", "builtin-ring");
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.transform.movementX = 100;
    layer.transform.endOpacity = 1;
    layer.trail = {
      enabled: true,
      count: 3,
      spacing: 100,
      lifetime: 400,
      opacity: 0.5,
      scaleFalloff: 0.1,
    };
    project.layers.push(layer);

    const instances = evaluateProject(project, 500, layer.id);
    expect(instances.map((instance) => instance.x)).toEqual([20, 30, 40, 50]);
    expect(instances.map((instance) => instance.trailIndex)).toEqual([
      3,
      2,
      1,
      null,
    ]);
    expect(instances.slice(0, 3).every((instance) => !instance.selected)).toBe(
      true,
    );
    expect(instances[0].scaleX).toBeCloseTo(0.7);
    expect(instances[0].opacity).toBeCloseTo(0.125);
  });

  it("moves layers along their authored curve", () => {
    const project = createEmptyProject("Curve test");
    const layer = createLayer("animated", "Orb", "builtin-ring");
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.transform.movementX = 100;
    layer.motionPath = {
      ...layer.motionPath,
      enabled: true,
      mode: "curve",
      controlX: 50,
      controlY: 100,
    };
    project.layers.push(layer);

    const [instance] = evaluateProject(project, 500, null);
    expect(instance.x).toBeCloseTo(50);
    expect(instance.y).toBeCloseTo(50);
  });

  it("interpolates multiple transform keyframes without taking over movement", () => {
    const project = createEmptyProject("Keyframe test");
    const layer = createLayer("animated", "Pulse", "builtin-ring");
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.transform.movementX = 100;
    layer.keyframes = {
      enabled: true,
      initialized: true,
      frames: [
        { time: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
        { time: 0.5, scaleX: 2, scaleY: 1.5, opacity: 0.25, rotation: 90 },
        { time: 1, scaleX: 1, scaleY: 1, opacity: 0, rotation: 180 },
      ],
    };
    project.layers.push(layer);

    const [instance] = evaluateProject(project, 500, null);
    expect(instance).toMatchObject({ x: 50, scaleX: 2, scaleY: 1.5 });
    expect(instance.opacity).toBeCloseTo(0.25);
    expect(instance.rotation).toBeCloseTo(90);

    layer.timing.easing = "fast-slow";
    const [easedInstance] = evaluateProject(project, 500, null);
    expect(easedInstance.scaleX).toBeCloseTo(2);
    expect(easedInstance.x).toBeGreaterThan(50);
  });

  it("applies shared group position and timing without changing layer values", () => {
    const project = createEmptyProject("Grouped impact");
    const group = createGroup("Impact core");
    group.x = 40;
    group.y = -10;
    group.delay = 200;
    const layer = createLayer("animated", "Flash", "builtin-flash");
    layer.groupId = group.id;
    layer.transform.x = 10;
    layer.transform.movementX = 100;
    layer.timing.delay = 100;
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    project.groups.push(group);
    project.layers.push(layer);

    expect(evaluateProject(project, 299, null)).toEqual([]);
    const [instance] = evaluateProject(project, 800, null);
    expect(instance).toMatchObject({ x: 100, y: -10 });
    expect(layer.transform.x).toBe(10);
    expect(layer.timing.delay).toBe(100);
  });

  it("applies a shared group position once across attached members", () => {
    const project = createEmptyProject("Grouped attachment");
    const group = createGroup("Attached pair");
    group.x = 100;
    const parent = createLayer("static", "Parent", "builtin-flash");
    const child = createLayer("static", "Child", "builtin-ring");
    parent.groupId = group.id;
    parent.transform.x = 10;
    child.groupId = group.id;
    child.parentId = parent.id;
    child.transform.x = 5;
    project.groups.push(group);
    project.layers.push(parent, child);

    const childInstance = evaluateProject(project, 0, null).find(
      (instance) => instance.layerId === child.id,
    );
    expect(childInstance?.x).toBe(115);
  });
});

describe("game exports", () => {
  it("creates a clean versioned runtime definition", () => {
    const project = createExampleProject();
    const runtime = createRuntimeDefinition(project);
    expect(runtime.formatVersion).toBe(15);
    expect(runtime.name).toBe("Simple Magic Impact");
    expect(runtime.layers).toHaveLength(4);
    expect(runtime.layers[0]).not.toHaveProperty("solo");
  });

  it("exports only assets referenced by exact runtime layer state", () => {
    const project = createEmptyProject("Focused asset export");
    const visualMask = {
      id: "stored-visual-mask",
      name: "Stored visual mask",
      mimeType: "image/png" as const,
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
    };
    const spawnMask = {
      ...visualMask,
      id: "stored-spawn-mask",
      name: "Stored spawn mask",
      alphaMask: {
        columns: 1,
        rows: 1,
        alpha: [255],
      },
    };
    const unused = {
      ...visualMask,
      id: "unused-image",
      name: "Unused image",
    };
    project.assets.push(visualMask, spawnMask, unused);
    const layer = createLayer("emitter", "Referenced roles", "builtin-ring");
    layer.appearance.effects.visualMask.maskAssetId = visualMask.id;
    layer.appearance.effects.visualMask.enabled = false;
    layer.spawn.maskAssetId = spawnMask.id;
    layer.spawn.shape = "point";
    project.layers.push(layer);

    const runtime = createRuntimeDefinition(project);
    const exportedIds = runtime.assets.map((asset) => asset.id);

    expect(exportedIds).toEqual(["builtin-ring", visualMask.id, spawnMask.id]);
    expect(generatePhaserCode(project)).not.toContain(unused.id);
  });

  it("flattens effect-group offsets into runtime and Phaser exports", () => {
    const project = createEmptyProject("Grouped export");
    const group = createGroup("Delayed core");
    group.x = 25;
    group.y = -15;
    group.delay = 150;
    const layer = createLayer("animated", "Core", "builtin-flash");
    layer.groupId = group.id;
    layer.transform.x = 10;
    layer.timing.delay = 20;
    project.groups.push(group);
    project.layers.push(layer);

    const runtime = createRuntimeDefinition(project);
    expect(runtime.layers[0].transform).toMatchObject({ x: 35, y: -15 });
    expect(runtime.layers[0].timing.delay).toBe(170);
    const code = generatePhaserCode(project);
    expect(code).toContain('"x": 35');
    expect(code).toContain('"delay": 170');
  });

  it("generates type-safe, runtime-backed Phaser code with exact editor settings", () => {
    const code = generatePhaserCode(createExampleProject());
    const transpiled = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    expect(code).toContain('from "@vvfx/phaser-runtime"');
    expect(code).toContain("export const vvfxDefinition");
    expect(code).toContain('"formatVersion": 15');
    expect(code).toContain("return playVvfx(scene, definition");
    expect(code).toContain("assetKeys: options.assetKeys");
    expect(code).toContain("autoDestroy: options.autoDestroy");
    expect(code).toContain("onWarning: options.onWarning");
    expect(
      transpiled.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });

  it("keeps experimental effects in runtime exports and rejects lossy standalone code", () => {
    const project = createEmptyProject("WebGL erosion");
    const glow = createLayer("animated", "Glow", "builtin-ring");
    glow.appearance.effects.outerGlow.enabled = true;
    glow.appearance.effects.directionalDissolve = {
      ...glow.appearance.effects.directionalDissolve,
      enabled: true,
      pattern: "noise",
      noiseScale: 11,
    };
    project.layers = [glow];

    const runtime = createRuntimeDefinition(project);

    expect(runtime.layers[0].appearance.effects.outerGlow.enabled).toBe(true);
    expect(
      runtime.layers[0].appearance.effects.directionalDissolve,
    ).toMatchObject({ pattern: "noise", noiseScale: 11 });
    const generated = generatePhaserCode(project);
    expect(generated).toContain('"outerGlow"');
    expect(generated).toContain('"pattern": "noise"');
    expect(generated).toContain('"noiseScale": 11');
    expect(() => generateStandalonePhaserCode(project)).toThrow(
      /experimental WebGL pixel effects/i,
    );
  });

  it("keeps disabled and dormant features out of standalone export decisions", () => {
    const project = createEmptyProject("Lifecycle-safe standalone export");
    const visible = createLayer("animated", "Visible core", "builtin-ring");
    const disabledBeam = createLayer("beam", "Disabled beam", "builtin-spark");
    disabledBeam.enabled = false;
    disabledBeam.appearance.effects.outerGlow.enabled = true;
    const dormant = createLayer(
      "animated",
      "Dormant triggered layer",
      "builtin-cloud",
    );
    dormant.startMode = "triggered";
    dormant.appearance.effects.outerGlow.enabled = true;
    const disconnectedSource = createLayer(
      "animated",
      "Disconnected event source",
      "builtin-spark",
    );
    disconnectedSource.startMode = "triggered";
    const disconnectedTarget = createLayer(
      "animated",
      "Disconnected event target",
      "builtin-flash",
    );
    disconnectedTarget.startMode = "triggered";
    disconnectedSource.events = [
      {
        id: "disconnected-link",
        enabled: true,
        trigger: "finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: disconnectedTarget.id,
        chance: 1,
        maxTriggers: 1,
      },
    ];
    visible.events = [
      {
        id: "disabled-link",
        enabled: false,
        trigger: "finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: dormant.id,
        chance: 1,
        maxTriggers: 1,
      },
    ];
    project.layers = [
      visible,
      disabledBeam,
      dormant,
      disconnectedSource,
      disconnectedTarget,
    ];

    const code = generateStandalonePhaserCode(project);

    expect(code).toContain("Visible core");
    expect(code).not.toContain("Disabled beam");
    expect(code).not.toContain("Dormant triggered layer");
    expect(code).not.toContain("Disconnected event source");
    expect(code).not.toContain("Disconnected event target");
    expect(code).not.toContain('"builtin-spark"');
    expect(code).not.toContain('"builtin-cloud"');

    visible.events[0].enabled = true;
    expect(() => generateStandalonePhaserCode(project)).toThrow(
      /does not support layer events/i,
    );
  });

  it("keeps the standalone approximation free of duplicate identifiers", () => {
    const project = createEmptyProject("Duplicate names");
    project.layers.push(
      createLayer("animated", "Animated image"),
      createLayer("animated", "Animated image"),
    );
    const code = generateStandalonePhaserCode(project);
    expect(code).toContain("const layer0 =");
    expect(code).toContain("const layer1 =");
    expect(code.match(/const animatedimage/g)).toBeNull();
  });

  it("generates named texture-atlas frames for Phaser images", () => {
    const project = createEmptyProject("Atlas impact");
    project.assets.push({
      id: "atlas-flash",
      name: "Atlas flash",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      atlasFrame: "vfx/flash-01",
    });
    project.layers.push(createLayer("animated", "Atlas flash", "atlas-flash"));

    const code = generateStandalonePhaserCode(project);
    expect(code).toContain('"vfx/flash-01"');
    expect(code).toContain("originY + 0");
  });

  it("generates a self-cleaning helper for simple motion trails", () => {
    const project = createEmptyProject("Trail export");
    const layer = createLayer("animated", "Comet", "builtin-spark");
    layer.trail.enabled = true;
    project.layers.push(layer);

    const code = generateStandalonePhaserCode(project);
    const transpiled = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    expect(code).toContain("addMotionTrail(scene, layer0");
    expect(code).toContain("echoes.splice(0).forEach");
    expect(
      transpiled.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });

  it("generates path playback for curved image layers", () => {
    const project = createEmptyProject("Curve export");
    const layer = createLayer("animated", "Orb", "builtin-ring");
    layer.transform.movementX = 160;
    layer.motionPath.enabled = true;
    layer.motionPath.orientToPath = true;
    project.layers.push(layer);

    const code = generateStandalonePhaserCode(project);
    const transpiled = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    expect(code).toContain("evaluateGeneratedMotionPath");
    expect(code).toContain("const layer0PathState");
    expect(code).toContain("layer0.setPosition");
    expect(
      transpiled.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });

  it("generates a reusable Phaser ease function for custom curves", () => {
    const project = createEmptyProject("Custom ease export");
    const layer = createLayer("animated", "Flash", "builtin-flash");
    layer.timing.easing = "custom";
    layer.timing.customEasing = { x1: 0.2, y1: -0.4, x2: 0.7, y2: 1.4 };
    project.layers.push(layer);

    const code = generateStandalonePhaserCode(project);
    const transpiled = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    expect(code).toContain("generatedCustomEasing");
    expect(code).toContain('"y1":-0.4');
    expect(
      transpiled.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });

  it("generates keyframe playback for animated image layers", () => {
    const project = createEmptyProject("Keyframe export");
    const layer = createLayer("animated", "Pulse", "builtin-ring");
    layer.keyframes = {
      enabled: true,
      initialized: true,
      frames: [
        { time: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
        { time: 0.4, scaleX: 2, scaleY: 2, opacity: 0.5, rotation: 60 },
        { time: 1, scaleX: 0, scaleY: 0, opacity: 0, rotation: 180 },
      ],
    };
    project.layers.push(layer);

    const code = generateStandalonePhaserCode(project);
    const transpiled = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    expect(code).toContain("evaluateGeneratedKeyframes");
    expect(code).toContain("const layer0KeyframeState");
    expect(code).toContain("keyframe.rotation");
    expect(
      transpiled.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });
});
