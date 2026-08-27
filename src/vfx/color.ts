import type { ColorStop } from "./types";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const MAX_COLOR_STOPS = 5;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function normalizeHexColor(value: unknown, fallback = "#ffffff") {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function normalizeColorStops(value: unknown): ColorStop[] {
  if (!Array.isArray(value))
    return [
      { time: 0, color: "#ffffff" },
      { time: 1, color: "#ffffff" },
    ];
  const stops = value
    .slice(0, MAX_COLOR_STOPS)
    .filter(
      (stop): stop is Record<string, unknown> =>
        typeof stop === "object" && stop !== null && !Array.isArray(stop),
    )
    .map((stop) => ({
      time:
        typeof stop.time === "number" && Number.isFinite(stop.time)
          ? clamp01(stop.time)
          : Number.NaN,
      color: normalizeHexColor(stop.color),
    }))
    .filter((stop) => Number.isFinite(stop.time))
    .sort((left, right) => left.time - right.time);
  if (stops.length < 2)
    return [
      { time: 0, color: stops[0]?.color ?? "#ffffff" },
      { time: 1, color: stops[0]?.color ?? "#ffffff" },
    ];
  stops[0] = { ...stops[0], time: 0 };
  stops[stops.length - 1] = { ...stops.at(-1)!, time: 1 };
  return stops;
}

function colorChannels(color: string): [number, number, number] {
  const value = Number.parseInt(normalizeHexColor(color).slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function interpolateColorStops(
  rawStops: ColorStop[],
  rawProgress: number,
): string {
  const stops = normalizeColorStops(rawStops);
  const progress = clamp01(rawProgress);
  const endIndex = Math.max(
    1,
    stops.findIndex((stop) => stop.time >= progress),
  );
  const start = stops[endIndex - 1];
  const end = stops[Math.min(endIndex, stops.length - 1)];
  const segment = Math.max(Number.EPSILON, end.time - start.time);
  const local = clamp01((progress - start.time) / segment);
  const from = colorChannels(start.color);
  const to = colorChannels(end.color);
  const channel = (index: number) =>
    Math.round(from[index] + (to[index] - from[index]) * local);
  return `#${[channel(0), channel(1), channel(2)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function tintNumber(color: string, strength: number): number {
  const [red, green, blue] = colorChannels(color);
  const mix = clamp01(strength);
  return (
    (Math.round(255 + (red - 255) * mix) << 16) |
    (Math.round(255 + (green - 255) * mix) << 8) |
    Math.round(255 + (blue - 255) * mix)
  );
}
