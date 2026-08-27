import type Phaser from "phaser";
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
  controllers: RenderingEffectControllerValues;
}
export interface RenderingEffectsEvaluationInput {
  /** Pass the layer's canonical, already-eased lifetime progress. */
  lifetimeProgress: number;
  elapsedMs: number;
  seed: number;
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
export declare const VVFX_RENDERING_NOISE_TEXTURE = "__vvfx-rendering-noise-v1";
export declare const MAX_RENDERING_EFFECT_PADDING = 64;
export declare const UNSUPPORTED_RENDERING_EFFECTS_WARNING =
  "Experimental pixel effects need Phaser WebGL. This Canvas renderer will show the ordinary sprites without visual masks, blur, glow, brightness/exposure, shine, gradients, dissolve/noise erosion, or sprite warp.";
export declare const DEFAULT_RENDERING_EFFECTS: Readonly<RenderingEffectsSettings>;
export declare function createDefaultRenderingEffects(): RenderingEffectsSettings;
/**
 * Restores missing legacy fields and bounds imported values before they can
 * reach Phaser's GPU controllers. Missing effects are always disabled.
 */
export declare function normalizeRenderingEffects(
  value: unknown,
): RenderingEffectsSettings;
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
export declare function sceneSupportsPhaserFilters(
  scene: Phaser.Scene,
): boolean;
/** Creates one fixed scene-scoped map. Phaser releases it with the game. */
export declare function ensureRenderingNoiseTexture(
  scene: Phaser.Scene,
): string | null;
export type PhaserRenderingAssetFrameResolver = (
  assetId: string,
) => Phaser.Textures.Frame | null;
export interface PhaserRenderingEffectsResult {
  supported: boolean;
  applied: boolean;
  passCost: number;
}
export declare function clearPhaserRenderingEffects(
  sprite: Phaser.GameObjects.Image,
): void;
/**
 * Synchronizes Phaser 4 Filters without stacking duplicate controllers. Call it
 * after setting the sprite's frame, tint, transform, and alpha.
 */
export declare function syncPhaserRenderingEffects({
  scene,
  sprite,
  effects,
  resolveAssetFrame,
  onWarning,
}: {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Image;
  effects: EvaluatedRenderingEffects;
  resolveAssetFrame?: PhaserRenderingAssetFrameResolver;
  onWarning?: (message: string) => void;
}): PhaserRenderingEffectsResult;
