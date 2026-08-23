import type Phaser from "phaser";
import { validateRuntimeDefinition } from "./definition";
import { loadVvfxAssets } from "./textures";
import type { VvfxEffectOptions } from "./types";
import { VvfxEffect } from "./VvfxEffect";

export async function playVvfx(
  scene: Phaser.Scene,
  input: unknown,
  options: VvfxEffectOptions = {},
): Promise<VvfxEffect> {
  const result = validateRuntimeDefinition(input);
  if (!result.ok || !result.definition)
    throw new Error(result.error ?? "Invalid Vvfx runtime definition.");
  await loadVvfxAssets(scene, result.definition, options.assetKeys);
  return new VvfxEffect(scene, result.definition, options);
}

export { validateRuntimeDefinition } from "./definition";
export { loadVvfxAssets } from "./textures";
export { VvfxEffect } from "./VvfxEffect";
export type {
  RuntimeValidationResult,
  VvfxEffectOptions,
  VvfxRuntimeAsset,
  VvfxRuntimeDefinition,
  VvfxRuntimeLayer,
} from "./types";
