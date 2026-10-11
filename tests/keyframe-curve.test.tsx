import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { KeyframeCurveGraph } from "../src/editor/components/KeyframeCurveGraph";
import { createLayer } from "../src/vfx/defaults";
import {
  curveProperties,
  curveRange,
  dragCurvePoint,
  formatCurveValue,
  sampleCurve,
  withCurveValue,
} from "../src/vfx/keyframeCurve";
import { MAX_KEYFRAMES } from "../src/vfx/keyframes";
import type { KeyframeSettings, TransformKeyframe } from "../src/vfx/types";

afterEach(cleanup);

const frames = (): TransformKeyframe[] => [
  { time: 0, scaleX: 0.5, scaleY: 0.5, opacity: 1, rotation: 0 },
  { time: 0.4, scaleX: 1.6, scaleY: 1.6, opacity: 1, rotation: 90 },
  { time: 1, scaleX: 1, scaleY: 1, opacity: 0, rotation: 180 },
];

const settings = (): KeyframeSettings => ({
  enabled: true,
  initialized: true,
  frames: frames(),
});

describe("keyframe curve model", () => {
  it("lists properties for uniform and separate scale", () => {
    expect(curveProperties(false)).toEqual(["size", "opacity", "rotation"]);
    expect(curveProperties(true)).toEqual([
      "width",
      "height",
      "opacity",
      "rotation",
    ]);
  });

  it("fits a range with room above the largest value", () => {
    expect(curveRange(frames(), "opacity")).toEqual({ min: 0, max: 1 });
    expect(curveRange(frames(), "size")).toEqual({ min: 0, max: 2 });
    expect(curveRange(frames(), "rotation")).toEqual({ min: -270, max: 270 });
    expect(formatCurveValue("size", 1.25)).toBe("125%");
    expect(formatCurveValue("rotation", 44.6)).toBe("45°");
  });

  it("samples exactly through every point with linear easing", () => {
    const samples = sampleCurve(
      settings(),
      { easing: "constant", customEasing: { x1: 0, y1: 0, x2: 1, y2: 1 } },
      "size",
      10,
    );
    expect(samples).toHaveLength(11);
    expect(samples[0].value).toBeCloseTo(0.5);
    expect(samples[10].value).toBeCloseTo(1);
    expect(samples[4].value).toBeCloseTo(1.6);
  });

  it("moves only middle points in time and clamps values", () => {
    const moved = dragCurvePoint(frames(), 1, "opacity", 0.99, 2);
    expect(moved[1].time).toBeCloseTo(0.99);
    expect(moved[1].opacity).toBe(1);
    const ends = dragCurvePoint(frames(), 0, "size", 0.5, -1);
    expect(ends[0]).toMatchObject({ time: 0, scaleX: 0, scaleY: 0 });
    expect(withCurveValue(frames()[2], "width", 9)).toMatchObject({
      scaleX: 4,
      scaleY: 1,
    });
    expect(withCurveValue(frames()[2], "rotation", 5000).rotation).toBe(1080);
  });
});

function Harness({ initial }: { initial: KeyframeSettings }) {
  const [keyframes, setKeyframes] = useState(initial);
  const layer = createLayer("animated", "Flash", "builtin-flash");
  return (
    <>
      <KeyframeCurveGraph
        keyframes={keyframes}
        transform={layer.transform}
        timing={{ ...layer.timing, duration: 1000 }}
        onChange={setKeyframes}
      />
      <output data-testid="frames">{JSON.stringify(keyframes.frames)}</output>
    </>
  );
}

const currentFrames = (): TransformKeyframe[] =>
  JSON.parse(screen.getByTestId("frames").textContent ?? "[]");

function stubPlot() {
  const plot = document.querySelector<HTMLElement>(".curve-graph__plot")!;
  plot.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
    }) as DOMRect;
  return plot;
}

describe("KeyframeCurveGraph", () => {
  it("labels each point and switches the value it shows", () => {
    render(<Harness initial={settings()} />);
    expect(
      screen.getByRole("button", { name: "Size point 2 of 3: 160% at 400 ms" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Rotation" }));
    expect(
      screen.getByRole("button", {
        name: "Rotation point 3 of 3: 180° at 1000 ms",
      }),
    ).toBeInTheDocument();
  });

  it("drags a point in time and value", () => {
    render(<Harness initial={settings()} />);
    const plot = stubPlot();
    const point = screen.getByRole("button", { name: /Size point 2/ });
    fireEvent.pointerDown(point, { pointerId: 1, clientX: 80, clientY: 20 });
    fireEvent.pointerMove(plot, { pointerId: 1, clientX: 120, clientY: 50 });
    fireEvent.pointerUp(plot, { pointerId: 1 });
    expect(currentFrames()[1].time).toBeCloseTo(0.6);
    // Range 0–200% frozen at drag start: halfway down is 100%.
    expect(currentFrames()[1].scaleX).toBeCloseTo(1);
  });

  it("adds a point where the graph is clicked, up to the limit", () => {
    render(<Harness initial={settings()} />);
    const plot = stubPlot();
    fireEvent.pointerDown(plot, { clientX: 160, clientY: 75 });
    expect(currentFrames()).toHaveLength(4);
    expect(currentFrames()[2].time).toBeCloseTo(0.8);
    expect(currentFrames()[2].scaleX).toBeCloseTo(0.5);

    const full: KeyframeSettings = {
      ...settings(),
      frames: Array.from({ length: MAX_KEYFRAMES }, (_, index) => ({
        time: index / (MAX_KEYFRAMES - 1),
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        rotation: 0,
      })),
    };
    cleanup();
    render(<Harness initial={full} />);
    fireEvent.pointerDown(stubPlot(), { clientX: 30, clientY: 10 });
    expect(currentFrames()).toHaveLength(MAX_KEYFRAMES);
    expect(screen.getByText(/the maximum is reached/)).toBeInTheDocument();
  });

  it("nudges and removes points from the keyboard", () => {
    render(<Harness initial={settings()} />);
    const middle = screen.getByRole("button", { name: /Size point 2/ });
    fireEvent.keyDown(middle, { key: "ArrowUp" });
    expect(currentFrames()[1].scaleX).toBeCloseTo(1.65);
    fireEvent.keyDown(middle, { key: "ArrowRight", shiftKey: true });
    expect(currentFrames()[1].time).toBeCloseTo(0.44);

    const first = screen.getByRole("button", { name: /Size point 1/ });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(currentFrames()[0].time).toBe(0);
    fireEvent.keyDown(first, { key: "Delete" });
    expect(currentFrames()).toHaveLength(3);

    fireEvent.keyDown(screen.getByRole("button", { name: /Size point 2/ }), {
      key: "Delete",
    });
    expect(currentFrames()).toHaveLength(2);
  });
});
