import type {
  EvaluatedRenderingEffects,
  RenderingEffectsSettings,
} from "./renderingEffects";
import type { AssetAlphaMask } from "./alphaMask";

export type LayerType = "static" | "animated" | "beam" | "burst" | "emitter";
export type EasingName =
  | "constant"
  | "fast-slow"
  | "slow-fast"
  | "smooth"
  | "bounce"
  | "overshoot"
  | "elastic"
  | "custom";
export type BlendMode = "normal" | "add";
export type SpawnShape =
  "point" | "rectangle" | "circle" | "line" | "arc" | "mask";
export type SpawnDistribution =
  "random" | "edge" | "even" | "clustered" | "stratified" | "clusters";
export type DirectionMode =
  "random" | "outward" | "inward" | "fixed" | "tangent";
export type PreviewBackground =
  "checkerboard" | "black" | "dark" | "white" | "custom";

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

export interface TrailSettings {
  enabled: boolean;
  count: number;
  spacing: number;
  lifetime: number;
  opacity: number;
  scaleFalloff: number;
}

/**
 * A beam uses the layer position as its authored start point and this local
 * offset as its end point. The runtime can override both endpoints in world
 * space without changing the portable definition.
 */
export interface BeamSettings {
  endX: number;
  endY: number;
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

export interface VfxAsset {
  id: string;
  name: string;
  mimeType: "image/png" | "image/webp" | "image/builtin";
  dataUrl: string;
  builtIn?: "flash" | "ring" | "spark" | "cloud";
  transparency?: "yes" | "no" | "unknown";
  width?: number;
  height?: number;
  spriteSheet?: SpriteSheetSettings | null;
  atlasFrame?: string | null;
  /** Editor-precomputed alpha bytes used for deterministic silhouette spawning. */
  alphaMask?: AssetAlphaMask | null;
}

export interface VfxGroup {
  id: string;
  name: string;
  x: number;
  y: number;
  delay: number;
}

export interface TransformSettings {
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
}

export interface TimingSettings {
  delay: number;
  duration: number;
  repeat: number;
  repeatForever: boolean;
  yoyo: boolean;
  loop: boolean;
  easing: EasingName;
  customEasing: CustomEasingSettings;
}

export interface CustomEasingSettings {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AppearanceSettings {
  tint: string | null;
  tintStrength: number;
  blendMode: BlendMode;
  colorOverLifetime: ColorOverLifetimeSettings;
  effects: RenderingEffectsSettings;
}

export interface ColorStop {
  time: number;
  color: string;
}

export interface ColorOverLifetimeSettings {
  enabled: boolean;
  stops: ColorStop[];
}

/**
 * A strength envelope inside one copy's existing lifetime. These normalized
 * stages deliberately do not create another project Timeline.
 */
export interface BehaviorEnvelopeSettings {
  enabled: boolean;
  start: number;
  attackEnd: number;
  releaseStart: number;
  end: number;
}

export interface PulseSettings {
  enabled: boolean;
  scale: number;
  opacity: number;
  speed: number;
  envelope: BehaviorEnvelopeSettings;
}

export interface FlickerSettings {
  enabled: boolean;
  amount: number;
  speed: number;
  randomness: number;
  envelope: BehaviorEnvelopeSettings;
}

export interface WobbleSettings {
  enabled: boolean;
  x: number;
  y: number;
  rotation: number;
  speed: number;
  style: "sway" | "organic";
  smoothness: number;
  envelope: BehaviorEnvelopeSettings;
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
  /** Deterministic per-copy gate used by copy-finish events. */
  chance: number;
  /** Maximum accepted copy-finish triggers per source activation. */
  maxTriggers: number;
}

/** Runtime-only anchor inherited by one spatial event chain. */
export interface LayerActivationContext {
  id: string;
  x: number;
  y: number;
  seed: number;
}

export interface PhysicsSettings {
  gravity: number;
  drag: number;
  gravityEnvelope: BehaviorEnvelopeSettings;
}

export interface BehaviorSettings {
  pulse: PulseSettings;
  flicker: FlickerSettings;
  wobble: WobbleSettings;
  physics: PhysicsSettings;
}

export interface RandomSettings {
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
}

export interface SpawnSettings {
  count: number;
  intervalMin: number;
  intervalMax: number;
  maxAlive: number;
  shape: SpawnShape;
  distribution: SpawnDistribution;
  /** Natural seeded movement inside each stratified interior cell. */
  stratifiedJitter: number;
  /** Number of stable shared clumps produced by the clusters pattern. */
  clusterCount: number;
  /** Clump diameter as a normalized fraction of the spawn shape's span. */
  clusterSpread: number;
  width: number;
  height: number;
  radius: number;
  lineLength: number;
  lineAngle: number;
  arcStartAngle: number;
  arcSweep: number;
  maskAssetId: string | null;
  /** Longest world-space side while preserving the source silhouette aspect. */
  maskSize: number;
  /** Minimum normalized alpha that can produce a copy. */
  maskThreshold: number;
  direction: DirectionMode;
  directionAngle: number;
  directionSpread: number;
  rotateToDirection: boolean;
  artworkForwardAngle: number;
  alignmentVariation: number;
}

interface BaseLayer {
  id: string;
  name: string;
  type: LayerType;
  assetId: string | null;
  visible: boolean;
  enabled: boolean;
  solo: boolean;
  startMode: LayerStartMode;
  events: LayerEvent[];
  parentId: string | null;
  groupId: string | null;
  transform: TransformSettings;
  timing: TimingSettings;
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
  random: RandomSettings;
  frameAnimation: FrameAnimationSettings;
  trail: TrailSettings;
  motionPath: MotionPathSettings;
  keyframes: KeyframeSettings;
  beam: BeamSettings | null;
}

export interface StaticLayer extends BaseLayer {
  type: "static";
  spawn: null;
  beam: null;
}

export interface AnimatedLayer extends BaseLayer {
  type: "animated";
  spawn: null;
  beam: null;
}

export interface BeamLayer extends BaseLayer {
  type: "beam";
  spawn: null;
  beam: BeamSettings;
}

export interface BurstLayer extends BaseLayer {
  type: "burst";
  spawn: SpawnSettings;
  beam: null;
}

export interface EmitterLayer extends BaseLayer {
  type: "emitter";
  spawn: SpawnSettings;
  beam: null;
}

export type VfxLayer =
  StaticLayer | AnimatedLayer | BeamLayer | BurstLayer | EmitterLayer;
export type SpawnLayer = BurstLayer | EmitterLayer;

export interface PreviewSettings {
  background: PreviewBackground;
  customColor: string;
  showGrid: boolean;
  zoom: number;
  loop: boolean;
  duration: number;
  randomSeed: number;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
}

export interface TimelineAuthoringSettings {
  markers: TimelineMarker[];
  notes: string;
}

export interface VfxProject {
  formatVersion: 17;
  metadata: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  assets: VfxAsset[];
  preview: PreviewSettings;
  timeline: TimelineAuthoringSettings;
  groups: VfxGroup[];
  layers: VfxLayer[];
}

export interface EvaluatedInstance {
  key: string;
  layerId: string;
  assetId: string | null;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  rotation: number;
  tint: string | null;
  tintStrength: number;
  blendMode: BlendMode;
  effects: EvaluatedRenderingEffects;
  selected: boolean;
  frame: number | null;
  trailIndex: number | null;
}

/** Endpoint coordinates are local to the effect origin during evaluation. */
export interface BeamEndpoints {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const isSpawnLayer = (layer: VfxLayer): layer is SpawnLayer =>
  layer.type === "burst" || layer.type === "emitter";
