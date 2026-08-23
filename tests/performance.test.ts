import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  MAX_STRESS_INSTANCES,
  analyzeProjectPerformance,
  countRecentCreations,
  replicateInstancesForStress,
} from "../src/vfx/performance";

describe("beginner performance estimates", () => {
  it("includes group timing, random tails, trails, and the longest layer", () => {
    const project = createEmptyProject();
    project.preview.duration = 5_000;
    project.groups = [
      { id: "group", name: "Aftermath", x: 0, y: 0, delay: 200 },
    ];
    const layer = createLayer("animated", "Smoke finish", "builtin-cloud");
    layer.groupId = "group";
    layer.timing.delay = 100;
    layer.timing.duration = 1_000;
    layer.random.duration = 100;
    layer.random.delay = 50;
    layer.trail = {
      enabled: true,
      count: 4,
      spacing: 50,
      lifetime: 300,
      opacity: 0.5,
      scaleFalloff: 0.05,
    };
    project.layers = [layer];

    const result = analyzeProjectPerformance(project);

    expect(result.durationMs).toBe(1_750);
    expect(result.longestLayerName).toBe("Smoke finish");
    expect(result.estimatedPeakSprites).toBe(5);
    expect(result.repeatingLayerCount).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("labels repeating pressure and expensive trails as heuristics", () => {
    const project = createEmptyProject();
    project.preview.duration = 3_000;
    const layers = Array.from({ length: 3 }, (_, index) => {
      const layer = createLayer(
        "emitter",
        `Repeating smoke ${index + 1}`,
        "builtin-cloud",
      );
      layer.timing.duration = 1_000;
      layer.spawn.count = 25;
      layer.spawn.intervalMin = 30;
      layer.spawn.intervalMax = 30;
      layer.spawn.maxAlive = 500;
      layer.trail = {
        ...layer.trail,
        enabled: true,
        count: 16,
        spacing: 10,
        lifetime: 5_000,
      };
      return layer;
    });
    project.layers = layers;

    const result = analyzeProjectPerformance(project);

    expect(result.durationMs).toBe(project.preview.duration);
    expect(result.durationIsPreviewWindow).toBe(true);
    expect(result.repeatingLayerCount).toBe(3);
    expect(result.estimatedPeakSprites).toBeGreaterThan(500);
    expect(result.warnings.map((warning) => warning.id)).toEqual(
      expect.arrayContaining([
        "effect-limit",
        expect.stringMatching(/^trail-/),
        "spawn-rate",
        "repeating-layers",
      ]),
    );
    expect(
      result.warnings.every((warning) => warning.evidence === "heuristic"),
    ).toBe(true);
  });

  it("reports an empty effect without pretending the preview length is content", () => {
    const result = analyzeProjectPerformance(createEmptyProject());
    expect(result).toMatchObject({
      durationMs: 0,
      longestLayerName: null,
      estimatedPeakSprites: 0,
      authoredSpritesPerSecond: 0,
    });
  });

  it("warns when experimental rendering passes multiply across sprites", () => {
    const project = createEmptyProject();
    const burst = createLayer("burst", "Glowing burst", "builtin-spark");
    burst.spawn.count = 50;
    burst.appearance.effects.blur.enabled = true;
    burst.appearance.effects.blur.steps = 4;
    burst.appearance.effects.outerGlow.enabled = true;
    project.layers = [burst];

    const result = analyzeProjectPerformance(project);

    expect(result.layers[0]).toMatchObject({
      renderingPassesPerSprite: 9,
      estimatedRenderingPasses: 450,
    });
    expect(result.estimatedRenderingPasses).toBe(450);
    expect(result.warnings.map((warning) => warning.id)).toContain(
      "rendering-effects",
    );
  });

  it("charges noisy erosion as one bounded rendering pass per copy", () => {
    const project = createEmptyProject();
    const burst = createLayer("burst", "Eroding burst", "builtin-spark");
    burst.spawn.count = 250;
    burst.appearance.effects.directionalDissolve.enabled = true;
    burst.appearance.effects.directionalDissolve.pattern = "noise";
    project.layers = [burst];

    const result = analyzeProjectPerformance(project);

    expect(result.layers[0]).toMatchObject({
      estimatedPeakSprites: 250,
      renderingPassesPerSprite: 1,
      estimatedRenderingPasses: 250,
    });
  });

  it("estimates bounded per-copy event fan-out and warns at high pressure", () => {
    const project = createEmptyProject();
    const source = createLayer("burst", "Fragment burst", "builtin-spark");
    source.spawn.count = 250;
    const target = createLayer("animated", "Fragment pop", "builtin-flash");
    target.startMode = "triggered";
    source.events = [
      {
        id: "fragment-finish",
        enabled: true,
        trigger: "copy-finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: target.id,
        chance: 0.5,
        maxTriggers: 200,
      },
    ];
    project.layers = [source, target];

    const moderate = analyzeProjectPerformance(project);

    expect(moderate.layers[0]).toMatchObject({
      estimatedCopyFinishTriggers: 125,
    });
    expect(moderate.estimatedCopyFinishTriggers).toBe(125);
    source.events[0].chance = 1;

    const highPressure = analyzeProjectPerformance(project);

    expect(highPressure.estimatedCopyFinishTriggers).toBe(200);
    expect(highPressure.warnings.map((warning) => warning.id)).toContain(
      "spatial-events",
    );
  });
});

describe("guarded stress preview", () => {
  it("duplicates one evaluator result with unique keys and tiled positions", () => {
    const project = createEmptyProject();
    project.layers = [
      createLayer("animated", "Stress source", "builtin-flash"),
    ];
    const base = evaluateProject(project, 100, null);
    const result = replicateInstancesForStress(base, 10, 820, 470);

    expect(base).toHaveLength(1);
    expect(result).toMatchObject({
      requestedCopies: 10,
      effectiveCopies: 10,
      limited: false,
    });
    expect(result.instances).toHaveLength(10);
    expect(new Set(result.instances.map((instance) => instance.key)).size).toBe(
      10,
    );
    expect(
      new Set(result.instances.map((instance) => instance.x)).size,
    ).toBeGreaterThan(1);
    expect(base[0].key).not.toContain("stress:");
  });

  it("never renders beyond the editor stress budget", () => {
    const project = createEmptyProject();
    project.layers = [
      createLayer("animated", "Stress source", "builtin-flash"),
    ];
    const [sample] = evaluateProject(project, 100, null);
    const base = Array.from({ length: 500 }, (_, index) => ({
      ...sample,
      key: `base-${index}`,
    }));
    const result = replicateInstancesForStress(base, 50, 820, 470);

    expect(result.effectiveCopies).toBe(4);
    expect(result.limited).toBe(true);
    expect(result.instances).toHaveLength(MAX_STRESS_INSTANCES);
  });

  it("forces one clean copy for recording without changing the request", () => {
    const project = createEmptyProject();
    project.layers = [
      createLayer("animated", "Recording source", "builtin-ring"),
    ];
    const base = evaluateProject(project, 100, null);
    const result = replicateInstancesForStress(base, 25, 820, 470, true);

    expect(result).toMatchObject({
      requestedCopies: 25,
      effectiveCopies: 1,
      limited: true,
    });
    expect(result.instances[0]?.key).toBe(base[0]?.key);
  });

  it("counts only sprite creations in the rolling time window", () => {
    expect(countRecentCreations([0, 250, 1_000, 1_250, 1_500], 1_500)).toBe(3);
    expect(countRecentCreations([100, 200], 1_500)).toBe(0);
  });
});
