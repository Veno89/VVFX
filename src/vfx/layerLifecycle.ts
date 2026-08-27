import {
  DEFAULT_BEHAVIOR,
  DEFAULT_COLOR_OVER_LIFETIME,
  DEFAULT_FRAME_ANIMATION,
  DEFAULT_KEYFRAMES,
  DEFAULT_MOTION_PATH,
  DEFAULT_RANDOM,
  DEFAULT_TIMING,
  DEFAULT_TRAIL,
  DEFAULT_TRANSFORM,
} from "./defaults";
import type { LayerEvent, VfxLayer, VfxProject } from "./types";

export type CopyableLayerSettings = Pick<
  VfxLayer,
  | "assetId"
  | "transform"
  | "timing"
  | "appearance"
  | "behavior"
  | "random"
  | "frameAnimation"
  | "trail"
  | "motionPath"
  | "keyframes"
  | "beam"
  | "parentId"
> & { spawn: VfxLayer["spawn"] };

function defaultBehavior(): VfxLayer["behavior"] {
  return {
    pulse: {
      ...DEFAULT_BEHAVIOR.pulse,
      envelope: { ...DEFAULT_BEHAVIOR.pulse.envelope },
    },
    flicker: {
      ...DEFAULT_BEHAVIOR.flicker,
      envelope: { ...DEFAULT_BEHAVIOR.flicker.envelope },
    },
    wobble: {
      ...DEFAULT_BEHAVIOR.wobble,
      envelope: { ...DEFAULT_BEHAVIOR.wobble.envelope },
    },
    physics: {
      ...DEFAULT_BEHAVIOR.physics,
      gravityEnvelope: { ...DEFAULT_BEHAVIOR.physics.gravityEnvelope },
    },
  };
}

function defaultMotionPath(): VfxLayer["motionPath"] {
  return {
    ...DEFAULT_MOTION_PATH,
    points: DEFAULT_MOTION_PATH.points.map((point) => ({ ...point })),
  };
}

function defaultKeyframes(): VfxLayer["keyframes"] {
  return {
    ...DEFAULT_KEYFRAMES,
    frames: DEFAULT_KEYFRAMES.frames.map((frame) => ({ ...frame })),
  };
}

function isDefaultEnvelope(
  envelope: VfxLayer["behavior"]["pulse"]["envelope"],
  expected: VfxLayer["behavior"]["pulse"]["envelope"],
): boolean {
  return (
    !!envelope &&
    envelope.enabled === expected.enabled &&
    envelope.start === expected.start &&
    envelope.attackEnd === expected.attackEnd &&
    envelope.releaseStart === expected.releaseStart &&
    envelope.end === expected.end
  );
}

function isDefaultBehavior(behavior: VfxLayer["behavior"]): boolean {
  return (
    !!behavior?.pulse &&
    behavior.pulse.enabled === DEFAULT_BEHAVIOR.pulse.enabled &&
    behavior.pulse.scale === DEFAULT_BEHAVIOR.pulse.scale &&
    behavior.pulse.opacity === DEFAULT_BEHAVIOR.pulse.opacity &&
    behavior.pulse.speed === DEFAULT_BEHAVIOR.pulse.speed &&
    isDefaultEnvelope(
      behavior.pulse.envelope,
      DEFAULT_BEHAVIOR.pulse.envelope,
    ) &&
    !!behavior.flicker &&
    behavior.flicker.enabled === DEFAULT_BEHAVIOR.flicker.enabled &&
    behavior.flicker.amount === DEFAULT_BEHAVIOR.flicker.amount &&
    behavior.flicker.speed === DEFAULT_BEHAVIOR.flicker.speed &&
    behavior.flicker.randomness === DEFAULT_BEHAVIOR.flicker.randomness &&
    isDefaultEnvelope(
      behavior.flicker.envelope,
      DEFAULT_BEHAVIOR.flicker.envelope,
    ) &&
    !!behavior.wobble &&
    behavior.wobble.enabled === DEFAULT_BEHAVIOR.wobble.enabled &&
    behavior.wobble.x === DEFAULT_BEHAVIOR.wobble.x &&
    behavior.wobble.y === DEFAULT_BEHAVIOR.wobble.y &&
    behavior.wobble.rotation === DEFAULT_BEHAVIOR.wobble.rotation &&
    behavior.wobble.speed === DEFAULT_BEHAVIOR.wobble.speed &&
    behavior.wobble.style === DEFAULT_BEHAVIOR.wobble.style &&
    behavior.wobble.smoothness === DEFAULT_BEHAVIOR.wobble.smoothness &&
    isDefaultEnvelope(
      behavior.wobble.envelope,
      DEFAULT_BEHAVIOR.wobble.envelope,
    ) &&
    !!behavior.physics &&
    behavior.physics.gravity === DEFAULT_BEHAVIOR.physics.gravity &&
    behavior.physics.drag === DEFAULT_BEHAVIOR.physics.drag &&
    isDefaultEnvelope(
      behavior.physics.gravityEnvelope,
      DEFAULT_BEHAVIOR.physics.gravityEnvelope,
    )
  );
}

