import type { LayerActivationContext, VfxLayer, VfxProject } from "./types";
export { emitterSpawnEvents, layerInstanceSeed } from "./instanceEvaluation";
export type { EmitterSpawnEvent } from "./instanceEvaluation";
export declare const MAX_EVENTS_PER_LAYER = 16;
export declare const MAX_EVENT_DEPTH = 12;
export declare const MAX_EVENT_ACTIVATIONS = 1000;
export interface LayerActivation {
  id: string;
  layerId: string;
  /** Stable within one layer and independent of the requested playhead time. */
  ordinal: number;
  /** Timeline origin for ordinary playback, or the event time for a replay. */
  origin: number;
  /** The visible start after applying the layer's existing delay. */
  start: number;
  /** Nominal authored end. Continuous layers use Infinity. */
  end: number;
  /** Restart cancels the old activation at this exact absolute time. */
  cancelledAt: number | null;
  depth: number;
  /** Null for legacy Timeline playback; set for a spatial event chain. */
  context: LayerActivationContext | null;
}
export interface LayerActivationSchedule {
  activations: LayerActivation[];
  byLayer: Map<string, LayerActivation[]>;
  truncated: boolean;
}
export interface LayerActivationIndex {
  layerIndex: ReadonlyMap<string, number>;
  layersById: ReadonlyMap<string, VfxLayer>;
  timelineLayers: readonly VfxLayer[];
}
/** Builds the project-only lookup tables shared by every playhead evaluation. */
export declare function createLayerActivationIndex(
  project: Pick<VfxProject, "layers">,
): LayerActivationIndex;
export declare function activationEffectiveEnd(
  activation: LayerActivation,
): number;
export declare function activationIsPendingOrActiveAt(
  activation: LayerActivation,
  time: number,
): boolean;
/**
 * Compiles event playback from absolute time. It deliberately owns no mutable
 * playback state, so a direct seek and frame-by-frame playback produce the
 * same activations.
 */
export declare function compileLayerActivations(
  project: VfxProject,
  evaluationTime: number,
  index?: LayerActivationIndex,
): LayerActivationSchedule;
export declare function findLayerEventCycle(
  layers: VfxLayer[],
): string[] | null;
export declare function maximumLayerEventDepth(layers: VfxLayer[]): number;
