import {
  BUILT_IN_ASSETS,
  DEFAULT_BEAM,
  DEFAULT_APPEARANCE,
  DEFAULT_BEHAVIOR,
  DEFAULT_COLOR_OVER_LIFETIME,
  DEFAULT_FRAME_ANIMATION,
  DEFAULT_KEYFRAMES,
  DEFAULT_MOTION_PATH,
  DEFAULT_RANDOM,
  DEFAULT_SPAWN,
  DEFAULT_TIMING,
  DEFAULT_TRAIL,
  DEFAULT_TRANSFORM,
} from "./defaults";
import {
  canonicalizeLayerCapabilities,
  canonicalizeProjectLayerCapabilities,
} from "./layerLifecycle";
import {
  MAX_COLOR_STOPS,
  normalizeColorStops,
  normalizeHexColor,
} from "./color";
import {
  findLayerEventCycle,
  maximumLayerEventDepth,
  MAX_EVENT_DEPTH,
  MAX_EVENTS_PER_LAYER,
} from "./events";
import {
  keyframesFromTransform,
  MAX_KEYFRAMES,
  normalizeKeyframes,
} from "./keyframes";
import { normalizeFrameAnimation, normalizeSpriteSheet } from "./spriteSheet";
import { normalizeRenderingEffects } from "./renderingEffects";
import {
  findLayerAttachmentCycle,
  maximumLayerAttachmentDepth,
} from "./attachments";
import { boundedLayerRepeat } from "./limits";
import {
  isSafeVfxId,
  isSupportedVfxNumber,
  MAX_ATTACHMENT_DEPTH,
  MAX_MOTION_PATH_POINTS,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_EMBEDDED_IMAGE_BYTES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_GROUPS,
  MAX_PROJECT_IMAGE_PIXELS,
  MAX_PROJECT_LAYERS,
  MAX_TIMELINE_MARKERS,
  MAX_VFX_EMITTER_INTERVAL_MS,
  MAX_VFX_NAME_LENGTH,
  MAX_VFX_POSITION_MAGNITUDE,
  MAX_VFX_ROTATION_MAGNITUDE,
  MAX_VFX_SCALE,
  MAX_VFX_SPAWN_GEOMETRY,
  MAX_VFX_TIMING_MS,
  utf8ByteLength,
} from "./inputLimits";
import {
  inspectPortableImageDataUrl,
  type PortableImageMimeType,
} from "./portableImage";
import {
  alphaMaskThresholdByte,
  maximumAlphaMaskValue,
  normalizeAssetAlphaMask,
} from "./alphaMask";
import { isSpawnLayer } from "./types";
import type {
  FrameAnimationSettings,
  LayerEvent,
  LayerType,
  VfxAsset,
  VfxGroup,
  VfxLayer,
  VfxProject,
} from "./types";

export interface ValidationResult {
  ok: boolean;
  project?: VfxProject;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number) =>
  isSupportedVfxNumber(value) ? value : fallback;

const stringOr = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const CURRENT_PROJECT_FORMAT_VERSION = 17;
const MAX_TIMELINE_NOTES_LENGTH = 12_000;
const MAX_TIMELINE_MARKER_LABEL_LENGTH = 120;

const builtInAssetsById = new Map(
  BUILT_IN_ASSETS.map((asset) => [asset.id, asset] as const),
);

function isDenseArray(value: unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}

function isSafeVfxName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_VFX_NAME_LENGTH
  );
}

function normalizedImportedName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const name = value.trim().slice(0, MAX_VFX_NAME_LENGTH);
  return name || fallback;
}

function validateNestedArray(
  owner: unknown,
  key: string,
  maximum: number,
  label: string,
): string | null {
  if (!isRecord(owner) || owner[key] === undefined) return null;
  const value = owner[key];
  if (!Array.isArray(value)) return `${label} is damaged.`;
  if (value.length > maximum)
    return `${label} contains more than the supported ${maximum} entries.`;
  if (!isDenseArray(value)) return `${label} is damaged.`;
  return null;
}

function validateRawLayerCollections(
  value: unknown,
  strictCurrentFormat: boolean,
): string | null {
  if (!isRecord(value)) return null;
  const motionPathError = validateNestedArray(
    value.motionPath,
    "points",
    MAX_MOTION_PATH_POINTS,
    "A layer's motion path",
  );
  if (motionPathError) return motionPathError;
  const keyframeError = validateNestedArray(
    value.keyframes,
    "frames",
    MAX_KEYFRAMES,
    "A layer's keyframe list",
  );
  if (keyframeError) return keyframeError;
  const appearance = isRecord(value.appearance) ? value.appearance : null;
  const colorOverLifetime = appearance?.colorOverLifetime;
  const colorStopError = validateNestedArray(
    colorOverLifetime,
    "stops",
    MAX_COLOR_STOPS,
    "A layer's color-stop list",
  );
  if (colorStopError) return colorStopError;
  if (!strictCurrentFormat) return null;

  const nestedCollections = [
    [
      isRecord(value.motionPath) ? value.motionPath.points : undefined,
      "motion path point",
    ],
    [
      isRecord(value.keyframes) ? value.keyframes.frames : undefined,
      "keyframe",
    ],
    [
      isRecord(colorOverLifetime) ? colorOverLifetime.stops : undefined,
      "color stop",
    ],
  ] as const;
  for (const [collection, label] of nestedCollections) {
    if (
      Array.isArray(collection) &&
      collection.some((candidate) => !isRecord(candidate))
    )
      return `A layer contains a damaged ${label}.`;
  }
  return null;
}

function normalizeBehaviorEnvelope(
  value: unknown,
): VfxLayer["behavior"]["pulse"]["envelope"] {
  const envelope = isRecord(value) ? value : {};
  const start = clamp(numberOr(envelope.start, 0), 0, 1);
  const attackEnd = clamp(numberOr(envelope.attackEnd, start), start, 1);
  const releaseStart = clamp(numberOr(envelope.releaseStart, 1), attackEnd, 1);
  const end = clamp(numberOr(envelope.end, 1), releaseStart, 1);
  return {
    enabled: typeof envelope.enabled === "boolean" ? envelope.enabled : false,
    start,
    attackEnd,
    releaseStart,
    end,
  };
}

function optionalHexColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return normalizeHexColor(value);
}

function validateRawLayerEvents(
  value: unknown,
  strictCurrentFormat: boolean,
): string | null {
  if (!isRecord(value) || value.events === undefined) return null;
  if (!Array.isArray(value.events)) return "A layer's event list is damaged.";
  if (value.events.length > MAX_EVENTS_PER_LAYER)
    return `A layer contains more than the supported ${MAX_EVENTS_PER_LAYER} events.`;
  if (!isDenseArray(value.events)) return "A layer's event list is damaged.";
  for (const event of value.events) {
    if (
      !isRecord(event) ||
      !isSafeVfxId(event.id) ||
      !["start", "percentage", "finish", "repeat", "copy-finish"].includes(
        String(event.trigger),
      ) ||
      !["play", "restart"].includes(String(event.action)) ||
      !isSafeVfxId(event.targetLayerId)
    )
      return "A layer event is damaged or missing its target.";
    if (
      event.trigger === "percentage" &&
      (typeof event.percentage !== "number" ||
        !Number.isFinite(event.percentage))
    )
      return "A percentage event is missing a valid chosen point.";
  }
  if (
    strictCurrentFormat &&
    value.events.some(
      (event) =>
        !isRecord(event) ||
        typeof event.enabled !== "boolean" ||
        typeof event.chance !== "number" ||
        !Number.isFinite(event.chance) ||
        typeof event.maxTriggers !== "number" ||
        !Number.isFinite(event.maxTriggers),
    )
  )
    return "A layer event is damaged or incomplete.";
  return null;
}

