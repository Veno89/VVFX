import type { ColorStop } from "./types";
export declare const MAX_COLOR_STOPS = 5;
export declare function normalizeHexColor(
  value: unknown,
  fallback?: string,
): string;
export declare function normalizeColorStops(value: unknown): ColorStop[];
export declare function interpolateColorStops(
  rawStops: ColorStop[],
  rawProgress: number,
): string;
export declare function tintNumber(color: string, strength: number): number;
