import type {
  AppearanceSettings,
  BehaviorSettings,
  ColorOverLifetimeSettings,
  CustomEasingSettings,
  FrameAnimationSettings,
  MotionPathSettings,
  KeyframeSettings,
  RandomSettings,
  SpawnSettings,
  TimingSettings,
  TrailSettings,
  TransformSettings,
  VfxAsset,
  VfxLayer,
  VfxGroup,
  VfxProject,
  LayerType,
  StaticLayer,
  AnimatedLayer,
  BurstLayer,
  EmitterLayer,
  BeamLayer,
} from "./types";
import { createDefaultRenderingEffects } from "./renderingEffects";
import { MAX_VFX_NAME_LENGTH } from "./inputLimits";

export const BUILT_IN_ASSETS: VfxAsset[] = [
  {
    id: "builtin-flash",
    name: "Soft flash",
    mimeType: "image/builtin",
    dataUrl: "builtin:flash",
    builtIn: "flash",
    transparency: "yes",
  },
  {
    id: "builtin-ring",
    name: "Energy ring",
    mimeType: "image/builtin",
    dataUrl: "builtin:ring",
    builtIn: "ring",
    transparency: "yes",
  },
  {
    id: "builtin-spark",
    name: "Spark streak",
    mimeType: "image/builtin",
    dataUrl: "builtin:spark",
    builtIn: "spark",
    transparency: "yes",
  },
  {
    id: "builtin-cloud",
    name: "Soft smoke",
    mimeType: "image/builtin",
    dataUrl: "builtin:cloud",
    builtIn: "cloud",
    transparency: "yes",
  },
];

export const DEFAULT_TRANSFORM: TransformSettings = {
  x: 0,
  y: 0,
  startScale: 1,
  endScale: 1,
  startScaleX: 1,
  startScaleY: 1,
  endScaleX: 1,
  endScaleY: 1,
  separateScale: false,
  startOpacity: 1,
  endOpacity: 0,
  rotation: 0,
  rotationDuring: 0,
  movementX: 0,
  movementY: 0,
};

export const DEFAULT_TIMING: TimingSettings = {
  delay: 0,
  duration: 900,
  repeat: 0,
  repeatForever: false,
  yoyo: false,
  loop: false,
  easing: "smooth",
  customEasing: {
    x1: 0.42,
    y1: 0,
    x2: 0.58,
    y2: 1,
  },
};

export const DEFAULT_CUSTOM_EASING: CustomEasingSettings = {
  ...DEFAULT_TIMING.customEasing,
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  tint: null,
  tintStrength: 1,
  blendMode: "normal",
  colorOverLifetime: {
    enabled: false,
    stops: [
      { time: 0, color: "#ffffff" },
      { time: 1, color: "#ffffff" },
    ],
  },
  effects: createDefaultRenderingEffects(),
  effectClips: [],
};

export const DEFAULT_COLOR_OVER_LIFETIME: ColorOverLifetimeSettings = {
  enabled: false,
  stops: [
    { time: 0, color: "#ffffff" },
    { time: 1, color: "#ffffff" },
  ],
};

export const DEFAULT_BEHAVIOR_ENVELOPE = {
  enabled: false,
  start: 0,
  attackEnd: 0,
  releaseStart: 1,
  end: 1,
} as const;

export const DEFAULT_BEHAVIOR: BehaviorSettings = {
  pulse: {
    enabled: false,
    scale: 0.1,
    opacity: 0,
    speed: 2,
    envelope: { ...DEFAULT_BEHAVIOR_ENVELOPE },
  },
  flicker: {
    enabled: false,
    amount: 0.25,
    speed: 8,
    randomness: 0.65,
    envelope: { ...DEFAULT_BEHAVIOR_ENVELOPE },
  },
  wobble: {
    enabled: false,
    x: 12,
    y: 0,
    rotation: 4,
    speed: 1.5,
    style: "organic",
    smoothness: 0.7,
    envelope: { ...DEFAULT_BEHAVIOR_ENVELOPE },
  },
  physics: {
    gravity: 0,
    drag: 0,
    gravityEnvelope: { ...DEFAULT_BEHAVIOR_ENVELOPE },
  },
};

export const DEFAULT_RANDOM: RandomSettings = {
  positionX: 0,
  positionY: 0,
  startScale: 0,
  endScale: 0,
  rotation: 0,
  duration: 0,
  movementX: 0,
  movementY: 0,
  delay: 0,
  opacity: 0,
};

export const DEFAULT_SPAWN: SpawnSettings = {
  count: 8,
  intervalMin: 260,
  intervalMax: 500,
  maxAlive: 80,
  shape: "point",
  distribution: "random",
  stratifiedJitter: 0.65,
  clusterCount: 3,
  clusterSpread: 0.18,
  width: 80,
  height: 50,
  radius: 45,
  lineLength: 120,
  lineAngle: 0,
  arcStartAngle: -180,
  arcSweep: 180,
  maskAssetId: null,
  maskSize: 160,
  maskThreshold: 0.2,
  direction: "random",
  directionAngle: -90,
  directionSpread: 30,
  rotateToDirection: false,
  artworkForwardAngle: 0,
  alignmentVariation: 0,
};

