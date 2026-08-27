import type { MotionPathPoint, MotionPathSettings } from "./types";
export declare function motionPathPoint(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  rawProgress: number,
): MotionPathPoint;
export declare function evaluateMotionPath(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  progress: number,
): MotionPathPoint & {
  angle: number;
};
export declare function sampleMotionPath(
  path: MotionPathSettings,
  movement: MotionPathPoint,
  steps?: number,
): MotionPathPoint[];
