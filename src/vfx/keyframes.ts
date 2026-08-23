import { lerp } from "./interpolation";
import type {
  KeyframeSettings,
  TransformKeyframe,
  TransformSettings,
} from "./types";

export const MIN_KEYFRAME_GAP = 0.01;
export const MAX_KEYFRAMES = 8;

export type KeyframePresetId =
  "punch" | "quick-pop" | "slow-fade" | "pulse" | "fast-burst-settle";

export const KEYFRAME_PRESETS: Array<{
  id: KeyframePresetId;
  name: string;
  description: string;
}> = [
  {
    id: "punch",
    name: "Punch / overshoot",
    description: "Grows past the final size, then settles into place.",
  },
  {
    id: "quick-pop",
    name: "Quick pop",
    description: "Expands and disappears early for a crisp impact beat.",
  },
  {
    id: "slow-fade",
    name: "Slow fade",
    description: "Keeps its visibility, then fades through the final stretch.",
  },
  {
    id: "pulse",
    name: "Pulse",
    description: "Breathes larger twice before reaching the ending look.",
  },
  {
    id: "fast-burst-settle",
    name: "Fast burst, then settle",
    description: "Hits its strongest size quickly and holds the settled shape.",
  },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function keyframesFromTransform(
  transform: TransformSettings,
): TransformKeyframe[] {
  return [
    {
      time: 0,
      scaleX: transform.separateScale
        ? transform.startScaleX
        : transform.startScale,
      scaleY: transform.separateScale
        ? transform.startScaleY
        : transform.startScale,
      opacity: transform.startOpacity,
      rotation: 0,
    },
    {
      time: 1,
      scaleX: transform.separateScale
        ? transform.endScaleX
        : transform.endScale,
      scaleY: transform.separateScale
        ? transform.endScaleY
        : transform.endScale,
      opacity: transform.endOpacity,
      rotation: transform.rotationDuring,
    },
  ];
}

const frameBetween = (
  start: TransformKeyframe,
  end: TransformKeyframe,
  time: number,
): TransformKeyframe => ({
  time,
  scaleX: lerp(start.scaleX, end.scaleX, time),
  scaleY: lerp(start.scaleY, end.scaleY, time),
  opacity: lerp(start.opacity, end.opacity, time),
  rotation: lerp(start.rotation, end.rotation, time),
});

const overshoot = (start: number, end: number, strength: number) =>
  Math.max(0, end + (end - start) * strength);

/** Creates beginner curve shapes using the existing canonical property moments. */
export function keyframesFromPreset(
  transform: TransformSettings,
  preset: KeyframePresetId,
): KeyframeSettings {
  const [start, end] = keyframesFromTransform(transform);
  let frames: TransformKeyframe[];

  if (preset === "punch") {
    const peak = frameBetween(start, end, 0.22);
    peak.scaleX = overshoot(start.scaleX, end.scaleX, 0.18);
    peak.scaleY = overshoot(start.scaleY, end.scaleY, 0.18);
    peak.opacity = lerp(start.opacity, end.opacity, 0.08);
    frames = [start, peak, end];
  } else if (preset === "quick-pop") {
    const peak = frameBetween(start, end, 0.12);
    const hidden = { ...end, time: 0.36 };
    peak.scaleX = Math.max(start.scaleX, end.scaleX, 0.01) * 1.18;
    peak.scaleY = Math.max(start.scaleY, end.scaleY, 0.01) * 1.18;
    peak.opacity = start.opacity;
    frames = [start, peak, hidden, end];
  } else if (preset === "slow-fade") {
    const hold = frameBetween(start, end, 0.62);
    hold.opacity = start.opacity;
    frames = [start, hold, end];
  } else if (preset === "pulse") {
    const firstPeak = frameBetween(start, end, 0.22);
    const valley = frameBetween(start, end, 0.5);
    const secondPeak = frameBetween(start, end, 0.76);
    firstPeak.scaleX *= 1.12;
    firstPeak.scaleY *= 1.12;
    secondPeak.scaleX *= 1.12;
    secondPeak.scaleY *= 1.12;
    frames = [start, firstPeak, valley, secondPeak, end];
  } else {
    const burst = frameBetween(start, end, 0.1);
    const settled = { ...end, time: 0.34 };
    burst.scaleX = overshoot(start.scaleX, end.scaleX, 0.28);
    burst.scaleY = overshoot(start.scaleY, end.scaleY, 0.28);
    burst.opacity = start.opacity;
    frames = [start, burst, settled, end];
  }

  return {
    enabled: true,
    initialized: true,
    frames: normalizeKeyframes(frames),
  };
}

export function normalizeKeyframes(
  frames: TransformKeyframe[],
): TransformKeyframe[] {
  const sorted = frames
    .filter((frame) => Number.isFinite(frame.time))
    .map((frame) => ({
      time: clamp01(frame.time),
      scaleX: Math.max(0, frame.scaleX),
      scaleY: Math.max(0, frame.scaleY),
      opacity: clamp01(frame.opacity),
      rotation: frame.rotation,
    }))
    .sort((a, b) => a.time - b.time)
    .slice(0, MAX_KEYFRAMES);

  if (sorted.length < 2) return [];
  sorted[0] = { ...sorted[0], time: 0 };
  sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], time: 1 };
  for (let index = 1; index < sorted.length - 1; index += 1) {
    const latestAllowed = 1 - (sorted.length - 1 - index) * MIN_KEYFRAME_GAP;
    sorted[index] = {
      ...sorted[index],
      time: Math.min(
        latestAllowed,
        Math.max(sorted[index - 1].time + MIN_KEYFRAME_GAP, sorted[index].time),
      ),
    };
  }
  return sorted;
}

