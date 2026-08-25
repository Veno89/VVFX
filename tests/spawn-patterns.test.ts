import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  evaluateSpawnOffset,
  layerInstanceSeed,
} from "../src/vfx/instanceEvaluation";
import { createRuntimeDefinition } from "../src/vfx/exporters";
import { validateProject } from "../src/vfx/serialization";
import type { SpawnLayer, VfxProject } from "../src/vfx/types";
import {
  runtimeDefinitionToProject,
  validateRuntimeDefinition,
} from "../packages/phaser-runtime/src/definition";

function placementOffsets(
  project: VfxProject,
  layer: SpawnLayer,
  batchBase = 0,
) {
  const count = Math.max(
    1,
    Math.min(
      layer.type === "emitter" ? 25 : 250,
      Math.floor(layer.spawn.count),
    ),
  );
  const batchSeed = layerInstanceSeed(project, layer, 0, batchBase);
  return Array.from({ length: count }, (_, copyIndex) => {
    const seed = layerInstanceSeed(project, layer, 0, batchBase + copyIndex);
    const offset = evaluateSpawnOffset(
      project,
      layer,
      seed,
      copyIndex,
      batchSeed,
    );
    if (!offset) throw new Error("Expected a geometric spawn offset.");
    return offset;
  });
}

describe("stratified interior placement", () => {
  it("uses one tidy, aspect-aware rectangle cell per copy at zero jitter", () => {
    const project = createEmptyProject("Stratified box");
    const layer = createLayer("burst", "Coverage", "builtin-spark");
    layer.spawn.count = 6;
    layer.spawn.shape = "rectangle";
    layer.spawn.distribution = "stratified";
    layer.spawn.width = 120;
    layer.spawn.height = 60;
    layer.spawn.stratifiedJitter = 0;

    const tidy = placementOffsets(project, layer);
    [
      [-40, -15],
      [0, -15],
      [40, -15],
      [-40, 15],
      [0, 15],
      [40, 15],
    ].forEach(([x, y], index) => {
      expect(tidy[index].x).toBeCloseTo(x, 10);
      expect(tidy[index].y).toBeCloseTo(y, 10);
    });

    layer.spawn.stratifiedJitter = 1;
    for (const offset of placementOffsets(project, layer)) {
      expect(offset.x).toBeGreaterThanOrEqual(-60);
      expect(offset.x).toBeLessThanOrEqual(60);
      expect(offset.y).toBeGreaterThanOrEqual(-30);
      expect(offset.y).toBeLessThanOrEqual(30);
    }
  });

  it("uses equal-area circle strata and remains deterministic", () => {
    const project = createEmptyProject("Stratified circle");
    const layer = createLayer("burst", "Filled aura", "builtin-ring");
    layer.spawn.count = 8;
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "stratified";
    layer.spawn.radius = 100;
    layer.spawn.stratifiedJitter = 0;

    const first = placementOffsets(project, layer);
    expect(placementOffsets(project, layer)).toEqual(first);
    first.forEach((offset, index) =>
      expect((offset.x ** 2 + offset.y ** 2) / 100 ** 2).toBeCloseTo(
        (index + 0.5) / 8,
        10,
      ),
    );
  });
});

describe("shared multi-cluster placement", () => {
  it("balances copies across stable batch anchors and changes the next batch", () => {
    const project = createEmptyProject("Three clumps");
    const layer = createLayer("burst", "Ember clumps", "builtin-spark");
    layer.spawn.count = 12;
    layer.spawn.shape = "rectangle";
    layer.spawn.distribution = "clusters";
    layer.spawn.width = 200;
    layer.spawn.height = 100;
    layer.spawn.clusterCount = 3;
    layer.spawn.clusterSpread = 0;

    const firstBatch = placementOffsets(project, layer);
    for (let index = 0; index < 3; index += 1) {
      expect(firstBatch[index + 3]).toEqual(firstBatch[index]);
      expect(firstBatch[index + 6]).toEqual(firstBatch[index]);
      expect(firstBatch[index + 9]).toEqual(firstBatch[index]);
    }
    expect(
      new Set(firstBatch.map(({ x, y }) => `${x.toFixed(6)}:${y.toFixed(6)}`))
        .size,
    ).toBe(3);
    expect(placementOffsets(project, layer, 12)).not.toEqual(firstBatch);
  });

  it("keeps loose rectangle, circle, line, and closed-arc clumps in bounds", () => {
    const project = createEmptyProject("Bounded clumps");
    const layer = createLayer("burst", "Clumps", "builtin-spark");
    layer.spawn.count = 250;
    layer.spawn.distribution = "clusters";
    layer.spawn.clusterCount = 8;
    layer.spawn.clusterSpread = 0.5;

    layer.spawn.shape = "rectangle";
    layer.spawn.width = 300;
    layer.spawn.height = 80;
    for (const offset of placementOffsets(project, layer)) {
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(150);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(40);
    }

    layer.spawn.shape = "circle";
    layer.spawn.radius = 90;
    for (const offset of placementOffsets(project, layer))
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(90);

    layer.spawn.shape = "line";
    layer.spawn.lineLength = 240;
    layer.spawn.lineAngle = 30;
    const lineAngle = (30 * Math.PI) / 180;
    for (const offset of placementOffsets(project, layer)) {
      expect(
        Math.abs(
          offset.x * Math.sin(lineAngle) - offset.y * Math.cos(lineAngle),
        ),
      ).toBeLessThan(0.000001);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(120);
    }

    layer.spawn.shape = "arc";
    layer.spawn.arcStartAngle = 80;
    layer.spawn.arcSweep = -360;
    layer.spawn.radius = 70;
    for (const offset of placementOffsets(project, layer))
      expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(70, 8);
  });

  it("replays identical positions on direct seeks", () => {
    const project = createEmptyProject("Seekable clumps");
    const layer = createLayer("burst", "Dust pockets", "builtin-cloud");
    layer.spawn.count = 24;
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "clusters";
    layer.spawn.clusterCount = 4;
    project.layers = [layer];

    expect(evaluateProject(project, 200, null)).toEqual(
      evaluateProject(project, 200, null),
    );
  });
});

