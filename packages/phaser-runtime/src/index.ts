import type Phaser from "phaser";
import { prepareRuntimeDefinition } from "./definition";
import { acquireVvfxAssets } from "./textures";
import type { VvfxEffectOptions } from "./types";
import { VvfxEffect } from "./VvfxEffect";

function cancellationError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function callerCancellation(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : cancellationError("Vvfx playback was cancelled.");
}

function sceneIsTerminated(scene: Phaser.Scene): boolean {
  const status = (
    scene.sys as Phaser.Scenes.Systems & {
      settings?: { status?: number };
    }
  ).settings?.status;
  return status === 8 || status === 9;
}

export async function playVvfx(
  scene: Phaser.Scene,
  input: unknown,
  options: VvfxEffectOptions = {},
): Promise<VvfxEffect> {
  const result = prepareRuntimeDefinition(input);
  if (!result.ok || !result.definition)
    throw new Error(result.error ?? "Invalid Vvfx runtime definition.");
  let sceneActive = !sceneIsTerminated(scene);
  const onShutdown = () => {
    sceneActive = false;
  };
  scene.events.once("shutdown", onShutdown);
  let releaseAssets: (() => void) | null = null;
  try {
    if (!sceneActive)
      throw cancellationError(
        "Vvfx playback stopped because the scene has shut down.",
      );
    if (options.signal?.aborted) throw callerCancellation(options.signal);
    const lease = await acquireVvfxAssets(
      scene,
      result.definition,
      options.assetKeys,
      options.signal,
    );
    releaseAssets = lease.release;
    if (!sceneActive)
      throw cancellationError(
        "Vvfx playback stopped because the scene shut down.",
      );
    if (options.signal?.aborted) throw callerCancellation(options.signal);
    const effect = new VvfxEffect(
      scene,
      result.definition,
      options,
      releaseAssets,
    );
    releaseAssets = null;
    return effect;
  } finally {
    scene.events.off("shutdown", onShutdown);
    releaseAssets?.();
  }
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
export type { BeamEndpoints } from "../../../src/vfx/types";
