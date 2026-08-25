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
import { normalizeColorStops, normalizeHexColor } from "./color";
import {
  findLayerEventCycle,
  maximumLayerEventDepth,
  MAX_EVENT_DEPTH,
  MAX_EVENTS_PER_LAYER,
} from "./events";
import { keyframesFromTransform, normalizeKeyframes } from "./keyframes";
import { normalizeFrameAnimation, normalizeSpriteSheet } from "./spriteSheet";
import { normalizeRenderingEffects } from "./renderingEffects";
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
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const stringOr = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

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

function validateRawLayerEvents(value: unknown): string | null {
  if (!isRecord(value) || value.events === undefined) return null;
  if (!Array.isArray(value.events)) return "A layer's event list is damaged.";
  if (value.events.length > MAX_EVENTS_PER_LAYER)
    return `A layer contains more than the supported ${MAX_EVENTS_PER_LAYER} events.`;
  for (const event of value.events) {
    if (
      !isRecord(event) ||
      typeof event.id !== "string" ||
      !event.id.trim() ||
      !["start", "percentage", "finish", "repeat", "copy-finish"].includes(
        String(event.trigger),
      ) ||
      !["play", "restart"].includes(String(event.action)) ||
      typeof event.targetLayerId !== "string" ||
      !event.targetLayerId.trim()
    )
      return "A layer event is damaged or missing its target.";
    if (
      event.trigger === "percentage" &&
      (typeof event.percentage !== "number" ||
        !Number.isFinite(event.percentage))
    )
      return "A percentage event is missing a valid chosen point.";
  }
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
    name: stringOr(value.name, `Imported layer ${index + 1}`),
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
      x: numberOr(transform.x, DEFAULT_TRANSFORM.x),
      y: numberOr(transform.y, DEFAULT_TRANSFORM.y),
      startScale: numberOr(transform.startScale, DEFAULT_TRANSFORM.startScale),
      endScale: numberOr(transform.endScale, DEFAULT_TRANSFORM.endScale),
      startScaleX: numberOr(
        transform.startScaleX,
        DEFAULT_TRANSFORM.startScaleX,
      ),
      startScaleY: numberOr(
        transform.startScaleY,
        DEFAULT_TRANSFORM.startScaleY,
      ),
      endScaleX: numberOr(transform.endScaleX, DEFAULT_TRANSFORM.endScaleX),
      endScaleY: numberOr(transform.endScaleY, DEFAULT_TRANSFORM.endScaleY),
      separateScale:
        typeof transform.separateScale === "boolean"
          ? transform.separateScale
          : false,
      startOpacity: numberOr(
        transform.startOpacity,
        DEFAULT_TRANSFORM.startOpacity,
      ),
      endOpacity: numberOr(transform.endOpacity, DEFAULT_TRANSFORM.endOpacity),
      rotation: numberOr(transform.rotation, DEFAULT_TRANSFORM.rotation),
      rotationDuring: numberOr(
        transform.rotationDuring,
        DEFAULT_TRANSFORM.rotationDuring,
      ),
      movementX: numberOr(transform.movementX, DEFAULT_TRANSFORM.movementX),
      movementY: numberOr(transform.movementY, DEFAULT_TRANSFORM.movementY),
    },
    timing: {
      delay: Math.max(0, numberOr(timing.delay, DEFAULT_TIMING.delay)),
      duration: Math.max(
        50,
        numberOr(timing.duration, DEFAULT_TIMING.duration),
      ),
      repeat: Math.max(
        0,
        Math.floor(numberOr(timing.repeat, DEFAULT_TIMING.repeat)),
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
      positionX: Math.max(
        0,
        numberOr(random.positionX, DEFAULT_RANDOM.positionX),
      ),
      positionY: Math.max(
        0,
        numberOr(random.positionY, DEFAULT_RANDOM.positionY),
      ),
      startScale: Math.max(
        0,
        numberOr(random.startScale, DEFAULT_RANDOM.startScale),
      ),
      endScale: Math.max(0, numberOr(random.endScale, DEFAULT_RANDOM.endScale)),
      rotation: Math.max(0, numberOr(random.rotation, DEFAULT_RANDOM.rotation)),
      duration: Math.max(0, numberOr(random.duration, DEFAULT_RANDOM.duration)),
      movementX: Math.max(
        0,
        numberOr(random.movementX, DEFAULT_RANDOM.movementX),
      ),
      movementY: Math.max(
        0,
        numberOr(random.movementY, DEFAULT_RANDOM.movementY),
      ),
      delay: Math.max(0, numberOr(random.delay, DEFAULT_RANDOM.delay)),
      opacity: Math.max(0, numberOr(random.opacity, DEFAULT_RANDOM.opacity)),
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
            .slice(0, 6)
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
          scaleX: numberOr(frame.scaleX, 1),
          scaleY: numberOr(frame.scaleY, 1),
          opacity: numberOr(frame.opacity, 1),
          rotation: numberOr(frame.rotation, 0),
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
    return { ...baseWithKeyframes, type, spawn: null, beam: null } as VfxLayer;
  if (type === "beam")
    return {
      ...baseWithKeyframes,
      type,
      spawn: null,
      beam: {
        endX: clamp(numberOr(beam.endX, DEFAULT_BEAM.endX), -5000, 5000),
        endY: clamp(numberOr(beam.endY, DEFAULT_BEAM.endY), -5000, 5000),
      },
    } as VfxLayer;
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
        numberOr(spawn.intervalMin, DEFAULT_SPAWN.intervalMin),
      ),
      intervalMax: Math.max(
        30,
        numberOr(spawn.intervalMax, DEFAULT_SPAWN.intervalMax),
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
      width: Math.max(0, numberOr(spawn.width, DEFAULT_SPAWN.width)),
      height: Math.max(0, numberOr(spawn.height, DEFAULT_SPAWN.height)),
      radius: Math.max(0, numberOr(spawn.radius, DEFAULT_SPAWN.radius)),
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
      directionAngle: numberOr(
        spawn.directionAngle,
        DEFAULT_SPAWN.directionAngle,
      ),
      directionSpread: Math.max(
        0,
        numberOr(spawn.directionSpread, DEFAULT_SPAWN.directionSpread),
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
  const name = stringOr(value.name, fallbackName).trim().slice(0, 120);
  return {
    id: stringOr(value.id, `imported-group-${index}`),
    name: name || fallbackName,
    x: Math.max(-5000, Math.min(5000, numberOr(value.x, 0))),
    y: Math.max(-5000, Math.min(5000, numberOr(value.y, 0))),
    delay: Math.max(0, Math.min(30_000, numberOr(value.delay, 0))),
  };
}

function normalizeTimeline(
  value: unknown,
  duration: number,
): VfxProject["timeline"] {
  if (!isRecord(value)) return { markers: [], notes: "" };
  const markerIds = new Set<string>();
  const markers = (Array.isArray(value.markers) ? value.markers : [])
    .slice(0, 100)
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
          label: (label || "Timing marker").slice(0, 120),
        },
      ];
    })
    .sort((left, right) => left.time - right.time);
  return {
    markers,
    notes: stringOr(value.notes, "").slice(0, 12_000),
  };
}

