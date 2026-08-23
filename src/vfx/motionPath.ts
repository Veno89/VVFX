import type { MotionPathPoint, MotionPathSettings } from "./types";

const clampProgress = (value: number) => Math.max(0, Math.min(1, value));

function catmullRom(
  p0: MotionPathPoint,
  p1: MotionPathPoint,
  p2: MotionPathPoint,
  p3: MotionPathPoint,
  progress: number,
): MotionPathPoint {
  const squared = progress * progress;
  const cubed = squared * progress;
  const component = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * progress +
      (2 * a - 5 * b + 4 * c - d) * squared +
      (-a + 3 * b - 3 * c + d) * cubed);
  return {
    x: component(p0.x, p1.x, p2.x, p3.x),
    y: component(p0.y, p1.y, p2.y, p3.y),
  };
}

function customPathPoint(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  progress: number,
): MotionPathPoint {
  const points = [{ x: 0, y: 0 }, ...path.points, movement];
  const segmentCount = points.length - 1;
  const scaled = progress * segmentCount;
  const segment = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = progress === 1 ? 1 : scaled - segment;
  const p1 = points[segment];
  const p2 = points[segment + 1];
  return catmullRom(
    points[Math.max(0, segment - 1)],
    p1,
    p2,
    points[Math.min(points.length - 1, segment + 2)],
    local,
  );
}

export function motionPathPoint(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  rawProgress: number,
): MotionPathPoint {
  const progress = clampProgress(rawProgress);
  if (!path.enabled)
    return { x: movement.x * progress, y: movement.y * progress };

  if (path.mode === "curve") {
    const inverse = 1 - progress;
    return {
      x:
        2 * inverse * progress * path.controlX +
        progress * progress * movement.x,
      y:
        2 * inverse * progress * path.controlY +
        progress * progress * movement.y,
    };
  }

  if (path.mode === "spiral") {
    const direction = path.spiralClockwise ? 1 : -1;
    const angle = direction * Math.PI * 2 * path.spiralTurns * progress;
    const radius = path.spiralRadius * (1 - progress);
    return {
      x: movement.x * progress + (Math.cos(angle) - 1) * radius,
      y: movement.y * progress + Math.sin(angle) * radius,
    };
  }

  return customPathPoint(path, movement, progress);
}

export function evaluateMotionPath(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  progress: number,
): MotionPathPoint & { angle: number } {
  const point = motionPathPoint(path, movement, progress);
  const before = motionPathPoint(path, movement, progress - 0.001);
  const after = motionPathPoint(path, movement, progress + 0.001);
  const tangentX = after.x - before.x;
  const tangentY = after.y - before.y;
  return {
    ...point,
    angle:
      Math.abs(tangentX) + Math.abs(tangentY) < 0.0001
        ? 0
        : (Math.atan2(tangentY, tangentX) * 180) / Math.PI,
  };
}

export function sampleMotionPath(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  steps = 40,
): MotionPathPoint[] {
  const count = Math.max(2, Math.floor(steps));
  return Array.from({ length: count + 1 }, (_, index) =>
    motionPathPoint(path, movement, index / count),
  );
}
