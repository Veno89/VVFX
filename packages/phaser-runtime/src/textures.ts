import type Phaser from "phaser";
import {
  IMAGE_DECODE_TIMEOUT_MS,
  VVFX_INTERNAL_MISSING_TEXTURE_KEY,
} from "../../../src/vfx/inputLimits";
import { applySpriteSheetFrames } from "../../../src/vfx/phaserFrames";
import { validateRuntimeDefinition } from "./definition";
import type { VvfxRuntimeAsset, VvfxRuntimeDefinition } from "./types";

type BuiltInKind = NonNullable<VvfxRuntimeAsset["builtIn"]>;
const MAX_CONCURRENT_IMAGE_DECODES = 4;

function cancellationError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function signalError(signal: AbortSignal, fallback: string): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : cancellationError(fallback);
}

function assertActive(signal: AbortSignal, message: string): void {
  if (signal.aborted) throw signalError(signal, message);
}

function sceneIsTerminated(scene: Phaser.Scene): boolean {
  const status = (
    scene.sys as Phaser.Scenes.Systems & {
      settings?: { status?: number };
    }
  ).settings?.status;
  return status === 8 || status === 9;
}

interface AssetLoadScope {
  signal: AbortSignal;
  cancel: (error: Error) => void;
  dispose: () => void;
}

interface OwnedRuntimeTexture {
  key: string;
  source: string;
  spriteSheet: string;
  texture: Phaser.Textures.Texture;
  references: number;
  persistent: boolean;
}

interface RuntimeTextureTransaction {
  retained: OwnedRuntimeTexture[];
  created: Set<OwnedRuntimeTexture>;
  persistOnSuccess: Set<OwnedRuntimeTexture>;
}

export interface RuntimeAssetLease {
  release: () => void;
}

// Phaser owns textures at the Game level, so every Scene in a Game shares the
// same TextureManager. Track Vvfx ownership there as well: a Scene-keyed
// registry can otherwise let one Scene release a texture that another Scene is
// still rendering.
const ownedRuntimeTextures = new WeakMap<
  Phaser.Textures.TextureManager,
  Map<string, OwnedRuntimeTexture>
>();

