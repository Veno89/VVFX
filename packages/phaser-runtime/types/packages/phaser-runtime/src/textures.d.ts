import type Phaser from "phaser";
import type { VvfxRuntimeAsset, VvfxRuntimeDefinition } from "./types";
type BuiltInKind = NonNullable<VvfxRuntimeAsset["builtIn"]>;
export interface RuntimeAssetLease {
  release: () => void;
  assetKeys: Record<string, string>;
}
/** Stable private key shared by preload, playback, and direct effect setup. */
export declare function runtimeAssetTextureKey(asset: VvfxRuntimeAsset): string;
export declare function createBuiltInTexture(
  scene: Phaser.Scene,
  key: string,
  kind: BuiltInKind,
): void;
export declare function createMissingTexture(scene: Phaser.Scene): void;
/**
 * Preloads assets for the scene lifetime. Manual callers intentionally keep
 * embedded textures cached; `playVvfx` uses the leased path below instead.
 */
export declare function loadVvfxAssets(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys?: Record<string, string>,
  signal?: AbortSignal,
): Promise<void>;
/** Internal leased loader used by playVvfx. */
export declare function acquireVvfxAssets(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys?: Record<string, string>,
  signal?: AbortSignal,
): Promise<RuntimeAssetLease>;
export {};
