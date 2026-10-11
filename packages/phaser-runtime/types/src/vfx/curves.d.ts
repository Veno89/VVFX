import type {
  AttractorSettings,
  CurvePoint,
  EmissionCurveSettings,
  ValueCurveSettings,
} from "./types";
/**
 * Value curves over normalized time, used for speed over a copy's life and an
 * emitter's rate over its first moments. Everything here is closed-form and
 * seed-free, so the editor preview and the game runtime stay identical.
 */
export declare const MAX_CURVE_POINTS = 8;
/** Largest multiplier a speed or emission-rate curve may reach. */
export declare const MAX_CURVE_VALUE = 4;
export declare const MIN_EMISSION_CURVE_LENGTH = 100;
export declare const flatCurvePoints: () => CurvePoint[];
export declare const defaultSpeedCurve: () => ValueCurveSettings;
export declare const defaultEmissionCurve: () => EmissionCurveSettings;
export declare const defaultAttractor: () => AttractorSettings;
/** Sorted points from 0 to 1 with values in [0, MAX_CURVE_VALUE]. */
export declare function normalizeCurvePoints(value: unknown): CurvePoint[];
export declare function normalizeSpeedCurve(value: unknown): ValueCurveSettings;
export declare function normalizeEmissionCurve(
  value: unknown,
  maxLength: number,
): EmissionCurveSettings;
export declare function normalizeAttractor(value: unknown): AttractorSettings;
/** Piecewise-linear value at normalized time t. */
export declare function evaluateCurve(
  points: readonly CurvePoint[],
  t: number,
): number;
/** Area under the curve from 0 to t (trapezoids, exact for linear pieces). */
export declare function integrateCurve(
  points: readonly CurvePoint[],
  t: number,
): number;
/**
 * Share of the total movement covered at progress t when speed follows the
 * curve. The total distance never changes; a zero-area curve stays linear.
 */
export declare function speedCurveProgress(
  curve: ValueCurveSettings,
  progress: number,
): number;
/**
 * Pulls a point toward the attractor and swirls it around it as the copy's
 * life progresses. Coordinates are relative to the layer's position.
 */
export declare function applyAttractor(
  attractor: AttractorSettings,
  x: number,
  y: number,
  progress: number,
): {
  x: number;
  y: number;
};
/** Emission-rate multiplier at a time since the emitter started. */
export declare function emissionRateAt(
  curve: EmissionCurveSettings,
  elapsed: number,
): number;
/** Highest multiplier a rate curve reaches, for bounding schedules. */
export declare function peakEmissionRate(
  curve: EmissionCurveSettings | null,
): number;
/** Moves a point; end points keep their time, middle ones stay between neighbors. */
export declare function moveCurvePoint(
  points: readonly CurvePoint[],
  index: number,
  time: number,
  value: number,
): CurvePoint[];
/** Adds a point in time order, unless it is full or too close to another. */
export declare function addCurvePoint(
  points: readonly CurvePoint[],
  time: number,
  value: number,
): CurvePoint[];
export declare function removeCurvePoint(
  points: readonly CurvePoint[],
  index: number,
): CurvePoint[];
/** Vertical range for editing a multiplier curve. */
export declare function curveEditRange(points: readonly CurvePoint[]): {
  min: number;
  max: number;
};
