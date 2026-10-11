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
  clearPhaserRenderingEffects,
  syncPhaserRenderingEffects,
  type PhaserRenderingAssetFrameResolver,
} from "../../../src/vfx/phaserRenderingEffects";
import type { BeamEndpoints, VfxProject } from "../../../src/vfx/types";
import { runtimeDefinitionToProject } from "./definition";
import {
  assertMappedSpriteSheetTexture,
  runtimeAssetTextureKey,
} from "./textures";
import type {
  VvfxEffectOptions,
  VvfxFollowTarget,
  VvfxRuntimeCue,
  VvfxRuntimeDefinition,
} from "./types";

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

/** Upper bound on hidden sprites one effect keeps for reuse. */
const MAX_POOLED_SPRITES = 256;

/** Fastest playback speed accepted by setTimeScale. */
const MAX_VVFX_TIME_SCALE = 10;

const validScale = (value: unknown): value is number =>
  isSupportedVfxNumber(value) && value > 0;

const validTimeScale = (value: unknown): value is number =>
  isSupportedVfxNumber(value) && value >= 0;

const validTint = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 0xffffff;

interface FollowState {
  target: VvfxFollowTarget;
  offsetX: number;
  offsetY: number;
  release: () => void;
}

export class VvfxEffect {
  private readonly project: VfxProject;
  private readonly evaluator: ProjectEvaluator;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  /**
   * Hidden filter-free sprites kept for reuse, so bursts and emitters do not
   * create and destroy a Phaser game object for every short-lived copy.
   */
  private readonly spritePool: Phaser.GameObjects.Image[] = [];
  private readonly layerDepths = new Map<string, number>();
  private elapsed = 0;
  private playing = false;
  private destroyed = false;
  private renderQueued = false;
  private renderRequest = 0;
  private originX: number;
  private originY: number;
  private effectScale = 1;
  private effectAngle = 0;
  private flipXEnabled = false;
  private flipYEnabled = false;
  private playbackRate = 1;
  private tintOverride: number | null = null;
  private following: FollowState | null = null;
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
  private readonly onCue?: (cue: VvfxRuntimeCue) => void;
  /** Validated cues in time order, carried as the project's Timeline markers. */
  private readonly cues: readonly VvfxRuntimeCue[];
  /** Cues at or before this time already fired in the current pass. */
  private cueCursor = -1;
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
    const scale = ownValue(safeOptions, "scale");
    if (validScale(scale)) this.effectScale = Math.min(MAX_VFX_SCALE, scale);
    this.effectAngle = finiteOr(ownValue(safeOptions, "angle"), 0);
    this.flipXEnabled = ownValue(safeOptions, "flipX") === true;
    this.flipYEnabled = ownValue(safeOptions, "flipY") === true;
    const timeScale = ownValue(safeOptions, "timeScale");
    if (validTimeScale(timeScale))
      this.playbackRate = Math.min(MAX_VVFX_TIME_SCALE, timeScale);
    const tint = ownValue(safeOptions, "tint");
    if (validTint(tint)) this.tintOverride = tint;
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
    const onCue = ownValue(safeOptions, "onCue");
    this.onCue =
      typeof onCue === "function"
        ? (onCue as (cue: VvfxRuntimeCue) => void)
        : undefined;
    this.cues = this.project.timeline.markers
      .map((marker) => ({ name: marker.label, time: marker.time }))
      .sort((left, right) => left.time - right.time);
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

  get scale() {
    return this.effectScale;
  }

  get angle() {
    return this.effectAngle;
  }

  get flipX() {
    return this.flipXEnabled;
  }

  get flipY() {
    return this.flipYEnabled;
  }