function isDefaultRandom(random: VfxLayer["random"]): boolean {
  return (
    !!random &&
    random.positionX === DEFAULT_RANDOM.positionX &&
    random.positionY === DEFAULT_RANDOM.positionY &&
    random.startScale === DEFAULT_RANDOM.startScale &&
    random.endScale === DEFAULT_RANDOM.endScale &&
    random.rotation === DEFAULT_RANDOM.rotation &&
    random.duration === DEFAULT_RANDOM.duration &&
    random.movementX === DEFAULT_RANDOM.movementX &&
    random.movementY === DEFAULT_RANDOM.movementY &&
    random.delay === DEFAULT_RANDOM.delay &&
    random.opacity === DEFAULT_RANDOM.opacity
  );
}

function isDefaultTrail(trail: VfxLayer["trail"]): boolean {
  return (
    !!trail &&
    trail.enabled === DEFAULT_TRAIL.enabled &&
    trail.count === DEFAULT_TRAIL.count &&
    trail.spacing === DEFAULT_TRAIL.spacing &&
    trail.lifetime === DEFAULT_TRAIL.lifetime &&
    trail.opacity === DEFAULT_TRAIL.opacity &&
    trail.scaleFalloff === DEFAULT_TRAIL.scaleFalloff
  );
}

function isDefaultMotionPath(path: VfxLayer["motionPath"]): boolean {
  return (
    !!path &&
    path.enabled === DEFAULT_MOTION_PATH.enabled &&
    path.mode === DEFAULT_MOTION_PATH.mode &&
    path.controlX === DEFAULT_MOTION_PATH.controlX &&
    path.controlY === DEFAULT_MOTION_PATH.controlY &&
    path.spiralTurns === DEFAULT_MOTION_PATH.spiralTurns &&
    path.spiralRadius === DEFAULT_MOTION_PATH.spiralRadius &&
    path.spiralClockwise === DEFAULT_MOTION_PATH.spiralClockwise &&
    path.orientToPath === DEFAULT_MOTION_PATH.orientToPath &&
    Array.isArray(path.points) &&
    path.points.length === DEFAULT_MOTION_PATH.points.length &&
    path.points.every(
      (point, index) =>
        !!point &&
        point.x === DEFAULT_MOTION_PATH.points[index].x &&
        point.y === DEFAULT_MOTION_PATH.points[index].y,
    )
  );
}

function isDefaultKeyframes(keyframes: VfxLayer["keyframes"]): boolean {
  return (
    !!keyframes &&
    keyframes.enabled === DEFAULT_KEYFRAMES.enabled &&
    keyframes.initialized === DEFAULT_KEYFRAMES.initialized &&
    Array.isArray(keyframes.frames) &&
    keyframes.frames.length === DEFAULT_KEYFRAMES.frames.length &&
    keyframes.frames.every((frame, index) => {
      const expected = DEFAULT_KEYFRAMES.frames[index];
      return (
        !!frame &&
        frame.time === expected.time &&
        frame.scaleX === expected.scaleX &&
        frame.scaleY === expected.scaleY &&
        frame.opacity === expected.opacity &&
        frame.rotation === expected.rotation
      );
    })
  );
}

function isDefaultFrameAnimation(
  animation: VfxLayer["frameAnimation"],
): boolean {
  return (
    !!animation &&
    animation.framesPerSecond === DEFAULT_FRAME_ANIMATION.framesPerSecond &&
    animation.startFrame === DEFAULT_FRAME_ANIMATION.startFrame &&
    animation.endFrame === DEFAULT_FRAME_ANIMATION.endFrame &&
    animation.playback === DEFAULT_FRAME_ANIMATION.playback &&
    animation.loop === DEFAULT_FRAME_ANIMATION.loop &&
    animation.randomStartFrame === DEFAULT_FRAME_ANIMATION.randomStartFrame
  );
}

