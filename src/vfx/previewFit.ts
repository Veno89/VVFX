import { createProjectEvaluator } from "./engine";
import { activeTimelineEnd } from "./projectState";
import type { VfxProject } from "./types";

export const PREVIEW_MIN_ZOOM = 0.25;
export const PREVIEW_MAX_ZOOM = 3;
const BUILT_IN_SIZE = 128;
const SAMPLES = 24;
const MARGIN = 16;

/**
 * Zoom that fits every clearly visible copy across the active range inside a
 * viewport of the given CSS size, rounded down to 5% within the editor's
 * zoom limits. Returns 1 when nothing is visible.
 */
export function fitPreviewZoom(
  project: VfxProject,
  viewWidth: number,
  viewHeight: number,
): number {
  const sizes = new Map(
    project.assets.map((asset) => {
      const width = asset.spriteSheet?.frameWidth ?? asset.width;
      const height = asset.spriteSheet?.frameHeight ?? asset.height;
      return [
        asset.id,
        asset.builtIn || !width || !height
          ? { width: BUILT_IN_SIZE, height: BUILT_IN_SIZE }
          : { width, height },
      ] as const;
    }),
  );
  const evaluator = createProjectEvaluator(project);
  const end = activeTimelineEnd(project);
  let extentX = 0;
  let extentY = 0;
  for (let step = 0; step <= SAMPLES; step += 1) {
    for (const instance of evaluator.evaluate((end * step) / SAMPLES, null)) {
      if (instance.opacity < 0.1) continue;
      const size = (instance.assetId && sizes.get(instance.assetId)) || {
        width: BUILT_IN_SIZE,
        height: BUILT_IN_SIZE,
      };
      // Rotation can swap axes, so use the larger half-size on both.
      const half =
        0.5 *
        Math.max(
          size.width * Math.abs(instance.scaleX),
          size.height * Math.abs(instance.scaleY),
        );
      extentX = Math.max(extentX, Math.abs(instance.x) + half);
      extentY = Math.max(extentY, Math.abs(instance.y) + half);
    }
  }
  if (extentX === 0 && extentY === 0) return 1;
  const fit = Math.min(
    (viewWidth / 2 - MARGIN) / Math.max(1, extentX),
    (viewHeight / 2 - MARGIN) / Math.max(1, extentY),
  );
  const rounded = Math.floor(fit * 20) / 20;
  return Math.max(PREVIEW_MIN_ZOOM, Math.min(PREVIEW_MAX_ZOOM, rounded));
}
