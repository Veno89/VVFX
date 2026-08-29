import type { NormalizedSourceCrop, VfxAsset } from "./types";
interface CroppableFrame {
  realWidth: number;
  realHeight: number;
}
interface CroppableImage {
  frame: CroppableFrame;
  isCropped: boolean;
  setCrop(x?: number, y?: number, width?: number, height?: number): unknown;
}
/** Applies evaluator-normalized crop coordinates to the sprite's current frame. */
export declare function syncNormalizedSourceCrop(
  sprite: CroppableImage,
  crop: NormalizedSourceCrop | null,
): void;
interface FrameTexture {
  frames: object;
  add: (
    name: number | string,
    sourceIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => unknown;
  remove: (name: string) => boolean;
  has: (name: string) => boolean;
}
export declare function applySpriteSheetFrames(
  texture: FrameTexture,
  asset: Pick<VfxAsset, "width" | "spriteSheet">,
  replace?: boolean,
): void;
export {};
