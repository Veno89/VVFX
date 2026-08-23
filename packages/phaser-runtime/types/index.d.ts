import type Phaser from "phaser";

export type LayerType = "static" | "animated" | "burst" | "emitter";
export type EasingName =
  | "constant"
  | "fast-slow"
  | "slow-fast"
  | "smooth"
  | "bounce"
  | "overshoot"
  | "elastic"
  | "custom";

export interface CustomEasingSettings {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export type BlendMode = "normal" | "add";
export type SpawnShape =
  "point" | "rectangle" | "circle" | "line" | "arc" | "mask";
export type SpawnDistribution =
  "random" | "edge" | "even" | "clustered" | "stratified" | "clusters";
export type DirectionMode =
  "random" | "outward" | "inward" | "fixed" | "tangent";

export interface SpriteSheetSettings {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

export type FramePlayback = "forward" | "reverse" | "ping-pong";

export interface FrameAnimationSettings {
  framesPerSecond: number;
  startFrame: number;
  endFrame: number | null;
  playback: FramePlayback;
  loop: boolean;
  randomStartFrame: boolean;
}

export type LayerStartMode = "timeline" | "triggered";
export type LayerEventTrigger =
  "start" | "percentage" | "finish" | "repeat" | "copy-finish";
export type LayerEventAction = "play" | "restart";

export interface LayerEvent {
  id: string;
  enabled: boolean;
  trigger: LayerEventTrigger;
  percentage: number;
  action: LayerEventAction;
  targetLayerId: string;
  chance: number;
  maxTriggers: number;
}

export interface TrailSettings {
  enabled: boolean;
  count: number;
  spacing: number;
  lifetime: number;
  opacity: number;
  scaleFalloff: number;
}

export type MotionPathMode = "curve" | "spiral" | "custom";

export interface MotionPathPoint {
  x: number;
  y: number;
}

export interface MotionPathSettings {
  enabled: boolean;
  mode: MotionPathMode;
  controlX: number;
  controlY: number;
  spiralTurns: number;
  spiralRadius: number;
  spiralClockwise: boolean;
  points: MotionPathPoint[];
  orientToPath: boolean;
}

export interface TransformKeyframe {
  time: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  rotation: number;
}

export interface KeyframeSettings {
  enabled: boolean;
  initialized: boolean;
  frames: TransformKeyframe[];
}

export interface VvfxRuntimeAsset {
  id: string;
  name: string;
  source: string;
  builtIn?: "flash" | "ring" | "spark" | "cloud";
  width?: number;
  height?: number;
  spriteSheet?: SpriteSheetSettings | null;
  atlasFrame?: string | null;
  alphaMask?: AssetAlphaMask | null;
}

export interface AssetAlphaMask {
  columns: number;
  rows: number;
  alpha: number[];
}

export interface BehaviorEnvelopeSettings {
  enabled: boolean;
  start: number;
  attackEnd: number;
  releaseStart: number;
  end: number;
}

export type BlurQuality = 0 | 1 | 2;
export type DirectionalDissolveAxis = "horizontal" | "vertical";
export type DissolvePattern = "directional" | "noise";
export type SpriteWarpMode = "barrel" | "noise" | "heat-shimmer";

export interface RenderingEffectsSettings {
  blur: {
    enabled: boolean;
    quality: BlurQuality;
    offsetX: number;
    offsetY: number;
    strength: number;
    color: string;
    steps: number;
  };
  outerGlow: {
    enabled: boolean;
    color: string;
    outerStrength: number;
    innerStrength: number;
  };
  brightnessExposure: {
    enabled: boolean;
    brightness: number;
    exposure: number;
  };
  animatedShine: {
    enabled: boolean;
    speed: number;
    lineWidth: number;
    gradient: number;
  };
  spatialGradient: {
    enabled: boolean;
    colorA: string;
    colorB: string;
    strength: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    bands: number;
  };
  directionalDissolve: {
    enabled: boolean;
    pattern: DissolvePattern;
    start: number;
    end: number;
    softness: number;
    noiseScale: number;
    axis: DirectionalDissolveAxis;
    reverse: boolean;
  };
  visualMask: {
    enabled: boolean;
    maskAssetId: string | null;
    channel: "alpha" | "luminance";
    invert: boolean;
    fit: "stretch" | "contain" | "cover";
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
    strength: number;
  };
  spriteWarp: {
    enabled: boolean;
    mode: SpriteWarpMode;
    barrel: number;
    amountX: number;
    amountY: number;
    speed: number;
  };
}

export interface VvfxRuntimeLayer {
  id: string;
  name: string;
  type: LayerType;
  asset: string | null;
  depth: number;
  enabled: boolean;
  startMode: LayerStartMode;
  events: LayerEvent[];
  attachTo: string | null;
  transform: {
    x: number;
    y: number;
    startScale: number;
    endScale: number;
    startScaleX: number;
    startScaleY: number;
    endScaleX: number;
    endScaleY: number;
    separateScale: boolean;
    startOpacity: number;
    endOpacity: number;
    rotation: number;
    rotationDuring: number;
    movementX: number;
    movementY: number;
  };
  timing: {
    delay: number;
    duration: number;
    repeat: number;
    repeatForever: boolean;
    yoyo: boolean;
    loop: boolean;
    easing: EasingName;
    customEasing: CustomEasingSettings;
  };
  appearance: {
    tint: string | null;
    tintStrength: number;
    blendMode: BlendMode;
    colorOverLifetime: {
      enabled: boolean;
      stops: Array<{ time: number; color: string }>;
    };
    effects: RenderingEffectsSettings;
  };
  behavior: {
    pulse: {
      enabled: boolean;
      scale: number;
      opacity: number;
      speed: number;
      envelope: BehaviorEnvelopeSettings;
    };
    flicker: {
      enabled: boolean;
      amount: number;
      speed: number;
      randomness: number;
      envelope: BehaviorEnvelopeSettings;
    };
    wobble: {
      enabled: boolean;
      x: number;
      y: number;
      rotation: number;
      speed: number;
      style: "sway" | "organic";
      smoothness: number;
      envelope: BehaviorEnvelopeSettings;
    };
    physics: {
      gravity: number;
      drag: number;
      gravityEnvelope: BehaviorEnvelopeSettings;
    };
  };
  spawn: {
    count: number;
    intervalMin: number;
    intervalMax: number;
    maxAlive: number;
    shape: SpawnShape;
    distribution: SpawnDistribution;
    stratifiedJitter: number;
    clusterCount: number;
    clusterSpread: number;
    width: number;
    height: number;
    radius: number;
    lineLength: number;
    lineAngle: number;
    arcStartAngle: number;
    arcSweep: number;
    maskAssetId: string | null;
    maskSize: number;
    maskThreshold: number;
    direction: DirectionMode;
    directionAngle: number;
    directionSpread: number;
    rotateToDirection: boolean;
    artworkForwardAngle: number;
    alignmentVariation: number;
  } | null;
  random: {
    positionX: number;
    positionY: number;
    startScale: number;
    endScale: number;
    rotation: number;
    duration: number;
    movementX: number;
    movementY: number;
    delay: number;
    opacity: number;
  };
  frameAnimation: FrameAnimationSettings;
  trail: TrailSettings;
  motionPath: MotionPathSettings;
  keyframes: KeyframeSettings;
}

export interface VvfxRuntimeDefinition {
  format: "vvfx-runtime";
  formatVersion: 14;
  name: string;
  duration: number;
  seed: number;
  assets: VvfxRuntimeAsset[];
  layers: VvfxRuntimeLayer[];
}

export interface RuntimeValidationResult {
  ok: boolean;
  definition?: VvfxRuntimeDefinition;
  error?: string;
}

export interface VvfxEffectOptions {
  originX?: number;
  originY?: number;
  baseDepth?: number;
  loop?: boolean;
  autoplay?: boolean;
  autoDestroy?: boolean;
  assetKeys?: Record<string, string>;
  assetFrames?: Record<string, string | number>;
  onComplete?: () => void;
  onWarning?: (message: string) => void;
}

export declare class VvfxEffect {
  constructor(
    scene: Phaser.Scene,
    definition: VvfxRuntimeDefinition,
    options?: VvfxEffectOptions,
  );
  get isPlaying(): boolean;
  get isDestroyed(): boolean;
  get currentTime(): number;
  play(): this;
  pause(): this;
  restart(): this;
  stop(): this;
  setPosition(x: number, y: number): this;
  update(delta: number): void;
  destroy(): void;
}

export declare function validateRuntimeDefinition(
  input: unknown,
): RuntimeValidationResult;

export declare function loadVvfxAssets(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys?: Record<string, string>,
): Promise<void>;

export declare function playVvfx(
  scene: Phaser.Scene,
  input: unknown,
  options?: VvfxEffectOptions,
): Promise<VvfxEffect>;
