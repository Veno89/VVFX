"use client";

import { Check, Shuffle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  availableAspects,
  createVariations,
  VARIATION_ASPECTS,
  type EffectVariation,
  type VariationAspect,
} from "../../vfx/variations";
import type { VfxProject } from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

const VARIATIONS_DIALOG_ID = "preview-variations-dialog";

const UNAVAILABLE_HINTS: Partial<Record<VariationAspect, string>> = {
  colors: "Nothing here has a color yet. Add a tint first.",
  count: "Only Burst and Repeating-copy layers have a copy count.",
  randomness: "The random pattern belongs to the whole effect.",
};

/**
 * Offers six alternative versions of the whole effect or of the selected
 * layer. Choosing one only previews it; the panel's Keep/Back bar decides
 * whether it replaces the project.
 */
export function VariationsMenu({
  project,
  selectedLayerId = null,
  activeVariationId,
  onTry,
}: {
  project: VfxProject;
  selectedLayerId?: string | null;
  activeVariationId: string | null;
  onTry: (variation: EffectVariation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [aspects, setAspects] = useState<VariationAspect[]>([
    "colors",
    "size",
    "randomness",
  ]);
  const [roll, setRoll] = useState(1);
  const [layerOnly, setLayerOnly] = useState(false);
  const selectedLayer =
    project.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const scope = layerOnly && selectedLayer ? selectedLayer.id : null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useFocusRegion<HTMLDivElement>({
    active: open,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: triggerRef,
    onEscape: () => setOpen(false),
  });
  const available = useMemo(
    () => availableAspects(project, scope),
    [project, scope],
  );
  const variations = useMemo(
    () => (open ? createVariations(project, aspects, roll, 6, scope) : []),
    [aspects, open, project, roll, scope],
  );
  const hasLayers = project.layers.length > 0;

  const toggleAspect = (aspect: VariationAspect) =>
    setAspects((current) =>
      current.includes(aspect)
        ? current.filter((item) => item !== aspect)
        : [...current, aspect],
    );

  return (
    <div className="menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`variations-trigger${open ? " is-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        disabled={!hasLayers}
        title={
          hasLayers
            ? "Try different versions of this effect"
            : "Add a layer to try variations"
        }
        aria-label="Variations"
        aria-controls={VARIATIONS_DIALOG_ID}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Shuffle size={14} aria-hidden="true" />
        <span className="variations-trigger__label">Variations</span>
      </button>
      {open && (
        <div
          ref={dialogRef}
          id={VARIATIONS_DIALOG_ID}
          className="view-menu variations-menu"
          role="dialog"
          aria-label="Effect variations"
        >
          <div
            className="variations-menu__scope"
            role="radiogroup"
            aria-label="Vary"
          >
            <button
              type="button"
              role="radio"
              aria-checked={scope === null}
              className={scope === null ? "is-active" : ""}
              onClick={() => setLayerOnly(false)}
            >
              Whole effect
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope !== null}
              className={scope !== null ? "is-active" : ""}
              disabled={!selectedLayer}
              title={
                selectedLayer ? undefined : "Select a layer to vary it alone"
              }
              onClick={() => setLayerOnly(true)}
            >
              {selectedLayer ? `Only ${selectedLayer.name}` : "Selected layer"}
            </button>
          </div>
          <span className="menu-label">Change</span>
          <div className="variations-menu__aspects">
            {VARIATION_ASPECTS.map((aspect) => {
              const unavailable = !available.includes(aspect.id);
              return (
                <label
                  key={aspect.id}
                  className="variations-chip"
                  title={unavailable ? UNAVAILABLE_HINTS[aspect.id] : undefined}
                >
                  <input
                    type="checkbox"
                    checked={aspects.includes(aspect.id) && !unavailable}
                    disabled={unavailable}
                    onChange={() => toggleAspect(aspect.id)}
                  />
                  {aspect.label}
                </label>
              );
            })}
          </div>
          {variations.length === 0 ? (
            <p className="view-menu-note">Pick at least one thing to change.</p>
          ) : (
            <ul className="variations-menu__list">
              {variations.map((variation, index) => {
                const active = variation.id === activeVariationId;
                return (
                  <li key={variation.id}>
                    <button
                      type="button"
                      className={`variation-card${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => onTry(variation)}
                    >
                      <span className="variation-card__title">
                        {active && <Check size={13} aria-hidden="true" />}
                        Version {index + 1}
                      </span>
                      {variation.swatches.length > 0 && (
                        <span
                          className="variation-card__swatches"
                          aria-hidden="true"
                        >
                          {variation.swatches.map((color) => (
                            <i key={color} style={{ background: color }} />
                          ))}
                        </span>
                      )}
                      <small>{variation.changes.join(" · ")}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="view-menu-note">
            Choose a version to see it in the preview, then Keep it or go Back.
          </p>
          <button
            type="button"
            className="variations-menu__shuffle"
            onClick={() => setRoll((value) => value + 1)}
            disabled={variations.length === 0}
          >
            <Shuffle size={14} aria-hidden="true" /> Show six more
          </button>
        </div>
      )}
    </div>
  );
}
