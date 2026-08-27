import type { SpriteSheetSettings, VfxAsset } from "./types";

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

export function applySpriteSheetFrames(
  texture: FrameTexture,
  asset: Pick<VfxAsset, "width" | "spriteSheet">,
  replace = false,
) {
  const sheet: SpriteSheetSettings | null = asset.spriteSheet ?? null;
  if (replace) {
    for (const name of Object.keys(texture.frames))
      if (/^\d+$/.test(name)) texture.remove(name);
  }

  // Disabling sprite-sheet treatment must remove frames created by the old
  // configuration. Returning before the replacement pass leaves those Phaser
  // Frame objects alive even though evaluation has gone back to __BASE.
  if (!sheet) return;
  if (!replace && texture.has("0")) return;

  const columns = Math.max(
    1,
    Math.floor(
      (asset.width ?? sheet.frameWidth * sheet.frameCount) / sheet.frameWidth,
    ),
  );
  for (let frame = 0; frame < sheet.frameCount; frame += 1) {
    texture.add(
      frame,
      0,
      (frame % columns) * sheet.frameWidth,
      Math.floor(frame / columns) * sheet.frameHeight,
      sheet.frameWidth,
      sheet.frameHeight,
    );
  }
}
