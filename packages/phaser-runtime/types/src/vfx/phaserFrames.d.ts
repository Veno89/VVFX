import type { VfxAsset } from "./types";
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
