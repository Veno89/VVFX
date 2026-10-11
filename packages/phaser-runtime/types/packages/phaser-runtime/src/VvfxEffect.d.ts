import type Phaser from "phaser";
import type { VfxProject } from "../../../src/vfx/types";
import type {
  VvfxEffectOptions,
  VvfxFollowTarget,
  VvfxRuntimeDefinition,
} from "./types";
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
  /**
   * Hidden filter-free sprites kept for reuse, so bursts and emitters do not
   * create and destroy a Phaser game object for every short-lived copy.
   */
  private readonly spritePool;
  private readonly layerDepths;
  private elapsed;
  private playing;
  private destroyed;
  private renderQueued;
  private renderRequest;
  private originX;
  private originY;
  private effectScale;
  private effectAngle;
  private flipXEnabled;
  private flipYEnabled;
  private playbackRate;
  private tintOverride;
  private following;
  private readonly baseDepth;
  private readonly loop;
  private readonly autoDestroy;
  private readonly beamOptions;
  private readonly maxDurationMs;
  private readonly assetKeys;
  private readonly assetFrames;
  private readonly assetsById;
  private readonly defaultAssetFrames;
  private readonly beamEndpoints;
  private readonly onComplete?;
  private readonly onCue?;
  /** Validated cues in time order, carried as the project's Timeline markers. */
  private readonly cues;
  /** Cues at or before this time already fired in the current pass. */
  private cueCursor;
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
  get scale(): number;
  get angle(): number;
  get flipX(): boolean;
  get flipY(): boolean;
  get timeScale(): number;
  play(): this;
  pause(): this;
  restart(): this;
  stop(): this;
  setPosition(x: number, y: number): this;
  /**
   * Scales the whole effect around its origin: copy positions, motion, and
   * sprite sizes together. 1 is the authored size.
   */
  setScale(scale: number): this;
  /** Rotates the whole effect around its origin, in degrees. */
  setAngle(degrees: number): this;
  /** Rotates the whole effect around its origin, in radians. */
  setRotation(radians: number): this;
  /** Mirrors the effect left to right, for example to face the other way. */
  setFlipX(flip: boolean): this;
  /** Mirrors the effect top to bottom. */
  setFlipY(flip: boolean): this;
  /**
   * Multiplies playback speed: 0.5 is slow motion, 2 is double speed, and 0
   * holds the current frame while the effect keeps playing. Capped at 10.
   */
  setTimeScale(timeScale: number): this;
  /**
   * Replaces every copy's authored tint with one color, such as 0x66ccff for
   * a team color. Call clearTint() to restore the authored colors.
   */
  setTint(color: number): this;
  clearTint(): this;
  /**
   * Keeps the effect's origin on a moving object, such as a Phaser sprite,
   * plus an optional offset. Following stops when the target emits Phaser's
   * "destroy" event, leaving the effect at its last position.
   */
  follow(target: VvfxFollowTarget, offsetX?: number, offsetY?: number): this;
  stopFollow(): this;
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
  /**
   * Fires each cue once per pass, in time order. The cursor moves before any
   * host callback runs, so a throwing callback cannot fire a cue twice.
   */
  private emitCues;
  private transformChanged;
  /** Moves the origin onto the follow target; true when it changed. */
  private syncFollow;
  /** Maps an effect-space offset to a world-space offset from the origin. */
  private toWorldOffset;
  /** Inverse of toWorldOffset, for world-space Beam endpoints. */
  private toEffectOffset;
  private scheduleRender;
  private cancelScheduledRender;
  private renderImmediately;
  private renderFrame;
  private acquireSprite;
  private releaseSprite;
  private clearSprites;
}
