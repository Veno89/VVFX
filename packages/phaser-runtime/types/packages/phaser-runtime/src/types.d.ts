import type {
  AppearanceSettings,
  BeamEndpoints,
  BeamSettings,
  BehaviorSettings,
  FrameAnimationSettings,
  LayerType,
  KeyframeSettings,
  LayerEvent,
  LayerStartMode,
  MotionPathSettings,
  RandomSettings,
  SpawnSettings,
  TimingSettings,
  TrailSettings,
  TransformSettings,
  VfxAsset,
} from "../../../src/vfx/types";
export interface VvfxRuntimeAsset {
  id: string;
  name: string;
  source: string;
  builtIn?: VfxAsset["builtIn"];
  width?: number;
  height?: number;
  spriteSheet?: VfxAsset["spriteSheet"];
  atlasFrame?: string | null;
  alphaMask?: VfxAsset["alphaMask"];
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
  transform: TransformSettings;
  timing: TimingSettings;
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
  spawn: SpawnSettings | null;
  random: RandomSettings;
  frameAnimation: FrameAnimationSettings;
  trail: TrailSettings;
  motionPath: MotionPathSettings;
  keyframes: KeyframeSettings;
  beam: BeamSettings | null;
}
/** A named moment exported from a Timeline marker. */
export interface VvfxRuntimeCue {
  name: string;
  /** Milliseconds from the start of the effect. */
  time: number;
}
export interface VvfxRuntimeDefinition {
  format: "vvfx-runtime";
  formatVersion: 16;
  name: string;
  duration: number;
  seed: number;
  assets: VvfxRuntimeAsset[];
  layers: VvfxRuntimeLayer[];
  /**
   * Optional and additive within format 16: runtimes without cue support ignore it,
   * and effects without markers omit it.
   */
  cues?: VvfxRuntimeCue[];
}
export interface RuntimeValidationResult {
  ok: boolean;
  definition?: VvfxRuntimeDefinition;
  error?: string;
}
export type BeamFit = "stretch" | "crop";
/** Anything with a world position, such as a Phaser game object. */
export interface VvfxFollowTarget {
  x: number;
  y: number;
}
export interface VvfxEffectOptions {
  originX?: number;
  originY?: number;
  baseDepth?: number;
  /** Scales the whole effect around its origin; 1 is the authored size. */
  scale?: number;
  /** Rotates the whole effect around its origin, in degrees. */
  angle?: number;
  /** Mirrors the effect left to right. */
  flipX?: boolean;
  /** Mirrors the effect top to bottom. */
  flipY?: boolean;
  /** Playback speed multiplier from 0 to 10; 1 is authored speed. */
  timeScale?: number;
  /** One 0xRRGGBB color that replaces every copy's authored tint. */
  tint?: number;
  loop?: boolean;
  autoplay?: boolean;
  autoDestroy?: boolean;
  assetKeys?: Record<string, string>;
  assetFrames?: Record<string, string | number>;
  /** Cancels asynchronous image loading before the effect is constructed. */
  signal?: AbortSignal;
  /** World-space endpoints applied to every Beam layer at startup. */
  beamEndpoints?: BeamEndpoints;
  /** Stretch all source pixels (default), or crop short dynamic Beams. */
  beamFit?: BeamFit;
  /** Multiplies Beam thickness only; endpoint-fitted length is unchanged. */
  beamThicknessScale?: number;
  /** Caps one-shot playback and cleanup before the authored duration. */
  maxDurationMs?: number;
  onComplete?: () => void;
  /**
   * Called when playback passes a cue exported from a Timeline marker, for
   * syncing sound, screen shake, hit-stop, or damage numbers. Fires once per
   * pass, including each loop.
   */
  onCue?: (cue: VvfxRuntimeCue) => void;
  /** Receives one-time compatibility warnings, such as Canvas FX fallback. */
  onWarning?: (message: string) => void;
}