describe("richer placement migration and runtime parity", () => {
  it("migrates v13 defaults, clamps fields, and rejects unsupported pairings", () => {
    const legacy = createEmptyProject("Legacy placement") as unknown as Record<
      string,
      unknown
    >;
    legacy.formatVersion = 13;
    const legacyLayer = createLayer("burst", "Legacy", "builtin-spark");
    const legacySpawn = legacyLayer.spawn as unknown as Record<string, unknown>;
    delete legacySpawn.stratifiedJitter;
    delete legacySpawn.clusterCount;
    delete legacySpawn.clusterSpread;
    legacy.layers = [legacyLayer];

    const migrated = validateProject(legacy);
    expect(migrated.project?.formatVersion).toBe(17);
    const migratedLayer = migrated.project?.layers[0];
    expect(migratedLayer?.spawn).toMatchObject({
      stratifiedJitter: 0.65,
      clusterCount: 3,
      clusterSpread: 0.18,
    });

    const raw = JSON.parse(
      JSON.stringify(createEmptyProject("Normalization")),
    ) as Record<string, unknown>;
    const layer = createLayer("burst", "Raw", "builtin-spark");
    layer.spawn.shape = "rectangle";
    layer.spawn.distribution = "clusters";
    layer.spawn.stratifiedJitter = 5;
    layer.spawn.clusterCount = 99;
    layer.spawn.clusterSpread = -1;
    raw.layers = [layer];
    const normalized = validateProject(raw).project?.layers[0];
    expect(normalized?.spawn).toMatchObject({
      distribution: "clusters",
      stratifiedJitter: 1,
      clusterCount: 8,
      clusterSpread: 0,
    });

    (raw.assets as unknown[]).push({
      id: "normalization-mask",
      name: "Normalization mask",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
      spriteSheet: null,
      atlasFrame: null,
      alphaMask: { columns: 1, rows: 1, alpha: [255] },
    });
    layer.spawn.maskAssetId = "normalization-mask";

    for (const [shape, distribution, expected] of [
      ["point", "clusters", "random"],
      ["mask", "stratified", "random"],
      ["line", "stratified", "random"],
      ["arc", "edge", "even"],
    ] as const) {
      layer.spawn.shape = shape;
      layer.spawn.distribution = distribution;
      raw.layers = [layer];
      expect(validateProject(raw).project?.layers[0].spawn?.distribution).toBe(
        expected,
      );
    }
  });

  it("round-trips exact positions through runtime JSON v12", () => {
    const project = createEmptyProject("Runtime clusters");
    const layer = createLayer("burst", "Runtime dust", "builtin-cloud");
    layer.spawn.count = 20;
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "clusters";
    layer.spawn.clusterCount = 5;
    layer.spawn.clusterSpread = 0.22;
    project.layers = [layer];

    const definition = createRuntimeDefinition(project);
    expect(definition.formatVersion).toBe(15);
    expect(definition.layers[0].spawn).toMatchObject({
      distribution: "clusters",
      clusterCount: 5,
      clusterSpread: 0.22,
    });
    expect(validateRuntimeDefinition(definition).ok).toBe(true);
    expect(
      evaluateProject(runtimeDefinitionToProject(definition), 200, null),
    ).toEqual(evaluateProject(project, 200, null));
  });

  it("keeps the maximum burst path bounded to the existing 250-copy cap", () => {
    const project = createEmptyProject("Bounded pattern");
    const layer = createLayer("burst", "Maximum clumps", "builtin-spark");
    layer.spawn.count = 250;
    layer.spawn.shape = "rectangle";
    layer.spawn.distribution = "clusters";
    layer.spawn.clusterCount = 8;
    project.layers = [layer];

    expect(evaluateProject(project, 0, null)).toHaveLength(250);
  });
});
