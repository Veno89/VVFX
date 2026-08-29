import { DEFAULT_KEYFRAMES, DEFAULT_MOTION_PATH } from "./defaults";
import { keyframesFromTransform } from "./keyframes";
import type {
  BehaviorEnvelopeSettings,
  SpawnSettings,
  SpawnShape,
  TransformSettings,
} from "./types";

export function disableBehaviorEnvelope(
  envelope: BehaviorEnvelopeSettings,
): BehaviorEnvelopeSettings {
  return envelope.enabled ? { ...envelope, enabled: false } : envelope;
}

export function removeKeyframes() {
  return {
    ...DEFAULT_KEYFRAMES,
    frames: DEFAULT_KEYFRAMES.frames.map((frame) => ({ ...frame })),
  };
}

export function resetKeyframes(transform: TransformSettings) {
  return {
    enabled: true,
    initialized: true,
    frames: keyframesFromTransform(transform),
  };
}

export function removeMotionPath() {
  return {
    ...DEFAULT_MOTION_PATH,
    points: DEFAULT_MOTION_PATH.points.map((point) => ({ ...point })),
  };
}

export function resetMotionPath() {
  return { ...removeMotionPath(), enabled: true };
}

export function changeSpawnShape(
  spawn: SpawnSettings,
  shape: SpawnShape,
  firstPreparedMaskAssetId: string | null,
): SpawnSettings {
  return {
    ...spawn,
    shape,
    // A silhouette is an owned reference, not tuning for another shape.
    // Leaving Mask is therefore an explicit Forget transition.
    maskAssetId:
      shape === "mask" ? (spawn.maskAssetId ?? firstPreparedMaskAssetId) : null,
    distribution:
      shape === "point" || shape === "mask"
        ? "random"
        : (shape === "line" || shape === "arc") && spawn.distribution === "edge"
          ? "even"
          : (shape === "line" || shape === "arc") &&
              spawn.distribution === "stratified"
            ? "random"
            : spawn.distribution,
  };
}
