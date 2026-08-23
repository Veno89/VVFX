import { DEFAULT_FRAME_ANIMATION } from "./defaults";
import { seededRandom } from "./random";
import type {
  FrameAnimationSettings,
  SpriteSheetSettings,
  VfxAsset,
} from "./types";

export const MAX_SPRITE_SHEET_FRAMES = 4096;

const positiveInteger = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Math.floor(value)));

export interface SpriteSheetGrid {
  columns: number;
  rows: number;
  capacity: number;
}

/** Derives the friendly grid shown by the editor from the stored frame size. */
export function spriteSheetGrid(
  asset: Pick<VfxAsset, "width" | "height">,
  sheet: Pick<SpriteSheetSettings, "frameWidth" | "frameHeight">,
): SpriteSheetGrid {
  const frameWidth = positiveInteger(sheet.frameWidth, 1);
  const frameHeight = positiveInteger(sheet.frameHeight, 1);
  const width = positiveInteger(asset.width ?? 0, frameWidth);
  const height = positiveInteger(asset.height ?? 0, frameHeight);
  const columns = Math.max(1, Math.floor(width / frameWidth));
  const rows = Math.max(1, Math.floor(height / frameHeight));
  return {
    columns,
    rows,
    capacity: Math.min(MAX_SPRITE_SHEET_FRAMES, columns * rows),
  };
}

export function spriteSheetCapacity(
  asset: Pick<VfxAsset, "width" | "height">,
  sheet: Pick<SpriteSheetSettings, "frameWidth" | "frameHeight">,
): number {
  if (!asset.width || !asset.height) return MAX_SPRITE_SHEET_FRAMES;
  return spriteSheetGrid(asset, sheet).capacity;
}

/** Converts beginner-friendly columns and rows into the portable frame-size model. */
export function spriteSheetFromGrid(
  asset: Pick<VfxAsset, "width" | "height">,
  columns: number,
  rows: number,
  frameCount?: number,
): SpriteSheetSettings {
  const width = positiveInteger(asset.width ?? 0, 64);
  const height = positiveInteger(asset.height ?? 0, 64);
  const safeColumns = clampInteger(columns, 1, Math.max(1, width));
  const safeRows = clampInteger(rows, 1, Math.max(1, height));
  const sheet = normalizeSpriteSheet(asset, {
    frameWidth: Math.max(1, Math.floor(width / safeColumns)),
    frameHeight: Math.max(1, Math.floor(height / safeRows)),
    frameCount:
      frameCount ?? Math.min(MAX_SPRITE_SHEET_FRAMES, safeColumns * safeRows),
  });
  return sheet;
}

export function suggestedSpriteSheet(asset: VfxAsset): SpriteSheetSettings {
  const width = positiveInteger(asset.width ?? 0, 64);
  const height = positiveInteger(asset.height ?? 0, 64);
  if (width === height && width >= 4) return spriteSheetFromGrid(asset, 4, 4);
  const frameSize = Math.min(width, height);
  const sheet = {
    frameWidth: frameSize,
    frameHeight: frameSize,
    frameCount: 1,
  };
  return { ...sheet, frameCount: spriteSheetCapacity(asset, sheet) };
}

export function normalizeSpriteSheet(
  asset: Pick<VfxAsset, "width" | "height">,
  value: Partial<SpriteSheetSettings>,
): SpriteSheetSettings {
  const maximumWidth = positiveInteger(asset.width ?? 0, 16384);
  const maximumHeight = positiveInteger(asset.height ?? 0, 16384);
  const frameWidth = Math.min(
    maximumWidth,
    positiveInteger(value.frameWidth ?? 0, Math.min(64, maximumWidth)),
  );
  const frameHeight = Math.min(
    maximumHeight,
    positiveInteger(value.frameHeight ?? 0, Math.min(64, maximumHeight)),
  );
  const capacity = spriteSheetCapacity(asset, { frameWidth, frameHeight });
  return {
    frameWidth,
    frameHeight,
    frameCount: Math.max(
      1,
      Math.min(capacity, positiveInteger(value.frameCount ?? 0, capacity)),
    ),
  };
}

export function normalizeFrameAnimation(
  value: Partial<FrameAnimationSettings>,
  frameCount?: number,
): FrameAnimationSettings {
  const lastFrame = Math.max(
    0,
    Math.min(
      MAX_SPRITE_SHEET_FRAMES - 1,
      Number.isFinite(frameCount) ? Math.floor(frameCount ?? 1) - 1 : Infinity,
    ),
  );
  const startFrame = Math.min(
    lastFrame,
    Math.max(0, Math.floor(value.startFrame ?? 0)),
  );
  const requestedEnd =
    value.endFrame === null ||
    value.endFrame === undefined ||
    !Number.isFinite(value.endFrame)
      ? null
      : Math.floor(value.endFrame);
  return {
    framesPerSecond: Math.max(
      1,
      Math.min(
        60,
        positiveInteger(
          value.framesPerSecond ?? 0,
          DEFAULT_FRAME_ANIMATION.framesPerSecond,
        ),
      ),
    ),
    startFrame,
    endFrame:
      requestedEnd === null
        ? null
        : Math.max(startFrame, Math.min(lastFrame, requestedEnd)),
    playback: ["forward", "reverse", "ping-pong"].includes(
      String(value.playback),
    )
      ? (value.playback as FrameAnimationSettings["playback"])
      : DEFAULT_FRAME_ANIMATION.playback,
    loop:
      typeof value.loop === "boolean"
        ? value.loop
        : DEFAULT_FRAME_ANIMATION.loop,
    randomStartFrame:
      typeof value.randomStartFrame === "boolean"
        ? value.randomStartFrame
        : DEFAULT_FRAME_ANIMATION.randomStartFrame,
  };
}

export function spriteFrameSequence(
  asset: VfxAsset,
  animation: FrameAnimationSettings,
): number[] {
  const count = asset.spriteSheet?.frameCount ?? 0;
  if (count < 1) return [];
  const start = Math.min(count - 1, Math.max(0, animation.startFrame));
  const requestedEnd = animation.endFrame ?? count - 1;
  const end = Math.min(count - 1, Math.max(start, requestedEnd));
  const forward = Array.from(
    { length: end - start + 1 },
    (_, index) => start + index,
  );
  if (animation.playback === "reverse") return forward.reverse();
  if (animation.playback === "ping-pong" && forward.length > 1)
    return [...forward, ...forward.slice(1, -1).reverse()];
  return forward;
}

export function spriteFrameAtTime(
  asset: VfxAsset | undefined,
  animation: FrameAnimationSettings,
  elapsed: number,
  seed = 0,
): number | null {
  if (!asset?.spriteSheet) return null;
  const sequence = spriteFrameSequence(asset, animation);
  if (!sequence.length) return null;
  const step = Math.max(
    0,
    Math.floor((Math.max(0, elapsed) * animation.framesPerSecond) / 1000),
  );
  const startOffset = animation.randomStartFrame
    ? Math.floor(seededRandom(seed, 73) * sequence.length)
    : 0;
  const index = animation.loop
    ? (step + startOffset) % sequence.length
    : Math.min(sequence.length - 1, step + startOffset);
  return sequence[index];
}
