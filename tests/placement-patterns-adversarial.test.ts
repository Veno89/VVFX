import { describe, expect, it } from "vitest";
import { runtimeDefinitionToProject } from "../packages/phaser-runtime/src/definition";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  createRuntimeDefinition,
  generateStandalonePhaserCode,
} from "../src/vfx/exporters";
import { evaluateSpawnOffset } from "../src/vfx/instanceEvaluation";
import { analyzeProjectPerformance } from "../src/vfx/performance";
import { validateProject } from "../src/vfx/serialization";

const pointKey = ({ x, y }: { x: number; y: number }) =>
  `${x.toFixed(8)}:${y.toFixed(8)}`;

describe("adversarial stratified placement", () => {
  it("is deterministic, finite, and bounded for uneven rectangular grids", () => {
    const project = createEmptyProject("Stratified rectangle");
    const layer = createLayer("burst", "Samples", "builtin-spark");
    layer.spawn = {
      ...layer.spawn,
      count: 97,
      shape: "rectangle",
      distribution: "stratified",
      width: 301,
      height: 79,
      stratifiedJitter: 1,
    };

    const evaluate = () =>
      Array.from({ length: layer.spawn.count }, (_, copyIndex) =>
        evaluateSpawnOffset(project, layer, 10_000 + copyIndex, copyIndex, 91),
      );
    const first = evaluate();

    expect(evaluate()).toEqual(first);
    expect(new Set(first.map((point) => point && pointKey(point))).size).toBe(
      layer.spawn.count,
    );
    for (const point of first) {
      expect(point).not.toBeNull();
      expect(Number.isFinite(point?.x)).toBe(true);
      expect(Number.isFinite(point?.y)).toBe(true);
      expect(Math.abs(point?.x ?? Infinity)).toBeLessThanOrEqual(
        layer.spawn.width / 2,
      );
      expect(Math.abs(point?.y ?? Infinity)).toBeLessThanOrEqual(
        layer.spawn.height / 2,
      );
    }
  });

  it("keeps maximum-jitter circle samples inside the authored radius", () => {
    const project = createEmptyProject("Stratified circle");
    const layer = createLayer("burst", "Samples", "builtin-spark");
    layer.spawn = {
      ...layer.spawn,
      count: 250,
      shape: "circle",
      distribution: "stratified",
      radius: 93,
      stratifiedJitter: 1,
    };

    const points = Array.from({ length: layer.spawn.count }, (_, copyIndex) =>
      evaluateSpawnOffset(project, layer, 20_000 + copyIndex, copyIndex, 321),
    );

    expect(points).toEqual(
      Array.from({ length: layer.spawn.count }, (_, copyIndex) =>
        evaluateSpawnOffset(project, layer, 20_000 + copyIndex, copyIndex, 321),
      ),
    );
    for (const point of points) {
      expect(point).not.toBeNull();
      expect(
        Math.hypot(point?.x ?? Infinity, point?.y ?? Infinity),
      ).toBeLessThanOrEqual(layer.spawn.radius + Number.EPSILON);
    }

    layer.spawn.count = 1;
    layer.spawn.radius = 0;
    const zeroRadius = evaluateSpawnOffset(project, layer, 1, 0, 2);
    expect(zeroRadius).not.toBeNull();
    expect(
      Math.hypot(zeroRadius?.x ?? Infinity, zeroRadius?.y ?? Infinity),
    ).toBe(0);
    expect(Number.isFinite(zeroRadius?.angle)).toBe(true);
  });
});