function normalizeLayerEvents(value: unknown): LayerEvent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EVENTS_PER_LAYER).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    return [
      {
        id: stringOr(candidate.id, "event").trim(),
        enabled:
          typeof candidate.enabled === "boolean" ? candidate.enabled : true,
        trigger: [
          "start",
          "percentage",
          "finish",
          "repeat",
          "copy-finish",
        ].includes(String(candidate.trigger))
          ? (candidate.trigger as LayerEvent["trigger"])
          : "finish",
        percentage: clamp(numberOr(candidate.percentage, 0.5), 0.01, 0.99),
        action: candidate.action === "restart" ? "restart" : "play",
        targetLayerId: stringOr(candidate.targetLayerId, "").trim(),
        chance: clamp(numberOr(candidate.chance, 1), 0, 1),
        maxTriggers: Math.floor(
          clamp(numberOr(candidate.maxTriggers, 32), 1, 250),
        ),
      },
    ];
  });
}

function normalizeLayer(value: unknown, index: number): VfxLayer | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (
    type !== "static" &&
    type !== "animated" &&
    type !== "beam" &&
    type !== "burst" &&
    type !== "emitter"
  )
    return null;
  const transform = isRecord(value.transform) ? value.transform : {};
  const timing = isRecord(value.timing) ? value.timing : {};
  const customEasing = isRecord(timing.customEasing) ? timing.customEasing : {};
  const appearance = isRecord(value.appearance) ? value.appearance : {};
  const colorOverLifetime = isRecord(appearance.colorOverLifetime)
    ? appearance.colorOverLifetime
    : {};
  const behavior = isRecord(value.behavior) ? value.behavior : {};
  const pulse = isRecord(behavior.pulse) ? behavior.pulse : {};
  const flicker = isRecord(behavior.flicker) ? behavior.flicker : {};
  const wobble = isRecord(behavior.wobble) ? behavior.wobble : {};
  const physics = isRecord(behavior.physics) ? behavior.physics : {};
  const random = isRecord(value.random) ? value.random : {};
  const frameAnimation = isRecord(value.frameAnimation)
    ? value.frameAnimation
    : {};
  const trail = isRecord(value.trail) ? value.trail : {};
  const motionPath = isRecord(value.motionPath) ? value.motionPath : {};
  const keyframes = isRecord(value.keyframes) ? value.keyframes : {};
  const beam = isRecord(value.beam) ? value.beam : {};
  const base = {
    id: stringOr(value.id, `imported-layer-${index}`),
    name: normalizedImportedName(value.name, `Imported layer ${index + 1}`),
    type: type as LayerType,
    assetId: typeof value.assetId === "string" ? value.assetId : null,
    visible: typeof value.visible === "boolean" ? value.visible : true,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    solo: typeof value.solo === "boolean" ? value.solo : false,
    startMode: value.startMode === "triggered" ? "triggered" : "timeline",
    events: normalizeLayerEvents(value.events),
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    groupId: typeof value.groupId === "string" ? value.groupId : null,
    transform: {
      x: clamp(
        numberOr(transform.x, DEFAULT_TRANSFORM.x),
        -MAX_VFX_POSITION_MAGNITUDE,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      y: clamp(
        numberOr(transform.y, DEFAULT_TRANSFORM.y),
        -MAX_VFX_POSITION_MAGNITUDE,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      startScale: clamp(
        numberOr(transform.startScale, DEFAULT_TRANSFORM.startScale),
        0,
        MAX_VFX_SCALE,
      ),
      endScale: clamp(
        numberOr(transform.endScale, DEFAULT_TRANSFORM.endScale),
        0,
        MAX_VFX_SCALE,
      ),
      startScaleX: clamp(
        numberOr(transform.startScaleX, DEFAULT_TRANSFORM.startScaleX),
        0,
        MAX_VFX_SCALE,
      ),
      startScaleY: clamp(
        numberOr(transform.startScaleY, DEFAULT_TRANSFORM.startScaleY),
        0,
        MAX_VFX_SCALE,
      ),
      endScaleX: clamp(
        numberOr(transform.endScaleX, DEFAULT_TRANSFORM.endScaleX),
        0,
        MAX_VFX_SCALE,
      ),
      endScaleY: clamp(
        numberOr(transform.endScaleY, DEFAULT_TRANSFORM.endScaleY),
        0,
        MAX_VFX_SCALE,
      ),
      separateScale:
        typeof transform.separateScale === "boolean"
          ? transform.separateScale
          : false,
      startOpacity: clamp(
        numberOr(transform.startOpacity, DEFAULT_TRANSFORM.startOpacity),
        0,
        1,
      ),
      endOpacity: clamp(
        numberOr(transform.endOpacity, DEFAULT_TRANSFORM.endOpacity),
        0,
        1,
      ),
      rotation: clamp(
        numberOr(transform.rotation, DEFAULT_TRANSFORM.rotation),
        -MAX_VFX_ROTATION_MAGNITUDE,
        MAX_VFX_ROTATION_MAGNITUDE,
      ),
      rotationDuring: clamp(
        numberOr(transform.rotationDuring, DEFAULT_TRANSFORM.rotationDuring),
        -MAX_VFX_ROTATION_MAGNITUDE,
        MAX_VFX_ROTATION_MAGNITUDE,
      ),
      movementX: clamp(
        numberOr(transform.movementX, DEFAULT_TRANSFORM.movementX),
        -MAX_VFX_POSITION_MAGNITUDE,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      movementY: clamp(
        numberOr(transform.movementY, DEFAULT_TRANSFORM.movementY),
        -MAX_VFX_POSITION_MAGNITUDE,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
    },
    timing: {
      delay: clamp(
        numberOr(timing.delay, DEFAULT_TIMING.delay),
        0,
        MAX_VFX_TIMING_MS,
      ),
      duration: clamp(
        numberOr(timing.duration, DEFAULT_TIMING.duration),
        50,
        MAX_VFX_TIMING_MS,
      ),
      repeat: boundedLayerRepeat(
        typeof timing.repeat === "number"
          ? timing.repeat
          : DEFAULT_TIMING.repeat,
      ),
      repeatForever:
        typeof timing.repeatForever === "boolean"
          ? timing.repeatForever
          : false,
      yoyo: typeof timing.yoyo === "boolean" ? timing.yoyo : false,
      loop: typeof timing.loop === "boolean" ? timing.loop : false,
      easing: [
        "constant",
        "fast-slow",
        "slow-fast",
        "smooth",
        "bounce",
        "overshoot",
        "elastic",
        "custom",
      ].includes(String(timing.easing))
        ? (timing.easing as typeof DEFAULT_TIMING.easing)
        : DEFAULT_TIMING.easing,
      customEasing: {
        x1: Math.max(
          0,
          Math.min(
            1,
            numberOr(customEasing.x1, DEFAULT_TIMING.customEasing.x1),
          ),
        ),
        y1: Math.max(
          -2,
          Math.min(
            3,
            numberOr(customEasing.y1, DEFAULT_TIMING.customEasing.y1),
          ),
        ),
        x2: Math.max(
          0,
          Math.min(
            1,
            numberOr(customEasing.x2, DEFAULT_TIMING.customEasing.x2),
          ),
        ),
        y2: Math.max(
          -2,
          Math.min(
            3,
            numberOr(customEasing.y2, DEFAULT_TIMING.customEasing.y2),
          ),
        ),
      },
    },
    appearance: {
      tint: optionalHexColor(appearance.tint),
      tintStrength: Math.max(
        0,
        Math.min(
          1,
          numberOr(appearance.tintStrength, DEFAULT_APPEARANCE.tintStrength),
        ),
      ),
      blendMode:
        appearance.blendMode === "add" ? ("add" as const) : ("normal" as const),
      colorOverLifetime: {
        enabled:
          typeof colorOverLifetime.enabled === "boolean"
            ? colorOverLifetime.enabled
            : DEFAULT_COLOR_OVER_LIFETIME.enabled,
        stops: normalizeColorStops(colorOverLifetime.stops),
      },
      effects: normalizeRenderingEffects(appearance.effects),
    },
    behavior: {
      pulse: {
        enabled:
          typeof pulse.enabled === "boolean"
            ? pulse.enabled
            : DEFAULT_BEHAVIOR.pulse.enabled,
        scale: clamp(
          numberOr(pulse.scale, DEFAULT_BEHAVIOR.pulse.scale),
          0,
          0.75,
        ),
        opacity: clamp(
          numberOr(pulse.opacity, DEFAULT_BEHAVIOR.pulse.opacity),
          0,
          1,
        ),
        speed: clamp(
          numberOr(pulse.speed, DEFAULT_BEHAVIOR.pulse.speed),
          0.1,
          12,
        ),
        envelope: normalizeBehaviorEnvelope(pulse.envelope),
      },
      flicker: {
        enabled:
          typeof flicker.enabled === "boolean"
            ? flicker.enabled
            : DEFAULT_BEHAVIOR.flicker.enabled,
        amount: clamp(
          numberOr(flicker.amount, DEFAULT_BEHAVIOR.flicker.amount),
          0,
          1,
        ),
        speed: clamp(
          numberOr(flicker.speed, DEFAULT_BEHAVIOR.flicker.speed),
          0.5,
          30,
        ),
        randomness: clamp(
          numberOr(flicker.randomness, DEFAULT_BEHAVIOR.flicker.randomness),
          0,
          1,
        ),
        envelope: normalizeBehaviorEnvelope(flicker.envelope),
      },
      wobble: {
        enabled:
          typeof wobble.enabled === "boolean"
            ? wobble.enabled
            : DEFAULT_BEHAVIOR.wobble.enabled,
        x: clamp(numberOr(wobble.x, DEFAULT_BEHAVIOR.wobble.x), 0, 250),
        y: clamp(numberOr(wobble.y, DEFAULT_BEHAVIOR.wobble.y), 0, 250),
        rotation: clamp(
          numberOr(wobble.rotation, DEFAULT_BEHAVIOR.wobble.rotation),
          0,
          180,
        ),
        speed: clamp(
          numberOr(wobble.speed, DEFAULT_BEHAVIOR.wobble.speed),
          0.1,
          12,
        ),
        style: wobble.style === "organic" ? "organic" : "sway",
        smoothness: clamp(
          numberOr(wobble.smoothness, DEFAULT_BEHAVIOR.wobble.smoothness),
          0,
          1,
        ),
        envelope: normalizeBehaviorEnvelope(wobble.envelope),
      },
      physics: {
        gravity: clamp(
          numberOr(physics.gravity, DEFAULT_BEHAVIOR.physics.gravity),
          -2000,
          2000,
        ),
        drag: clamp(
          numberOr(physics.drag, DEFAULT_BEHAVIOR.physics.drag),
          0,
          1,
        ),
        gravityEnvelope: normalizeBehaviorEnvelope(physics.gravityEnvelope),
      },
    },
    random: {
      positionX: clamp(
        numberOr(random.positionX, DEFAULT_RANDOM.positionX),
        0,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      positionY: clamp(
        numberOr(random.positionY, DEFAULT_RANDOM.positionY),
        0,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      startScale: clamp(
        numberOr(random.startScale, DEFAULT_RANDOM.startScale),
        0,
        MAX_VFX_SCALE,
      ),
      endScale: clamp(
        numberOr(random.endScale, DEFAULT_RANDOM.endScale),
        0,
        MAX_VFX_SCALE,
      ),
      rotation: clamp(
        numberOr(random.rotation, DEFAULT_RANDOM.rotation),
        0,
        MAX_VFX_ROTATION_MAGNITUDE,
      ),
      duration: clamp(
        numberOr(random.duration, DEFAULT_RANDOM.duration),
        0,
        MAX_VFX_TIMING_MS,
      ),
      movementX: clamp(
        numberOr(random.movementX, DEFAULT_RANDOM.movementX),
        0,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      movementY: clamp(
        numberOr(random.movementY, DEFAULT_RANDOM.movementY),
        0,
        MAX_VFX_POSITION_MAGNITUDE,
      ),
      delay: clamp(
        numberOr(random.delay, DEFAULT_RANDOM.delay),
        0,
        MAX_VFX_TIMING_MS,
      ),
      opacity: clamp(numberOr(random.opacity, DEFAULT_RANDOM.opacity), 0, 1),
    },
    frameAnimation: normalizeFrameAnimation({
      framesPerSecond: numberOr(
        frameAnimation.framesPerSecond,
        DEFAULT_FRAME_ANIMATION.framesPerSecond,
      ),
      startFrame: numberOr(
        frameAnimation.startFrame,
        DEFAULT_FRAME_ANIMATION.startFrame,
      ),
      endFrame:
        frameAnimation.endFrame === null
          ? null
          : numberOr(frameAnimation.endFrame, Number.NaN),
      playback: String(
        frameAnimation.playback ?? DEFAULT_FRAME_ANIMATION.playback,
      ) as FrameAnimationSettings["playback"],
      loop:
        typeof frameAnimation.loop === "boolean"
          ? frameAnimation.loop
          : DEFAULT_FRAME_ANIMATION.loop,
      randomStartFrame:
        typeof frameAnimation.randomStartFrame === "boolean"
          ? frameAnimation.randomStartFrame
          : DEFAULT_FRAME_ANIMATION.randomStartFrame,
    }),
    trail: {
      enabled:
        typeof trail.enabled === "boolean"
          ? trail.enabled
          : DEFAULT_TRAIL.enabled,
      count: Math.max(
        1,
        Math.min(16, Math.floor(numberOr(trail.count, DEFAULT_TRAIL.count))),
      ),
      spacing: Math.max(
        10,
        Math.min(500, numberOr(trail.spacing, DEFAULT_TRAIL.spacing)),
      ),
      lifetime: Math.max(
        50,
        Math.min(5000, numberOr(trail.lifetime, DEFAULT_TRAIL.lifetime)),
      ),
      opacity: Math.max(
        0,
        Math.min(1, numberOr(trail.opacity, DEFAULT_TRAIL.opacity)),
      ),
      scaleFalloff: Math.max(
        0,
        Math.min(1, numberOr(trail.scaleFalloff, DEFAULT_TRAIL.scaleFalloff)),
      ),
    },
    motionPath: {
      enabled:
        typeof motionPath.enabled === "boolean"
          ? motionPath.enabled
          : DEFAULT_MOTION_PATH.enabled,
      mode: ["curve", "spiral", "custom"].includes(String(motionPath.mode))
        ? (motionPath.mode as typeof DEFAULT_MOTION_PATH.mode)
        : DEFAULT_MOTION_PATH.mode,
      controlX: Math.max(
        -1000,
        Math.min(
          1000,
          numberOr(motionPath.controlX, DEFAULT_MOTION_PATH.controlX),
        ),
      ),
      controlY: Math.max(
        -1000,
        Math.min(
          1000,
          numberOr(motionPath.controlY, DEFAULT_MOTION_PATH.controlY),
        ),
      ),
      spiralTurns: Math.max(
        0.25,
        Math.min(
          8,
          numberOr(motionPath.spiralTurns, DEFAULT_MOTION_PATH.spiralTurns),
        ),
      ),
      spiralRadius: Math.max(
        0,
        Math.min(
          500,
          numberOr(motionPath.spiralRadius, DEFAULT_MOTION_PATH.spiralRadius),
        ),
      ),
      spiralClockwise:
        typeof motionPath.spiralClockwise === "boolean"
          ? motionPath.spiralClockwise
          : DEFAULT_MOTION_PATH.spiralClockwise,
      points: Array.isArray(motionPath.points)
        ? motionPath.points
            .filter(isRecord)
            .slice(0, MAX_MOTION_PATH_POINTS)
            .map((point) => ({
              x: Math.max(-1000, Math.min(1000, numberOr(point.x, 0))),
              y: Math.max(-1000, Math.min(1000, numberOr(point.y, 0))),
            }))
        : DEFAULT_MOTION_PATH.points.map((point) => ({ ...point })),
      orientToPath:
        typeof motionPath.orientToPath === "boolean"
          ? motionPath.orientToPath
          : DEFAULT_MOTION_PATH.orientToPath,
    },
  };

  const parsedFrames = Array.isArray(keyframes.frames)
    ? normalizeKeyframes(
        keyframes.frames.filter(isRecord).map((frame) => ({
          time: numberOr(frame.time, Number.NaN),
          scaleX: clamp(numberOr(frame.scaleX, 1), 0, MAX_VFX_SCALE),
          scaleY: clamp(numberOr(frame.scaleY, 1), 0, MAX_VFX_SCALE),
          opacity: clamp(numberOr(frame.opacity, 1), 0, 1),
          rotation: clamp(
            numberOr(frame.rotation, 0),
            -MAX_VFX_ROTATION_MAGNITUDE,
            MAX_VFX_ROTATION_MAGNITUDE,
          ),
        })),
      )
    : [];
  const baseWithKeyframes = {
    ...base,
    keyframes: {
      enabled:
        typeof keyframes.enabled === "boolean"
          ? keyframes.enabled && parsedFrames.length >= 2
          : DEFAULT_KEYFRAMES.enabled,
      initialized:
        typeof keyframes.initialized === "boolean"
          ? keyframes.initialized
          : parsedFrames.length >= 2,
      frames:
        parsedFrames.length >= 2
          ? parsedFrames
          : keyframesFromTransform(base.transform),
    },
  };

  if (type === "static" || type === "animated")
    return canonicalizeLayerCapabilities({
      ...baseWithKeyframes,
      type,
      spawn: null,
      beam: null,
    } as VfxLayer);
  if (type === "beam")
    return canonicalizeLayerCapabilities({
      ...baseWithKeyframes,
      type,
      spawn: null,
      beam: {
        endX: clamp(
          numberOr(beam.endX, DEFAULT_BEAM.endX),
          -MAX_VFX_POSITION_MAGNITUDE,
          MAX_VFX_POSITION_MAGNITUDE,
        ),
        endY: clamp(
          numberOr(beam.endY, DEFAULT_BEAM.endY),
          -MAX_VFX_POSITION_MAGNITUDE,
          MAX_VFX_POSITION_MAGNITUDE,
        ),
      },
    } as VfxLayer);
  const spawn = isRecord(value.spawn) ? value.spawn : {};
  const normalizedSpawnShape = [
    "point",
    "rectangle",
    "circle",
    "line",
    "arc",
    "mask",
  ].includes(String(spawn.shape))
    ? (spawn.shape as typeof DEFAULT_SPAWN.shape)
    : DEFAULT_SPAWN.shape;
  const normalizedDistribution = [
    "random",
    "edge",
    "even",
    "clustered",
    "stratified",
    "clusters",
  ].includes(String(spawn.distribution))
    ? (spawn.distribution as typeof DEFAULT_SPAWN.distribution)
    : DEFAULT_SPAWN.distribution;
  return {
    ...baseWithKeyframes,
    type,
    beam: null,
    spawn: {
      count: Math.max(
        1,
        Math.min(
          type === "emitter" ? 25 : 250,
          Math.floor(numberOr(spawn.count, DEFAULT_SPAWN.count)),
        ),
      ),
      intervalMin: Math.max(
        30,
        Math.min(
          MAX_VFX_EMITTER_INTERVAL_MS,
          numberOr(spawn.intervalMin, DEFAULT_SPAWN.intervalMin),
        ),
      ),
      intervalMax: Math.max(
        30,
        Math.min(
          MAX_VFX_EMITTER_INTERVAL_MS,
          numberOr(spawn.intervalMax, DEFAULT_SPAWN.intervalMax),
        ),
      ),
      maxAlive: Math.max(
        1,
        Math.min(
          500,
          Math.floor(numberOr(spawn.maxAlive, DEFAULT_SPAWN.maxAlive)),
        ),
      ),
      shape: normalizedSpawnShape,
      distribution:
        normalizedSpawnShape === "point" || normalizedSpawnShape === "mask"
          ? "random"
          : (normalizedSpawnShape === "line" ||
                normalizedSpawnShape === "arc") &&
              normalizedDistribution === "edge"
            ? "even"
            : (normalizedSpawnShape === "line" ||
                  normalizedSpawnShape === "arc") &&
                normalizedDistribution === "stratified"
              ? "random"
              : normalizedDistribution,
      stratifiedJitter: clamp(
        numberOr(spawn.stratifiedJitter, DEFAULT_SPAWN.stratifiedJitter),
        0,
        1,
      ),
      clusterCount: clamp(
        Math.floor(numberOr(spawn.clusterCount, DEFAULT_SPAWN.clusterCount)),
        2,
        8,
      ),
      clusterSpread: clamp(
        numberOr(spawn.clusterSpread, DEFAULT_SPAWN.clusterSpread),
        0,
        0.5,
      ),
      width: clamp(
        numberOr(spawn.width, DEFAULT_SPAWN.width),
        0,
        MAX_VFX_SPAWN_GEOMETRY,
      ),
      height: clamp(
        numberOr(spawn.height, DEFAULT_SPAWN.height),
        0,
        MAX_VFX_SPAWN_GEOMETRY,
      ),
      radius: clamp(
        numberOr(spawn.radius, DEFAULT_SPAWN.radius),
        0,
        MAX_VFX_SPAWN_GEOMETRY,
      ),
      lineLength: clamp(
        numberOr(spawn.lineLength, DEFAULT_SPAWN.lineLength),
        0,
        1000,
      ),
      lineAngle: clamp(
        numberOr(spawn.lineAngle, DEFAULT_SPAWN.lineAngle),
        -360,
        360,
      ),
      arcStartAngle: clamp(
        numberOr(spawn.arcStartAngle, DEFAULT_SPAWN.arcStartAngle),
        -360,
        360,
      ),
      arcSweep: clamp(
        numberOr(spawn.arcSweep, DEFAULT_SPAWN.arcSweep),
        -360,
        360,
      ),
      maskAssetId:
        typeof spawn.maskAssetId === "string" && spawn.maskAssetId.trim()
          ? spawn.maskAssetId.trim()
          : null,
      maskSize: clamp(
        numberOr(spawn.maskSize, DEFAULT_SPAWN.maskSize),
        0,
        1000,
      ),
      maskThreshold: clamp(
        numberOr(spawn.maskThreshold, DEFAULT_SPAWN.maskThreshold),
        0.01,
        1,
      ),
      direction: ["random", "outward", "inward", "fixed", "tangent"].includes(
        String(spawn.direction),
      )
        ? (spawn.direction as typeof DEFAULT_SPAWN.direction)
        : DEFAULT_SPAWN.direction,
      directionAngle: clamp(
        numberOr(spawn.directionAngle, DEFAULT_SPAWN.directionAngle),
        -360,
        360,
      ),
      directionSpread: clamp(
        numberOr(spawn.directionSpread, DEFAULT_SPAWN.directionSpread),
        0,
        180,
      ),
      rotateToDirection:
        typeof spawn.rotateToDirection === "boolean"
          ? spawn.rotateToDirection
          : false,
      artworkForwardAngle: clamp(
        numberOr(
          spawn.artworkForwardAngle,
          spawn.rotateSideways === true ? -90 : 0,
        ),
        -360,
        360,
      ),
      alignmentVariation: clamp(numberOr(spawn.alignmentVariation, 0), 0, 180),
    },
  } as VfxLayer;
}

function normalizeGroup(value: unknown, index: number): VfxGroup | null {
  if (!isRecord(value)) return null;
  const fallbackName = `Imported group ${index + 1}`;
  return {
    id: stringOr(value.id, `imported-group-${index}`),
    name: normalizedImportedName(value.name, fallbackName),
    x: clamp(
      numberOr(value.x, 0),
      -MAX_VFX_POSITION_MAGNITUDE,
      MAX_VFX_POSITION_MAGNITUDE,
    ),
    y: clamp(
      numberOr(value.y, 0),
      -MAX_VFX_POSITION_MAGNITUDE,
      MAX_VFX_POSITION_MAGNITUDE,
    ),
    delay: clamp(numberOr(value.delay, 0), 0, MAX_VFX_TIMING_MS),
  };
}

function normalizeTimeline(
  value: unknown,
  duration: number,
): VfxProject["timeline"] {
  if (!isRecord(value)) return { markers: [], notes: "" };
  const markerIds = new Set<string>();
  const markers = (Array.isArray(value.markers) ? value.markers : [])
    .slice(0, MAX_TIMELINE_MARKERS)
    .flatMap((candidate, index) => {
      if (!isRecord(candidate)) return [];
      const fallbackId = `imported-marker-${index}`;
      const id = stringOr(candidate.id, fallbackId).trim() || fallbackId;
      if (markerIds.has(id)) return [];
      markerIds.add(id);
      const label = stringOr(candidate.label, "Timing marker").trim();
      return [
        {
          id,
          time: clamp(numberOr(candidate.time, 0), 0, duration),
          label: (label || "Timing marker").slice(
            0,
            MAX_TIMELINE_MARKER_LABEL_LENGTH,
          ),
        },
      ];
    })
    .sort((left, right) => left.time - right.time);
  return {
    markers,
    notes: stringOr(value.notes, "").slice(0, MAX_TIMELINE_NOTES_LENGTH),
  };
}

function validateProjectUnchecked(input: unknown): ValidationResult {
  if (!isRecord(input))
    return { ok: false, error: "This file does not contain a Vvfx project." };
  if (
    input.formatVersion !== 1 &&
    input.formatVersion !== 2 &&
    input.formatVersion !== 3 &&
    input.formatVersion !== 4 &&
    input.formatVersion !== 5 &&
    input.formatVersion !== 6 &&
    input.formatVersion !== 7 &&
    input.formatVersion !== 8 &&
    input.formatVersion !== 9 &&
    input.formatVersion !== 10 &&
    input.formatVersion !== 11 &&
    input.formatVersion !== 12 &&
    input.formatVersion !== 13 &&
    input.formatVersion !== 14 &&
    input.formatVersion !== 15 &&
    input.formatVersion !== 16 &&
    input.formatVersion !== 17
  )
    return {
      ok: false,
      error:
        "This project uses a Vvfx format version that this app cannot open yet. Versions 1 through 17 are supported.",
    };
  if (!Array.isArray(input.layers) || !Array.isArray(input.assets)) {
    return {
      ok: false,
      error: "This project is missing its layers or image library.",
    };
  }
  const strictCurrentFormat =
    input.formatVersion === CURRENT_PROJECT_FORMAT_VERSION;
  if (input.layers.length > MAX_PROJECT_LAYERS)
    return {
      ok: false,
      error: `Projects are limited to ${MAX_PROJECT_LAYERS} layers.`,
    };
  if (input.assets.length > MAX_PROJECT_ASSETS)
    return {
      ok: false,
      error: `Projects are limited to ${MAX_PROJECT_ASSETS} images.`,
    };
  if (!isDenseArray(input.layers) || !isDenseArray(input.assets))
    return {
      ok: false,
      error: "This project's layers or image library is damaged.",
    };
  if (strictCurrentFormat && !Array.isArray(input.groups))
    return { ok: false, error: "This project is missing its effect groups." };
  if (Array.isArray(input.groups)) {
    if (input.groups.length > MAX_PROJECT_GROUPS)
      return {
        ok: false,
        error: `Projects are limited to ${MAX_PROJECT_GROUPS} effect groups.`,
      };
    if (!isDenseArray(input.groups))
      return { ok: false, error: "This project's effect groups are damaged." };
  }
  if (strictCurrentFormat && !isRecord(input.timeline))
    return { ok: false, error: "This project is missing its timeline." };
  if (isRecord(input.timeline)) {
    if (strictCurrentFormat && !Array.isArray(input.timeline.markers))
      return {
        ok: false,
        error: "This project is missing its timeline markers.",
      };
    if (
      input.timeline.markers !== undefined &&
      !Array.isArray(input.timeline.markers)
    )
      return {
        ok: false,
        error: "This project's timeline markers are damaged.",
      };
    if (
      Array.isArray(input.timeline.markers) &&
      input.timeline.markers.length > MAX_TIMELINE_MARKERS
    )
      return {
        ok: false,
        error: `Projects are limited to ${MAX_TIMELINE_MARKERS} timeline markers.`,
      };
    if (
      Array.isArray(input.timeline.markers) &&
      !isDenseArray(input.timeline.markers)
    )
      return {
        ok: false,
        error: "This project's timeline markers are damaged.",
      };
    if (Array.isArray(input.timeline.markers)) {
      const markerIds = new Set<string>();
      for (const marker of input.timeline.markers) {
        if (!isRecord(marker)) {
          if (strictCurrentFormat)
            return {
              ok: false,
              error: "This project contains a damaged timeline marker.",
            };
          continue;
        }
        if (
          (strictCurrentFormat || marker.id !== undefined) &&
          !isSafeVfxId(marker.id)
        )
          return {
            ok: false,
            error: "A timeline marker has an unsafe identifier.",
          };
        if (
          strictCurrentFormat &&
          (!isSafeVfxName(marker.label) ||
            typeof marker.time !== "number" ||
            !Number.isFinite(marker.time))
        )
          return {
            ok: false,
            error: "This project contains a damaged timeline marker.",
          };
        if (strictCurrentFormat && isSafeVfxId(marker.id)) {
          if (markerIds.has(marker.id))
            return {
              ok: false,
              error: "Two timeline markers share the same identifier.",
            };
          markerIds.add(marker.id);
        }
      }
    }
  }

  const metadata = isRecord(input.metadata) ? input.metadata : {};
  if (strictCurrentFormat && !isRecord(input.metadata))
    return { ok: false, error: "This project is missing its project details." };
  if (
    (strictCurrentFormat || metadata.id !== undefined) &&
    !isSafeVfxId(metadata.id)
  )
    return { ok: false, error: "This project's identifier is not safe." };
  if (strictCurrentFormat && !isSafeVfxName(metadata.name))
    return {
      ok: false,
      error: `Project names must be between 1 and ${MAX_VFX_NAME_LENGTH} characters (metadata.name).`,
    };

  for (const rawLayer of input.layers) {
    const collectionError = validateRawLayerCollections(
      rawLayer,
      strictCurrentFormat,
    );
    if (collectionError) return { ok: false, error: collectionError };
    const eventError = validateRawLayerEvents(rawLayer, strictCurrentFormat);
    if (eventError) return { ok: false, error: eventError };
    if (!isRecord(rawLayer)) continue;
    if (
      rawLayer.type !== "static" &&
      rawLayer.type !== "animated" &&
      rawLayer.type !== "beam" &&
      rawLayer.type !== "burst" &&
      rawLayer.type !== "emitter"
    )
      continue;
    if (
      (strictCurrentFormat || rawLayer.id !== undefined) &&
      !isSafeVfxId(rawLayer.id)
    )
      return { ok: false, error: "A layer has an unsafe identifier." };
    if (strictCurrentFormat && !isSafeVfxName(rawLayer.name))
      return {
        ok: false,
        error: `Layer names must be between 1 and ${MAX_VFX_NAME_LENGTH} characters.`,
      };
    for (const [reference, label] of [
      [rawLayer.assetId, "image"],
      [rawLayer.parentId, "parent layer"],
      [rawLayer.groupId, "effect group"],
    ] as const) {
      if (
        (strictCurrentFormat && reference !== null) ||
        (!strictCurrentFormat && typeof reference === "string")
      ) {
        if (!isSafeVfxId(reference))
          return {
            ok: false,
            error: `A layer contains an unsafe ${label} reference.`,
          };
      }
    }
    const spawn = isRecord(rawLayer.spawn) ? rawLayer.spawn : null;
    if (
      spawn &&
      spawn.maskAssetId !== undefined &&
      spawn.maskAssetId !== null &&
      !isSafeVfxId(spawn.maskAssetId)
    )
      return {
        ok: false,
        error: "A layer contains an unsafe silhouette-image reference.",
      };
    const appearance = isRecord(rawLayer.appearance)
      ? rawLayer.appearance
      : null;
    const effects =
      appearance && isRecord(appearance.effects) ? appearance.effects : null;
    const visualMask =
      effects && isRecord(effects.visualMask) ? effects.visualMask : null;
    if (
      visualMask &&
      visualMask.maskAssetId !== undefined &&
      visualMask.maskAssetId !== null &&
      !isSafeVfxId(visualMask.maskAssetId)
    )
      return {
        ok: false,
        error: "A layer contains an unsafe visual-mask image reference.",
      };
  }
  const layers = input.layers.map(normalizeLayer);
  if (layers.some((layer) => layer === null)) {
    return {
      ok: false,
      error: "One or more layers are damaged or use an unknown layer type.",
    };
  }
  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  const currentGroupIds = new Set<string>();
  for (const rawGroup of rawGroups) {
    if (!isRecord(rawGroup)) continue;
    if (
      (strictCurrentFormat || rawGroup.id !== undefined) &&
      !isSafeVfxId(rawGroup.id)
    )
      return { ok: false, error: "An effect group has an unsafe identifier." };
    if (strictCurrentFormat && !isSafeVfxName(rawGroup.name))
      return {
        ok: false,
        error: `Effect-group names must be between 1 and ${MAX_VFX_NAME_LENGTH} characters.`,
      };
    if (strictCurrentFormat && isSafeVfxId(rawGroup.id)) {
      if (currentGroupIds.has(rawGroup.id))
        return {
          ok: false,
          error: "Two effect groups share the same identifier.",
        };
      currentGroupIds.add(rawGroup.id);
    }
  }
  const normalizedGroups = rawGroups.map(normalizeGroup);
  if (normalizedGroups.some((group) => group === null))
    return {
      ok: false,
      error: "One or more effect groups are damaged.",
    };
  const groups = (normalizedGroups as VfxGroup[]).filter(
    (group, index, candidates) =>
      group.id &&
      candidates.findIndex((candidate) => candidate.id === group.id) === index,
  );
  const groupIds = new Set(groups.map((group) => group.id));
  if (
    strictCurrentFormat &&
    (layers as VfxLayer[]).some(
      (layer) => layer.groupId && !groupIds.has(layer.groupId),
    )
  )
    return {
      ok: false,
      error: "A layer refers to an effect group that no longer exists.",
    };
  const normalizedLayers = (layers as VfxLayer[]).map((layer) => ({
    ...layer,
    groupId:
      layer.groupId && groupIds.has(layer.groupId) ? layer.groupId : null,
  })) as VfxLayer[];
  const layerIds = new Set<string>();
  for (const layer of normalizedLayers) {
    if (!layer.id || layerIds.has(layer.id))
      return {
        ok: false,
        error:
          "Two layers share the same identifier. Rename or recreate one of them before importing this project.",
      };
    layerIds.add(layer.id);
  }
  for (const layer of normalizedLayers) {
    const eventIds = new Set<string>();
    for (const event of layer.events) {
      if (eventIds.has(event.id))
        return {
          ok: false,
          error: `Two events on “${layer.name}” share the same identifier. Recreate one of those event links and try again.`,
        };
      eventIds.add(event.id);
      if (!layerIds.has(event.targetLayerId))
        return {
          ok: false,
          error: `An event on “${layer.name}” targets a layer that no longer exists.`,
        };
      if (event.targetLayerId === layer.id)
        return {
          ok: false,
          error: `The layer “${layer.name}” cannot trigger itself. Choose another target layer.`,
        };
      if (
        layer.type === "emitter" &&
        (event.trigger === "percentage" || event.trigger === "finish")
      )
        return {
          ok: false,
          error: `The repeating-copies layer “${layer.name}” has no single percentage or finish point. Use Layer starts or Layer repeats.`,
        };
      if (layer.type === "static" && event.trigger === "copy-finish")
        return {
          ok: false,
          error: `The still-image layer "${layer.name}" has no animated copy ending. Use Layer finishes instead.`,
        };
    }
  }
  const eventCycle = findLayerEventCycle(normalizedLayers);
  if (eventCycle) {
    const layerNames = new Map(
      normalizedLayers.map((layer) => [layer.id, layer.name]),
    );
    return {
      ok: false,
      error: `This project contains a circular layer event: ${eventCycle
        .map((id) => layerNames.get(id) ?? id)
        .join(" → ")}. Remove one event link and try again.`,
    };
  }
  if (maximumLayerEventDepth(normalizedLayers) > MAX_EVENT_DEPTH)
    return {
      ok: false,
      error: `This project's layer-event chain is deeper than the supported ${MAX_EVENT_DEPTH} steps.`,
    };
  const preview = isRecord(input.preview) ? input.preview : {};
  const assets: VfxAsset[] = [];
  const importedAssetIds = new Set<string>();
  let embeddedImageBytes = 0;
  let embeddedImagePixels = 0;
  for (const value of input.assets) {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      typeof value.dataUrl !== "string"
    ) {
      if (strictCurrentFormat)
        return {
          ok: false,
          error: "This project contains a damaged image-library entry.",
        };
      continue;
    }
    if (!isSafeVfxId(value.id))
      return { ok: false, error: "An image has an unsafe identifier." };
    if (strictCurrentFormat && !isSafeVfxName(value.name))
      return {
        ok: false,
        error: `Image names must be between 1 and ${MAX_VFX_NAME_LENGTH} characters.`,
      };
    if (importedAssetIds.has(value.id))
      return {
        ok: false,
        error:
          "Two images share the same identifier. Remove the duplicate before importing this project.",
      };
    importedAssetIds.add(value.id);

    const canonicalBuiltIn = builtInAssetsById.get(value.id);
    if (canonicalBuiltIn) {
      const identityIsCanonical =
        value.mimeType === canonicalBuiltIn.mimeType &&
        value.dataUrl === canonicalBuiltIn.dataUrl &&
        value.builtIn === canonicalBuiltIn.builtIn;
      const currentOptionalFieldsAreCanonical =
        !strictCurrentFormat ||
        (value.transparency === canonicalBuiltIn.transparency &&
          value.width === undefined &&
          value.height === undefined &&
          (value.spriteSheet === undefined || value.spriteSheet === null) &&
          (value.atlasFrame === undefined || value.atlasFrame === null) &&
          (value.alphaMask === undefined || value.alphaMask === null));
      if (!identityIsCanonical || !currentOptionalFieldsAreCanonical)
        return {
          ok: false,
          error: `The built-in image "${canonicalBuiltIn.name}" has been altered and cannot be imported.`,
        };
      assets.push({
        ...canonicalBuiltIn,
        name: strictCurrentFormat
          ? value.name
          : normalizedImportedName(value.name, canonicalBuiltIn.name),
        spriteSheet: null,
        atlasFrame: null,
        alphaMask: null,
      });
      continue;
    }

    if (
      value.mimeType === "image/builtin" ||
      value.dataUrl.startsWith("builtin:") ||
      value.builtIn !== undefined
    )
      return {
        ok: false,
        error: "This project contains an unknown or mismatched built-in image.",
      };
    const expectedMimeType: PortableImageMimeType | undefined =
      value.mimeType === "image/png" || value.mimeType === "image/webp"
        ? value.mimeType
        : undefined;
    if (strictCurrentFormat && !expectedMimeType)
      return {
        ok: false,
        error: "An imported image does not declare PNG or WebP data.",
      };
    const inspection = inspectPortableImageDataUrl(
      value.dataUrl,
      expectedMimeType,
    );
    if (!inspection.ok)
      return {
        ok: false,
        error: `The image "${normalizedImportedName(value.name, "Imported image")}" could not be imported. ${inspection.error}`,
      };
    embeddedImageBytes += inspection.byteLength;
    embeddedImagePixels += inspection.width * inspection.height;
    if (embeddedImageBytes > MAX_PROJECT_EMBEDDED_IMAGE_BYTES)
      return {
        ok: false,
        error: `Embedded project images are limited to ${Math.floor(MAX_PROJECT_EMBEDDED_IMAGE_BYTES / 1024 / 1024)} MB in total.`,
      };
    if (embeddedImagePixels > MAX_PROJECT_IMAGE_PIXELS)
      return {
        ok: false,
        error:
          "This project's embedded images exceed the supported decoded-pixel budget.",
      };
    if (
      strictCurrentFormat &&
      (value.width !== inspection.width || value.height !== inspection.height)
    )
      return {
        ok: false,
        error: `The stored dimensions for "${value.name}" do not match its image data.`,
      };

    const transparency: VfxAsset["transparency"] =
      value.transparency === "no" || value.transparency === "yes"
        ? value.transparency
        : "unknown";
    const alphaMask = normalizeAssetAlphaMask(value.alphaMask);
    if (strictCurrentFormat && value.alphaMask != null && !alphaMask)
      return {
        ok: false,
        error: `The prepared silhouette data for "${value.name}" is damaged.`,
      };
    if (
      strictCurrentFormat &&
      value.spriteSheet != null &&
      !isRecord(value.spriteSheet)
    )
      return {
        ok: false,
        error: `The sprite-sheet settings for "${value.name}" are damaged.`,
      };
    const asset: VfxAsset = {
      id: value.id,
      name: strictCurrentFormat
        ? value.name
        : normalizedImportedName(value.name, "Imported image"),
      dataUrl: value.dataUrl,
      mimeType: inspection.mimeType,
      builtIn: undefined,
      transparency,
      width: inspection.width,
      height: inspection.height,
      spriteSheet: null,
      atlasFrame:
        typeof value.atlasFrame === "string" && value.atlasFrame.trim()
          ? value.atlasFrame.trim().slice(0, 160)
          : null,
      alphaMask,
    };
    if (isRecord(value.spriteSheet)) {
      asset.spriteSheet = normalizeSpriteSheet(asset, {
        frameWidth: numberOr(value.spriteSheet.frameWidth, 64),
        frameHeight: numberOr(value.spriteSheet.frameHeight, 64),
        frameCount: numberOr(value.spriteSheet.frameCount, 1),
      });
    }
    assets.push(asset);
  }
  const assetIds = new Set(assets.map((asset) => asset.id));
  for (const builtIn of BUILT_IN_ASSETS) {
    if (!assetIds.has(builtIn.id)) {
      assets.unshift({ ...builtIn });
      assetIds.add(builtIn.id);
    }
  }
  if (assets.length > MAX_PROJECT_ASSETS)
    return {
      ok: false,
      error: `Projects are limited to ${MAX_PROJECT_ASSETS} images.`,
    };
  for (const layer of normalizedLayers) {
    const asset = layer.assetId
      ? assets.find((candidate) => candidate.id === layer.assetId)
      : undefined;
    layer.frameAnimation = asset?.spriteSheet
      ? normalizeFrameAnimation(
          layer.frameAnimation,
          asset.spriteSheet.frameCount,
        )
      : { ...DEFAULT_FRAME_ANIMATION };
    if (layer.assetId && !assetIds.has(layer.assetId))
      return {
        ok: false,
        error: `The layer “${layer.name}” refers to an image that is missing from this project.`,
      };
    const visualMask = layer.appearance.effects.visualMask;
    if (visualMask.enabled && !visualMask.maskAssetId)
      return {
        ok: false,
        error: `The layer "${layer.name}" has a visual mask enabled but no mask image selected.`,
      };
    if (visualMask.maskAssetId) {
      const visualMaskAsset = assets.find(
        (candidate) => candidate.id === visualMask.maskAssetId,
      );
      if (!visualMaskAsset)
        return {
          ok: false,
          error: `The visual mask used by "${layer.name}" is missing from this project.`,
        };
      if (visualMaskAsset.spriteSheet)
        return {
          ok: false,
          error: `The visual mask used by "${layer.name}" must be a still image, not a sprite sheet.`,
        };
    }
    if (isSpawnLayer(layer) && layer.spawn.maskAssetId) {
      const retainedMaskAsset = assets.find(
        (candidate) => candidate.id === layer.spawn.maskAssetId,
      );
      if (!retainedMaskAsset)
        return {
          ok: false,
          error: `The layer “${layer.name}” keeps a reference to an image silhouette that is missing from this project.`,
        };
      if (
        retainedMaskAsset.builtIn ||
        retainedMaskAsset.spriteSheet ||
        !retainedMaskAsset.alphaMask
      )
        return {
          ok: false,
          error: `The image silhouette kept by “${layer.name}” has not been prepared from a still PNG or WebP.`,
        };
    }
    if (isSpawnLayer(layer) && layer.spawn.shape === "mask") {
      const maskAsset = layer.spawn.maskAssetId
        ? assets.find((candidate) => candidate.id === layer.spawn.maskAssetId)
        : undefined;
      if (!maskAsset)
        return {
          ok: false,
          error: `The layer â€œ${layer.name}â€ uses an image silhouette that is missing from this project.`,
        };
      if (maskAsset.builtIn || maskAsset.spriteSheet || !maskAsset.alphaMask)
        return {
          ok: false,
          error: `The image silhouette used by â€œ${layer.name}â€ has not been prepared from a still PNG or WebP.`,
        };
      if (
        maximumAlphaMaskValue(maskAsset.alphaMask) <
        alphaMaskThresholdByte(layer.spawn.maskThreshold)
      )
        return {
          ok: false,
          error: `No visible pixels remain in the image silhouette used by â€œ${layer.name}â€. Lower Minimum opacity or choose another image.`,
        };
    }
    if (layer.parentId && !layerIds.has(layer.parentId))
      return {
        ok: false,
        error: `The layer “${layer.name}” is attached to a layer that no longer exists.`,
      };
  }
  if (findLayerAttachmentCycle(normalizedLayers))
    return {
      ok: false,
      error:
        "This project contains a circular layer attachment. Detach one of the linked layers and try again.",
    };
  if (maximumLayerAttachmentDepth(normalizedLayers) > MAX_ATTACHMENT_DEPTH)
    return {
      ok: false,
      error: `This project's layer-attachment chain is deeper than the supported ${MAX_ATTACHMENT_DEPTH} steps.`,
    };
  const now = new Date().toISOString();
  const previewDuration = clamp(numberOr(preview.duration, 3000), 500, 30_000);
  const project: VfxProject = {
    formatVersion: 17,
    metadata: {
      id: stringOr(metadata.id, `project-${Date.now()}`),
      name: normalizedImportedName(metadata.name, "Imported Vvfx project"),
      createdAt: stringOr(metadata.createdAt, now),
      updatedAt: stringOr(metadata.updatedAt, now),
    },
    assets,
    preview: {
      background: ["checkerboard", "black", "dark", "white", "custom"].includes(
        String(preview.background),
      )
        ? (preview.background as VfxProject["preview"]["background"])
        : "checkerboard",
      customColor: stringOr(preview.customColor, "#142039"),
      showGrid:
        typeof preview.showGrid === "boolean" ? preview.showGrid : false,
      zoom: Math.max(0.25, Math.min(3, numberOr(preview.zoom, 1))),
      loop: typeof preview.loop === "boolean" ? preview.loop : true,
      duration: previewDuration,
      randomSeed: Math.floor(numberOr(preview.randomSeed, 8421)),
    },
    timeline: normalizeTimeline(input.timeline, previewDuration),
    groups,
    layers: normalizedLayers,
  };
  return { ok: true, project };
}

/** Validation is a total boundary: malformed caller data never escapes as a raw exception. */
export function validateProject(input: unknown): ValidationResult {
  try {
    return validateProjectUnchecked(input);
  } catch {
    return {
      ok: false,
      error:
        "This project contains damaged or unsupported data and could not be opened.",
    };
  }
}

export type ProjectBoundary =
  | "browser-save"
  | "recovery-save"
  | "project-export"
  | "runtime-export"
  | "standalone-export"
  | "preview-export";

export type ProjectIntegrityResult =
  | { ok: true; project: VfxProject }
  | { ok: false; error: string; path?: string };

function canonicalBoundaryProject(project: VfxProject): unknown {
  const timeline = isRecord(project.timeline)
    ? {
        ...project.timeline,
        notes:
          typeof project.timeline.notes === "string"
            ? project.timeline.notes.slice(0, 12_000)
            : project.timeline.notes,
        markers: Array.isArray(project.timeline.markers)
          ? project.timeline.markers.map((marker) => {
              if (!isRecord(marker) || typeof marker.label !== "string")
                return marker;
              const label = marker.label.trim();
              return {
                ...marker,
                label: (label || "Timing marker").slice(0, 120),
              };
            })
          : project.timeline.markers,
      }
    : project.timeline;
  return {
    ...project,
    assets: Array.isArray(project.assets)
      ? project.assets.map((asset) => {
          if (!isRecord(asset)) return asset;
          return {
            ...asset,
            transparency: asset.transparency ?? "unknown",
            spriteSheet: asset.spriteSheet ?? null,
            atlasFrame:
              typeof asset.atlasFrame === "string"
                ? asset.atlasFrame.trim().slice(0, 160) || null
                : (asset.atlasFrame ?? null),
            alphaMask: asset.alphaMask ?? null,
          };
        })
      : project.assets,
    timeline,
    groups: Array.isArray(project.groups)
      ? project.groups.map((group, index) => {
          if (!isRecord(group) || typeof group.name !== "string") return group;
          const fallbackName = `Imported group ${index + 1}`;
          const name = group.name.trim().slice(0, 120);
          return { ...group, name: name || fallbackName };
        })
      : project.groups,
  };
}

function definedObjectEntries(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
}

function firstIntegrityDifference(
  current: unknown,
  normalized: unknown,
  path = "project",
): string | null {
  if (Object.is(current, normalized)) return null;
  if (Array.isArray(current) || Array.isArray(normalized)) {
    if (!Array.isArray(current) || !Array.isArray(normalized)) return path;
    if (current.length !== normalized.length) return `${path}.length`;
    for (let index = 0; index < current.length; index += 1) {
      const difference = firstIntegrityDifference(
        current[index],
        normalized[index],
        `${path}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }
  if (isRecord(current) || isRecord(normalized)) {
    if (!isRecord(current) || !isRecord(normalized)) return path;
    const currentEntries = definedObjectEntries(current);
    const normalizedEntries = definedObjectEntries(normalized);
    if (currentEntries.length !== normalizedEntries.length) return path;
    for (let index = 0; index < currentEntries.length; index += 1) {
      const [currentKey, currentValue] = currentEntries[index];
      const [normalizedKey, normalizedValue] = normalizedEntries[index];
      if (currentKey !== normalizedKey) return `${path}.${currentKey}`;
      const difference = firstIntegrityDifference(
        currentValue,
        normalizedValue,
        `${path}.${currentKey}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return path;
}

/** Strict validation for current editor state at every outbound boundary. */
export function validateCurrentProject(
  project: VfxProject,
): ProjectIntegrityResult {
  if (!isRecord(project))
    return {
      ok: false,
      error: "This project does not contain valid Vvfx project data.",
      path: "project",
    };
  if (project.formatVersion !== 17)
    return {
      ok: false,
      error:
        "This project must be opened and upgraded before it can be saved or exported.",
      path: "project.formatVersion",
    };
  const validation = validateProject(project);
  if (!validation.ok || !validation.project)
    return {
      ok: false,
      error: validation.error ?? "This project contains invalid data.",
    };
  const path = firstIntegrityDifference(
    canonicalBoundaryProject(project),
    canonicalBoundaryProject(validation.project),
  );
  if (path)
    return {
      ok: false,
      error: `This project contains an unsupported or inconsistent value at ${path}. Undo the latest change and try again.`,
      path,
    };
  return { ok: true, project: validation.project };
}

export function requireCurrentProject(
  project: VfxProject,
  boundary: ProjectBoundary,
): VfxProject {
  const result = validateCurrentProject(
    canonicalizeProjectLayerCapabilities(project),
  );
  if (result.ok) return result.project;
  const action =
    boundary === "browser-save"
      ? "saved"
      : boundary === "recovery-save"
        ? "added to recovery"
        : boundary === "preview-export"
          ? "recorded"
          : "exported";
  throw new Error(`This project cannot be ${action}. ${result.error}`);
}

export function serializeProject(project: VfxProject): string {
  const currentProject = requireCurrentProject(project, "project-export");
  const serialized = JSON.stringify(
    {
      ...currentProject,
      metadata: {
        ...currentProject.metadata,
        updatedAt: new Date().toISOString(),
      },
    },
    null,
    2,
  );
  if (
    serialized.length > MAX_PROJECT_FILE_BYTES ||
    utf8ByteLength(serialized) > MAX_PROJECT_FILE_BYTES
  )
    throw new Error(
      `This project cannot be exported. Project files are limited to ${Math.floor(MAX_PROJECT_FILE_BYTES / 1024 / 1024)} MB.`,
    );
  return serialized;
}

export function deserializeProject(text: string): ValidationResult {
  if (typeof text !== "string")
    return {
      ok: false,
      error: "This file is not valid JSON. Try exporting it from Vvfx again.",
    };
  if (
    text.length > MAX_PROJECT_FILE_BYTES ||
    utf8ByteLength(text) > MAX_PROJECT_FILE_BYTES
  )
    return {
      ok: false,
      error: `This project file is larger than the supported ${Math.floor(MAX_PROJECT_FILE_BYTES / 1024 / 1024)} MB limit.`,
    };
  try {
    return validateProject(JSON.parse(text) as unknown);
  } catch {
    return {
      ok: false,
      error: "This file is not valid JSON. Try exporting it from Vvfx again.",
    };
  }
}
