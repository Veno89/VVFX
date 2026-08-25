import type Phaser from "phaser";
import { tintNumber } from "../../../src/vfx/color";
import { evaluateProject } from "../../../src/vfx/engine";
import {
  syncPhaserRenderingEffects,
  type PhaserRenderingAssetFrameResolver,
} from "../../../src/vfx/renderingEffects";
import type { BeamEndpoints, VfxProject } from "../../../src/vfx/types";
import { runtimeDefinitionToProject } from "./definition";
import type { VvfxEffectOptions, VvfxRuntimeDefinition } from "./types";

export function resolveRuntimeRenderingAssetFrame(
  scene: Phaser.Scene,
  asset: VfxProject["assets"][number] | undefined,
  assetKeys: Record<string, string>,
  assetFrames: Record<string, string | number>,
): Phaser.Textures.Frame | null {
  if (!asset || asset.spriteSheet) return null;
  const textureKey = assetKeys[asset.id] ?? asset.id;
  if (!scene.textures.exists(textureKey)) return null;
  const requestedFrame = assetFrames[asset.id] ?? asset.atlasFrame ?? "__BASE";
  const texture = scene.textures.get(textureKey);
  return texture.has(String(requestedFrame))
    ? texture.get(requestedFrame)
    : null;
}

export class VvfxEffect {
  private readonly project: VfxProject;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly layerDepths = new Map<string, number>();
  private elapsed = 0;
  private playing = false;
  private destroyed = false;
  private originX: number;
  private originY: number;
  private readonly baseDepth: number;
  private readonly loop: boolean;
  private readonly autoDestroy: boolean;
  private readonly assetKeys: Record<string, string>;
  private readonly assetFrames: Record<string, string | number>;
  private readonly assetsById: Map<string, VfxProject["assets"][number]>;
  private readonly defaultAssetFrames = new Map<string, string>();
  private readonly beamEndpoints = new Map<string, BeamEndpoints>();
  private readonly onComplete?: () => void;
  private readonly onWarning?: (message: string) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    definition: VvfxRuntimeDefinition,
    options: VvfxEffectOptions = {},
  ) {
    this.project = runtimeDefinitionToProject(definition);
    definition.layers.forEach((layer) =>
      this.layerDepths.set(layer.id, layer.depth),
    );
    this.originX = options.originX ?? 0;
    this.originY = options.originY ?? 0;
    this.baseDepth = options.baseDepth ?? 0;
    this.loop = options.loop ?? false;
    this.autoDestroy = options.autoDestroy ?? true;
    this.assetKeys = options.assetKeys ?? {};
    this.assetFrames = options.assetFrames ?? {};
    this.assetsById = new Map(
      this.project.assets.map((asset) => [asset.id, asset]),
    );
    definition.assets.forEach((asset) => {
      if (asset.atlasFrame)
        this.defaultAssetFrames.set(asset.id, asset.atlasFrame);
    });
    if (options.beamEndpoints) {
      for (const layer of this.project.layers)
        if (layer.type === "beam")
          this.beamEndpoints.set(layer.id, { ...options.beamEndpoints });
    }
    this.onComplete = options.onComplete;
    this.onWarning = options.onWarning;
    scene.events.on("update", this.handleSceneUpdate);
    scene.events.once("shutdown", this.handleSceneShutdown);
    if (options.autoplay !== false) this.play();
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
    this.renderFrame();
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
    this.renderFrame();
    return this;
  }

  stop() {
    this.playing = false;
    this.elapsed = 0;
    this.clearSprites();
    return this;
  }

  setPosition(x: number, y: number) {
    this.originX = x;
    this.originY = y;
    if (!this.destroyed) this.renderFrame();
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
    if (![startX, startY, endX, endY].every(Number.isFinite)) return this;
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
    if (!this.destroyed) this.renderFrame();
    return this;
  }

  /** Restores authored endpoints for one Beam layer or all Beam layers. */
  clearEndpoints(layerId?: string) {
    if (layerId) this.beamEndpoints.delete(layerId);
    else this.beamEndpoints.clear();
    if (!this.destroyed) this.renderFrame();
    return this;
  }

  update(delta: number) {
    if (!this.playing || this.destroyed) return;
    this.elapsed += Math.max(0, delta);
    const duration = Math.max(1, this.project.preview.duration);
    if (this.elapsed >= duration) {
      if (this.loop) {
        this.elapsed %= duration;
      } else {
        this.playing = false;
        this.clearSprites();
        this.onComplete?.();
        if (this.autoDestroy) this.destroy();
        return;
      }
    }
    this.renderFrame();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    this.clearSprites();
    this.scene.events.off("update", this.handleSceneUpdate);
    this.scene.events.off("shutdown", this.handleSceneShutdown);
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
    const instances = evaluateProject(
      this.project,
      this.elapsed,
      null,
      localBeamEndpoints,
    );
    const liveKeys = new Set(instances.map((instance) => instance.key));
    for (const [key, sprite] of this.sprites) {
      if (!liveKeys.has(key)) {
        sprite.destroy();
        this.sprites.delete(key);
      }
    }

    for (const instance of instances) {
      const textureKey = instance.assetId
        ? (this.assetKeys[instance.assetId] ?? instance.assetId)
        : "vvfx-missing";
      const availableTexture = this.scene.textures.exists(textureKey)
        ? textureKey
        : "vvfx-missing";
      const requestedFrame = instance.assetId
        ? (instance.frame ??
          this.assetFrames[instance.assetId] ??
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
        resolveAssetFrame: this.resolveRenderingAssetFrame,
        onWarning: this.onWarning,
      });
    }
  }

  private clearSprites() {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
