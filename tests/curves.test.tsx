import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { validateRuntimeDefinition } from "../packages/phaser-runtime/src";
import { runtimeDefinitionToProject } from "../packages/phaser-runtime/src/definition";
import { ValueCurveEditor } from "../src/editor/components/ValueCurveEditor";
import {
  addCurvePoint,
  applyAttractor,
  curveEditRange,
  defaultAttractor,
  defaultEmissionCurve,
  emissionRateAt,
  evaluateCurve,
  integrateCurve,
  moveCurvePoint,
  normalizeAttractor,
  normalizeCurvePoints,
  normalizeEmissionCurve,
  peakEmissionRate,
  removeCurvePoint,
  speedCurveProgress,
} from "../src/vfx/curves";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import { createRuntimeDefinition } from "../src/vfx/exporters";
import { validateProject } from "../src/vfx/serialization";
import type { CurvePoint, VfxProject } from "../src/vfx/types";

afterEach(cleanup);

const ramp: CurvePoint[] = [
  { time: 0, value: 0 },
  { time: 1, value: 2 },
];

describe("curve math", () => {
  it("interpolates and integrates piecewise-linear curves", () => {
    expect(evaluateCurve(ramp, 0.25)).toBeCloseTo(0.5);
    expect(evaluateCurve(ramp, 2)).toBe(2);
    expect(integrateCurve(ramp, 1)).toBeCloseTo(1);
    expect(integrateCurve(ramp, 0.5)).toBeCloseTo(0.25);
    expect(evaluateCurve([], 0.5)).toBe(1);
  });

  it("keeps the total distance while reshaping speed", () => {
    const curve = { enabled: true, points: ramp };
    expect(speedCurveProgress(curve, 0)).toBe(0);
    expect(speedCurveProgress(curve, 1)).toBeCloseTo(1);
    // Accelerating: only a quarter of the way at half time.
    expect(speedCurveProgress(curve, 0.5)).toBeCloseTo(0.25);
    expect(speedCurveProgress({ ...curve, enabled: false }, 0.5)).toBe(0.5);
    const flatZero = {
      enabled: true,
      points: [
        { time: 0, value: 0 },
        { time: 1, value: 0 },
      ],
    };
    expect(speedCurveProgress(flatZero, 0.3)).toBe(0.3);
  });

  it("pulls toward and swirls around the attractor", () => {
    const attractor = { enabled: true, x: 100, y: 0, pull: 1, swirl: 0 };
    expect(applyAttractor(attractor, 0, 0, 1)).toEqual({ x: 100, y: 0 });
    expect(applyAttractor(attractor, 0, 0, 0.5)).toEqual({ x: 50, y: 0 });
    const vortex = { enabled: true, x: 0, y: 0, pull: 0, swirl: 90 };
    const turned = applyAttractor(vortex, 10, 0, 1);
    expect(turned.x).toBeCloseTo(0);
    expect(turned.y).toBeCloseTo(10);
    expect(applyAttractor(defaultAttractor(), 3, 4, 1)).toEqual({ x: 3, y: 4 });
  });

  it("reads emission rate over the curve length and holds the last value", () => {
    const curve = { enabled: true, length: 1000, points: ramp };
    expect(emissionRateAt(curve, 500)).toBeCloseTo(1);
    expect(emissionRateAt(curve, 5000)).toBe(2);
    expect(emissionRateAt(defaultEmissionCurve(), 500)).toBe(1);
    expect(peakEmissionRate(curve)).toBe(2);
    expect(peakEmissionRate(null)).toBe(1);
  });

  it("normalizes untrusted curves and attractors", () => {
    expect(
      normalizeCurvePoints([
        { time: 0.7, value: 9 },
        { time: 0.2, value: -1 },
        { time: "x" },
        "nope",
      ]),
    ).toEqual([
      { time: 0, value: 0 },
      { time: 1, value: 4 },
    ]);
    expect(normalizeCurvePoints(null)).toEqual([
      { time: 0, value: 1 },
      { time: 1, value: 1 },
    ]);
    expect(
      normalizeEmissionCurve({ enabled: true, length: 5 }, 30_000),
    ).toMatchObject({
      enabled: true,
      length: 100,
    });
    expect(
      normalizeAttractor({ enabled: true, pull: 4, swirl: -9999, x: 1e9 }),
    ).toEqual({
      enabled: true,
      x: 4000,
      y: 0,
      pull: 1,
      swirl: -1080,
    });
  });

  it("edits points without breaking order or end times", () => {
    const points: CurvePoint[] = [
      { time: 0, value: 1 },
      { time: 0.5, value: 1 },
      { time: 1, value: 1 },
    ];
    expect(moveCurvePoint(points, 0, 0.4, 9)[0]).toEqual({ time: 0, value: 4 });
    expect(moveCurvePoint(points, 1, 0.999, 2)[1].time).toBeCloseTo(0.99);
    expect(addCurvePoint(points, 0.25, 3).map((point) => point.time)).toEqual([
      0, 0.25, 0.5, 1,
    ]);
    expect(addCurvePoint(points, 0.505, 3)).toHaveLength(3);
    expect(removeCurvePoint(points, 0)).toHaveLength(3);
    expect(removeCurvePoint(points, 1)).toHaveLength(2);
    expect(curveEditRange(points)).toEqual({ min: 0, max: 2.5 });
  });
});

