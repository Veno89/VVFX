"use client";

import { Activity, Eye, Palette, Plus, Sparkles, Wand2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { RenderingEffectKey } from "../../vfx/renderingEffectsModel";
import { useFocusRegion } from "../useFocusRegion";

export interface EffectToolbeltClip {
  id: string;
  effect: RenderingEffectKey;
  enabled: boolean;
}

interface EffectToolbeltDefinition {
  effect: RenderingEffectKey;
  label: string;
  description: string;
  category: "Light and color" | "Clipping and reveal" | "Distortion";
  icon: ReactNode;
}

export const EFFECT_TOOLBELT_DEFINITIONS: EffectToolbeltDefinition[] = [
  {
    effect: "outerGlow",
    label: "Outer glow",
    description: "Add a soft colored halo around visible pixels.",
    category: "Light and color",
    icon: <Sparkles size={14} aria-hidden="true" />,
  },
  {
    effect: "blur",
    label: "Blur",
    description: "Soften the layer with a configurable GPU blur.",
    category: "Light and color",
    icon: <Activity size={14} aria-hidden="true" />,
  },
  {
    effect: "brightnessExposure",
    label: "Brightness",
    description: "Temporarily brighten or darken the whole layer.",
    category: "Light and color",
    icon: <Palette size={14} aria-hidden="true" />,
  },
  {
    effect: "spatialGradient",
    label: "Gradient",
    description: "Blend two colors across the layer.",
    category: "Light and color",
    icon: <Palette size={14} aria-hidden="true" />,
  },
  {
    effect: "animatedShine",
    label: "Shine",
    description: "Sweep a moving highlight across the artwork.",
    category: "Light and color",
    icon: <Sparkles size={14} aria-hidden="true" />,
  },
  {
    effect: "visualMask",
    label: "Visual mask",
    description: "Clip the layer with a separate still image.",
    category: "Clipping and reveal",
    icon: <Eye size={14} aria-hidden="true" />,
  },
  {
    effect: "directionalDissolve",
    label: "Dissolve",
    description: "Reveal or remove pixels with a wipe or noisy erosion.",
    category: "Clipping and reveal",
    icon: <Wand2 size={14} aria-hidden="true" />,
  },
  {
    effect: "spriteWarp",
    label: "Warp",
    description: "Bend or shimmer the pixels inside this layer.",
    category: "Distortion",
    icon: <Activity size={14} aria-hidden="true" />,
  },
];

export function effectToolbeltDefinition(effect: RenderingEffectKey) {
  return EFFECT_TOOLBELT_DEFINITIONS.find(
    (candidate) => candidate.effect === effect,
  );
}

export function EffectToolbelt({
  layerName,
  clips,
  selectedClipId,
  onAdd,
  onSelect,
}: {
  layerName: string;
  clips: EffectToolbeltClip[];
  selectedClipId: string | null;
  onAdd: (effect: RenderingEffectKey) => void;
  onSelect: (clipId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useFocusRegion<HTMLDivElement>({
    active: open,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: triggerRef,
    onEscape: () => setOpen(false),
  });
  const configuredEffects = new Set(clips.map((clip) => clip.effect));
  const categories = [
    "Light and color",
    "Clipping and reveal",
    "Distortion",
  ] as const;

  return (
    <section
      className="effect-toolbelt"
      aria-label={`Effects for ${layerName}`}
    >
      <div className="effect-toolbelt__header">
        <span title="Effects modify this layer; chip order does not change front/back depth.">
          <Wand2 size={13} aria-hidden="true" /> Effects
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="effect-toolbelt__add"
          data-effect-toolbelt-add
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="effect-toolbelt-palette"
          onClick={() => setOpen((current) => !current)}
        >
          <Plus size={13} aria-hidden="true" /> Add effect
        </button>
      </div>

      {clips.length === 0 ? (
        <p className="effect-toolbelt__empty">
          Add a timed modifier without changing the source image.
        </p>
      ) : (
        <div className="effect-toolbelt__chips" aria-label="Added effects">
          {clips.map((clip) => {
            const definition = effectToolbeltDefinition(clip.effect);
            return (
              <button
                key={clip.id}
                type="button"
                data-effect-clip-id={clip.id}
                className={`${selectedClipId === clip.id ? "is-selected" : ""} ${clip.enabled ? "" : "is-disabled"}`}
                aria-pressed={selectedClipId === clip.id}
                aria-label={`${definition?.label ?? clip.effect}${clip.enabled ? "" : ", Off"}`}
                onClick={() => onSelect(clip.id)}
              >
                {definition?.icon}
                <span>{definition?.label ?? clip.effect}</span>
                {!clip.enabled && <small>Off</small>}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div
          ref={paletteRef}
          id="effect-toolbelt-palette"
          className="effect-toolbelt__palette"
          role="dialog"
          aria-modal="false"
          aria-label={`Add an effect to ${layerName}`}
        >
          <header>
            <div>
              <strong>Add an effect</strong>
              <small>Time it inside each copy of this layer.</small>
            </div>
            <span className="effect-toolbelt__webgl">WebGL</span>
          </header>
          {categories.map((category) => (
            <div className="effect-toolbelt__category" key={category}>
              <span>{category}</span>
              <div>
                {EFFECT_TOOLBELT_DEFINITIONS.filter(
                  (definition) => definition.category === category,
                ).map((definition) => {
                  const configured = configuredEffects.has(definition.effect);
                  return (
                    <button
                      key={definition.effect}
                      type="button"
                      disabled={configured}
                      aria-label={
                        configured
                          ? `${definition.label}, Already added`
                          : `Add ${definition.label}: ${definition.description}`
                      }
                      onClick={() => {
                        onAdd(definition.effect);
                        setOpen(false);
                      }}
                    >
                      {definition.icon}
                      <span>
                        <strong>{definition.label}</strong>
                        <small>
                          {configured
                            ? "Already added"
                            : definition.description}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
