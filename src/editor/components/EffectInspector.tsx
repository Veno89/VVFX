"use client";

import { ArrowLeft, Clock3, Wand2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  RenderingEffectFadeEasing,
  RenderingEffectKey,
} from "../../vfx/renderingEffectsModel";
import type { VfxAsset, VfxLayer } from "../../vfx/types";
import { RangeField, SelectField, SettingsSection } from "./Controls";
import { effectToolbeltDefinition } from "./EffectToolbelt";
import { ExperimentalRenderingSection } from "./ExperimentalRenderingSection";

export interface EditableEffectClip {
  id: string;
  effect: RenderingEffectKey;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  fadeEasing: RenderingEffectFadeEasing;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const milliseconds = (normalized: number, duration: number) =>
  Math.round(normalized * duration);

export function EffectInspector({
  layer,
  clip,
  assets,
  locked = false,
  onBack,
  onLayerChange,
  onClipChange,
  onRemove,
}: {
  layer: VfxLayer;
  clip: EditableEffectClip;
  assets: VfxAsset[];
  locked?: boolean;
  onBack: () => void;
  onLayerChange: (layer: VfxLayer) => void;
  onClipChange: (patch: Partial<EditableEffectClip>) => void;
  onRemove: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const definition = effectToolbeltDefinition(clip.effect);
  const clipDuration = Math.max(0, clip.end - clip.start);
  const clipDurationMs = milliseconds(clipDuration, layer.timing.duration);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside
      className={`panel inspector effect-inspector ${locked ? "is-locked" : ""}`}
      aria-label={`${definition?.label ?? clip.effect} settings for ${layer.name}`}
    >
      <div className="inspector-header effect-inspector__header">
        <button
          type="button"
          className="effect-inspector__back"
          onClick={onBack}
          aria-label={`Back to ${layer.name} settings`}
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
        <div>
          <span className="eyebrow">Effect on {layer.name}</span>
          <h2 ref={headingRef} tabIndex={-1}>
            {definition?.label ?? clip.effect}
          </h2>
        </div>
        <span className="effect-inspector__icon" aria-hidden="true">
          {definition?.icon ?? <Wand2 size={14} />}
        </span>
      </div>

      {locked && (
        <p className="inspector-lock-notice" role="status">
          This layer is locked. Unlock it in Layers to edit its effect.
        </p>
      )}

      <div className="inspector-scroll" inert={locked}>
        <div className="effect-inspector__summary" aria-label="Effect timing">
          <span>
            <Clock3 size={13} aria-hidden="true" />
            {milliseconds(clip.start, layer.timing.duration)}–
            {milliseconds(clip.end, layer.timing.duration)} ms
          </span>
          <small>{clipDurationMs} ms long</small>
        </div>

        <SettingsSection
          title="Timing and fades"
          icon={<Clock3 size={15} />}
          defaultOpen
        >
          <p className="section-intro">
            This clip lives inside the parent layer’s lifetime. Drag it in the
            Timeline for broad edits or use these controls for exact values.
          </p>
          <div className="field-grid">
            <RangeField
              label="Starts"
              value={clip.start * 100}
              defaultValue={0}
              min={0}
              max={Math.max(0, clip.end * 100 - 1)}
              unit="% of layer"
              help="The point in the layer lifetime where this effect starts."
              onChange={(value) =>
                onClipChange({ start: clamp(value / 100, 0, clip.end - 0.01) })
              }
            />
            <RangeField
              label="Ends"
              value={clip.end * 100}
              defaultValue={100}
              min={Math.min(100, clip.start * 100 + 1)}
              max={100}
              unit="% of layer"
              help="The point in the layer lifetime where this effect stops."
              onChange={(value) =>
                onClipChange({ end: clamp(value / 100, clip.start + 0.01, 1) })
              }
            />
            <RangeField
              label="Fade in"
              value={clip.fadeIn * 100}
              defaultValue={0}
              min={0}
              max={(1 - clip.fadeOut) * 100}
              unit="% of effect"
              help="How much of this effect clip is used to fade from zero to full strength."
              onChange={(value) =>
                onClipChange({
                  fadeIn: clamp(value / 100, 0, 1 - clip.fadeOut),
                })
              }
            />
            <RangeField
              label="Fade out"
              value={clip.fadeOut * 100}
              defaultValue={0}
              min={0}
              max={(1 - clip.fadeIn) * 100}
              unit="% of effect"
              help="How much of this effect clip is used to fade from full strength to zero."
              onChange={(value) =>
                onClipChange({
                  fadeOut: clamp(value / 100, 0, 1 - clip.fadeIn),
                })
              }
            />
          </div>
          <SelectField
            label="Fade shape"
            value={clip.fadeEasing}
            help="Controls how quickly the effect gains and loses strength inside its fade handles."
            onChange={(fadeEasing) =>
              onClipChange({
                fadeEasing: fadeEasing as RenderingEffectFadeEasing,
              })
            }
          >
            <option value="linear">Linear</option>
            <option value="smooth">Smooth</option>
            <option value="ease-in">Ease in</option>
            <option value="ease-out">Ease out</option>
          </SelectField>
        </SettingsSection>

        <ExperimentalRenderingSection
          effects={layer.appearance.effects}
          assets={assets}
          focusedEffect={clip.effect}
          title={`${definition?.label ?? clip.effect} settings`}
          onChange={(effects) =>
            onLayerChange({
              ...layer,
              appearance: { ...layer.appearance, effects },
            })
          }
          onRemove={onRemove}
        />
      </div>
    </aside>
  );
}
