import type { CustomEasingSettings, EasingName } from "./types";
export declare function cubicBezierEasing(
  value: number,
  controls: CustomEasingSettings,
): number;
export declare function applyEasing(
  name: EasingName,
  value: number,
  custom?: CustomEasingSettings,
): number;
export declare const lerp: (
  from: number,
  to: number,
  progress: number,
) => number;
export declare function animationProgress(
  elapsed: number,
  duration: number,
  yoyo: boolean,
): number;
