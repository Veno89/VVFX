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