function isDefaultColorOverLifetime(
  color: VfxLayer["appearance"]["colorOverLifetime"],
): boolean {
  return (
    !!color &&
    color.enabled === DEFAULT_COLOR_OVER_LIFETIME.enabled &&
    Array.isArray(color.stops) &&
    color.stops.length === DEFAULT_COLOR_OVER_LIFETIME.stops.length &&
    color.stops.every(
      (stop, index) =>
        !!stop &&
        stop.time === DEFAULT_COLOR_OVER_LIFETIME.stops[index].time &&
        stop.color === DEFAULT_COLOR_OVER_LIFETIME.stops[index].color,
    )
  );
}

function isDefaultCustomEasing(
  easing: VfxLayer["timing"]["customEasing"],
): boolean {
  return (
    !!easing &&
    easing.x1 === DEFAULT_TIMING.customEasing.x1 &&
    easing.y1 === DEFAULT_TIMING.customEasing.y1 &&
    easing.x2 === DEFAULT_TIMING.customEasing.x2 &&
    easing.y2 === DEFAULT_TIMING.customEasing.y2
  );
}

function hasCanonicalStaticCapabilities(
  layer: Extract<VfxLayer, { type: "static" }>,
): boolean {
  return (
    layer.transform.endScale === layer.transform.startScale &&
    layer.transform.endScaleX === layer.transform.startScaleX &&
    layer.transform.endScaleY === layer.transform.startScaleY &&
    layer.transform.endOpacity === layer.transform.startOpacity &&
    layer.transform.rotationDuring === DEFAULT_TRANSFORM.rotationDuring &&
    layer.transform.movementX === DEFAULT_TRANSFORM.movementX &&
    layer.transform.movementY === DEFAULT_TRANSFORM.movementY &&
    layer.timing.repeat === DEFAULT_TIMING.repeat &&
    layer.timing.repeatForever === DEFAULT_TIMING.repeatForever &&
    layer.timing.yoyo === DEFAULT_TIMING.yoyo &&
    layer.timing.loop === DEFAULT_TIMING.loop &&
    layer.timing.easing === DEFAULT_TIMING.easing &&
    isDefaultCustomEasing(layer.timing.customEasing) &&
    isDefaultColorOverLifetime(layer.appearance.colorOverLifetime) &&
    isDefaultBehavior(layer.behavior) &&
    isDefaultRandom(layer.random) &&
    isDefaultTrail(layer.trail) &&
    isDefaultMotionPath(layer.motionPath) &&
    isDefaultKeyframes(layer.keyframes)
  );
}

function hasCanonicalBeamCapabilities(
  layer: Extract<VfxLayer, { type: "beam" }>,
): boolean {
  return (
    layer.transform.startScaleX === DEFAULT_TRANSFORM.startScaleX &&
    layer.transform.startScaleY === DEFAULT_TRANSFORM.startScaleY &&
    layer.transform.endScaleX === DEFAULT_TRANSFORM.endScaleX &&
    layer.transform.endScaleY === DEFAULT_TRANSFORM.endScaleY &&
    layer.transform.separateScale === DEFAULT_TRANSFORM.separateScale &&
    layer.transform.rotation === DEFAULT_TRANSFORM.rotation &&
    layer.transform.rotationDuring === DEFAULT_TRANSFORM.rotationDuring &&
    layer.transform.movementX === DEFAULT_TRANSFORM.movementX &&
    layer.transform.movementY === DEFAULT_TRANSFORM.movementY &&
    isDefaultMotionPath(layer.motionPath) &&
    isDefaultKeyframes(layer.keyframes)
  );
}

/**
 * Enforces the public capabilities of each layer type. Hidden settings are
 * removed to canonical values so imported or stale state cannot affect output
 * and cannot unexpectedly return after a later type change.
 */
