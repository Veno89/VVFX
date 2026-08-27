import type { BeamEndpoints, EvaluatedInstance, VfxProject } from "./types";
export declare const MAX_EFFECT_INSTANCES = 500;
export interface EvaluationDiagnostics {
  instanceEvaluations: number;
  budgetExhausted: boolean;
  /** Set only when supplied by the caller; 0 means the schedule cache hit. */
  scheduleCompilations?: number;
}
export interface ProjectEvaluator {
  readonly project: VfxProject;
  evaluate(
    time: number,
    selectedId: string | null,
    beamEndpoints?: Readonly<Record<string, BeamEndpoints>>,
    diagnostics?: EvaluationDiagnostics,
  ): EvaluatedInstance[];
}
/**
 * Prepares immutable project lookups once and retains a small LRU of exact
 * playhead schedules. Long-running playback stays bounded while repeated
 * scrubs and multi-consumer renders reuse the expensive event compilation.
 */
export declare function createProjectEvaluator(
  project: VfxProject,
): ProjectEvaluator;
export declare function evaluateProject(
  project: VfxProject,
  time: number,
  selectedId: string | null,
  beamEndpoints?: Readonly<Record<string, BeamEndpoints>>,
  diagnostics?: EvaluationDiagnostics,
): EvaluatedInstance[];