  get timeScale() {
    return this.playbackRate;
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
    this.cueCursor = -1;
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
    this.cueCursor = -1;
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
   * Scales the whole effect around its origin: copy positions, motion, and
   * sprite sizes together. 1 is the authored size.
   */
  setScale(scale: number) {
    if (!validScale(scale)) return this;
    this.effectScale = Math.min(MAX_VFX_SCALE, scale);
    return this.transformChanged();
  }

  /** Rotates the whole effect around its origin, in degrees. */
  setAngle(degrees: number) {
    if (!isSupportedVfxNumber(degrees)) return this;
    this.effectAngle = degrees;
    return this.transformChanged();
  }

  /** Rotates the whole effect around its origin, in radians. */
  setRotation(radians: number) {
    if (!isSupportedVfxNumber(radians)) return this;
    return this.setAngle((radians * 180) / Math.PI);
  }

  /** Mirrors the effect left to right, for example to face the other way. */
  setFlipX(flip: boolean) {
    this.flipXEnabled = flip === true;
    return this.transformChanged();
  }

  /** Mirrors the effect top to bottom. */
  setFlipY(flip: boolean) {
    this.flipYEnabled = flip === true;
    return this.transformChanged();
  }

  /**
   * Multiplies playback speed: 0.5 is slow motion, 2 is double speed, and 0
   * holds the current frame while the effect keeps playing. Capped at 10.
   */
  setTimeScale(timeScale: number) {
    if (!validTimeScale(timeScale)) return this;
    this.playbackRate = Math.min(MAX_VVFX_TIME_SCALE, timeScale);
    return this;
  }

  /**
   * Replaces every copy's authored tint with one color, such as 0x66ccff for
   * a team color. Call clearTint() to restore the authored colors.
   */
  setTint(color: number) {
    if (!validTint(color)) return this;
    this.tintOverride = color;
    return this.transformChanged();
  }

  clearTint() {
    this.tintOverride = null;
    return this.transformChanged();
  }

  /**
   * Keeps the effect's origin on a moving object, such as a Phaser sprite,
   * plus an optional offset. Following stops when the target emits Phaser's
   * "destroy" event, leaving the effect at its last position.
   */
  follow(target: VvfxFollowTarget, offsetX = 0, offsetY = 0) {
    this.stopFollow();
    if (this.destroyed || !isRecord(target)) return this;
    const following: FollowState = {
      target,
      offsetX: finiteOr(offsetX, 0),
      offsetY: finiteOr(offsetY, 0),
      release: () => undefined,
    };
    const emitter = target as { on?: unknown; off?: unknown };
    if (typeof emitter.on === "function" && typeof emitter.off === "function") {
      type Listen = (event: string, listener: () => void) => unknown;
      const handleDestroy = () => {
        if (this.following === following) this.stopFollow();
      };
      (emitter.on as Listen).call(target, "destroy", handleDestroy);
      following.release = () =>
        (emitter.off as Listen).call(target, "destroy", handleDestroy);
    }
    this.following = following;
    if (this.syncFollow()) this.scheduleRender();
    return this;
  }

  stopFollow() {
    const following = this.following;
    this.following = null;
    following?.release();
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
    if (this.destroyed) return;
    const moved = this.syncFollow();
    if (!this.playing) {
      // A paused effect still tracks its target; a stopped one stays empty.
      if (moved && this.sprites.size > 0) this.scheduleRender();
      return;
    }
    if (!isSupportedVfxNumber(delta)) return;
    this.cancelScheduledRender();
    this.elapsed += Math.max(0, delta) * this.playbackRate;
    const authoredDuration = Math.max(1, this.project.preview.duration);
    const duration =
      this.loop || this.maxDurationMs === null
        ? authoredDuration
        : Math.min(authoredDuration, this.maxDurationMs);
    const passEnd = Math.min(this.elapsed, duration);
    const wrapped = this.loop && this.elapsed >= duration;
    if (wrapped) this.elapsed %= duration;
    this.emitCues(passEnd, duration, wrapped);
    if (this.destroyed) return;
    // A looping effect has already wrapped, so only one-shots reach the end.
    if (this.elapsed >= duration) {
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
      this.stopFollow();
    } catch (error) {
      cleanupError = error;
    }
    try {
      this.clearSprites();
    } catch (error) {
      cleanupError ??= error;
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

  /**
   * Fires each cue once per pass, in time order. The cursor moves before any
   * host callback runs, so a throwing callback cannot fire a cue twice.
   */
  private emitCues(passEnd: number, duration: number, wrapped: boolean) {
    const due: VvfxRuntimeCue[] = [];
    const collect = (from: number, to: number) => {
      for (const cue of this.cues) {
        if (cue.time > to) break;
        if (cue.time > from && cue.time <= duration) due.push({ ...cue });
      }
    };
    collect(this.cueCursor, passEnd);
    this.cueCursor = passEnd;
    if (wrapped) {
      collect(-1, this.elapsed);
      this.cueCursor = this.elapsed;
    }
    if (!this.onCue) return;
    for (const cue of due) {
      if (this.destroyed) return;
      this.onCue(cue);
    }
  }

  private transformChanged() {
    if (!this.destroyed) this.scheduleRender();
    return this;
  }

  /** Moves the origin onto the follow target; true when it changed. */
  private syncFollow() {
    const following = this.following;
    if (!following) return false;
    const x = following.target.x + following.offsetX;
    const y = following.target.y + following.offsetY;
    if (!isSupportedVfxNumber(x) || !isSupportedVfxNumber(y)) return false;
    if (x === this.originX && y === this.originY) return false;
    this.originX = x;
    this.originY = y;
    return true;
  }

  /** Maps an effect-space offset to a world-space offset from the origin. */
  private toWorldOffset(x: number, y: number) {
    const mirroredX = (this.flipXEnabled ? -x : x) * this.effectScale;
    const mirroredY = (this.flipYEnabled ? -y : y) * this.effectScale;
    if (this.effectAngle === 0) return { x: mirroredX, y: mirroredY };
    const radians = (this.effectAngle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: mirroredX * cos - mirroredY * sin,
      y: mirroredX * sin + mirroredY * cos,
    };
  }

  /** Inverse of toWorldOffset, for world-space Beam endpoints. */
  private toEffectOffset(x: number, y: number) {
    let localX = x;
    let localY = y;
    if (this.effectAngle !== 0) {
      const radians = (this.effectAngle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      localX = x * cos + y * sin;
      localY = -x * sin + y * cos;
    }
    localX /= this.effectScale;
    localY /= this.effectScale;
    return {
      x: this.flipXEnabled ? -localX : localX,
      y: this.flipYEnabled ? -localY : localY,
    };
  }

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
      [...this.beamEndpoints].map(([layerId, endpoints]) => {
        const start = this.toEffectOffset(
          endpoints.startX - this.originX,
          endpoints.startY - this.originY,
        );
        const end = this.toEffectOffset(
          endpoints.endX - this.originX,
          endpoints.endY - this.originY,
        );
        return [
          layerId,
          { startX: start.x, startY: start.y, endX: end.x, endY: end.y },
        ];
      }),
    );
    // A single mirror reverses the direction of every authored rotation.
    const angleSign = this.flipXEnabled !== this.flipYEnabled ? -1 : 1;
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
        this.releaseSprite(sprite);
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
        sprite = this.acquireSprite(availableTexture, availableFrame);
        this.sprites.set(instance.key, sprite);
      } else if (
        sprite.texture.key !== availableTexture ||
        sprite.frame.name !== availableFrame
      ) {
        sprite.setTexture(availableTexture, availableFrame);
      }
      syncNormalizedSourceCrop(sprite, instance.sourceCrop);
      const offset = this.toWorldOffset(instance.x, instance.y);
      sprite
        .setPosition(this.originX + offset.x, this.originY + offset.y)
        .setScale(
          instance.scaleX * this.effectScale,
          instance.scaleY * this.effectScale,
        )
        .setAlpha(instance.opacity)
        .setAngle(instance.rotation * angleSign + this.effectAngle)
        .setBlendMode(instance.blendMode === "add" ? 1 : 0);
      if (
        sprite.flipX !== this.flipXEnabled ||
        sprite.flipY !== this.flipYEnabled
      )
        sprite.setFlip(this.flipXEnabled, this.flipYEnabled);
      // Phaser queues a sort of the host scene's whole display list on every
      // depth assignment, so only assign when the value actually changes.
      const depth =
        this.baseDepth +
        (this.layerDepths.get(instance.layerId) ?? 0) +
        (instance.trailIndex === null
          ? 0
          : -0.01 - instance.trailIndex * 0.001);
      if (sprite.depth !== depth) sprite.setDepth(depth);
      if (this.tintOverride !== null) sprite.setTint(this.tintOverride);
      else if (instance.tint)
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

  private acquireSprite(
    texture: string,
    frame: string | number,
  ): Phaser.GameObjects.Image {
    const pooled = this.spritePool.pop();
    if (!pooled) return this.scene.add.image(0, 0, texture, frame);
    // Every per-frame property is reassigned by renderFrame; only the texture
    // and visibility need restoring here.
    return pooled.setTexture(texture, frame).setVisible(true);
  }

  private releaseSprite(sprite: Phaser.GameObjects.Image) {
    clearPhaserRenderingEffects(sprite);
    // A sprite that ever enabled filters keeps its filter camera; destroy it
    // rather than carry that cost into an unrelated copy.
    if (sprite.filters || this.spritePool.length >= MAX_POOLED_SPRITES) {
      sprite.destroy();
      return;
    }
    sprite.setVisible(false);
    this.spritePool.push(sprite);
  }

  private clearSprites() {
    let cleanupError: unknown;
    for (const sprite of [...this.sprites.values(), ...this.spritePool]) {
      try {
        sprite.destroy();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    this.sprites.clear();
    this.spritePool.length = 0;
    if (cleanupError) throw cleanupError;
  }
}
