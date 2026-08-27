import type { BeamEndpoints, EvaluatedInstance, VfxProject } from "./types";
export declare const MAX_EFFECT_INSTANCES = 500;
export interface EvaluationDiagnostics {
  instanceEvaluations: number;
  budgetExhausted: boolean;
}
export declare function evaluateProject(
  project: VfxProject,
  time: number,
  selectedId: string | null,
  beamEndpoints?: Readonly<Record<string, BeamEndpoints>>,
  diagnostics?: EvaluationDiagnostics,
): EvaluatedInstance[];
