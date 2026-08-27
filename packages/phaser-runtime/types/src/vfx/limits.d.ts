/** Maximum number of additional finite playback cycles a layer can author. */
export declare const MAX_LAYER_REPEATS = 20;
/**
 * Keeps repeat-derived work bounded even when callers construct project state
 * directly instead of going through project-file validation.
 */
export declare function boundedLayerRepeat(value: number): number;
export declare function finiteLayerCycleCount(repeat: number): number;