function createAssetLoadScope(
  scene: Phaser.Scene,
  callerSignal?: AbortSignal,
): AssetLoadScope {
  const controller = new AbortController();
  const cancel = (error: Error) => {
    if (!controller.signal.aborted) controller.abort(error);
  };
  const onShutdown = () =>
    cancel(
      cancellationError(
        "Vvfx asset loading stopped because the scene shut down.",
      ),
    );
  const onCallerAbort = () =>
    cancel(
      callerSignal
        ? signalError(callerSignal, "Vvfx asset loading was cancelled.")
        : cancellationError("Vvfx asset loading was cancelled."),
    );
  scene.events.once("shutdown", onShutdown);
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = globalThis.setTimeout(
    () =>
      cancel(
        new Error("Vvfx timed out while decoding the runtime image library."),
      ),
    IMAGE_DECODE_TIMEOUT_MS,
  );
  if (sceneIsTerminated(scene)) onShutdown();
  if (callerSignal?.aborted) onCallerAbort();
  return {
    signal: controller.signal,
    cancel,
    dispose: () => {
      globalThis.clearTimeout(timeout);
      scene.events.off("shutdown", onShutdown);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

const ownValue = <T>(record: Record<string, T>, key: string): T | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor
    ? (descriptor.value as T)
    : undefined;
};

const hasControlCharacters = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

const isSafeTextureKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 256 &&
  value.trim().length > 0 &&
  value !== VVFX_INTERNAL_MISSING_TEXTURE_KEY &&
  !hasControlCharacters(value);

const spriteSheetSignature = (asset: VvfxRuntimeAsset) =>
  asset.spriteSheet
    ? `${asset.spriteSheet.frameWidth}:${asset.spriteSheet.frameHeight}:${asset.spriteSheet.frameCount}`
    : "still";

function runtimeTextureRegistry(textures: Phaser.Textures.TextureManager) {
  const existing = ownedRuntimeTextures.get(textures);
  if (existing) return existing;
  const created = new Map<string, OwnedRuntimeTexture>();
  ownedRuntimeTextures.set(textures, created);
  return created;
}

function liveOwnedRuntimeTexture(
  textures: Phaser.Textures.TextureManager,
  key: string,
): OwnedRuntimeTexture | null {
  const registry = runtimeTextureRegistry(textures);
  const record = registry.get(key);
  if (!record) return null;
  if (!textures.exists(key) || textures.get(key) !== record.texture) {
    registry.delete(key);
    return null;
  }
  return record;
}

function disposeOwnedRuntimeTexture(
  textures: Phaser.Textures.TextureManager,
  record: OwnedRuntimeTexture,
) {
  if (record.references > 0 || record.persistent) return;
  const registry = runtimeTextureRegistry(textures);
  if (registry.get(record.key) !== record) return;
  registry.delete(record.key);
  try {
    if (
      textures.exists(record.key) &&
      textures.get(record.key) === record.texture
    )
      textures.remove(record.key);
  } catch {
    // Game shutdown can tear down the TextureManager before an effect's Scene
    // shutdown listener releases its final lease. The registry is already
    // detached, so there is no live Vvfx owner left to retain.
  }
}

function claimRuntimeTexture(
  scene: Phaser.Scene,
  key: string,
  asset: VvfxRuntimeAsset,
  createdTexture: Phaser.Textures.Texture | null,
  mode: "acquire" | "persistent",
  transaction: RuntimeTextureTransaction,
) {
  const textures = scene.textures;
  let record = liveOwnedRuntimeTexture(textures, key);
  if (!record && createdTexture) {
    if (!textures.exists(key) || textures.get(key) !== createdTexture)
      throw new Error(
        `The Phaser texture key "${key}" was replaced while Vvfx was loading it.`,
      );
    record = {
      key,
      source: asset.source,
      spriteSheet: spriteSheetSignature(asset),
      texture: createdTexture,
      references: 0,
      persistent: false,
    };
    runtimeTextureRegistry(textures).set(key, record);
    transaction.created.add(record);
  }
  if (!record) return;
  if (
    record.source !== asset.source ||
    record.spriteSheet !== spriteSheetSignature(asset)
  )
    throw new Error(
      `The Phaser texture key "${key}" is already owned by a different Vvfx image.`,
    );
  // Persistent preloads need the same provisional ownership as effect leases.
  // Without it, another effect can release the last acquired reference while
  // this transaction is still decoding later assets, deleting the texture
  // immediately before the persistent transaction commits.
  record.references += 1;
  transaction.retained.push(record);
  if (mode === "persistent") transaction.persistOnSuccess.add(record);
}

function releaseRuntimeTexture(
  textures: Phaser.Textures.TextureManager,
  record: OwnedRuntimeTexture,
) {
  record.references = Math.max(0, record.references - 1);
  disposeOwnedRuntimeTexture(textures, record);
}

function rollbackRuntimeTextureTransaction(
  scene: Phaser.Scene,
  transaction: RuntimeTextureTransaction,
) {
  const textures = scene.textures;
  for (const record of transaction.retained)
    releaseRuntimeTexture(textures, record);
  transaction.retained.length = 0;
  for (const record of transaction.created)
    disposeOwnedRuntimeTexture(textures, record);
}

function commitRuntimeTextureTransaction(
  scene: Phaser.Scene,
  mode: "acquire" | "persistent",
  transaction: RuntimeTextureTransaction,
): RuntimeAssetLease | null {
  if (mode === "persistent") {
    for (const record of transaction.persistOnSuccess) record.persistent = true;
    for (const record of transaction.retained)
      releaseRuntimeTexture(scene.textures, record);
    transaction.retained.length = 0;
    return null;
  }
  const retained = [...transaction.retained];
  const textures = scene.textures;
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      for (const record of retained) releaseRuntimeTexture(textures, record);
    },
  };
}

function generateTexture(
  scene: Phaser.Scene,
  key: string,
  draw: (graphics: Phaser.GameObjects.Graphics) => void,
) {
  if (scene.textures.exists(key)) return;
  const graphics = scene.add.graphics().setVisible(false);
  draw(graphics);
  graphics.generateTexture(key, 128, 128);
  graphics.destroy();
}

export function createBuiltInTexture(
  scene: Phaser.Scene,
  key: string,
  kind: BuiltInKind,
) {
  generateTexture(scene, key, (graphics) => {
    if (kind === "flash") {
      graphics.fillStyle(0xffffff, 0.08).fillCircle(64, 64, 60);
      graphics.fillStyle(0xffffff, 0.16).fillCircle(64, 64, 46);
      graphics.fillStyle(0xffffff, 0.35).fillCircle(64, 64, 30);
      graphics.fillStyle(0xffffff, 0.95).fillCircle(64, 64, 13);
    } else if (kind === "ring") {
      graphics.lineStyle(9, 0xffffff, 0.17).strokeCircle(64, 64, 46);
      graphics.lineStyle(3, 0xffffff, 0.95).strokeCircle(64, 64, 46);
    } else if (kind === "spark") {
      graphics.fillStyle(0xffffff, 0.16).fillRoundedRect(9, 51, 110, 26, 13);
      graphics.fillStyle(0xffffff, 0.95).fillRoundedRect(17, 59, 94, 10, 5);
    } else {
      graphics
        .fillStyle(0xffffff, 0.18)
        .fillCircle(44, 68, 34)
        .fillCircle(76, 54, 38)
        .fillCircle(92, 76, 28);
      graphics
        .fillStyle(0xffffff, 0.34)
        .fillCircle(61, 69, 29)
        .fillCircle(79, 70, 24);
    }
  });
}

