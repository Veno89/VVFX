import { describe, expect, it } from "vitest";
import {
  LAYER_TYPE_LABELS,
  describeLayer,
  layerTypeLabel,
} from "../src/editor/guidance";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  createRuntimeDefinition,
  generatePhaserCode,
} from "../src/vfx/exporters";
import type {
  EvaluatedInstance,
  LayerType,
  SpawnDistribution,
  VfxLayer,
} from "../src/vfx/types";

function evaluateLayerAt(layer: VfxLayer, time: number): EvaluatedInstance[] {
  const project = createEmptyProject("Capability test");
  project.preview.randomSeed = 12345;
  project.layers.push(layer);
  return evaluateProject(project, time, null);
}

describe("beginner-facing layer guidance", () => {
  it.each([
    ["static", "still image"],
    ["animated", "one animated image"],
    ["burst", "releases 8 copies at once"],
    ["emitter", "creates 8 copies every"],
  ] as const)("describes a %s layer accurately", (type, phrase) => {
    const layer = createLayer(type, `${type} example`, "builtin-ring");
    expect(describeLayer(layer).toLowerCase()).toContain(phrase);
  });

  it.each([
    [
      "color over lifetime",
      (layer: VfxLayer) => {
        layer.appearance.colorOverLifetime.enabled = true;
      },
      "changes whole-image color over time",
    ],
    [
      "pulse",
      (layer: VfxLayer) => {
        layer.behavior.pulse.enabled = true;
      },
      "pulses",
    ],
    [
      "flicker",
      (layer: VfxLayer) => {
        layer.behavior.flicker.enabled = true;
      },
      "flickers",
    ],
    [
      "wobble",
      (layer: VfxLayer) => {
        layer.behavior.wobble.enabled = true;
        layer.behavior.wobble.style = "sway";
      },
      "gently sways",
    ],
    [
      "motion path",
      (layer: VfxLayer) => {
        layer.motionPath.enabled = true;
        layer.motionPath.mode = "curve";
      },
      "follows a curve path",
    ],
    [
      "trail",
      (layer: VfxLayer) => {
        layer.trail.enabled = true;
      },
      "leaves fading trail copies",
    ],
  ] as const)("summarizes %s without UI state", (_name, configure, phrase) => {
    const layer = createLayer("animated", "Guided layer", "builtin-ring");
    configure(layer);
    expect(describeLayer(layer).toLowerCase()).toContain(phrase);
  });

  it("uses friendly labels instead of internal engine terms", () => {
    expect(LAYER_TYPE_LABELS).toEqual({
      static: "Still image",
      animated: "Animated image",
      burst: "Burst",
      emitter: "Repeating copies",
    });
    expect(
      (["static", "animated", "burst", "emitter"] as LayerType[]).map(
        layerTypeLabel,
      ),
    ).toEqual(["Still image", "Animated image", "Burst", "Repeating copies"]);
  });
});