describe("adversarial multi-cluster placement", () => {
  it("shares stable clump anchors within a batch without leaving bounds", () => {
    const project = createEmptyProject("Rectangle clusters");
    const layer = createLayer("burst", "Clumps", "builtin-spark");
    layer.spawn = {
      ...layer.spawn,
      count: 12,
      shape: "rectangle",
      distribution: "clusters",
      width: 200,
      height: 80,
      clusterCount: 3,
      clusterSpread: 0,
      direction: "fixed",
      directionAngle: 0,
      directionSpread: 0,
    };

    const batch = (batchSeed: number) =>
      Array.from({ length: layer.spawn.count }, (_, copyIndex) =>
        evaluateSpawnOffset(
          project,
          layer,
          30_000 + copyIndex,
          copyIndex,
          batchSeed,
        ),
      );
    const first = batch(444);

    expect(batch(444)).toEqual(first);
    for (let copyIndex = 3; copyIndex < first.length; copyIndex += 1)
      expect(first[copyIndex]).toEqual(first[copyIndex % 3]);
    expect(new Set(first.map((point) => point && pointKey(point))).size).toBe(
      3,
    );
    expect(batch(445).slice(0, 3)).not.toEqual(first.slice(0, 3));
    for (const point of first) {
      expect(Math.abs(point?.x ?? Infinity)).toBeLessThanOrEqual(100);
      expect(Math.abs(point?.y ?? Infinity)).toBeLessThanOrEqual(40);
    }
  });

  it("keeps circle, line, and negative closed-arc clumps inside their regions", () => {
    const project = createEmptyProject("Bounded clusters");
    const layer = createLayer("burst", "Clumps", "builtin-spark");
    layer.spawn = {
      ...layer.spawn,
      count: 25,
      shape: "circle",
      distribution: "clusters",
      radius: 75,
      clusterCount: 8,
      clusterSpread: 0.5,
    };

    const offsets = () =>
      Array.from({ length: layer.spawn.count }, (_, copyIndex) =>
        evaluateSpawnOffset(project, layer, 40_000 + copyIndex, copyIndex, 73),
      );
    for (const point of offsets())
      expect(
        Math.hypot(point?.x ?? Infinity, point?.y ?? Infinity),
      ).toBeLessThanOrEqual(75 + Number.EPSILON);

    layer.spawn.shape = "line";
    layer.spawn.lineLength = 240;
    layer.spawn.lineAngle = 37;
    for (const point of offsets())
      expect(
        Math.hypot(point?.x ?? Infinity, point?.y ?? Infinity),
      ).toBeLessThanOrEqual(120 + Number.EPSILON);

    layer.spawn.shape = "arc";
    layer.spawn.radius = 61;
    layer.spawn.arcStartAngle = 135;
    layer.spawn.arcSweep = -360;
    for (const point of offsets())
      expect(
        Math.hypot(point?.x ?? Infinity, point?.y ?? Infinity),
      ).toBeCloseTo(61, 8);
  });

  it("keeps each emitter emission coherent but gives the next emission new anchors", () => {
    const project = createEmptyProject("Emitter clusters");
    const layer = createLayer("emitter", "Repeating clumps", "builtin-spark");
    layer.spawn = {
      ...layer.spawn,
      count: 6,
      intervalMin: 100,
      intervalMax: 100,
      maxAlive: 30,
      shape: "rectangle",
      distribution: "clusters",
      width: 160,
      height: 90,
      clusterCount: 3,
      clusterSpread: 0,
      direction: "fixed",
      directionAngle: 0,
      directionSpread: 0,
    };
    layer.timing.duration = 1_000;
    project.layers = [layer];

    const instances = evaluateProject(project, 100, null);
    expect(instances).toHaveLength(12);
    const firstBatch = instances.slice(0, 6).map(pointKey);
    const secondBatch = instances.slice(6, 12).map(pointKey);

    expect(firstBatch[0]).toBe(firstBatch[3]);
    expect(firstBatch[1]).toBe(firstBatch[4]);
    expect(firstBatch[2]).toBe(firstBatch[5]);
    expect(secondBatch[0]).toBe(secondBatch[3]);
    expect(secondBatch[1]).toBe(secondBatch[4]);
    expect(secondBatch[2]).toBe(secondBatch[5]);
    expect(secondBatch.slice(0, 3)).not.toEqual(firstBatch.slice(0, 3));
  });
});

