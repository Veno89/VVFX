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
export declare const BUILT_IN_ASSETS: VfxAsset[];
export declare const DEFAULT_TRANSFORM: TransformSettings;
export declare const DEFAULT_TIMING: TimingSettings;
export declare const DEFAULT_CUSTOM_EASING: CustomEasingSettings;
export declare const DEFAULT_APPEARANCE: AppearanceSettings;
export declare const DEFAULT_COLOR_OVER_LIFETIME: ColorOverLifetimeSettings;
export declare const DEFAULT_BEHAVIOR_ENVELOPE: {
  readonly enabled: false;
  readonly start: 0;
  readonly attackEnd: 0;
  readonly releaseStart: 1;
  readonly end: 1;
};
export declare const DEFAULT_BEHAVIOR: BehaviorSettings;
export declare const DEFAULT_RANDOM: RandomSettings;
export declare const DEFAULT_SPAWN: SpawnSettings;
export declare const DEFAULT_FRAME_ANIMATION: FrameAnimationSettings;
export declare const DEFAULT_TRAIL: TrailSettings;
export declare const DEFAULT_BEAM: {
  readonly endX: 240;
  readonly endY: 0;
};
export declare const DEFAULT_MOTION_PATH: MotionPathSettings;
export declare const DEFAULT_KEYFRAMES: KeyframeSettings;
export declare function makeId(prefix: string): string;
export declare function createGroup(name?: string): VfxGroup;
export declare function createLayer(
  type: "static",
  name?: string,
  assetId?: string | null,
): StaticLayer;
export declare function createLayer(
  type: "animated",
  name?: string,
  assetId?: string | null,
): AnimatedLayer;
export declare function createLayer(
  type: "beam",
  name?: string,
  assetId?: string | null,
): BeamLayer;
export declare function createLayer(
  type: "burst",
  name?: string,
  assetId?: string | null,
): BurstLayer;
export declare function createLayer(
  type: "emitter",
  name?: string,
  assetId?: string | null,
): EmitterLayer;
export declare function createLayer(
  type: LayerType,
  name?: string,
  assetId?: string | null,
): VfxLayer;
export declare function createExampleProject(): VfxProject;
export declare function createEmptyProject(name?: string): VfxProject;