describe("whole-image color and procedural behaviors", () => {
  it("interpolates a deterministic whole-image color over lifetime", () => {
    const layer = createLayer("animated", "Color shift", "builtin-ring");
    layer.id = "color-shift";
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.appearance.colorOverLifetime = {
      enabled: true,
      stops: [
        { time: 0, color: "#ff0000" },
        { time: 0.5, color: "#00ff00" },
        { time: 1, color: "#0000ff" },
      ],
    };

    expect(evaluateLayerAt(layer, 250)[0]?.tint).toBe("#808000");
    expect(evaluateLayerAt(layer, 500)[0]?.tint).toBe("#00ff00");
    expect(evaluateLayerAt(layer, 750)[0]?.tint).toBe("#008080");
    expect(evaluateLayerAt(layer, 500)).toEqual(evaluateLayerAt(layer, 500));
  });

  it("evaluates pulse and regular flicker at predictable phases", () => {
    const pulse = createLayer("animated", "Pulse", "builtin-ring");
    pulse.timing.duration = 1000;
    pulse.timing.easing = "constant";
    pulse.transform.startOpacity = 0.5;
    pulse.transform.endOpacity = 0.5;
    pulse.behavior.pulse = {
      ...pulse.behavior.pulse,
      enabled: true,
      scale: 0.2,
      opacity: 0.5,
      speed: 2,
    };
    const [pulsed] = evaluateLayerAt(pulse, 125);
    expect(pulsed.scaleX).toBeCloseTo(1.2);
    expect(pulsed.scaleY).toBeCloseTo(1.2);
    expect(pulsed.opacity).toBeCloseTo(0.75);

    const flicker = createLayer("animated", "Flicker", "builtin-flash");
    flicker.timing.duration = 1000;
    flicker.timing.easing = "constant";
    flicker.transform.endOpacity = 1;
    flicker.behavior.flicker = {
      ...flicker.behavior.flicker,
      enabled: true,
      amount: 0.5,
      speed: 4,
      randomness: 0,
    };
    expect(evaluateLayerAt(flicker, 125)[0]?.opacity).toBeCloseTo(0.5);
  });

  it("adds wobble and gravity without changing authored starting coordinates", () => {
    const wobble = createLayer("animated", "Wobble", "builtin-cloud");
    wobble.timing.duration = 1000;
    wobble.timing.easing = "constant";
    wobble.behavior.wobble = {
      ...wobble.behavior.wobble,
      enabled: true,
      x: 10,
      y: 6,
      rotation: 8,
      speed: 1,
      style: "sway",
      smoothness: 0.7,
    };
    expect(evaluateLayerAt(wobble, 0)[0]).toMatchObject({ x: 0 });
    const [drifting] = evaluateLayerAt(wobble, 250);
    expect(drifting.x).toBeCloseTo(10);
    expect(drifting.y).toBeCloseTo(0);
    expect(drifting.rotation).toBeGreaterThan(0);

    const falling = createLayer("animated", "Falling", "builtin-spark");
    falling.timing.duration = 1000;
    falling.timing.easing = "constant";
    falling.behavior.physics.gravity = 200;
    expect(evaluateLayerAt(falling, 1000)[0]?.y).toBeCloseTo(100);
  });

  it("keeps seeded organic movement smooth, bounded, and reproducible", () => {
    const organic = createLayer("animated", "Organic smoke", "builtin-cloud");
    organic.id = "organic-smoke";
    organic.timing.duration = 2000;
    organic.timing.easing = "constant";
    organic.behavior.wobble = {
      ...organic.behavior.wobble,
      enabled: true,
      x: 24,
      y: 12,
      rotation: 10,
      speed: 1.4,
      style: "organic",
      smoothness: 0.85,
    };

    expect(evaluateLayerAt(organic, 0)[0]).toMatchObject({
      x: 0,
      y: 0,
      rotation: 0,
    });
    const first = evaluateLayerAt(organic, 730)[0];
    const repeated = evaluateLayerAt(organic, 730)[0];
    const adjacent = evaluateLayerAt(organic, 731)[0];
    expect(first).toEqual(repeated);
    expect(Math.abs(first.x)).toBeLessThanOrEqual(24);
    expect(Math.abs(first.y)).toBeLessThanOrEqual(12);
    expect(Math.abs(first.rotation)).toBeLessThanOrEqual(10);
    expect(Math.abs(adjacent.x - first.x)).toBeLessThan(1);

    const otherProject = createEmptyProject("Other seed");
    otherProject.preview.randomSeed = 999;
    otherProject.layers.push(organic);
    expect(evaluateProject(otherProject, 730, null)[0]?.x).not.toBe(first.x);
    expect(describeLayer(organic)).toContain("wanders organically");
  });

  it("slows toward the destination while preserving the route endpoint", () => {
    const regular = createLayer("animated", "Regular", "builtin-ring");
    regular.timing.duration = 1000;
    regular.timing.easing = "constant";
    regular.transform.movementX = 100;
    const slowed = structuredClone(regular);
    slowed.id = "slowed";
    slowed.behavior.physics.drag = 1;

    expect(evaluateLayerAt(slowed, 500)[0]?.x).toBeGreaterThan(
      evaluateLayerAt(regular, 500)[0]?.x ?? Number.POSITIVE_INFINITY,
    );
    expect(evaluateLayerAt(slowed, 1000)[0]?.x).toBeCloseTo(100);
  });
});