describe("placement parity and migration", () => {
  it("is independent of seek order and round-trips exactly through Runtime JSON", () => {
    const project = createEmptyProject("Seekable clusters");
    const layer = createLayer("emitter", "Seekable", "builtin-spark");
    layer.spawn = {
      ...layer.spawn,
      count: 7,
      intervalMin: 90,
      intervalMax: 130,
      maxAlive: 100,
      shape: "circle",
      distribution: "clusters",
      radius: 70,
      clusterCount: 4,
      clusterSpread: 0.23,
    };
    layer.timing.duration = 800;
    project.layers = [layer];

    const at430 = evaluateProject(project, 430, null);
    evaluateProject(project, 1_200, null);
    evaluateProject(project, 17, null);
    expect(evaluateProject(project, 430, null)).toEqual(at430);

    const definition = createRuntimeDefinition(project);
    const restored = runtimeDefinitionToProject(definition);
    expect(definition.formatVersion).toBe(14);
    expect(definition.layers[0]?.spawn).toMatchObject({
      distribution: "clusters",
      clusterCount: 4,
      clusterSpread: 0.23,
      stratifiedJitter: 0.65,
    });
    expect(evaluateProject(restored, 430, null)).toEqual(at430);
  });

  it("does not change sprite or render-pass estimates merely by changing placement", () => {
    const project = createEmptyProject("Placement cost");
    const layer = createLayer("burst", "Same copies", "builtin-spark");
    layer.spawn.count = 120;
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "random";
    project.layers = [layer];
    const baseline = analyzeProjectPerformance(project);

    layer.spawn.distribution = "stratified";
    expect(analyzeProjectPerformance(project)).toEqual(baseline);
    layer.spawn.distribution = "clusters";
    expect(analyzeProjectPerformance(project)).toEqual(baseline);
  });

  it("keeps the standalone export honest while passing the full placement config", () => {
    const project = createEmptyProject("Standalone clusters");
    const layer = createLayer("burst", "Clumps", "builtin-spark");
    layer.spawn.shape = "rectangle";
    layer.spawn.distribution = "clusters";
    layer.spawn.clusterCount = 6;
    layer.spawn.clusterSpread = 0.31;
    project.layers = [layer];

    const code = generateStandalonePhaserCode(project);
    expect(code).toContain("Implement spawnLayer below");
    expect(code).toContain(
      "Runtime JSON + @vvfx/phaser-runtime remains the exact path",
    );
    expect(code).toContain('"distribution":"clusters"');
    expect(code).toContain('"clusterCount":6');
    expect(code).toContain('"clusterSpread":0.31');
  });

  it("adds bounded defaults to v13 files and rejects unsupported shape combinations", () => {
    const legacy = createEmptyProject("Legacy placement") as unknown as Record<
      string,
      unknown
    >;
    legacy.formatVersion = 13;
    const layer = createLayer(
      "burst",
      "Legacy",
      "builtin-spark",
    ) as unknown as Record<string, unknown>;
    const spawn = layer.spawn as Record<string, unknown>;
    delete spawn.stratifiedJitter;
    delete spawn.clusterCount;
    delete spawn.clusterSpread;
    (legacy.layers as Array<Record<string, unknown>>).push(layer);

    const migrated = validateProject(legacy);
    expect(migrated.ok).toBe(true);
    expect(migrated.project?.formatVersion).toBe(16);
    expect(migrated.project?.layers[0]?.spawn).toMatchObject({
      stratifiedJitter: 0.65,
      clusterCount: 3,
      clusterSpread: 0.18,
    });

    spawn.shape = "line";
    spawn.distribution = "stratified";
    spawn.stratifiedJitter = 99;
    spawn.clusterCount = 99;
    spawn.clusterSpread = -4;
    const clamped = validateProject(legacy);
    expect(clamped.ok).toBe(true);
    expect(clamped.project?.layers[0]?.spawn).toMatchObject({
      distribution: "random",
      stratifiedJitter: 1,
      clusterCount: 8,
      clusterSpread: 0,
    });
  });
});
