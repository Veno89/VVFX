export function layerPositionAfterPreviewDrag({
  layerX,
  layerY,
  startPreviewX,
  startPreviewY,
  endPreviewX,
  endPreviewY,
  zoom,
}: {
  layerX: number;
  layerY: number;
  startPreviewX: number;
  startPreviewY: number;
  endPreviewX: number;
  endPreviewY: number;
  zoom: number;
}) {
  const safeLayerX = Number.isFinite(layerX) ? layerX : 0;
  const safeLayerY = Number.isFinite(layerY) ? layerY : 0;
  const safeStartX = Number.isFinite(startPreviewX) ? startPreviewX : 0;
  const safeStartY = Number.isFinite(startPreviewY) ? startPreviewY : 0;
  const safeEndX = Number.isFinite(endPreviewX) ? endPreviewX : safeStartX;
  const safeEndY = Number.isFinite(endPreviewY) ? endPreviewY : safeStartY;
  const safeZoom = Number.isFinite(zoom) ? Math.max(0.01, zoom) : 1;
  return {
    x: safeLayerX + (safeEndX - safeStartX) / safeZoom,
    y: safeLayerY + (safeEndY - safeStartY) / safeZoom,
  };
}

export function pathPointAfterPreviewDrag({
  layerX,
  layerY,
  previewCenterX,
  previewCenterY,
  endPreviewX,
  endPreviewY,
  zoom,
}: {
  layerX: number;
  layerY: number;
  previewCenterX: number;
  previewCenterY: number;
  endPreviewX: number;
  endPreviewY: number;
  zoom: number;
}) {
  const safeZoom = Number.isFinite(zoom) ? Math.max(0.01, zoom) : 1;
  const safeLayerX = Number.isFinite(layerX) ? layerX : 0;
  const safeLayerY = Number.isFinite(layerY) ? layerY : 0;
  const safeCenterX = Number.isFinite(previewCenterX) ? previewCenterX : 0;
  const safeCenterY = Number.isFinite(previewCenterY) ? previewCenterY : 0;
  const safeEndX = Number.isFinite(endPreviewX)
    ? endPreviewX
    : safeCenterX + safeLayerX * safeZoom;
  const safeEndY = Number.isFinite(endPreviewY)
    ? endPreviewY
    : safeCenterY + safeLayerY * safeZoom;
  return {
    x: (safeEndX - safeCenterX) / safeZoom - safeLayerX,
    y: (safeEndY - safeCenterY) / safeZoom - safeLayerY,
  };
}

/** The parts of a placed sprite a pointer hit test needs. */
export interface HitTestSprite {
  x: number;
  y: number;
  /** Unscaled frame size. */
  width: number;
  height: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  /** Radians. */
  rotation: number;
  visible: boolean;
  alpha: number;
}

/** True when a world point falls inside a sprite's rotated, scaled frame. */
export function spriteContainsPoint(
  sprite: HitTestSprite,
  x: number,
  y: number,
) {
  if (!sprite.visible || sprite.alpha <= 0.01) return false;
  if (sprite.scaleX === 0 || sprite.scaleY === 0) return false;
  const cos = Math.cos(-sprite.rotation);
  const sin = Math.sin(-sprite.rotation);
  const dx = x - sprite.x;
  const dy = y - sprite.y;
  const localX = (dx * cos - dy * sin) / sprite.scaleX;
  const localY = (dx * sin + dy * cos) / sprite.scaleY;
  const left = -sprite.originX * sprite.width;
  const top = -sprite.originY * sprite.height;
  return (
    localX >= left &&
    localX <= left + sprite.width &&
    localY >= top &&
    localY <= top + sprite.height
  );
}

/**
 * The topmost candidate under a point. `ordered` is in drawing order, so the
 * last match is the one the user sees on top.
 */
export function topSpriteAt<T extends HitTestSprite>(
  ordered: readonly T[],
  x: number,
  y: number,
): T | null {
  for (let index = ordered.length - 1; index >= 0; index -= 1)
    if (spriteContainsPoint(ordered[index], x, y)) return ordered[index];
  return null;
}
