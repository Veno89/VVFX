"use client";

import { useMemo, useState } from "react";
import { applyEasing } from "../../vfx/interpolation";
import type { CustomEasingSettings, EasingName } from "../../vfx/types";
import { RangeField } from "./Controls";

export const EASING_OPTIONS: Array<{
  id: EasingName;
  label: string;
  short: string;
  help: string;
}> = [
  {
    id: "constant",
    label: "Constant",
    short: "Even speed",
    help: "Moves at the same pace from start to finish.",
  },
  {
    id: "fast-slow",
    label: "Fast then slow",
    short: "Punchy settle",
    help: "Starts with energy, then settles. Great for explosions and sparks.",
  },
  {
    id: "slow-fast",
    label: "Slow then fast",
    short: "Gather speed",
    help: "Builds speed toward the end. Useful for things being pulled inward.",
  },
  {
    id: "smooth",
    label: "Smooth",
    short: "Gentle ends",
    help: "Gently speeds up and slows down. A natural all-round choice.",
  },
  {
    id: "bounce",
    label: "Bounce",
    short: "Rebound",
    help: "Rebounds at the end, like something landing.",
  },
  {
    id: "overshoot",
    label: "Overshoot",
    short: "Pass and settle",
    help: "Goes a little too far, then settles back. Adds punch.",
  },
  {
    id: "elastic",
    label: "Elastic",
    short: "Springy finish",
    help: "Wobbles past the end several times. Playful and energetic.",
  },
  {
    id: "custom",
    label: "Custom",
    short: "Shape it yourself",
    help: "Uses two editable handles to create your own acceleration curve.",
  },
];

function curveGeometry(easing: EasingName, custom: CustomEasingSettings) {
  const samples = Array.from({ length: 49 }, (_, index) => {
    const time = index / 48;
    return { time, value: applyEasing(easing, time, custom) };
  });
  const rawMin = Math.min(0, ...samples.map((sample) => sample.value));
  const rawMax = Math.max(1, ...samples.map((sample) => sample.value));
  const padding = Math.max(0.06, (rawMax - rawMin) * 0.08);
  const minimum = rawMin - padding;
  const maximum = rawMax + padding;
  const yFor = (value: number) =>
    94 - ((value - minimum) / Math.max(0.001, maximum - minimum)) * 88;
  return {
    path: samples
      .map(
        (sample, index) =>
          `${index === 0 ? "M" : "L"} ${(sample.time * 100).toFixed(2)} ${yFor(sample.value).toFixed(2)}`,
      )
      .join(" "),
    yFor,
  };
}

function CurveGraph({
  easing,
  custom,
  progress,
  compact = false,
}: {
  easing: EasingName;
  custom: CustomEasingSettings;
  progress?: number;
  compact?: boolean;
}) {
  const geometry = useMemo(
    () => curveGeometry(easing, custom),
    [custom, easing],
  );
  const result = applyEasing(easing, progress ?? 0, custom);
  return (
    <svg
      className={compact ? "ease-curve-mini" : "ease-curve-graph"}
      viewBox="0 0 100 100"
      role={compact ? undefined : "img"}
      aria-hidden={compact ? true : undefined}
      aria-label={
        compact
          ? undefined
          : "Easing graph. Horizontal is elapsed time and vertical is animation progress."
      }
    >
      {!compact && (
        <>
          <line className="ease-grid-line" x1="25" y1="0" x2="25" y2="100" />
          <line className="ease-grid-line" x1="50" y1="0" x2="50" y2="100" />
          <line className="ease-grid-line" x1="75" y1="0" x2="75" y2="100" />
          <line
            className="ease-boundary-line"
            x1="0"
            y1={geometry.yFor(0)}
            x2="100"
            y2={geometry.yFor(0)}
          />
          <line
            className="ease-boundary-line"
            x1="0"
            y1={geometry.yFor(1)}
            x2="100"
            y2={geometry.yFor(1)}
          />
          {easing === "custom" && (
            <>
              <line
                className="ease-handle-line"
                x1="0"
                y1={geometry.yFor(0)}
                x2={custom.x1 * 100}
                y2={geometry.yFor(custom.y1)}
              />
              <line
                className="ease-handle-line"
                x1="100"
                y1={geometry.yFor(1)}
                x2={custom.x2 * 100}
                y2={geometry.yFor(custom.y2)}
              />
              <circle
                className="ease-handle-dot"
                cx={custom.x1 * 100}
                cy={geometry.yFor(custom.y1)}
                r="2.8"
              />
              <circle
                className="ease-handle-dot"
                cx={custom.x2 * 100}
                cy={geometry.yFor(custom.y2)}
                r="2.8"
              />
            </>
          )}
        </>
      )}
      <path className="ease-curve-line" d={geometry.path} />
      {progress !== undefined && !compact && (
        <circle
          className="ease-progress-dot"
          cx={progress * 100}
          cy={geometry.yFor(result)}
          r="3.5"
        />
      )}
    </svg>
  );
}

