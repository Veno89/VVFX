import type Phaser from "phaser";
import { type EvaluatedRenderingEffects } from "./renderingEffectsModel";
export declare const VVFX_RENDERING_NOISE_TEXTURE = "__vvfx-rendering-noise-v1";
export declare const UNSUPPORTED_RENDERING_EFFECTS_WARNING =
  "Experimental pixel effects need Phaser WebGL. This Canvas renderer will show the ordinary sprites without visual masks, blur, glow, brightness/exposure, shine, gradients, dissolve/noise erosion, or sprite warp.";
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
  timeMs,
  resolveAssetFrame,
  onWarning,
}: {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Image;
  effects: EvaluatedRenderingEffects;
  /** Explicit effect time for deterministic seeking and restarts. */
  timeMs?: number;
  resolveAssetFrame?: PhaserRenderingAssetFrameResolver;
  onWarning?: (message: string) => void;
}): PhaserRenderingEffectsResult;
