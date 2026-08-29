export type BlurQuality = 0 | 1 | 2;
export type DissolvePattern = "directional" | "noise";
export type DirectionalDissolveAxis = "horizontal" | "vertical";
export type SpriteWarpMode = "barrel" | "noise" | "heat-shimmer";
export type VisualMaskChannel = "alpha" | "luminance";
export type VisualMaskFit = "stretch" | "contain" | "cover";
export interface VisualMaskEffectSettings {
  enabled: boolean;
  maskAssetId: string | null;
  channel: VisualMaskChannel;
  invert: boolean;
  fit: VisualMaskFit;
  /** Horizontal offset measured in target-sprite spans. */
  offsetX: number;
  /** Vertical offset measured in target-sprite spans. */
  offsetY: number;
  scale: number;
  /** Clockwise rotation in degrees. */
  rotation: number;
  strength: number;
}
export interface BlurEffectSettings {
  enabled: boolean;
  quality: BlurQuality;
  offsetX: number;
  offsetY: number;
  strength: number;
  color: string;
  steps: number;
}
export interface OuterGlowEffectSettings {
  enabled: boolean;
  color: string;
  outerStrength: number;
  innerStrength: number;
}
export interface BrightnessExposureEffectSettings {
  enabled: boolean;
  /** Neutral is 1. Phaser applies this as a linear color multiplier. */
  brightness: number;
  /** Exposure in stops; +1 doubles and -1 halves the multiplier. */
  exposure: number;
}
export interface AnimatedShineEffectSettings {
  enabled: boolean;
  speed: number;
  lineWidth: number;
  gradient: number;
}
export interface SpatialGradientEffectSettings {
  enabled: boolean;
  colorA: string;
  colorB: string;
  strength: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bands: number;
}
/**
 * Both patterns share one lifetime envelope. The directional pattern uses
 * Phaser's built-in Wipe filter; noise uses a deterministic Vvfx render node.
 */
export interface DirectionalDissolveEffectSettings {
  enabled: boolean;
  /** Normalized point in this copy's lifetime where erasing begins. */
  start: number;
  /** Normalized point in this copy's lifetime where erasing finishes. */
  end: number;
  softness: number;
  pattern: DissolvePattern;
  axis: DirectionalDissolveAxis;
  reverse: boolean;
  /** Approximate patches across the largest rendered sprite dimension. */
  noiseScale: number;
}
/**
 * All modes warp the sprite's own pixels. They do not sample or refract the
 * game scene behind the sprite.
 */
export interface SpriteWarpEffectSettings {
  enabled: boolean;
  mode: SpriteWarpMode;
  /** Vvfx offset from Phaser's neutral barrel amount of 1. */
  barrel: number;
  /** Small normalized displacement amounts; values around 0.005 are useful. */
  amountX: number;
  amountY: number;
  /** Cycles per second for the sprite-local heat-shimmer mode. */
  speed: number;
}
export interface RenderingEffectsSettings {
  visualMask: VisualMaskEffectSettings;
  blur: BlurEffectSettings;
  outerGlow: OuterGlowEffectSettings;
  brightnessExposure: BrightnessExposureEffectSettings;
  animatedShine: AnimatedShineEffectSettings;
  spatialGradient: SpatialGradientEffectSettings;
  directionalDissolve: DirectionalDissolveEffectSettings;
  spriteWarp: SpriteWarpEffectSettings;
}
export type RenderingEffectKey = keyof RenderingEffectsSettings;
export type RenderingEffectFadeEasing =
  "linear" | "smooth" | "ease-in" | "ease-out";
/**
 * Chooses the time source used by effect-specific animation controllers.
 * Current clips always use chronological copy-lifetime time. The legacy mode
 * exists only so migrated directional dissolves retain their pre-v18 eased and
 * yoyo-aware transform progression.
 */
export type RenderingEffectClipProgressMode =
  "chronological" | "legacy-transform";
/**
 * A normalized timing window inside one copy of the parent layer. Fade values
 * are fractions of this clip's own duration, rather than layer-lifetime values.
 */
