/** Maximum number of additional finite playback cycles a layer can author. */
export const MAX_LAYER_REPEATS = 20;

/**
 * Keeps repeat-derived work bounded even when callers construct project state
 * directly instead of going through project-file validation.
 */
export function boundedLayerRepeat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_LAYER_REPEATS, Math.floor(value)));
}

export function finiteLayerCycleCount(repeat: number): number {
  return boundedLayerRepeat(repeat) + 1;
}
