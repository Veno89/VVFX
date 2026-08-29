import type Phaser from "phaser";
import { tintNumber } from "../../../src/vfx/color";
import {
  createProjectEvaluator,
  type BeamEvaluationOptions,
  type ProjectEvaluator,
} from "../../../src/vfx/engine";
import {
  isSupportedVfxNumber,
  MAX_VFX_SCALE,
  MAX_VFX_TIMING_MS,
  VVFX_INTERNAL_MISSING_TEXTURE_KEY,
  VVFX_INTERNAL_TEXTURE_PREFIX,
} from "../../../src/vfx/inputLimits";
import { syncNormalizedSourceCrop } from "../../../src/vfx/phaserFrames";
import {
  syncPhaserRenderingEffects,
  type PhaserRenderingAssetFrameResolver,
} from "../../../src/vfx/phaserRenderingEffects";
import type { BeamEndpoints, VfxProject } from "../../../src/vfx/types";
import { runtimeDefinitionToProject } from "./definition";
import {
  assertMappedSpriteSheetTexture,
  runtimeAssetTextureKey,
} from "./textures";
import type { VvfxEffectOptions, VvfxRuntimeDefinition } from "./types";

const ownValue = <T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined => {
  if (!record) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor
    ? (descriptor.value as T)
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteOr = (value: unknown, fallback: number) =>
  isSupportedVfxNumber(value) ? value : fallback;

const hasControlCharacters = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

const isSafeRenderableTextureKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 256 &&
  value.trim().length > 0 &&
  value !== VVFX_INTERNAL_MISSING_TEXTURE_KEY &&
  !hasControlCharacters(value);

const isSafeExternalTextureKey = (value: unknown): value is string =>
  isSafeRenderableTextureKey(value) &&
  !value.startsWith(VVFX_INTERNAL_TEXTURE_PREFIX);

const isSafeFrame = (value: unknown): value is string | number =>
  (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
  (typeof value === "string" &&
    value.length <= 160 &&
    value.trim().length > 0 &&
    !hasControlCharacters(value));

function sanitizeAssetKeys(
  value: unknown,
  assetIds: readonly string[],
): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  if (!isRecord(value)) return result;
  for (const assetId of assetIds) {
    const candidate = ownValue(value, assetId);
    if (candidate === undefined) continue;
    if (!isSafeExternalTextureKey(candidate))
      throw new Error(
        `The mapped Phaser texture key for "${assetId}" is invalid.`,
      );
    result[assetId] = candidate;
  }
  return result;
}

function sanitizeRuntimeAssetKeys(
  value: unknown,
  assetIds: readonly string[],
): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  if (!isRecord(value)) return result;
  for (const assetId of assetIds) {
    const candidate = ownValue(value, assetId);
    if (isSafeRenderableTextureKey(candidate)) result[assetId] = candidate;
  }
  return result;
}

function sanitizeAssetFrames(
  value: unknown,
  assetIds: readonly string[],
): Record<string, string | number> {
  const result = Object.create(null) as Record<string, string | number>;
  if (!isRecord(value)) return result;
  for (const assetId of assetIds) {
    const candidate = ownValue(value, assetId);
    if (candidate === undefined) continue;
    if (!isSafeFrame(candidate))
      throw new Error(`The mapped Phaser frame for "${assetId}" is invalid.`);
    result[assetId] = candidate;
  }
  return result;
}

function finiteBeamEndpoints(value: unknown): BeamEndpoints | null {
  if (!isRecord(value)) return null;
  const startX = ownValue(value, "startX");
  const startY = ownValue(value, "startY");
  const endX = ownValue(value, "endX");
  const endY = ownValue(value, "endY");
  if (
    ![startX, startY, endX, endY].every((coordinate) =>
      isSupportedVfxNumber(coordinate),
    )
  )
    return null;
  return {
    startX: startX as number,
    startY: startY as number,
    endX: endX as number,
    endY: endY as number,
  };
}

export function resolveRuntimeRenderingAssetFrame(
  scene: Phaser.Scene,
  asset: VfxProject["assets"][number] | undefined,
  assetKeys: Record<string, string>,
  assetFrames: Record<string, string | number>,
): Phaser.Textures.Frame | null {
  if (!asset || asset.spriteSheet) return null;
  const mappedTextureKey = ownValue(assetKeys, asset.id);
  const textureKey = isSafeRenderableTextureKey(mappedTextureKey)
    ? mappedTextureKey
    : asset.id;
  if (!scene.textures.exists(textureKey)) return null;
  const mappedFrame = ownValue(assetFrames, asset.id);
  const requestedFrame =
    (isSafeFrame(mappedFrame) ? mappedFrame : undefined) ??
    asset.atlasFrame ??
    "__BASE";
  const texture = scene.textures.get(textureKey);
  return texture.has(String(requestedFrame))
    ? texture.get(requestedFrame)
    : null;
}

