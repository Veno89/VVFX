import type Phaser from "phaser";
import type { VvfxEffectOptions } from "./types";
import { VvfxEffect } from "./VvfxEffect";
export declare function playVvfx(
  scene: Phaser.Scene,
  input: unknown,
  options?: VvfxEffectOptions,
): Promise<VvfxEffect>;
export { validateRuntimeDefinition } from "./definition";
export { loadVvfxAssets } from "./textures";
export { VvfxEffect } from "./VvfxEffect";
export type {
  BeamFit,
  RuntimeValidationResult,
  VvfxEffectOptions,
  VvfxRuntimeAsset,
  VvfxRuntimeDefinition,
  VvfxRuntimeLayer,
} from "./types";
export type { BeamEndpoints } from "../../../src/vfx/types";