export function evaluateTransformKeyframes(
  settings: KeyframeSettings,
  progress: number,
  ease: (value: number) => number = (value) => value,
): Omit<TransformKeyframe, "time"> | null {
  if (!settings.enabled || settings.frames.length < 2) return null;
  const frames = settings.frames;
  const time = clamp01(progress);
  let nextIndex = frames.findIndex((frame) => frame.time >= time);
  if (nextIndex <= 0) nextIndex = 1;
  const start = frames[nextIndex - 1];
  const end = frames[Math.min(nextIndex, frames.length - 1)];
  const segment = Math.max(Number.EPSILON, end.time - start.time);
  const local = ease(clamp01((time - start.time) / segment));
  return {
    scaleX: lerp(start.scaleX, end.scaleX, local),
    scaleY: lerp(start.scaleY, end.scaleY, local),
    opacity: lerp(start.opacity, end.opacity, local),
    rotation: lerp(start.rotation, end.rotation, local),
  };
}

export function insertKeyframe(settings: KeyframeSettings): KeyframeSettings {
  const frames = normalizeKeyframes(settings.frames);
  if (frames.length < 2 || frames.length >= MAX_KEYFRAMES) return settings;
  let gapIndex = 0;
  for (let index = 1; index < frames.length - 1; index += 1) {
    if (
      frames[index + 1].time - frames[index].time >
      frames[gapIndex + 1].time - frames[gapIndex].time
    )
      gapIndex = index;
  }
  const start = frames[gapIndex];
  const end = frames[gapIndex + 1];
  const time = (start.time + end.time) / 2;
  return {
    ...settings,
    frames: [
      ...frames.slice(0, gapIndex + 1),
      {
        time,
        scaleX: lerp(start.scaleX, end.scaleX, 0.5),
        scaleY: lerp(start.scaleY, end.scaleY, 0.5),
        opacity: lerp(start.opacity, end.opacity, 0.5),
        rotation: lerp(start.rotation, end.rotation, 0.5),
      },
      ...frames.slice(gapIndex + 1),
    ],
  };
}

export function insertKeyframeAt(
  settings: KeyframeSettings,
  transform: TransformSettings,
  time: number,
): KeyframeSettings {
  const sourceFrames = settings.initialized
    ? normalizeKeyframes(settings.frames)
    : keyframesFromTransform(transform);
  if (sourceFrames.length < 2 || sourceFrames.length >= MAX_KEYFRAMES)
    return settings;
  const requestedTime = clamp01(time);
  if (
    requestedTime <= MIN_KEYFRAME_GAP ||
    requestedTime >= 1 - MIN_KEYFRAME_GAP ||
    sourceFrames.some(
      (frame) => Math.abs(frame.time - requestedTime) < MIN_KEYFRAME_GAP,
    )
  )
    return settings;
  const settingsForEvaluation: KeyframeSettings = {
    enabled: true,
    initialized: true,
    frames: sourceFrames,
  };
  const value = evaluateTransformKeyframes(
    settingsForEvaluation,
    requestedTime,
  );
  if (!value) return settings;
  return {
    enabled: true,
    initialized: true,
    frames: normalizeKeyframes([
      ...sourceFrames,
      { time: requestedTime, ...value },
    ]),
  };
}

export function moveKeyframe(
  frames: TransformKeyframe[],
  index: number,
  time: number,
): TransformKeyframe[] {
  if (index <= 0 || index >= frames.length - 1) return frames;
  const minimum = frames[index - 1].time + MIN_KEYFRAME_GAP;
  const maximum = frames[index + 1].time - MIN_KEYFRAME_GAP;
  return frames.map((frame, frameIndex) =>
    frameIndex === index
      ? { ...frame, time: Math.max(minimum, Math.min(maximum, time)) }
      : frame,
  );
}

export function syncKeyframeEndpoints(
  settings: KeyframeSettings,
  transform: TransformSettings,
  patch: Partial<TransformSettings>,
): KeyframeSettings {
  if (!settings.initialized || settings.frames.length < 2) return settings;
  const frames = settings.frames.map((frame) => ({ ...frame }));
  const first = frames[0];
  const last = frames[frames.length - 1];

  if (patch.startScale !== undefined) {
    first.scaleX = transform.startScale;
    first.scaleY = transform.startScale;
  }
  if (patch.endScale !== undefined) {
    last.scaleX = transform.endScale;
    last.scaleY = transform.endScale;
  }
  if (patch.startScaleX !== undefined) first.scaleX = transform.startScaleX;
  if (patch.startScaleY !== undefined) first.scaleY = transform.startScaleY;
  if (patch.endScaleX !== undefined) last.scaleX = transform.endScaleX;
  if (patch.endScaleY !== undefined) last.scaleY = transform.endScaleY;
  if (patch.startOpacity !== undefined) first.opacity = transform.startOpacity;
  if (patch.endOpacity !== undefined) last.opacity = transform.endOpacity;
  if (patch.rotationDuring !== undefined)
    last.rotation = transform.rotationDuring;

  return { ...settings, frames };
}