export class VvfxEffect {
  private readonly project: VfxProject;
  private readonly evaluator: ProjectEvaluator;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly layerDepths = new Map<string, number>();
  private elapsed = 0;
  private playing = false;
  private destroyed = false;
  private renderQueued = false;
  private renderRequest = 0;
  private originX: number;
  private originY: number;
  private readonly baseDepth: number;
  private readonly loop: boolean;
  private readonly autoDestroy: boolean;
  private readonly beamOptions: BeamEvaluationOptions;
  private readonly maxDurationMs: number | null;
  private readonly assetKeys: Record<string, string>;
  private readonly assetFrames: Record<string, string | number>;
  private readonly assetsById: Map<string, VfxProject["assets"][number]>;
  private readonly defaultAssetFrames = new Map<string, string>();
  private readonly beamEndpoints = new Map<string, BeamEndpoints>();
  private readonly onComplete?: () => void;
  private readonly onWarning?: (message: string) => void;
  private releaseAssets: (() => void) | null;

  constructor(
    private readonly scene: Phaser.Scene,
    definition: VvfxRuntimeDefinition,
    options: VvfxEffectOptions = {},
    releaseAssets?: () => void,
    runtimeAssetKeys: Record<string, string> = {},
  ) {
    this.releaseAssets = releaseAssets ?? null;
    this.project = runtimeDefinitionToProject(definition);
    this.evaluator = createProjectEvaluator(this.project);
    const safeOptions = isRecord(options) ? options : {};
    this.project.layers.forEach((layer, depth) =>
      this.layerDepths.set(layer.id, depth),
    );
    this.originX = finiteOr(ownValue(safeOptions, "originX"), 0);
    this.originY = finiteOr(ownValue(safeOptions, "originY"), 0);
    this.baseDepth = finiteOr(ownValue(safeOptions, "baseDepth"), 0);
    this.loop = ownValue(safeOptions, "loop") === true;
    this.autoDestroy = ownValue(safeOptions, "autoDestroy") !== false;
    const beamFit = ownValue(safeOptions, "beamFit");
    const beamThicknessScale = ownValue(safeOptions, "beamThicknessScale");
    this.beamOptions = {
      beamFit: beamFit === "crop" ? "crop" : "stretch",
      beamThicknessScale:
        isSupportedVfxNumber(beamThicknessScale) && beamThicknessScale >= 0
          ? Math.min(MAX_VFX_SCALE, beamThicknessScale)
          : 1,
    };
    const maxDurationMs = ownValue(safeOptions, "maxDurationMs");
    this.maxDurationMs =
      isSupportedVfxNumber(maxDurationMs) && maxDurationMs > 0
        ? Math.max(1, Math.min(MAX_VFX_TIMING_MS, maxDurationMs))
        : null;
    const assetIds = this.project.assets.map((asset) => asset.id);
    const detectedRuntimeAssetKeys = Object.fromEntries(
      definition.assets
        .map((asset) => [asset.id, runtimeAssetTextureKey(asset)] as const)
        .filter(([, key]) => scene.textures.exists(key)),
    );
    this.assetKeys = Object.assign(
      Object.create(null) as Record<string, string>,
      detectedRuntimeAssetKeys,
      sanitizeRuntimeAssetKeys(runtimeAssetKeys, assetIds),
      sanitizeAssetKeys(ownValue(safeOptions, "assetKeys"), assetIds),
    );
    this.assetFrames = sanitizeAssetFrames(
      ownValue(safeOptions, "assetFrames"),
      assetIds,
    );
    this.assetsById = new Map(
      this.project.assets.map((asset) => [asset.id, asset]),
    );
    for (const asset of definition.assets) {
      const mappedTextureKey = ownValue(this.assetKeys, asset.id);
      if (
        asset.spriteSheet &&
        mappedTextureKey &&
        !mappedTextureKey.startsWith(VVFX_INTERNAL_TEXTURE_PREFIX)
      )
        assertMappedSpriteSheetTexture(scene, mappedTextureKey, asset);
    }
    this.project.assets.forEach((asset) => {
      if (asset.atlasFrame)
        this.defaultAssetFrames.set(asset.id, asset.atlasFrame);
    });
    const initialBeamEndpoints = finiteBeamEndpoints(
      ownValue(safeOptions, "beamEndpoints"),
    );
    if (initialBeamEndpoints) {
      for (const layer of this.project.layers)
        if (layer.type === "beam")
          this.beamEndpoints.set(layer.id, { ...initialBeamEndpoints });
    }
    const onComplete = ownValue(safeOptions, "onComplete");
    const onWarning = ownValue(safeOptions, "onWarning");
    this.onComplete =
      typeof onComplete === "function" ? (onComplete as () => void) : undefined;
    this.onWarning =
      typeof onWarning === "function"
        ? (onWarning as (message: string) => void)
        : undefined;
    scene.events.on("update", this.handleSceneUpdate);
    scene.events.once("shutdown", this.handleSceneShutdown);
    try {
      if (ownValue(safeOptions, "autoplay") !== false) this.play();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  get isPlaying() {
    return this.playing;
  }

  get isDestroyed() {
    return this.destroyed;
  }

  get currentTime() {
    return this.elapsed;
  }

  play() {
    if (this.destroyed) return this;
    this.playing = true;
    this.renderImmediately();
    return this;
  }

  pause() {
    this.playing = false;
    return this;
  }

  restart() {
    if (this.destroyed) return this;
    this.elapsed = 0;
    this.playing = true;
    // Restart is a lifecycle boundary, not just a seek. Rebuild every Phaser
    // object from canonical evaluator output so no controller, input state, or
    // other transient attached to a reused sprite can survive the restart.
    this.clearSprites();
    this.renderImmediately();
    return this;
  }

  stop() {
    this.cancelScheduledRender();
    this.playing = false;
    this.elapsed = 0;
    this.clearSprites();
    return this;
  }

  setPosition(x: number, y: number) {
    if (!isSupportedVfxNumber(x) || !isSupportedVfxNumber(y)) return this;
    this.originX = x;
    this.originY = y;
    if (!this.destroyed) this.scheduleRender();
    return this;
  }

  /**
   * Fits one Beam layer, or every Beam layer when layerId is omitted, between
   * two world-space points. This can be called every frame for moving targets.
   */
  setEndpoints(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    layerId?: string,
  ) {
    if (![startX, startY, endX, endY].every(isSupportedVfxNumber)) return this;
    const endpoints = { startX, startY, endX, endY };
    const targetIds = layerId
      ? [layerId]
      : this.project.layers
          .filter((layer) => layer.type === "beam")
          .map((layer) => layer.id);
    for (const id of targetIds)
      if (
        this.project.layers.some(
          (layer) => layer.id === id && layer.type === "beam",
        )
      )
        this.beamEndpoints.set(id, { ...endpoints });
    if (!this.destroyed) this.scheduleRender();
    return this;
  }

  /** Restores authored endpoints for one Beam layer or all Beam layers. */
  clearEndpoints(layerId?: string) {
    if (layerId) this.beamEndpoints.delete(layerId);
    else this.beamEndpoints.clear();
    if (!this.destroyed) this.scheduleRender();
    return this;
  }

  update(delta: number) {
    if (!this.playing || this.destroyed) return;
    if (!isSupportedVfxNumber(delta)) return;
    this.cancelScheduledRender();
    this.elapsed += Math.max(0, delta);
    const authoredDuration = Math.max(1, this.project.preview.duration);
    const duration =
      this.loop || this.maxDurationMs === null
        ? authoredDuration
        : Math.min(authoredDuration, this.maxDurationMs);
    if (this.elapsed >= duration) {
      if (this.loop) {
        this.elapsed %= duration;
      } else {
        this.playing = false;
        try {
          this.clearSprites();
          this.onComplete?.();
        } finally {
          // Host callbacks are not allowed to defeat the runtime's cleanup
          // guarantee. Their exception still propagates after destroy runs.
          if (this.autoDestroy) this.destroy();
        }
        return;
      }
    }
    this.renderFrame();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    this.cancelScheduledRender();
    this.scene.events.off("update", this.handleSceneUpdate);
    this.scene.events.off("shutdown", this.handleSceneShutdown);
    let cleanupError: unknown;
    try {
      this.clearSprites();
    } catch (error) {
      cleanupError = error;
    }
    this.layerDepths.clear();
    this.defaultAssetFrames.clear();
    this.beamEndpoints.clear();
    this.assetsById.clear();
    const releaseAssets = this.releaseAssets;
    this.releaseAssets = null;
    try {
      releaseAssets?.();
    } catch (error) {
      cleanupError ??= error;
    }
    if (cleanupError) throw cleanupError;
  }

  private readonly handleSceneUpdate = (_time: number, delta: number) => {
    this.update(delta);
  };

  private readonly handleSceneShutdown = () => {
    this.destroy();
  };

  private readonly resolveRenderingAssetFrame: PhaserRenderingAssetFrameResolver =
    (assetId) =>
      resolveRuntimeRenderingAssetFrame(
        this.scene,
        this.assetsById.get(assetId),
        this.assetKeys,
        this.assetFrames,
      );

  private scheduleRender() {
    if (this.renderQueued || this.destroyed) return;
    this.renderQueued = true;
    const request = ++this.renderRequest;
    queueMicrotask(() => {
      if (
        this.destroyed ||
        !this.renderQueued ||
        request !== this.renderRequest
      )
        return;
      this.renderQueued = false;
      this.renderFrame();
    });
  }

  private cancelScheduledRender() {
    this.renderQueued = false;
    this.renderRequest += 1;
  }

  private renderImmediately() {
    this.cancelScheduledRender();
    this.renderFrame();
  }

  private renderFrame() {
    const localBeamEndpoints = Object.fromEntries(
      [...this.beamEndpoints].map(([layerId, endpoints]) => [
        layerId,
        {
          startX: endpoints.startX - this.originX,
          startY: endpoints.startY - this.originY,
          endX: endpoints.endX - this.originX,
          endY: endpoints.endY - this.originY,
        },
      ]),
    );
    const instances = this.evaluator.evaluate(
      this.elapsed,
      null,
      localBeamEndpoints,
      undefined,
      this.beamOptions,
    );
    const liveKeys = new Set(instances.map((instance) => instance.key));
    for (const [key, sprite] of this.sprites) {
      if (!liveKeys.has(key)) {
        sprite.destroy();
        this.sprites.delete(key);
      }
    }

    for (const instance of instances) {
      const mappedTextureKey = instance.assetId
        ? ownValue(this.assetKeys, instance.assetId)
        : undefined;
      const textureKey = instance.assetId
        ? (mappedTextureKey ?? instance.assetId)
        : VVFX_INTERNAL_MISSING_TEXTURE_KEY;
      const availableTexture = this.scene.textures.exists(textureKey)
        ? textureKey
        : VVFX_INTERNAL_MISSING_TEXTURE_KEY;
      const requestedFrame = instance.assetId
        ? (instance.frame ??
          ownValue(this.assetFrames, instance.assetId) ??
          this.defaultAssetFrames.get(instance.assetId) ??
          "__BASE")
        : "__BASE";
      const texture = this.scene.textures.get(availableTexture);
      const availableFrame = texture.has(String(requestedFrame))
        ? requestedFrame
        : "__BASE";
      let sprite = this.sprites.get(instance.key);
      if (!sprite) {
        sprite = this.scene.add.image(0, 0, availableTexture, availableFrame);
        this.sprites.set(instance.key, sprite);
      } else if (
        sprite.texture.key !== availableTexture ||
        sprite.frame.name !== availableFrame
      ) {
        sprite.setTexture(availableTexture, availableFrame);
      }
      syncNormalizedSourceCrop(sprite, instance.sourceCrop);
      sprite
        .setPosition(this.originX + instance.x, this.originY + instance.y)
        .setScale(instance.scaleX, instance.scaleY)
        .setAlpha(instance.opacity)
        .setAngle(instance.rotation)
        .setBlendMode(instance.blendMode === "add" ? 1 : 0)
        .setDepth(
          this.baseDepth +
            (this.layerDepths.get(instance.layerId) ?? 0) +
            (instance.trailIndex === null
              ? 0
              : -0.01 - instance.trailIndex * 0.001),
        );
      if (instance.tint)
        sprite.setTint(tintNumber(instance.tint, instance.tintStrength));
      else sprite.clearTint();
      syncPhaserRenderingEffects({
        scene: this.scene,
        sprite,
        effects: instance.effects,
        timeMs: this.elapsed,
        resolveAssetFrame: this.resolveRenderingAssetFrame,
        onWarning: this.onWarning,
      });
    }
  }

  private clearSprites() {
    let cleanupError: unknown;
    for (const sprite of this.sprites.values()) {
      try {
        sprite.destroy();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    this.sprites.clear();
    if (cleanupError) throw cleanupError;
  }
}
