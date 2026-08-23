import { describe, expect, it } from "vitest";
import {
  animationProgress,
  applyEasing,
  cubicBezierEasing,
  lerp,
} from "../src/vfx/interpolation";
import { motionPathPoint } from "../src/vfx/motionPath";
import { randomBetween, seededRandom } from "../src/vfx/random";
import { spriteFrameAtTime } from "../src/vfx/spriteSheet";
import {
  DEFAULT_FRAME_ANIMATION,
  DEFAULT_MOTION_PATH,
} from "../src/vfx/defaults";

describe("seeded random values", () => {
  it("replays the same random version for the same seed", () => {
    const first = Array.from({ length: 8 }, (_, index) =>
      seededRandom(8421, index),
    );
    const second = Array.from({ length: 8 }, (_, index) =>
      seededRandom(8421, index),
    );
    expect(second).toEqual(first);
    expect(seededRandom(8422, 0)).not.toBe(first[0]);
  });

  it("keeps random ranges within their friendly limits", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(randomBetween(12, index, -8, 5)).toBeGreaterThanOrEqual(-8);
      expect(randomBetween(12, index, -8, 5)).toBeLessThan(5);
    }
  });
});

describe("sprite-sheet playback", () => {
  const asset = {
    id: "sheet",
    name: "Sheet",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,abc",
    width: 128,
    height: 32,
    spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
  };

  it("advances, loops, reverses, and clamps frame sequences", () => {
    expect(spriteFrameAtTime(asset, DEFAULT_FRAME_ANIMATION, 250)).toBe(3);
    expect(spriteFrameAtTime(asset, DEFAULT_FRAME_ANIMATION, 350)).toBe(0);
    expect(
      spriteFrameAtTime(
        asset,
        { ...DEFAULT_FRAME_ANIMATION, playback: "reverse" },
        0,
      ),
    ).toBe(3);
    expect(
      spriteFrameAtTime(
        asset,
        { ...DEFAULT_FRAME_ANIMATION, framesPerSecond: 10, loop: false },
        900,
      ),
    ).toBe(3);
  });
});

describe("parameter interpolation", () => {
  it("interpolates values and yoyo progress predictably", () => {
    expect(lerp(10, 30, 0.25)).toBe(15);
    expect(animationProgress(250, 1000, false)).toBe(0.25);
    expect(animationProgress(750, 1000, true)).toBe(0.5);
  });

  it("maps beginner easing choices to distinct curves", () => {
    expect(applyEasing("constant", 0.5)).toBe(0.5);
    expect(applyEasing("fast-slow", 0.5)).toBeGreaterThan(0.5);
    expect(applyEasing("slow-fast", 0.5)).toBeLessThan(0.5);
    expect(applyEasing("smooth", 0)).toBe(0);
    expect(applyEasing("smooth", 1)).toBe(1);
  });

  it("solves editable cubic easing curves by elapsed time", () => {
    expect(cubicBezierEasing(0.25, { x1: 0, y1: 0, x2: 1, y2: 1 })).toBeCloseTo(
      0.25,
      4,
    );
    expect(
      applyEasing("custom", 0.5, {
        x1: 0.3,
        y1: 1.5,
        x2: 0.7,
        y2: 1.5,
      }),
    ).toBeGreaterThan(1);
  });
});

describe("motion path geometry", () => {
  it("evaluates curves and preserves exact route endpoints", () => {
    const curve = {
      ...DEFAULT_MOTION_PATH,
      enabled: true,
      controlX: 50,
      controlY: 100,
    };
    expect(motionPathPoint(curve, { x: 100, y: 0 }, 0.5)).toEqual({
      x: 50,
      y: 50,
    });

    const spiral = { ...curve, mode: "spiral" as const };
    expect(motionPathPoint(spiral, { x: 120, y: -30 }, 0)).toEqual({
      x: 0,
      y: 0,
    });
    expect(motionPathPoint(spiral, { x: 120, y: -30 }, 1)).toEqual({
      x: 120,
      y: -30,
    });
  });
});
