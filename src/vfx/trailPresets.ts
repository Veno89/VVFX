import type { TrailSettings } from "./types";

export type TrailPresetId =
  "energy-bolt" | "smoke-trail" | "slash-trail" | "ghost-trail";

export interface TrailPreset {
  id: TrailPresetId;
  name: string;
  description: string;
  settings: TrailSettings;
}

export const TRAIL_PRESETS: TrailPreset[] = [
  {
    id: "energy-bolt",
    name: "Energy Bolt",
    description: "A bright, close trail for fast magic projectiles.",
    settings: {
      enabled: true,
      count: 9,
      spacing: 35,
      lifetime: 360,
      opacity: 0.62,
      scaleFalloff: 0.06,
    },
  },
  {
    id: "smoke-trail",
    name: "Smoke Trail",
    description: "A longer, softer trail with gently fading copies.",
    settings: {
      enabled: true,
      count: 11,
      spacing: 85,
      lifetime: 1050,
      opacity: 0.3,
      scaleFalloff: 0,
    },
  },
  {
    id: "slash-trail",
    name: "Slash Trail",
    description: "A very short, sharp streak for swings and dashes.",
    settings: {
      enabled: true,
      count: 4,
      spacing: 25,
      lifetime: 160,
      opacity: 0.72,
      scaleFalloff: 0.12,
    },
  },
  {
    id: "ghost-trail",
    name: "Ghost Trail",
    description: "Clear fading copies that make a character dash readable.",
    settings: {
      enabled: true,
      count: 7,
      spacing: 75,
      lifetime: 620,
      opacity: 0.44,
      scaleFalloff: 0.02,
    },
  },
];

export function trailFromPreset(id: TrailPresetId): TrailSettings {
  const preset = TRAIL_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown trail preset: ${id}`);
  return { ...preset.settings };
}
