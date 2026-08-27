import { evaluateBehavior } from "./behaviors";
import { evaluateTransformKeyframes } from "./keyframes";
import type { VfxLayer, VfxProject } from "./types";
import type { LayerActivation, LayerActivationSchedule } from "./events";
export declare const MAX_EMITTER_SPAWN_EVENTS = 1001;
export interface EmitterSpawnEvent {
  time: number;
  index: number;
}
export interface CopySpawnDescriptor {
  instanceIndex: number;
  copyIndex: number;
  spawnTime: number;
  seed: number;
  duration: number;
  delayedSpawn: number;
  deathTime: number;
}
export interface EvaluatedInstanceSpatialState {
  seed: number;
  duration: number;
  delayedSpawn: number;
  elapsed: number;
  lifetimeProgress: number;
  rawProgress: number;
  progress: number;
  behavior: ReturnType<typeof evaluateBehavior>;
  keyed: ReturnType<typeof evaluateTransformKeyframes>;
  x: number;
  y: number;
  rotation: number;
}
/**
 * Null-context playback preserves the original seed calculation exactly.
 * Spatial chains add their source-copy seed without replacing authored seed.
 */
export declare function layerInstanceSeed(
  project: Pick<VfxProject, "preview">,
  layer: Pick<VfxLayer, "id">,
  activationOrdinal: number,
  instanceIndex: number,
  contextSeed?: number,
): number;
export declare function emitterSpawnEvents(
  project: Pick<VfxProject, "preview">,
  layer: Extract<
    VfxLayer,
    {
      type: "emitter";
    }
  >,
  activation: LayerActivation,
  until: number,
): EmitterSpawnEvent[];
export declare function instanceTiming(
  project: Pick<VfxProject, "preview">,
  layer: VfxLayer,
  activation: LayerActivation,
  instanceIndex: number,
  spawnTime: number,
): {
  seed: number;
  duration: number;
  delayedSpawn: number;
  deathTime: number;
};
/** Enumerates authored copies, never renderer-only trail samples. */
export declare function copySpawnDescriptors(
  project: Pick<VfxProject, "preview">,
  layer: Exclude<
    VfxLayer,
    {
      type: "static";
    }
  >,
  activation: LayerActivation,
  until: number,
): Generator<CopySpawnDescriptor>;
type SpawnOffset = {
  x: number;
  y: number;
  angle: number;
};
/**
 * Pure seeded start-position evaluation shared by preview and runtime playback.
 * Pass one stable batchSeed for every copy that should share cluster anchors.
 */
export declare function evaluateSpawnOffset(
  project: Pick<VfxProject, "assets">,
  layer: VfxLayer,
  seed: number,
  copyIndex: number,
  batchSeed?: number,
): SpawnOffset | null;
export declare function evaluateInstanceSpatialState(
  project: VfxProject,
  layer: VfxLayer,
  activation: LayerActivation,
  schedule: LayerActivationSchedule,
  instanceIndex: number,
  copyIndex: number,
  spawnTime: number,
  time: number,
): EvaluatedInstanceSpatialState | null;
export {};
