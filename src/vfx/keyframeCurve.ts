import { applyEasing } from "./interpolation";
import { evaluateTransformKeyframes, MIN_KEYFRAME_GAP } from "./keyframes";
import type {
  KeyframeSettings,
  TimingSettings,
  TransformKeyframe,
} from "./types";

/**
 * Model behind the keyframe curve graph: which value a curve shows, the
 * vertical range that fits it, and exact samples drawn with the same
 * per-segment easing the engine uses.
 */

export type CurveProperty =
  "size" | "width" | "height" | "opacity" | "rotation";

export const CURVE_PROPERTY_LABELS: Record<CurveProperty, string> = {
  size: "Size",
  width: "Width",
  height: "Height",
  opacity: "Opacity",
  rotation: "Rotation",
};

export function curveProperties(separateScale: boolean): CurveProperty[] {
  return separateScale
    ? ["width", "height", "opacity", "rotation"]
    : ["size", "opacity", "rotation"];
}

export function curveValue(
  frame: Omit<TransformKeyframe, "time">,
  property: CurveProperty,
): number {
  switch (property) {
    case "size":
    case "width":
      return frame.scaleX;
    case "height":
      return frame.scaleY;
    case "opacity":
      return frame.opacity;
    case "rotation":
      return frame.rotation;
  }
}

/** Limits match the Inspector sliders for the same values. */
export function clampCurveValue(property: CurveProperty, value: number) {
  if (property === "opacity") return Math.min(1, Math.max(0, value));
  if (property === "rotation") return Math.min(1080, Math.max(-1080, value));
  return Math.min(4, Math.max(0, value));
}

export function withCurveValue(
  frame: TransformKeyframe,
  property: CurveProperty,
  value: number,
): TransformKeyframe {
  const next = clampCurveValue(property, value);
  switch (property) {
    case "size":
      return { ...frame, scaleX: next, scaleY: next };
    case "width":
      return { ...frame, scaleX: next };
    case "height":
      return { ...frame, scaleY: next };
    case "opacity":
      return { ...frame, opacity: next };
    case "rotation":
      return { ...frame, rotation: next };
  }
}

/** The vertical range shown for a property, with room to drag past values. */
export function curveRange(
  frames: readonly TransformKeyframe[],
  property: CurveProperty,
): { min: number; max: number } {
  const values = frames.map((frame) => curveValue(frame, property));
  if (property === "opacity") return { min: 0, max: 1 };
  if (property === "rotation") {
    const extent = Math.max(180, ...values.map((value) => Math.abs(value)));
    const limit = Math.min(1080, Math.ceil((extent * 1.2) / 90) * 90);
    return { min: -limit, max: limit };
  }
  const top = Math.max(1.5, ...values) * 1.2;
  return { min: 0, max: Math.min(4, Math.ceil(top * 4) / 4) };
}

export function formatCurveValue(property: CurveProperty, value: number) {
  return property === "rotation"
    ? `${Math.round(value)}°`
    : `${Math.round(value * 100)}%`;
}

/** Keyboard step for one arrow press. */
export function curveValueStep(property: CurveProperty) {
  return property === "rotation" ? 5 : 0.05;
}

export function sampleCurve(
  keyframes: KeyframeSettings,
  timing: Pick<TimingSettings, "easing" | "customEasing">,
  property: CurveProperty,
  samples = 64,
): { time: number; value: number }[] {
  const ease = (value: number) =>
    applyEasing(timing.easing, value, timing.customEasing);
  const points: { time: number; value: number }[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const time = index / samples;
    const value = evaluateTransformKeyframes(
      { ...keyframes, enabled: true },
      time,
      ease,
    );
    if (value) points.push({ time, value: curveValue(value, property) });
  }
  return points;
}

/** Moves one point; only middle points move in time, between neighbors. */
export function dragCurvePoint(
  frames: readonly TransformKeyframe[],
  index: number,
  property: CurveProperty,
  time: number,
  value: number,
): TransformKeyframe[] {
  return frames.map((frame, frameIndex) => {
    if (frameIndex !== index) return frame;
    const movable = index > 0 && index < frames.length - 1;
    const nextTime = movable
      ? Math.min(
          frames[index + 1].time - MIN_KEYFRAME_GAP,
          Math.max(frames[index - 1].time + MIN_KEYFRAME_GAP, time),
        )
      : frame.time;
    return withCurveValue({ ...frame, time: nextTime }, property, value);
  });
}
