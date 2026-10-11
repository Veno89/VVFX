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

export const MAX_CURVE_POINTS = 8;
/** Largest multiplier a speed or emission-rate curve may reach. */
export const MAX_CURVE_VALUE = 4;
export const MIN_EMISSION_CURVE_LENGTH = 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const flatCurvePoints = (): CurvePoint[] => [
  { time: 0, value: 1 },
  { time: 1, value: 1 },
];

export const defaultSpeedCurve = (): ValueCurveSettings => ({
  enabled: false,
  points: flatCurvePoints(),
});

export const defaultEmissionCurve = (): EmissionCurveSettings => ({
  enabled: false,
  length: 2000,
  points: flatCurvePoints(),
});

export const defaultAttractor = (): AttractorSettings => ({
  enabled: false,
  x: 0,
  y: 0,
  pull: 0.6,
  swirl: 0,
});

/** Sorted points from 0 to 1 with values in [0, MAX_CURVE_VALUE]. */
export function normalizeCurvePoints(value: unknown): CurvePoint[] {
  if (!Array.isArray(value)) return flatCurvePoints();
  const points = value
    .slice(0, MAX_CURVE_POINTS)
    .filter(isRecord)
    .map((point) => ({
      time: clamp(finite(point.time, Number.NaN), 0, 1),
      value: clamp(finite(point.value, 1), 0, MAX_CURVE_VALUE),
    }))
    .filter((point) => Number.isFinite(point.time))
    .sort((left, right) => left.time - right.time);
  if (points.length < 2) return flatCurvePoints();
  points[0] = { ...points[0], time: 0 };
  points[points.length - 1] = { ...points[points.length - 1], time: 1 };
  return points;
}

export function normalizeSpeedCurve(value: unknown): ValueCurveSettings {
  const input = isRecord(value) ? value : {};
  return {
    enabled: input.enabled === true,
    points: normalizeCurvePoints(input.points),
  };
}

export function normalizeEmissionCurve(
  value: unknown,
  maxLength: number,
): EmissionCurveSettings {
  const input = isRecord(value) ? value : {};
  return {
    enabled: input.enabled === true,
    length: Math.round(
      clamp(finite(input.length, 2000), MIN_EMISSION_CURVE_LENGTH, maxLength),
    ),
    points: normalizeCurvePoints(input.points),
  };
}

export function normalizeAttractor(value: unknown): AttractorSettings {
  const input = isRecord(value) ? value : {};
  return {
    enabled: input.enabled === true,
    x: clamp(finite(input.x, 0), -4000, 4000),
    y: clamp(finite(input.y, 0), -4000, 4000),
    pull: clamp(finite(input.pull, 0.6), 0, 1),
    swirl: clamp(finite(input.swirl, 0), -1080, 1080),
  };
}

/** Piecewise-linear value at normalized time t. */
export function evaluateCurve(points: readonly CurvePoint[], t: number) {
  if (points.length === 0) return 1;
  const time = clamp(t, 0, 1);
  for (let index = 1; index < points.length; index += 1) {
    const end = points[index];
    if (time <= end.time) {
      const start = points[index - 1];
      const span = end.time - start.time;
      if (span <= 0) return end.value;
      return (
        start.value + ((time - start.time) / span) * (end.value - start.value)
      );
    }
  }
  return points[points.length - 1].value;
}

/** Area under the curve from 0 to t (trapezoids, exact for linear pieces). */
export function integrateCurve(points: readonly CurvePoint[], t: number) {
  const time = clamp(t, 0, 1);
  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (time <= start.time) break;
    const segmentEnd = Math.min(time, end.time);
    const endValue = evaluateCurve(points, segmentEnd);
    area += ((start.value + endValue) / 2) * (segmentEnd - start.time);
  }
  return area;
}

/**
 * Share of the total movement covered at progress t when speed follows the
 * curve. The total distance never changes; a zero-area curve stays linear.
 */
export function speedCurveProgress(
  curve: ValueCurveSettings,
  progress: number,
) {
  const time = clamp(progress, 0, 1);
  if (!curve.enabled) return time;
  const total = integrateCurve(curve.points, 1);
  if (total <= 1e-6) return time;
  return integrateCurve(curve.points, time) / total;
}

/**
 * Pulls a point toward the attractor and swirls it around it as the copy's
 * life progresses. Coordinates are relative to the layer's position.
 */
export function applyAttractor(
  attractor: AttractorSettings,
  x: number,
  y: number,
  progress: number,
): { x: number; y: number } {
  if (!attractor.enabled) return { x, y };
  const amount = clamp(progress, 0, 1);
  const keep = 1 - attractor.pull * amount;
  const angle = (attractor.swirl * amount * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = (x - attractor.x) * keep;
  const dy = (y - attractor.y) * keep;
  return {
    x: attractor.x + dx * cos - dy * sin,
    y: attractor.y + dx * sin + dy * cos,
  };
}

/** Emission-rate multiplier at a time since the emitter started. */
export function emissionRateAt(curve: EmissionCurveSettings, elapsed: number) {
  if (!curve.enabled) return 1;
  return evaluateCurve(
    curve.points,
    Math.max(0, elapsed) / Math.max(MIN_EMISSION_CURVE_LENGTH, curve.length),
  );
}

/** Highest multiplier a rate curve reaches, for bounding schedules. */
export function peakEmissionRate(curve: EmissionCurveSettings | null) {
  if (!curve?.enabled) return 1;
  return Math.max(...curve.points.map((point) => point.value), 0);
}

const MIN_POINT_GAP = 0.01;

/** Moves a point; end points keep their time, middle ones stay between neighbors. */
export function moveCurvePoint(
  points: readonly CurvePoint[],
  index: number,
  time: number,
  value: number,
): CurvePoint[] {
  return points.map((point, pointIndex) => {
    if (pointIndex !== index) return point;
    const middle = index > 0 && index < points.length - 1;
    return {
      time: middle
        ? clamp(
            time,
            points[index - 1].time + MIN_POINT_GAP,
            points[index + 1].time - MIN_POINT_GAP,
          )
        : point.time,
      value: clamp(value, 0, MAX_CURVE_VALUE),
    };
  });
}

/** Adds a point in time order, unless it is full or too close to another. */
export function addCurvePoint(
  points: readonly CurvePoint[],
  time: number,
  value: number,
): CurvePoint[] {
  if (
    points.length >= MAX_CURVE_POINTS ||
    time <= MIN_POINT_GAP ||
    time >= 1 - MIN_POINT_GAP ||
    points.some((point) => Math.abs(point.time - time) < MIN_POINT_GAP)
  )
    return [...points];
  return [...points, { time, value: clamp(value, 0, MAX_CURVE_VALUE) }].sort(
    (left, right) => left.time - right.time,
  );
}

export function removeCurvePoint(
  points: readonly CurvePoint[],
  index: number,
): CurvePoint[] {
  if (index <= 0 || index >= points.length - 1) return [...points];
  return points.filter((_, pointIndex) => pointIndex !== index);
}

/** Vertical range for editing a multiplier curve. */
export function curveEditRange(points: readonly CurvePoint[]) {
  const top = Math.max(2, ...points.map((point) => point.value)) * 1.15;
  return { min: 0, max: Math.min(MAX_CURVE_VALUE, Math.ceil(top * 2) / 2) };
}
