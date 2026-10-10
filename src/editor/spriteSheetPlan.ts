/**
 * Pure layout and atlas helpers for sprite-sheet export, kept apart from the
 * canvas recorder so the Export dialog can plan sheets without loading it.
 */

/** Most engines and GPUs accept 8192 px textures; many mobile targets 4096. */
export const SPRITE_SHEET_MAX_SIDE = 8192;
export const SPRITE_SHEET_MAX_FRAMES = 240;
export const SPRITE_SHEET_FRAME_RATES = [12, 15, 24, 30] as const;

export interface SpriteSheetPlan {
  allowed: boolean;
  frameCount: number;
  columns: number;
  rows: number;
  sheetWidth: number;
  sheetHeight: number;
  reason: string | null;
}

/** Lays frames out row by row in the squarest grid that fits the limits. */
export function planSpriteSheet({
  duration,
  framesPerSecond,
  frameWidth,
  frameHeight,
}: {
  duration: number;
  framesPerSecond: number;
  frameWidth: number;
  frameHeight: number;
}): SpriteSheetPlan {
  const frameCount = Math.max(
    1,
    Math.ceil((duration / 1000) * framesPerSecond),
  );
  const preferredColumns = Math.ceil(
    Math.sqrt((frameCount * frameHeight) / frameWidth),
  );
  const maxColumns = Math.max(
    1,
    Math.floor(SPRITE_SHEET_MAX_SIDE / frameWidth),
  );
  const columns = Math.max(
    1,
    Math.min(frameCount, preferredColumns, maxColumns),
  );
  const rows = Math.ceil(frameCount / columns);
  const sheetWidth = columns * frameWidth;
  const sheetHeight = rows * frameHeight;
  const reason =
    frameCount > SPRITE_SHEET_MAX_FRAMES
      ? `A sprite sheet holds at most ${SPRITE_SHEET_MAX_FRAMES} frames. Shorten the active range or lower the frame rate.`
      : sheetWidth > SPRITE_SHEET_MAX_SIDE ||
          sheetHeight > SPRITE_SHEET_MAX_SIDE
        ? `This sheet would be ${sheetWidth} × ${sheetHeight} px, over the ${SPRITE_SHEET_MAX_SIDE} px limit. Choose a smaller frame size or frame rate.`
        : null;
  return {
    allowed: reason === null,
    frameCount,
    columns,
    rows,
    sheetWidth,
    sheetHeight,
    reason,
  };
}

export function spriteSheetFrameName(baseName: string, index: number) {
  return `${baseName}_${String(index).padStart(3, "0")}.png`;
}

/**
 * TexturePacker "JSON Hash" atlas, read by Phaser (`load.atlas`), PixiJS, and
 * importers for most other 2D engines.
 */
export function createSpriteSheetAtlas({
  baseName,
  plan,
  frameWidth,
  frameHeight,
  framesPerSecond,
}: {
  baseName: string;
  plan: SpriteSheetPlan;
  frameWidth: number;
  frameHeight: number;
  framesPerSecond: number;
}) {
  const frames: Record<string, unknown> = {};
  for (let index = 0; index < plan.frameCount; index += 1) {
    const x = (index % plan.columns) * frameWidth;
    const y = Math.floor(index / plan.columns) * frameHeight;
    frames[spriteSheetFrameName(baseName, index)] = {
      frame: { x, y, w: frameWidth, h: frameHeight },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      sourceSize: { w: frameWidth, h: frameHeight },
      duration: Math.round(1000 / framesPerSecond),
    };
  }
  return {
    frames,
    meta: {
      app: "Vvfx",
      version: "1.0",
      image: `${baseName}-sheet.png`,
      format: "RGBA8888",
      size: { w: plan.sheetWidth, h: plan.sheetHeight },
      scale: "1",
      frameRate: framesPerSecond,
      columns: plan.columns,
      rows: plan.rows,
    },
  };
}