describe("spawn placement and stable emitter evaluation", () => {
  function burstPositions(distribution: SpawnDistribution, count = 64) {
    const layer = createLayer(
      "burst",
      `${distribution} burst`,
      "builtin-spark",
    );
    layer.id = `${distribution}-burst`;
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.spawn.count = count;
    layer.spawn.shape = "circle";
    layer.spawn.radius = 100;
    layer.spawn.distribution = distribution;
    return evaluateLayerAt(layer, 0);
  }

  it("places edge copies on the authored circle", () => {
    const radii = burstPositions("edge").map((copy) =>
      Math.hypot(copy.x, copy.y),
    );
    expect(radii.every((radius) => Math.abs(radius - 100) < 0.0001)).toBe(true);
  });

  it("spaces even copies around the authored circle", () => {
    const positions = burstPositions("even", 4);
    expect(positions[0]).toMatchObject({ x: expect.closeTo(0), y: -100 });
    expect(positions[1]).toMatchObject({ x: 100, y: expect.closeTo(0) });
    expect(positions[2]).toMatchObject({ x: expect.closeTo(0), y: 100 });
    expect(positions[3]).toMatchObject({ x: -100, y: expect.closeTo(0) });
  });

  it("clusters copies nearer the center than uniform random placement", () => {
    const meanRadius = (distribution: SpawnDistribution) => {
      const radii = burstPositions(distribution, 250).map((copy) =>
        Math.hypot(copy.x, copy.y),
      );
      return radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
    };
    expect(meanRadius("clustered")).toBeLessThan(meanRadius("random"));
    expect(meanRadius("clustered")).toBeLessThan(50);
  });

  it("uses random directions for emitter copies, not one fixed route", () => {
    const emitter = createLayer("emitter", "Random emitter", "builtin-spark");
    emitter.id = "random-emitter";
    emitter.timing.duration = 1000;
    emitter.timing.easing = "constant";
    emitter.transform.movementX = 100;
    emitter.spawn.count = 1;
    emitter.spawn.intervalMin = 30;
    emitter.spawn.intervalMax = 30;
    emitter.spawn.direction = "random";
    const copies = evaluateLayerAt(emitter, 300).filter(
      (copy) => Math.hypot(copy.x, copy.y) > 1,
    );

    expect(copies.length).toBeGreaterThan(3);
    expect(copies.some((copy) => Math.abs(copy.y) > 1)).toBe(true);
    expect(
      new Set(copies.map((copy) => Math.round(Math.atan2(copy.y, copy.x) * 10)))
        .size,
    ).toBeGreaterThan(2);
  });

  it("keeps global emitter indices stable and does not stop after the old cap", () => {
    const emitter = createLayer("emitter", "Long emitter", "builtin-cloud");
    emitter.id = "stable-emitter";
    emitter.timing.duration = 1000;
    emitter.spawn.count = 1;
    emitter.spawn.maxAlive = 4;
    emitter.spawn.intervalMin = 30;
    emitter.spawn.intervalMax = 30;

    const late = evaluateLayerAt(emitter, 5000);
    const indices = late.map((copy) => Number(copy.key.split(":")[1]));

    expect(late).toHaveLength(4);
    expect(Math.min(...indices)).toBeGreaterThan(100);
    expect(evaluateLayerAt(emitter, 5000)).toEqual(late);
  });

  it("keeps delayed instances alive beyond the nominal cycle boundary", () => {
    const layer = createLayer("animated", "Delayed tail", "builtin-ring");
    layer.id = "delayed-tail";
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.random.delay = 900;

    const hasTail = Array.from(
      { length: 90 },
      (_, index) => 1010 + index * 10,
    ).some((time) => evaluateLayerAt(layer, time).length > 0);
    expect(hasTail).toBe(true);
  });

  it("keeps positive duration variation alive beyond the nominal cycle boundary", () => {
    const hasDurationTail = Array.from({ length: 12 }, (_, index) => {
      const layer = createLayer("animated", "Duration tail", "builtin-ring");
      layer.id = `duration-tail-${index}`;
      layer.timing.duration = 1000;
      layer.timing.easing = "constant";
      layer.random.duration = 900;
      return Array.from(
        { length: 80 },
        (_unused, step) => 1010 + step * 10,
      ).some((time) => evaluateLayerAt(layer, time).length > 0);
    }).some(Boolean);

    expect(hasDurationTail).toBe(true);
  });

  it("applies scale variation to both separate scale axes", () => {
    const layer = createLayer("animated", "Wide random", "builtin-ring");
    layer.id = "separate-scale-random";
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.transform.separateScale = true;
    layer.transform.startScaleX = 2;
    layer.transform.endScaleX = 2;
    layer.transform.startScaleY = 3;
    layer.transform.endScaleY = 3;
    layer.random.startScale = 0.5;
    layer.random.endScale = 0.5;

    const [copy] = evaluateLayerAt(layer, 500);
    expect(copy.scaleX).not.toBeCloseTo(2, 5);
    expect(copy.scaleX - 2).toBeCloseTo(copy.scaleY - 3);
  });
});

describe("runtime-backed export boundary", () => {
  it("omits canvas-only preview preferences and editor visibility state", () => {
    const project = createEmptyProject("Runtime boundary");
    project.preview.background = "custom";
    project.preview.customColor = "#123456";
    project.preview.showGrid = true;
    project.preview.zoom = 2.5;
    project.preview.loop = true;
    const layer = createLayer("animated", "Hidden in editor", "builtin-ring");
    layer.visible = false;
    layer.solo = true;
    project.layers.push(layer);

    const runtime = createRuntimeDefinition(project);
    const serialized = JSON.stringify(runtime);

    expect(runtime.formatVersion).toBe(14);
    expect(runtime.layers).toHaveLength(1);
    expect(runtime.layers[0]).not.toHaveProperty("visible");
    expect(runtime.layers[0]).not.toHaveProperty("solo");
    expect(runtime).not.toHaveProperty("preview");
    expect(runtime).not.toHaveProperty("timeline");
    expect(serialized).not.toContain("#123456");
    expect(serialized).not.toContain("showGrid");
    expect(serialized).not.toContain('"zoom"');
  });

  it("embeds new behavior and color data in the supported Phaser helper", () => {
    const project = createEmptyProject("Exact aura");
    const layer = createLayer("emitter", "Aura motes", "builtin-spark");
    layer.appearance.colorOverLifetime = {
      enabled: true,
      stops: [
        { time: 0, color: "#ffffff" },
        { time: 1, color: "#00ccff" },
      ],
    };
    layer.behavior.pulse.enabled = true;
    layer.behavior.wobble.enabled = true;
    layer.spawn.distribution = "even";
    project.layers.push(layer);

    const code = generatePhaserCode(project);

    expect(code).toContain('"colorOverLifetime"');
    expect(code).toContain('"pulse"');
    expect(code).toContain('"wobble"');
    expect(code).toContain('"distribution": "even"');
    expect(code).toContain("return playVvfx(scene, definition");
  });
});
