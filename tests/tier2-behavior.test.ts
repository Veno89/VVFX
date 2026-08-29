import { describe, expect, it } from "vitest";
import {
  behaviorEnvelopeWeight,
  integratedBehaviorEnvelope,
} from "../src/vfx/behaviors";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import { createRuntimeDefinition } from "../src/vfx/exporters";
import { validateProject } from "../src/vfx/serialization";
import { runtimeDefinitionToProject } from "../packages/phaser-runtime/src/definition";

describe("Tier 2 structured spawn regions", () => {
  it("places even copies across both endpoints of a rotated line", () => {
    const project = createEmptyProject("Line spawn");
    const line = createLayer("burst", "Line sparks", "builtin-spark");
    line.spawn = {
      ...line.spawn,
      count: 3,
      shape: "line",
      distribution: "even",
      lineLength: 100,
      lineAngle: 0,
    };
    project.layers.push(line);

    const positions = evaluateProject(project, 0, null)
      .map(({ x, y }) => ({ x, y }))
      .sort((left, right) => left.x - right.x);
    expect(positions).toEqual([
      { x: -50, y: 0 },
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);

    line.spawn.lineAngle = 90;
    const vertical = evaluateProject(project, 0, null)
      .map(({ x, y }) => ({ x, y }))
      .sort((left, right) => left.y - right.y);
    expect(vertical[0].x).toBeCloseTo(0);
    expect(vertical[0].y).toBeCloseTo(-50);
    expect(vertical[2].x).toBeCloseTo(0);
    expect(vertical[2].y).toBeCloseTo(50);
  });

  it("places an open arc on both authored endpoints without duplicating a closed ring", () => {
    const project = createEmptyProject("Arc spawn");
    const arc = createLayer("burst", "Arc sparks", "builtin-spark");
    arc.spawn = {
      ...arc.spawn,
      count: 3,
      shape: "arc",
      distribution: "even",
      radius: 100,
      arcStartAngle: -90,
      arcSweep: 180,
    };
    project.layers.push(arc);

    const open = evaluateProject(project, 0, null);
    expect(open[0]).toMatchObject({ y: -100 });
    expect(open[0].x).toBeCloseTo(0);
    expect(open[1]).toMatchObject({ x: 100 });
    expect(open[1].y).toBeCloseTo(0);
    expect(open[2]).toMatchObject({ y: 100 });
    expect(open[2].x).toBeCloseTo(0);

    arc.spawn.count = 4;
    arc.spawn.arcStartAngle = 0;
    arc.spawn.arcSweep = 360;
    const closed = evaluateProject(project, 0, null);
    expect(closed).toHaveLength(4);
    expect(
      new Set(closed.map(({ x, y }) => `${x.toFixed(4)}:${y.toFixed(4)}`)).size,
    ).toBe(4);
  });

  it("aligns artwork from its authored forward angle with stable variation", () => {
    const project = createEmptyProject("Aligned sparks");
    const spark = createLayer("burst", "Up-facing spark", "builtin-spark");
    spark.spawn = {
      ...spark.spawn,
      count: 1,
      direction: "fixed",
      directionAngle: 0,
      directionSpread: 0,
      rotateToDirection: true,
      artworkForwardAngle: -90,
      alignmentVariation: 0,
    };
    spark.transform.rotation = 10;
    spark.transform.movementX = 100;
    project.layers.push(spark);
    expect(evaluateProject(project, 0, null)[0]?.rotation).toBe(100);

    spark.spawn.alignmentVariation = 20;
    const first = evaluateProject(project, 0, null)[0]?.rotation;
    expect(evaluateProject(project, 0, null)[0]?.rotation).toBe(first);
    expect(first).toBeGreaterThanOrEqual(80);
    expect(first).toBeLessThanOrEqual(120);
  });
});

describe("Tier 2 per-copy behavior envelopes", () => {
  const middle = {
    enabled: true,
    start: 0.2,
    attackEnd: 0.4,
    releaseStart: 0.6,
    end: 0.8,
  };

  it("fades strength through ordered stages inside one lifetime", () => {
    expect(behaviorEnvelopeWeight(middle, 0.1)).toBe(0);
    expect(behaviorEnvelopeWeight(middle, 0.3)).toBeCloseTo(0.5);
    expect(behaviorEnvelopeWeight(middle, 0.5)).toBe(1);
    expect(behaviorEnvelopeWeight(middle, 0.7)).toBeCloseTo(0.5);
    expect(behaviorEnvelopeWeight(middle, 0.9)).toBe(0);
  });

  it("integrates a releasing gravity force without reversing position", () => {
    const project = createEmptyProject("Gravity envelope");
    const debris = createLayer("animated", "Debris", "builtin-spark");
    debris.timing.duration = 1000;
    debris.timing.easing = "constant";
    debris.behavior.physics.gravity = 200;
    debris.behavior.physics.gravityEnvelope = {
      enabled: true,
      start: 0,
      attackEnd: 0,
      releaseStart: 0.5,
      end: 0.75,
    };
    project.layers.push(debris);

    const beforeReleaseEnd = evaluateProject(project, 749, null)[0]?.y ?? 0;
    const atReleaseEnd = evaluateProject(project, 750, null)[0]?.y ?? 0;
    const afterRelease = evaluateProject(project, 751, null)[0]?.y ?? 0;
    const atLifetimeEnd = evaluateProject(project, 1000, null)[0]?.y ?? 0;
    expect(atReleaseEnd).toBeGreaterThan(beforeReleaseEnd);
    expect(afterRelease).toBeGreaterThan(atReleaseEnd);
    expect(atLifetimeEnd).toBeGreaterThan(afterRelease);
    expect(
      integratedBehaviorEnvelope(debris.behavior.physics.gravityEnvelope, 1),
    ).toBeGreaterThan(0);
  });

  it("round-trips exact Tier 2 behavior through Runtime JSON", () => {
    const project = createEmptyProject("Runtime Tier 2");
    const arc = createLayer("burst", "Enveloped arc", "builtin-spark");
    arc.spawn = {
      ...arc.spawn,
      shape: "arc",
      distribution: "clustered",
      arcStartAngle: -120,
      arcSweep: 240,
      artworkForwardAngle: -90,
      alignmentVariation: 12,
      rotateToDirection: true,
    };
    arc.behavior.flicker.enabled = true;
    arc.behavior.flicker.envelope = { ...middle };
    project.layers.push(arc);
    const definition = createRuntimeDefinition(project);
    const restored = runtimeDefinitionToProject(definition);
    expect(definition.formatVersion).toBe(16);
    expect(evaluateProject(restored, 300, null)).toEqual(
      evaluateProject(project, 300, null),
    );
  });

  it("migrates v11 sideways alignment and adds safe disabled envelopes", () => {
    const project = createEmptyProject("Legacy alignment") as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 11;
    const layers = project.layers as Array<Record<string, unknown>>;
    const legacy = createLayer(
      "burst",
      "Legacy vertical spark",
      "builtin-spark",
    ) as unknown as Record<string, unknown>;
    const spawn = legacy.spawn as Record<string, unknown>;
    delete spawn.artworkForwardAngle;
    delete spawn.alignmentVariation;
    spawn.rotateSideways = true;
    const behavior = legacy.behavior as Record<string, Record<string, unknown>>;
    delete behavior.pulse.envelope;
    delete behavior.flicker.envelope;
    delete behavior.wobble.envelope;
    delete behavior.physics.gravityEnvelope;
    layers.push(legacy);

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(18);
    const migrated = result.project?.layers[0];
    if (!migrated || migrated.type !== "burst")
      throw new Error("Missing migrated burst");
    expect(migrated.spawn.artworkForwardAngle).toBe(-90);
    expect(migrated.spawn.alignmentVariation).toBe(0);
    expect(migrated.behavior.pulse.envelope.enabled).toBe(false);
    expect(migrated.behavior.physics.gravityEnvelope.enabled).toBe(false);
  });
});
