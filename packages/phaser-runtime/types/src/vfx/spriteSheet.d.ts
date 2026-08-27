import type {
  FrameAnimationSettings,
  SpriteSheetSettings,
  VfxAsset,
} from "./types";
export declare const MAX_SPRITE_SHEET_FRAMES = 4096;
export interface SpriteSheetGrid {
  columns: number;
  rows: number;
  capacity: number;
}
/** Derives the friendly grid shown by the editor from the stored frame size. */
export declare function spriteSheetGrid(
  asset: Pick<VfxAsset, "width" | "height">,
  sheet: Pick<SpriteSheetSettings, "frameWidth" | "frameHeight">,
): SpriteSheetGrid;
export declare function spriteSheetCapacity(
  asset: Pick<VfxAsset, "width" | "height">,
  sheet: Pick<SpriteSheetSettings, "frameWidth" | "frameHeight">,
): number;
/** Converts beginner-friendly columns and rows into the portable frame-size model. */
export declare function spriteSheetFromGrid(
  asset: Pick<VfxAsset, "width" | "height">,
  columns: number,
  rows: number,
  frameCount?: number,
): SpriteSheetSettings;
export declare function suggestedSpriteSheet(
  asset: VfxAsset,
): SpriteSheetSettings;
export declare function normalizeSpriteSheet(
  asset: Pick<VfxAsset, "width" | "height">,
  value: Partial<SpriteSheetSettings>,
): SpriteSheetSettings;
export declare function normalizeFrameAnimation(
  value: Partial<FrameAnimationSettings>,
  frameCount?: number,
): FrameAnimationSettings;
export declare function spriteFrameSequence(
  asset: VfxAsset,
  animation: FrameAnimationSettings,
): number[];
export declare function spriteFrameAtTime(
  asset: VfxAsset | undefined,
  animation: FrameAnimationSettings,
  elapsed: number,
  seed?: number,
): number | null;
