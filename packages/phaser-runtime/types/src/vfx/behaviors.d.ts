import type { BehaviorEnvelopeSettings, BehaviorSettings } from "./types";
export interface EvaluatedBehavior {
  x: number;
  y: number;
  rotation: number;
  scaleMultiplier: number;
  opacityMultiplier: number;
}
export declare function behaviorEnvelopeWeight(
  envelope: BehaviorEnvelopeSettings,
  progress: number,
): number;
/**
 * Integrates a normalized acceleration envelope twice far enough to obtain
 * displacement. Unlike multiplying an already-computed gravity position by a
 * fading weight, this preserves velocity and cannot pull a particle backward
 * when the force releases.
 */
export declare function integratedBehaviorEnvelope(
  envelope: BehaviorEnvelopeSettings,
  progress: number,
): number;
export declare function movementProgress(
  progress: number,
  drag: number,
): number;
export declare function evaluateBehavior(
  behavior: BehaviorSettings,
  elapsedMs: number,
  durationMs: number,
  seed: number,
): EvaluatedBehavior;
