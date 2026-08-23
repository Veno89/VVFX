import type { CustomEasingSettings, EasingName } from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function cubicCoordinate(
  progress: number,
  firstControl: number,
  secondControl: number,
) {
  const inverse = 1 - progress;
  return (
    3 * inverse * inverse * progress * firstControl +
    3 * inverse * progress * progress * secondControl +
    progress * progress * progress
  );
}

function cubicDerivative(
  progress: number,
  firstControl: number,
  secondControl: number,
) {
  const inverse = 1 - progress;
  return (
    3 * inverse * inverse * firstControl +
    6 * inverse * progress * (secondControl - firstControl) +
    3 * progress * progress * (1 - secondControl)
  );
}

export function cubicBezierEasing(
  value: number,
  controls: CustomEasingSettings,
): number {
  const targetX = clamp01(value);
  if (targetX === 0 || targetX === 1) return targetX;

  let parameter = targetX;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error =
      cubicCoordinate(parameter, controls.x1, controls.x2) - targetX;
    const slope = cubicDerivative(parameter, controls.x1, controls.x2);
    if (Math.abs(error) < 0.000001) break;
    if (Math.abs(slope) < 0.000001) break;
    parameter = clamp01(parameter - error / slope);
  }

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const currentX = cubicCoordinate(parameter, controls.x1, controls.x2);
    if (Math.abs(currentX - targetX) < 0.000001) break;
    if (currentX < targetX) low = parameter;
    else high = parameter;
    parameter = (low + high) / 2;
  }
  return cubicCoordinate(parameter, controls.y1, controls.y2);
}

export function applyEasing(
  name: EasingName,
  value: number,
  custom?: CustomEasingSettings,
): number {
  const t = clamp01(value);
  switch (name) {
    case "fast-slow":
      return 1 - (1 - t) * (1 - t);
    case "slow-fast":
      return t * t;
    case "smooth":
      return t * t * (3 - 2 * t);
    case "bounce": {
      const n = 7.5625;
      const d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) {
        const p = t - 1.5 / d;
        return n * p * p + 0.75;
      }
      if (t < 2.5 / d) {
        const p = t - 2.25 / d;
        return n * p * p + 0.9375;
      }
      const p = t - 2.625 / d;
      return n * p * p + 0.984375;
    }
    case "overshoot": {
      const c = 1.70158;
      const p = t - 1;
      return 1 + (c + 1) * p * p * p + c * p * p;
    }
    case "elastic":
      if (t === 0 || t === 1) return t;
      return (
        2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1
      );
    case "custom":
      return cubicBezierEasing(
        t,
        custom ?? { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
      );
    default:
      return t;
  }
}

export const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export function animationProgress(
  elapsed: number,
  duration: number,
  yoyo: boolean,
): number {
  const base = clamp01(elapsed / Math.max(1, duration));
  if (!yoyo) return base;
  return base <= 0.5 ? base * 2 : (1 - base) * 2;
}
