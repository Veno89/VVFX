import type Phaser from "phaser";
import type { VfxProject } from "../../../src/vfx/types";
import type { VvfxEffectOptions, VvfxRuntimeDefinition } from "./types";
export declare function resolveRuntimeRenderingAssetFrame(
  scene: Phaser.Scene,
  asset: VfxProject["assets"][number] | undefined,
  assetKeys: Record<string, string>,
  assetFrames: Record<string, string | number>,
): Phaser.Textures.Frame | null;
export declare class VvfxEffect {
  private readonly scene;
  private readonly project;
  private readonly evaluator;
  private readonly sprites;
  private readonly layerDepths;
  private elapsed;
  private playing;
  private destroyed;
  private renderQueued;
  private renderRequest;
  private originX;
  private originY;
  private readonly baseDepth;
  private readonly loop;
  private readonly autoDestroy;
  private readonly assetKeys;
  private readonly assetFrames;
  private readonly assetsById;
  private readonly defaultAssetFrames;
  private readonly beamEndpoints;
  private readonly onComplete?;
  private readonly onWarning?;
  private releaseAssets;
  constructor(
    scene: Phaser.Scene,
    definition: VvfxRuntimeDefinition,
    options?: VvfxEffectOptions,
    releaseAssets?: () => void,
    runtimeAssetKeys?: Record<string, string>,
  );
  get isPlaying(): boolean;
  get isDestroyed(): boolean;
  get currentTime(): number;
  play(): this;
  pause(): this;
  restart(): this;
  stop(): this;
  setPosition(x: number, y: number): this;
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
  ): this;
  /** Restores authored endpoints for one Beam layer or all Beam layers. */
  clearEndpoints(layerId?: string): this;
  update(delta: number): void;
  destroy(): void;
  private readonly handleSceneUpdate;
  private readonly handleSceneShutdown;
  private readonly resolveRenderingAssetFrame;
  private scheduleRender;
  private cancelScheduledRender;
  private renderImmediately;
  private renderFrame;
  private clearSprites;
}