export function createMissingTexture(scene: Phaser.Scene) {
  generateTexture(scene, VVFX_INTERNAL_MISSING_TEXTURE_KEY, (graphics) => {
    graphics.fillStyle(0x211f30, 1).fillRoundedRect(20, 20, 88, 88, 16);
    graphics.lineStyle(5, 0xff6d8d, 0.9).strokeRoundedRect(20, 20, 88, 88, 16);
    graphics.lineBetween(40, 40, 88, 88).lineBetween(88, 40, 40, 88);
  });
}

interface LoadedBase64Texture {
  created: boolean;
  texture: Phaser.Textures.Texture;
}

async function loadBase64Texture(
  scene: Phaser.Scene,
  key: string,
  asset: VvfxRuntimeAsset,
  signal: AbortSignal,
): Promise<LoadedBase64Texture> {
  assertActive(signal, "Vvfx asset loading was cancelled.");
  if (scene.textures.exists(key))
    return { created: false, texture: scene.textures.get(key) };
  return await new Promise<LoadedBase64Texture>((resolve, reject) => {
    let candidate: HTMLImageElement;
    try {
      candidate = new Image();
    } catch {
      reject(new Error(`Vvfx could not create an image for "${key}".`));
      return;
    }
    let settled = false;
    let installingTexture = false;
    const cleanup = () => {
      candidate.onload = null;
      candidate.onerror = null;
      signal.removeEventListener("abort", onAbort);
    };
    const clearSource = () => {
      try {
        candidate.src = "";
      } catch {
        // Some browser/test Image shims expose a read-only source.
      }
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearSource();
      reject(error);
    };
    const succeed = (
      result: LoadedBase64Texture,
      clearUnusedSource: boolean,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (clearUnusedSource) clearSource();
      resolve(result);
    };
    const onAbort = () => {
      // TextureManager.addImage can synchronously trigger Scene shutdown.
      // Finish capturing the returned Texture identity before allowing that
      // abort to reject this load; the worker will claim it and then observe
      // the aborted signal so transaction rollback can remove it safely.
      if (installingTexture) return;
      fail(signalError(signal, "Vvfx asset loading was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    candidate.onload = () => {
      if (signal.aborted) {
        onAbort();
        return;
      }
      if (
        candidate.naturalWidth !== asset.width ||
        candidate.naturalHeight !== asset.height
      ) {
        fail(
          new Error(
            `The decoded dimensions for the image "${key}" do not match its definition.`,
          ),
        );
        return;
      }
      if (scene.textures.exists(key)) {
        succeed({ created: false, texture: scene.textures.get(key) }, true);
        return;
      }
      try {
        assertActive(signal, "Vvfx asset loading was cancelled.");
        installingTexture = true;
        const texture = scene.textures.addImage(key, candidate);
        installingTexture = false;
        if (!texture)
          throw new Error(`Vvfx could not install the image "${key}".`);
        // Phaser now owns the decoded image source. Clearing it here would
        // invalidate Canvas rendering and WebGL context restoration.
        succeed({ created: true, texture }, false);
      } catch (error) {
        installingTexture = false;
        fail(
          error instanceof Error
            ? error
            : new Error(`Vvfx could not install the image "${key}".`),
        );
      }
    };
    candidate.onerror = () =>
      fail(new Error(`Vvfx could not load the image "${key}".`));
    if (signal.aborted) {
      onAbort();
      return;
    }
    try {
      candidate.decoding = "async";
      candidate.src = asset.source;
    } catch (error) {
      fail(
        error instanceof Error
          ? error
          : new Error(`Vvfx could not load the image "${key}".`),
      );
    }
  });
}

async function loadVvfxAssetsWithMode(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys: Record<string, string> = {},
  signal?: AbortSignal,
  mode: "acquire" | "persistent" = "persistent",
): Promise<RuntimeAssetLease | null> {
  if (sceneIsTerminated(scene))
    throw cancellationError(
      "Vvfx asset loading stopped because the scene has shut down.",
    );
  const scope = createAssetLoadScope(scene, signal);
  const transaction: RuntimeTextureTransaction = {
    retained: [],
    created: new Set(),
    persistOnSuccess: new Set(),
  };
  try {
    assertActive(scope.signal, "Vvfx asset loading was cancelled.");
    const validation = validateRuntimeDefinition(definition);
    if (!validation.ok || !validation.definition)
      throw new Error(validation.error ?? "Invalid Vvfx runtime definition.");
    const normalized = validation.definition;
    const safeAssetKeys =
      assetKeys && typeof assetKeys === "object" && !Array.isArray(assetKeys)
        ? assetKeys
        : {};
    const planned = normalized.assets.map((asset) => {
      const mappedTextureKey = ownValue(safeAssetKeys, asset.id);
      if (mappedTextureKey !== undefined && !isSafeTextureKey(mappedTextureKey))
        throw new Error(
          `The mapped Phaser texture key for "${asset.name}" is invalid.`,
        );
      const textureKey = mappedTextureKey ?? asset.id;
      if (mappedTextureKey !== undefined && !scene.textures.exists(textureKey))
        throw new Error(
          `The mapped Phaser texture "${textureKey}" for "${asset.name}" is not loaded.`,
        );
      return {
        asset,
        textureKey,
        managed: mappedTextureKey === undefined && !asset.builtIn,
      };
    });

    assertActive(scope.signal, "Vvfx asset loading was cancelled.");
    createMissingTexture(scene);
    const pendingImages: typeof planned = [];
    for (const entry of planned) {
      assertActive(scope.signal, "Vvfx asset loading was cancelled.");
      if (scene.textures.exists(entry.textureKey)) {
        if (entry.managed)
          claimRuntimeTexture(
            scene,
            entry.textureKey,
            entry.asset,
            null,
            mode,
            transaction,
          );
        applySpriteSheetFrames(
          scene.textures.get(entry.textureKey),
          entry.asset,
        );
      } else if (entry.asset.builtIn) {
        createBuiltInTexture(scene, entry.textureKey, entry.asset.builtIn);
      } else {
        pendingImages.push(entry);
      }
    }

    let nextImage = 0;
    const worker = async () => {
      while (nextImage < pendingImages.length) {
        assertActive(scope.signal, "Vvfx asset loading was cancelled.");
        const entry = pendingImages[nextImage];
        nextImage += 1;
        const loadResult = await loadBase64Texture(
          scene,
          entry.textureKey,
          entry.asset,
          scope.signal,
        );
        if (entry.managed)
          claimRuntimeTexture(
            scene,
            entry.textureKey,
            entry.asset,
            loadResult.created ? loadResult.texture : null,
            mode,
            transaction,
          );
        // `addImage` can synchronously emit application events that shut down
        // the Scene. Claim the exact installed texture first so an abort here
        // is guaranteed to be rolled back without touching a replacement.
        assertActive(scope.signal, "Vvfx asset loading was cancelled.");
        applySpriteSheetFrames(
          scene.textures.get(entry.textureKey),
          entry.asset,
        );
      }
    };
    const workers = Array.from(
      {
        length: Math.min(MAX_CONCURRENT_IMAGE_DECODES, pendingImages.length),
      },
      () => worker(),
    );
    try {
      await Promise.all(workers);
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error("Vvfx could not load the runtime image library.");
      scope.cancel(failure);
      await Promise.allSettled(workers);
      throw failure;
    }
    assertActive(scope.signal, "Vvfx asset loading was cancelled.");
    return commitRuntimeTextureTransaction(scene, mode, transaction);
  } catch (error) {
    rollbackRuntimeTextureTransaction(scene, transaction);
    throw error;
  } finally {
    scope.dispose();
  }
}

/**
 * Preloads assets for the scene lifetime. Manual callers intentionally keep
 * embedded textures cached; `playVvfx` uses the leased path below instead.
 */
export async function loadVvfxAssets(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<void> {
  await loadVvfxAssetsWithMode(
    scene,
    definition,
    assetKeys,
    signal,
    "persistent",
  );
}

/** Internal leased loader used by playVvfx. */
export async function acquireVvfxAssets(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<RuntimeAssetLease> {
  const lease = await loadVvfxAssetsWithMode(
    scene,
    definition,
    assetKeys,
    signal,
    "acquire",
  );
  return lease ?? { release: () => undefined };
}