export function EasingCurveEditor({
  easing,
  custom,
  onEasingChange,
  onCustomChange,
}: {
  easing: EasingName;
  custom: CustomEasingSettings;
  onEasingChange: (easing: EasingName) => void;
  onCustomChange: (custom: CustomEasingSettings) => void;
}) {
  const [previewProgress, setPreviewProgress] = useState(0.5);
  const selected =
    EASING_OPTIONS.find((option) => option.id === easing) ?? EASING_OPTIONS[0];
  const result = applyEasing(easing, previewProgress, custom);
  const patchCustom = (patch: Partial<CustomEasingSettings>) =>
    onCustomChange({ ...custom, ...patch });

  return (
    <div className="easing-editor">
      <div className="easing-preset-grid" aria-label="Easing presets">
        {EASING_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.id}
            className={option.id === easing ? "is-selected" : ""}
            aria-pressed={option.id === easing}
            aria-label={`Use ${option.label} easing`}
            onClick={() => onEasingChange(option.id)}
          >
            <CurveGraph easing={option.id} custom={custom} compact />
            <span>
              <strong>{option.label}</strong>
              <small>{option.short}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="easing-curve-panel">
        <div className="easing-curve-heading">
          <span>
            <strong>{selected.label}</strong>
            <small>{selected.help}</small>
          </span>
          <output aria-live="polite">
            {Math.round(previewProgress * 100)}% time →{" "}
            {Math.round(result * 100)}% result
          </output>
        </div>
        <CurveGraph
          easing={easing}
          custom={custom}
          progress={previewProgress}
        />
        <div className="easing-axis-labels" aria-hidden="true">
          <span>Start</span>
          <span>Elapsed time →</span>
          <span>End</span>
        </div>
        <label className="ease-scrubber">
          Preview a moment
          <input
            type="range"
            min={0}
            max={100}
            value={previewProgress * 100}
            aria-label="Preview easing progress"
            onChange={(event) =>
              setPreviewProgress(Number(event.target.value) / 100)
            }
          />
        </label>
      </div>

      {easing === "custom" && (
        <div className="custom-easing-controls">
          <p className="section-note">
            Time changes when each handle acts. Height changes how strongly it
            accelerates, anticipates, or overshoots.
          </p>
          <RangeField
            label="First handle time"
            value={custom.x1 * 100}
            defaultValue={42}
            min={0}
            max={100}
            unit="%"
            onChange={(value) => patchCustom({ x1: value / 100 })}
          />
          <RangeField
            label="First handle height"
            value={custom.y1 * 100}
            defaultValue={0}
            min={-200}
            max={300}
            unit="%"
            onChange={(value) => patchCustom({ y1: value / 100 })}
          />
          <RangeField
            label="Second handle time"
            value={custom.x2 * 100}
            defaultValue={58}
            min={0}
            max={100}
            unit="%"
            onChange={(value) => patchCustom({ x2: value / 100 })}
          />
          <RangeField
            label="Second handle height"
            value={custom.y2 * 100}
            defaultValue={100}
            min={-200}
            max={300}
            unit="%"
            onChange={(value) => patchCustom({ y2: value / 100 })}
          />
        </div>
      )}
    </div>
  );
}
