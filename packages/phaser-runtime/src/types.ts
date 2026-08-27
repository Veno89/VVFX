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

export interface VvfxRuntimeDefinition {
  format: "vvfx-runtime";
  formatVersion: 15;
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
  /** Cancels asynchronous image loading before the effect is constructed. */
  signal?: AbortSignal;
  /** World-space endpoints applied to every Beam layer at startup. */
  beamEndpoints?: BeamEndpoints;
  onComplete?: () => void;
  /** Receives one-time compatibility warnings, such as Canvas FX fallback. */
  onWarning?: (message: string) => void;
}
