import { normalizeHexColor } from "./color";
import { validateProject } from "./serialization";
import { activeTimelineEnd } from "./projectState";
import type { VfxLayer, VfxProject } from "./types";

/**
 * "Try variations": deterministic alternative versions of a whole effect or
 * of one layer. Each one changes only the aspects the user picked and is
 * validated like an imported project, so keeping one can never produce an
 * invalid effect.
 */

export type VariationAspect =
  "colors" | "size" | "speed" | "count" | "randomness";

export const VARIATION_ASPECTS: {
  id: VariationAspect;
  label: string;
}[] = [
  { id: "colors", label: "Colors" },
  { id: "size", label: "Size" },
  { id: "speed", label: "Speed" },
  { id: "count", label: "Copy count" },
  { id: "randomness", label: "Randomness" },
];

/** Limits a change to one layer, or null for the whole effect. */
type Scope = string | null;
const inScope = (layer: VfxLayer, scope: Scope) =>
  scope === null || layer.id === scope;

export interface EffectVariation {
  id: string;
  project: VfxProject;
  /** Short plain-language changes, e.g. "New colors", "1.3× bigger". */
  changes: string[];
  /** Up to four of the variation's colors, for a quick visual hint. */
  swatches: string[];
}

/** Small seeded generator so the same roll always gives the same set. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToHsl(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function rotateHue(hex: string, degrees: number) {
  const [hue, saturation, lightness] = hexToHsl(normalizeHexColor(hex));
  return hslToHex(hue + degrees, saturation, lightness);
}

/** Every distinct, visibly colored tint in scope, in layer order. */
export function effectColors(
  project: VfxProject,
  scope: Scope = null,
): string[] {
  const colors = new Set<string>();
  for (const layer of project.layers) {
    if (!inScope(layer, scope)) continue;
    const { tint, colorOverLifetime } = layer.appearance;
    if (tint) colors.add(normalizeHexColor(tint));
    if (colorOverLifetime.enabled)
      for (const stop of colorOverLifetime.stops)
        colors.add(normalizeHexColor(stop.color));
  }
  // White and greys do not change with hue.
  return [...colors].filter((color) => hexToHsl(color)[1] > 0.05);
}

/**
 * Which aspects can change anything in scope. A random pattern belongs to
 * the whole effect, so it is not offered for one layer.
 */
export function availableAspects(
  project: VfxProject,
  scope: Scope = null,
): VariationAspect[] {
  const layers = project.layers.filter((layer) => inScope(layer, scope));
  if (layers.length === 0) return [];
  return VARIATION_ASPECTS.map((aspect) => aspect.id).filter((aspect) =>
    aspect === "colors"
      ? effectColors(project, scope).length > 0
      : aspect === "count"
        ? layers.some((layer) => layer.spawn !== null)
        : aspect === "randomness"
          ? scope === null
          : true,
  );
}

function recolor(project: VfxProject, degrees: number, scope: Scope) {
  for (const layer of project.layers) {
    if (!inScope(layer, scope)) continue;
    const appearance = layer.appearance;
    if (appearance.tint) appearance.tint = rotateHue(appearance.tint, degrees);
    for (const stop of appearance.colorOverLifetime.stops)
      stop.color = rotateHue(stop.color, degrees);
  }
}

function resize(project: VfxProject, factor: number, scope: Scope) {
  for (const layer of project.layers) {
    if (!inScope(layer, scope)) continue;
    const { transform, keyframes } = layer;
    transform.startScale *= factor;
    transform.endScale *= factor;
    transform.startScaleX *= factor;
    transform.startScaleY *= factor;
    transform.endScaleX *= factor;
    transform.endScaleY *= factor;
    for (const frame of keyframes.frames) {
      frame.scaleX *= factor;
      frame.scaleY *= factor;
    }
  }
}