export function validateProject(input: unknown): ValidationResult {
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
  for (const rawLayer of input.layers) {
    const eventError = validateRawLayerEvents(rawLayer);
    if (eventError) return { ok: false, error: eventError };
  }
  const layers = input.layers.map(normalizeLayer);
  if (layers.some((layer) => layer === null)) {
    return {
      ok: false,
      error: "One or more layers are damaged or use an unknown layer type.",
    };
  }
  const normalizedGroups = Array.isArray(input.groups)
    ? input.groups.map(normalizeGroup)
    : [];
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
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const preview = isRecord(input.preview) ? input.preview : {};
  const assets: VfxAsset[] = [];
  const importedAssetIds = new Set<string>();
  for (const value of input.assets) {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      typeof value.dataUrl !== "string"
    )
      continue;
    if (importedAssetIds.has(value.id))
      return {
        ok: false,
        error:
          "Two images share the same identifier. Remove the duplicate before importing this project.",
      };
    importedAssetIds.add(value.id);
    const mimeType: VfxAsset["mimeType"] =
      value.mimeType === "image/webp" || value.mimeType === "image/builtin"
        ? value.mimeType
        : "image/png";
    const transparency: VfxAsset["transparency"] =
      value.transparency === "no" || value.transparency === "yes"
        ? value.transparency
        : "unknown";
    const width = Math.max(0, Math.floor(numberOr(value.width, 0)));
    const height = Math.max(0, Math.floor(numberOr(value.height, 0)));
    const asset: VfxAsset = {
      id: value.id,
      name: value.name,
      dataUrl: value.dataUrl,
      mimeType,
      builtIn: ["flash", "ring", "spark", "cloud"].includes(
        String(value.builtIn),
      )
        ? (value.builtIn as "flash" | "ring" | "spark" | "cloud")
        : undefined,
      transparency,
      width: width || undefined,
      height: height || undefined,
      spriteSheet: null,
      atlasFrame:
        typeof value.atlasFrame === "string" && value.atlasFrame.trim()
          ? value.atlasFrame.trim().slice(0, 160)
          : null,
      alphaMask: normalizeAssetAlphaMask(value.alphaMask),
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
  for (const layer of normalizedLayers) {
    const asset = layer.assetId
      ? assets.find((candidate) => candidate.id === layer.assetId)
      : undefined;
    layer.frameAnimation = normalizeFrameAnimation(
      layer.frameAnimation,
      asset?.spriteSheet?.frameCount,
    );
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
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(normalizedLayers.map((layer) => [layer.id, layer]));
  const hasParentCycle = (layerId: string): boolean => {
    if (visiting.has(layerId)) return true;
    if (visited.has(layerId)) return false;
    visiting.add(layerId);
    const parentId = byId.get(layerId)?.parentId;
    const cyclic = parentId ? hasParentCycle(parentId) : false;
    visiting.delete(layerId);
    visited.add(layerId);
    return cyclic;
  };
  if (normalizedLayers.some((layer) => hasParentCycle(layer.id)))
    return {
      ok: false,
      error:
        "This project contains a circular layer attachment. Detach one of the linked layers and try again.",
    };
  const now = new Date().toISOString();
  const previewDuration = clamp(numberOr(preview.duration, 3000), 500, 30_000);
  const project: VfxProject = {
    formatVersion: 17,
    metadata: {
      id: stringOr(metadata.id, `project-${Date.now()}`),
      name: stringOr(metadata.name, "Imported Vvfx project"),
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

export function serializeProject(project: VfxProject): string {
  return JSON.stringify(
    {
      ...project,
      metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
    },
    null,
    2,
  );
}

export function deserializeProject(text: string): ValidationResult {
  try {
    return validateProject(JSON.parse(text) as unknown);
  } catch {
    return {
      ok: false,
      error: "This file is not valid JSON. Try exporting it from Vvfx again.",
    };
  }
}
