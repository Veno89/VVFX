import { GraduationCap, Sparkles } from "lucide-react";
import { COMPOSITION_PRESETS } from "../../vfx/presets";

/** Complete effects that read well as a first thing to play with. */
export const STARTER_PRESET_IDS = [
  "magic-impact",
  "fire-impact",
  "healing-aura",
  "projectile-trail",
] as const;

const STARTERS = STARTER_PRESET_IDS.flatMap((id) => {
  const preset = COMPOSITION_PRESETS.find((candidate) => candidate.id === id);
  return preset ? [preset] : [];
});

/**
 * The beginner's first decision: learn step by step, or start from a complete
 * effect and take it apart. Shared by the empty preview and the end of the tour.
 */
export function StartChoices({
  onStartGuide,
  onStartPreset,
}: {
  onStartGuide: () => void;
  onStartPreset: (presetId: string) => void;
}) {
  return (
    <div className="start-choices">
      <button
        type="button"
        className="start-choice start-choice--guide"
        onClick={onStartGuide}
      >
        <GraduationCap size={18} aria-hidden="true" />
        <span>
          <strong>Build my first effect</strong>
          <small>A guided 5-minute lesson, one step at a time.</small>
        </span>
      </button>
      <p className="start-choices__label">Or start from a complete effect</p>
      <div className="start-choices__grid">
        {STARTERS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="start-choice"
            onClick={() => onStartPreset(preset.id)}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>
              <strong>{preset.name}</strong>
              <small>{preset.ingredients.join(" · ")}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Shown over an empty preview so the first click produces something moving. */
export function PreviewStartPanel({
  onStartGuide,
  onStartPreset,
}: {
  onStartGuide: () => void;
  onStartPreset: (presetId: string) => void;
}) {
  return (
    <section className="preview-start" aria-labelledby="preview-start-title">
      <h2 id="preview-start-title">Make something move</h2>
      <p>
        Pick a starting point. Everything stays editable, and you can add your
        own PNG or WebP images from the Asset Library at any time.
      </p>
      <StartChoices onStartGuide={onStartGuide} onStartPreset={onStartPreset} />
    </section>
  );
}