function emitterProject(): VfxProject {
  const project = createEmptyProject("Rate curve");
  project.preview.duration = 4000;
  const emitter = createLayer("emitter", "Embers", "builtin-spark");
  if (emitter.type !== "emitter") throw new Error("expected emitter");
  emitter.spawn.count = 1;
  emitter.spawn.intervalMin = 100;
  emitter.spawn.intervalMax = 100;
  emitter.spawn.maxAlive = 500;
  emitter.timing.duration = 4000;
  emitter.random.delay = 0;
  emitter.random.duration = 0;
  project.layers.push(emitter);
  return project;
}

describe("curves in the engine", () => {
  it("changes how often an emitter emits", () => {
    const steady = emitterProject();
    const shaped = emitterProject();
    const layer = shaped.layers[0];
    if (layer.type !== "emitter") throw new Error("expected emitter");
    layer.spawn.rateCurve = {
      enabled: true,
      length: 1000,
      points: [
        { time: 0, value: 2 },
        { time: 1, value: 0 },
      ],
    };
    const count = (project: VfxProject, time: number) =>
      evaluateProject(project, time, null).length;
    // A 2× opening emits faster than the steady 100 ms rhythm...
    expect(count(shaped, 400)).toBeGreaterThan(count(steady, 400));
    // ...and the rate falls to zero after the curve, so emission stops.
    expect(count(shaped, 3000)).toBe(count(shaped, 3900));
    expect(count(steady, 3900)).toBeGreaterThan(count(steady, 3000));
  });

  it("moves copies along the speed curve and toward the attractor", () => {
    const project = createEmptyProject("Speed");
    const layer = createLayer("animated", "Orb", "builtin-flash");
    layer.transform.movementX = 200;
    layer.transform.movementY = 0;
    layer.timing.duration = 1000;
    layer.timing.easing = "constant";
    layer.random.duration = 0;
    project.layers.push(layer);
    const xAt = (time: number) => evaluateProject(project, time, null)[0].x;
    expect(xAt(500)).toBeCloseTo(100);

    layer.behavior.physics.speedCurve = { enabled: true, points: ramp };
    expect(xAt(500)).toBeCloseTo(50);
    expect(xAt(999)).toBeCloseTo(200, 0);

    layer.behavior.physics.speedCurve.enabled = false;
    layer.behavior.physics.attractor = {
      enabled: true,
      x: 0,
      y: 100,
      pull: 1,
      swirl: 0,
    };
    const end = evaluateProject(project, 999, null)[0];
    expect(end.x).toBeCloseTo(0, 0);
    expect(end.y).toBeCloseTo(100, 0);
  });

  it("travels through Runtime JSON and plays the same in the runtime", () => {
    const project = emitterProject();
    const layer = project.layers[0];
    if (layer.type !== "emitter") throw new Error("expected emitter");
    layer.spawn.rateCurve = {
      enabled: true,
      length: 800,
      points: [
        { time: 0, value: 3 },
        { time: 1, value: 0.5 },
      ],
    };
    layer.behavior.physics.attractor = {
      enabled: true,
      x: 40,
      y: -30,
      pull: 0.5,
      swirl: 180,
    };
    layer.behavior.physics.speedCurve = { enabled: true, points: ramp };
    const definition = createRuntimeDefinition(project);
    const validated = validateRuntimeDefinition(
      JSON.parse(JSON.stringify(definition)),
    );
    expect(validated.ok).toBe(true);
    const runtimeProject = runtimeDefinitionToProject(validated.definition!);
    for (const time of [0, 250, 900, 2000]) {
      expect(evaluateProject(runtimeProject, time, null)).toEqual(
        evaluateProject(project, time, null),
      );
    }
  });

  it("loads older projects without the new settings as disabled", () => {
    const project = emitterProject() as unknown as Record<string, unknown>;
    const [layer] = project.layers as Record<string, Record<string, unknown>>[];
    delete layer.spawn.rateCurve;
    const physics = (layer.behavior as Record<string, Record<string, unknown>>)
      .physics;
    delete physics.speedCurve;
    delete physics.attractor;
    const result = validateProject(project);
    expect(result.ok).toBe(true);
    const loaded = result.project!.layers[0];
    expect(loaded.behavior.physics.speedCurve.enabled).toBe(false);
    expect(loaded.behavior.physics.attractor.enabled).toBe(false);
    if (loaded.type !== "emitter") throw new Error("expected emitter");
    expect(loaded.spawn.rateCurve.enabled).toBe(false);
  });
});

function Harness() {
  const [points, setPoints] = useState<CurvePoint[]>([
    { time: 0, value: 1 },
    { time: 1, value: 1 },
  ]);
  return (
    <>
      <ValueCurveEditor
        label="Speed"
        points={points}
        durationMs={1000}
        help="Higher points move faster."
        onChange={setPoints}
      />
      <output data-testid="points">{JSON.stringify(points)}</output>
    </>
  );
}

describe("ValueCurveEditor", () => {
  it("adds, nudges, and removes points", () => {
    render(<Harness />);
    const plot = document.querySelector<HTMLElement>(".curve-graph__plot")!;
    plot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.pointerDown(plot, { clientX: 50, clientY: 20 });
    const points = () =>
      JSON.parse(screen.getByTestId("points").textContent ?? "[]");
    expect(points()).toHaveLength(3);
    expect(points()[1].time).toBeCloseTo(0.5);
    expect(points()[1].value).toBeCloseTo(2);

    const middle = screen.getByRole("button", { name: /Speed point 2 of 3/ });
    fireEvent.keyDown(middle, { key: "ArrowDown" });
    expect(points()[1].value).toBeCloseTo(1.95);
    fireEvent.keyDown(middle, { key: "Delete" });
    expect(points()).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Speed point 1 of 2: 1× at 0 ms" }),
    ).toBeInTheDocument();
  });
});
