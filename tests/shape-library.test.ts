import { describe, expect, it } from "vitest";
import { LIBRARY_SHAPES } from "../src/editor/shapeLibrary";

/** Records 2D drawing calls so shapes can be checked without a real canvas. */
function recordingContext() {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "createRadialGradient") return () => gradient;
        if (property === "createLinearGradient") return () => gradient;
        return (...args: unknown[]) => {
          calls.push(String(property));
          for (const value of args)
            if (typeof value === "number" && !Number.isFinite(value))
              throw new Error(`${String(property)} received ${value}`);
        };
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

describe("shape library", () => {
  it("offers at least 20 uniquely named starter shapes", () => {
    expect(LIBRARY_SHAPES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LIBRARY_SHAPES.map((shape) => shape.id)).size).toBe(
      LIBRARY_SHAPES.length,
    );
    expect(new Set(LIBRARY_SHAPES.map((shape) => shape.name)).size).toBe(
      LIBRARY_SHAPES.length,
    );
  });

  it("draws every shape with finite coordinates inside a bounded canvas", () => {
    for (const shape of LIBRARY_SHAPES) {
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.width).toBeLessThanOrEqual(256);
      expect(shape.height).toBeLessThanOrEqual(256);
      const { context, calls } = recordingContext();
      shape.draw(context, shape.width, shape.height);
      expect(
        calls.some(
          (call) => call === "fill" || call === "stroke" || call === "fillRect",
        ),
        shape.id,
      ).toBe(true);
    }
  });

  it("draws seeded shapes identically every time", () => {
    const shape = LIBRARY_SHAPES.find(
      (candidate) => candidate.id === "speck-cluster",
    )!;
    const first = recordingContext();
    const second = recordingContext();
    shape.draw(first.context, shape.width, shape.height);
    shape.draw(second.context, shape.width, shape.height);
    expect(first.calls).toEqual(second.calls);
  });
});