export interface RenderingEffectClip {
  id: string;
  effect: RenderingEffectKey;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  fadeEasing: RenderingEffectFadeEasing;
  progressMode: RenderingEffectClipProgressMode;
}
export type RenderingEffectWeights = Record<RenderingEffectKey, number>;
export interface RenderingEffectControllerValues {
  brightnessMultiplier: number;
  shineSpeed: number;
  shineLineWidth: number;
  shineGradient: number;
  directionalDissolveProgress: number;
  dissolveNoiseOffsetX: number;
  dissolveNoiseOffsetY: number;
  barrelAmount: number;
  displacementX: number;
  displacementY: number;
}
export interface EvaluatedRenderingEffects {
  settings: RenderingEffectsSettings;
  weights: RenderingEffectWeights;
  controllers: RenderingEffectControllerValues;
}
export interface RenderingEffectsEvaluationInput {
  /** Pass the copy's linear, normalized lifetime progress. */
  lifetimeProgress: number;
  /** Optional legacy/eased progress used by migrated dissolve settings. */
  dissolveProgress?: number;
  elapsedMs: number;
  seed: number;
  clips?: readonly RenderingEffectClip[];
}
export type RenderingEffectName =
  | "visual-mask"
  | "blur"
  | "outer-glow"
  | "brightness-exposure"
  | "animated-shine"
  | "spatial-gradient"
  | "directional-dissolve"
  | "sprite-warp";
export declare const RENDERING_EFFECT_KEYS: readonly [
  "visualMask",
  "blur",
  "outerGlow",
  "brightnessExposure",
  "animatedShine",
  "spatialGradient",
  "directionalDissolve",
  "spriteWarp",
];
export declare const RENDERING_EFFECT_NAMES: readonly [
  "visual-mask",
  "blur",
  "outer-glow",
  "brightness-exposure",
  "animated-shine",
  "spatial-gradient",
  "directional-dissolve",
  "sprite-warp",
];
export declare const MAX_RENDERING_EFFECT_CLIPS: 8;
export declare function renderingEffectNameForKey(
  key: RenderingEffectKey,
): RenderingEffectName;
export declare function renderingEffectKeyForName(
  name: RenderingEffectName,
): RenderingEffectKey;
export declare const MAX_RENDERING_EFFECT_PADDING = 64;
export declare const DEFAULT_RENDERING_EFFECTS: Readonly<RenderingEffectsSettings>;
export declare function createDefaultRenderingEffects(): RenderingEffectsSettings;
export declare function createRenderingEffectClip(
  effect: RenderingEffectKey,
  id: string,
): RenderingEffectClip;
/**
 * Builds explicit full-life clips for pre-v18 settings. Tuned disabled effects
 * get a clip too, so enabling them later restores both their settings and time.
 */
export declare function migrateLegacyRenderingEffectClips(
  settings: RenderingEffectsSettings,
): RenderingEffectClip[];
/** Adds full-life clips for authored settings without disturbing timed clips. */
export declare function reconcileRenderingEffectClips(
  settings: RenderingEffectsSettings,
  clips: readonly RenderingEffectClip[],
  createId?: (effect: RenderingEffectKey) => string,
  options?: {
    legacyTransformProgress?: boolean;
  },
): RenderingEffectClip[];
export declare function normalizeRenderingEffectClips(
  value: unknown,
  settings: RenderingEffectsSettings,
  options?: {
    migrateLegacy?: boolean;
    legacyTransformProgress?: boolean;
  },
): RenderingEffectClip[];
/**
 * Restores missing legacy fields and bounds imported values before they can
 * reach Phaser's GPU controllers. Missing effects are always disabled.
 */
export declare function normalizeRenderingEffects(
  value: unknown,
): RenderingEffectsSettings;
export declare function evaluateRenderingEffectClipWeight(
  clip: RenderingEffectClip,
  lifetimeProgress: number,
): number;
export declare function evaluateRenderingEffectWeights(
  settings: RenderingEffectsSettings,
  clips: readonly RenderingEffectClip[],
  lifetimeProgress: number,
): RenderingEffectWeights;
export declare function enabledRenderingEffects(
  settings: RenderingEffectsSettings,
): RenderingEffectName[];
export declare function hasEnabledRenderingEffects(
  settings: RenderingEffectsSettings,
): boolean;
/**
 * A deliberately simple GPU-pass estimate for warnings and stress-preview
 * limits. Blur runs horizontal and vertical passes for every authored step.
 */
export declare function renderingEffectPassCost(
  settings: RenderingEffectsSettings,
): number;
export declare function evaluateRenderingEffects(
  settings: RenderingEffectsSettings,
  input: RenderingEffectsEvaluationInput,
): EvaluatedRenderingEffects;
export declare function renderingEffectPadding(
  settings: RenderingEffectsSettings,
): number;