export const DEFAULT_FRAME_ANIMATION: FrameAnimationSettings = {
  framesPerSecond: 12,
  startFrame: 0,
  endFrame: null,
  playback: "forward",
  loop: true,
  randomStartFrame: false,
};

export const DEFAULT_TRAIL: TrailSettings = {
  enabled: false,
  count: 6,
  spacing: 50,
  lifetime: 400,
  opacity: 0.45,
  scaleFalloff: 0.05,
};

export const DEFAULT_BEAM = {
  endX: 240,
  endY: 0,
} as const;

export const DEFAULT_MOTION_PATH: MotionPathSettings = {
  enabled: false,
  mode: "curve",
  controlX: 60,
  controlY: -80,
  spiralTurns: 1.5,
  spiralRadius: 70,
  spiralClockwise: true,
  points: [{ x: 60, y: -80 }],
  orientToPath: false,
};

export const DEFAULT_KEYFRAMES: KeyframeSettings = {
  enabled: false,
  initialized: false,
  frames: [
    { time: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
    { time: 1, scaleX: 1, scaleY: 1, opacity: 0, rotation: 0 },
  ],
};

let idCounter = 0;
export function makeId(prefix: string): string {
  const safePrefix =
    prefix
      .slice(0, 64)
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[^A-Za-z0-9]+/, "")
      .slice(0, 32) || "id";
  idCounter += 1;
  if (typeof globalThis.crypto?.randomUUID === "function")
    return `${safePrefix}-${globalThis.crypto.randomUUID()}-${idCounter.toString(36)}`;
  return `${safePrefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createGroup(name = "Unnamed group"): VfxGroup {
  const safeName = name.trim().slice(0, MAX_VFX_NAME_LENGTH);
  return {
    id: makeId("group"),
    name: safeName || "Unnamed group",
    x: 0,
    y: 0,
    delay: 0,
  };
}

export function createLayer(
  type: "static",
  name?: string,
  assetId?: string | null,
): StaticLayer;
export function createLayer(
  type: "animated",
  name?: string,
  assetId?: string | null,
): AnimatedLayer;
export function createLayer(
  type: "beam",
  name?: string,
  assetId?: string | null,
): BeamLayer;
export function createLayer(
  type: "burst",
  name?: string,
  assetId?: string | null,
): BurstLayer;
export function createLayer(
  type: "emitter",
  name?: string,
  assetId?: string | null,
): EmitterLayer;
export function createLayer(
  type: LayerType,
  name?: string,
  assetId?: string | null,
): VfxLayer;
export function createLayer(
  type: LayerType,
  name = type === "emitter"
    ? "Repeating particles"
    : type === "burst"
      ? "Particle burst"
      : type === "beam"
        ? "Beam"
        : type === "static"
          ? "Static image"
          : "Animated image",
  assetId: string | null = "builtin-flash",
): VfxLayer {
  const safeName = name.trim().slice(0, MAX_VFX_NAME_LENGTH);
  const base = {
    id: makeId("layer"),
    name: safeName || "Unnamed layer",
    assetId,
    visible: true,
    enabled: true,
    solo: false,
    startMode: "timeline" as const,
    events: [],
    parentId: null,
    groupId: null,
    transform: { ...DEFAULT_TRANSFORM },
    timing: {
      ...DEFAULT_TIMING,
      customEasing: { ...DEFAULT_CUSTOM_EASING },
    },
    appearance: {
      ...DEFAULT_APPEARANCE,
      colorOverLifetime: {
        ...DEFAULT_COLOR_OVER_LIFETIME,
        stops: DEFAULT_COLOR_OVER_LIFETIME.stops.map((stop) => ({ ...stop })),
      },
      effects: createDefaultRenderingEffects(),
      effectClips: [],
    },
    behavior: {
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
    },
    random: { ...DEFAULT_RANDOM },
    frameAnimation: { ...DEFAULT_FRAME_ANIMATION },
    trail: { ...DEFAULT_TRAIL },
    motionPath: {
      ...DEFAULT_MOTION_PATH,
      points: DEFAULT_MOTION_PATH.points.map((point) => ({ ...point })),
    },
    keyframes: {
      ...DEFAULT_KEYFRAMES,
      frames: DEFAULT_KEYFRAMES.frames.map((frame) => ({ ...frame })),
    },
    beam: null,
  };
  if (type === "static") {
    return {
      ...base,
      type,
      spawn: null,
      timing: {
        ...DEFAULT_TIMING,
        duration: 3000,
        customEasing: { ...DEFAULT_CUSTOM_EASING },
      },
      transform: { ...DEFAULT_TRANSFORM, endOpacity: 1 },
    };
  }
  if (type === "animated") return { ...base, type, spawn: null };
  if (type === "beam") {
    return {
      ...base,
      type,
      spawn: null,
      beam: { ...DEFAULT_BEAM },
      transform: {
        ...base.transform,
        startOpacity: 1,
        endOpacity: 0,
      },
      timing: { ...base.timing, duration: 220 },
      appearance: { ...base.appearance, blendMode: "add" },
      behavior: {
        ...base.behavior,
        flicker: { ...base.behavior.flicker, enabled: true },
      },
    };
  }
  return { ...base, type, spawn: { ...DEFAULT_SPAWN } };
}

export function createExampleProject(): VfxProject {
  const now = new Date().toISOString();
  const flash = createLayer("animated", "Flash", "builtin-flash");
  flash.transform = {
    ...flash.transform,
    startScale: 0.2,
    endScale: 1.5,
    endOpacity: 0,
  };
  flash.timing = { ...flash.timing, duration: 320, easing: "fast-slow" };
  flash.appearance = { ...flash.appearance, tint: "#c9f7ff", blendMode: "add" };

  const ring = createLayer("animated", "Shockwave", "builtin-ring");
  ring.transform = {
    ...ring.transform,
    startScale: 0.25,
    endScale: 2.2,
    startOpacity: 0.9,
    endOpacity: 0,
  };
  ring.timing = {
    ...ring.timing,
    duration: 760,
    delay: 90,
    easing: "fast-slow",
  };
  ring.appearance = { ...ring.appearance, tint: "#73d9ff", blendMode: "add" };

  const sparks = createLayer("burst", "Sparks", "builtin-spark");
  sparks.transform = {
    ...sparks.transform,
    startScale: 0.75,
    endScale: 0.15,
    movementX: 135,
    movementY: 0,
    endOpacity: 0,
  };
  sparks.timing = {
    ...sparks.timing,
    duration: 680,
    delay: 40,
    easing: "fast-slow",
  };
  sparks.appearance = {
    ...sparks.appearance,
    tint: "#ffbd5a",
    blendMode: "add",
    colorOverLifetime: {
      enabled: true,
      stops: [
        { time: 0, color: "#fff2a6" },
        { time: 0.55, color: "#ffb141" },
        { time: 1, color: "#e84b2c" },
      ],
    },
  };
  sparks.behavior.physics = {
    ...sparks.behavior.physics,
    gravity: 300,
    drag: 0.5,
  };
  sparks.random = {
    ...sparks.random,
    rotation: 18,
    startScale: 0.28,
    duration: 170,
    movementX: 55,
    movementY: 55,
  };
  sparks.spawn = {
    ...sparks.spawn,
    count: 14,
    direction: "outward",
    shape: "circle",
    distribution: "edge",
    radius: 10,
    rotateToDirection: true,
  };

  const smoke = createLayer("burst", "Smoke", "builtin-cloud");
  smoke.transform = {
    ...smoke.transform,
    y: 10,
    startScale: 0.35,
    endScale: 1.15,
    startOpacity: 0.48,
    endOpacity: 0,
    movementY: -72,
  };
  smoke.timing = {
    ...smoke.timing,
    duration: 1300,
    delay: 220,
    easing: "fast-slow",
  };
  smoke.appearance = { ...smoke.appearance, tint: "#7c8aa0" };
  smoke.behavior.wobble = {
    ...smoke.behavior.wobble,
    enabled: true,
    x: 16,
    y: 3,
    rotation: 6,
    speed: 0.8,
    style: "organic",
  };
  smoke.random = {
    ...smoke.random,
    positionX: 20,
    startScale: 0.15,
    duration: 280,
    movementX: 22,
  };
  smoke.spawn = {
    ...smoke.spawn,
    count: 3,
    shape: "rectangle",
    distribution: "clustered",
    width: 46,
    height: 8,
    direction: "fixed",
    directionAngle: -90,
    directionSpread: 18,
  };

  return {
    formatVersion: 18,
    metadata: {
      id: makeId("project"),
      name: "Simple Magic Impact",
      createdAt: now,
      updatedAt: now,
    },
    assets: BUILT_IN_ASSETS.map((asset) => ({ ...asset })),
    preview: {
      background: "checkerboard",
      customColor: "#142039",
      showGrid: false,
      zoom: 1,
      loop: true,
      duration: 3000,
      randomSeed: 8421,
    },
    timeline: { markers: [], notes: "" },
    groups: [],
    layers: [flash, ring, sparks, smoke],
  };
}

export function createEmptyProject(name = "Untitled Effect"): VfxProject {
  const now = new Date().toISOString();
  const safeName = name.trim().slice(0, MAX_VFX_NAME_LENGTH);
  return {
    formatVersion: 18,
    metadata: {
      id: makeId("project"),
      name: safeName || "Untitled Effect",
      createdAt: now,
      updatedAt: now,
    },
    assets: BUILT_IN_ASSETS.map((asset) => ({ ...asset })),
    preview: {
      background: "checkerboard",
      customColor: "#142039",
      showGrid: false,
      zoom: 1,
      loop: true,
      duration: 3000,
      randomSeed: 8421,
    },
    timeline: { markers: [], notes: "" },
    groups: [],
    layers: [],
  };
}