/** Stretches every millisecond value; motion distances stay the same. */
function retime(project: VfxProject, factor: number, scope: Scope) {
  const ms = (value: number) => Math.round(value * factor);
  for (const layer of project.layers) {
    if (!inScope(layer, scope)) continue;
    layer.timing.delay = ms(layer.timing.delay);
    layer.timing.duration = Math.max(1, ms(layer.timing.duration));
    layer.random.delay = ms(layer.random.delay);
    layer.random.duration = ms(layer.random.duration);
    if (layer.spawn) {
      layer.spawn.intervalMin = ms(layer.spawn.intervalMin);
      layer.spawn.intervalMax = ms(layer.spawn.intervalMax);
    }
    layer.trail.spacing = ms(layer.trail.spacing);
    layer.trail.lifetime = ms(layer.trail.lifetime);
    layer.frameAnimation.framesPerSecond /= factor;
  }
  if (scope === null) {
    for (const group of project.groups) group.delay = ms(group.delay);
    for (const marker of project.timeline.markers)
      marker.time = ms(marker.time);
    project.preview.duration = ms(project.preview.duration);
  } else {
    // One slower layer may outlast the composition; make room for it.
    project.preview.duration = Math.max(
      project.preview.duration,
      Math.ceil(activeTimelineEnd(project)),
    );
  }
}

/** Scales how many copies bursts and emitters create. */
function recount(project: VfxProject, factor: number, scope: Scope) {
  for (const layer of project.layers) {
    if (!inScope(layer, scope) || !layer.spawn) continue;
    layer.spawn.count = Math.max(1, Math.round(layer.spawn.count * factor));
  }
}

/** A factor away from 1 in [low, high], so every variation is noticeable. */
function noticeableFactor(next: () => number, low: number, high: number) {
  const grow = next() < 0.5;
  return grow ? 1.12 + next() * (high - 1.12) : low + next() * (0.88 - low);
}

export function createVariations(
  project: VfxProject,
  aspects: readonly VariationAspect[],
  roll: number,
  count = 6,
  scope: Scope = null,
): EffectVariation[] {
  const available = availableAspects(project, scope);
  const active = aspects.filter((aspect) => available.includes(aspect));
  if (active.length === 0) return [];
  const variations: EffectVariation[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = random(roll * 7919 + index * 104729 + 17);
    const copy = structuredClone(project);
    const changes: string[] = [];
    if (active.includes("colors")) {
      // Spread hues around the wheel so the set covers distinct palettes.
      const degrees = Math.round(
        ((index + 1) * (360 / (count + 1)) + next() * 24 - 12 + roll * 37) %
          360,
      );
      const shift = degrees === 0 ? 30 : degrees;
      recolor(copy, shift, scope);
      changes.push("New colors");
    }
    if (active.includes("size")) {
      const factor = noticeableFactor(next, 0.65, 1.5);
      resize(copy, factor, scope);
      changes.push(
        factor > 1
          ? `${factor.toFixed(1)}× bigger`
          : `${Math.round(factor * 100)}% size`,
      );
    }
    if (active.includes("speed")) {
      const factor = noticeableFactor(next, 0.7, 1.45);
      retime(copy, factor, scope);
      changes.push(
        factor > 1
          ? `${factor.toFixed(1)}× slower`
          : `${(1 / factor).toFixed(1)}× faster`,
      );
    }
    if (active.includes("count")) {
      const factor = noticeableFactor(next, 0.5, 2);
      recount(copy, factor, scope);
      changes.push(factor > 1 ? "More copies" : "Fewer copies");
    }
    if (active.includes("randomness")) {
      copy.preview.randomSeed = Math.floor(next() * 999_999);
      changes.push("New random pattern");
    }
    const validated = validateProject(copy);
    if (!validated.ok || !validated.project) continue;
    variations.push({
      id: `variation-${scope ?? "all"}-${roll}-${index}`,
      project: validated.project,
      changes,
      swatches: effectColors(validated.project, scope).slice(0, 4),
    });
  }
  return variations;
}