export function canonicalizeLayerCapabilities<T extends VfxLayer>(layer: T): T {
  if (!layer || typeof layer !== "object") return layer;
  if (layer.type === "static") {
    if (
      !layer.transform ||
      !layer.timing ||
      !layer.appearance ||
      !layer.behavior ||
      !layer.random ||
      !layer.trail ||
      !layer.motionPath ||
      !layer.keyframes
    )
      return layer;
    if (hasCanonicalStaticCapabilities(layer)) return layer;
    return {
      ...layer,
      transform: {
        ...layer.transform,
        endScale: layer.transform.startScale,
        endScaleX: layer.transform.startScaleX,
        endScaleY: layer.transform.startScaleY,
        endOpacity: layer.transform.startOpacity,
        rotationDuring: DEFAULT_TRANSFORM.rotationDuring,
        movementX: DEFAULT_TRANSFORM.movementX,
        movementY: DEFAULT_TRANSFORM.movementY,
      },
      timing: {
        ...layer.timing,
        repeat: DEFAULT_TIMING.repeat,
        repeatForever: DEFAULT_TIMING.repeatForever,
        yoyo: DEFAULT_TIMING.yoyo,
        loop: DEFAULT_TIMING.loop,
        easing: DEFAULT_TIMING.easing,
        customEasing: { ...DEFAULT_TIMING.customEasing },
      },
      appearance: {
        ...layer.appearance,
        colorOverLifetime: {
          ...DEFAULT_COLOR_OVER_LIFETIME,
          stops: DEFAULT_COLOR_OVER_LIFETIME.stops.map((stop) => ({ ...stop })),
        },
      },
      behavior: defaultBehavior(),
      random: { ...DEFAULT_RANDOM },
      trail: { ...DEFAULT_TRAIL },
      motionPath: defaultMotionPath(),
      keyframes: defaultKeyframes(),
    } as T;
  }

  if (layer.type === "beam") {
    if (!layer.transform || !layer.motionPath || !layer.keyframes) return layer;
    if (hasCanonicalBeamCapabilities(layer)) return layer;
    return {
      ...layer,
      transform: {
        ...layer.transform,
        startScaleX: DEFAULT_TRANSFORM.startScaleX,
        startScaleY: DEFAULT_TRANSFORM.startScaleY,
        endScaleX: DEFAULT_TRANSFORM.endScaleX,
        endScaleY: DEFAULT_TRANSFORM.endScaleY,
        separateScale: DEFAULT_TRANSFORM.separateScale,
        rotation: DEFAULT_TRANSFORM.rotation,
        rotationDuring: DEFAULT_TRANSFORM.rotationDuring,
        movementX: DEFAULT_TRANSFORM.movementX,
        movementY: DEFAULT_TRANSFORM.movementY,
      },
      motionPath: defaultMotionPath(),
      keyframes: defaultKeyframes(),
    } as T;
  }

  return layer;
}

export function canonicalizeProjectLayerCapabilities(
  project: VfxProject,
): VfxProject {
  if (!project || !Array.isArray(project.layers)) return project;
  const assets = Array.isArray(project.assets) ? project.assets : null;
  let repairedLayers: VfxLayer[] | null = null;
  for (let index = 0; index < project.layers.length; index += 1) {
    const layer = project.layers[index];
    let repaired = canonicalizeLayerCapabilities(layer);
    if (assets && repaired && typeof repaired === "object") {
      const asset = repaired.assetId
        ? assets.find((candidate) => candidate.id === repaired.assetId)
        : undefined;
      if (
        !asset?.spriteSheet &&
        !isDefaultFrameAnimation(repaired.frameAnimation)
      ) {
        repaired = {
          ...repaired,
          frameAnimation: { ...DEFAULT_FRAME_ANIMATION },
        };
      }
    }
    if (!repairedLayers && repaired !== layer)
      repairedLayers = project.layers.slice(0, index);
    repairedLayers?.push(repaired);
  }
  return repairedLayers ? { ...project, layers: repairedLayers } : project;
}

/** Applies copied settings, then removes settings unsupported by the target. */
export function mergeCompatibleLayerSettings<T extends VfxLayer>(
  target: T,
  copied: CopyableLayerSettings,
): T {
  return canonicalizeLayerCapabilities({
    ...target,
    ...copied,
    spawn: target.spawn && copied.spawn ? copied.spawn : target.spawn,
    beam: target.beam && copied.beam ? copied.beam : target.beam,
  } as T);
}

export interface IncomingLayerEvent {
  source: VfxLayer;
  event: LayerEvent;
}

/** Only active source layers and active events can trigger a target at runtime. */
export function enabledIncomingLayerEvents(
  layers: VfxLayer[],
  targetLayerId: string,
): IncomingLayerEvent[] {
  return layers.flatMap((source) =>
    source.enabled
      ? source.events
          .filter(
            (event) => event.enabled && event.targetLayerId === targetLayerId,
          )
          .map((event) => ({ source, event }))
      : [],
  );
}
