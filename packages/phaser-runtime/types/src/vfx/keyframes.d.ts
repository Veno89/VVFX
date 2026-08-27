import type {
  KeyframeSettings,
  TransformKeyframe,
  TransformSettings,
} from "./types";
export declare const MIN_KEYFRAME_GAP = 0.01;
export declare const MAX_KEYFRAMES = 8;
export type KeyframePresetId =
  "punch" | "quick-pop" | "slow-fade" | "pulse" | "fast-burst-settle";
export declare const KEYFRAME_PRESETS: Array<{
  id: KeyframePresetId;
  name: string;
  description: string;
}>;
export declare function keyframesFromTransform(
  transform: TransformSettings,
): TransformKeyframe[];
/** Creates beginner curve shapes using the existing canonical property moments. */
export declare function keyframesFromPreset(
  transform: TransformSettings,
  preset: KeyframePresetId,
): KeyframeSettings;
export declare function normalizeKeyframes(
  frames: TransformKeyframe[],
): TransformKeyframe[];
export declare function evaluateTransformKeyframes(
  settings: KeyframeSettings,
  progress: number,
  ease?: (value: number) => number,
): Omit<TransformKeyframe, "time"> | null;
export declare function insertKeyframe(
  settings: KeyframeSettings,
): KeyframeSettings;
export declare function insertKeyframeAt(
  settings: KeyframeSettings,
  transform: TransformSettings,
  time: number,
): KeyframeSettings;
export declare function moveKeyframe(
  frames: TransformKeyframe[],
  index: number,
  time: number,
): TransformKeyframe[];
export declare function syncKeyframeEndpoints(
  settings: KeyframeSettings,
  transform: TransformSettings,
  patch: Partial<TransformSettings>,
): KeyframeSettings;
