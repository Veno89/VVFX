"use client";

import { useState } from "react";
import {
  CURVE_PROPERTY_LABELS,
  curveProperties,
  curveRange,
  curveValue,
  curveValueStep,
  dragCurvePoint,
  formatCurveValue,
  sampleCurve,
  withCurveValue,
  type CurveProperty,
} from "../../vfx/keyframeCurve";
import {
  insertKeyframeAt,
  MAX_KEYFRAMES,
  MIN_KEYFRAME_GAP,
} from "../../vfx/keyframes";
import type {
  KeyframeSettings,
  TimingSettings,
  TransformSettings,
} from "../../vfx/types";
import { CurvePlot } from "./CurvePlot";

/**
 * A small graph of one keyframed value over the layer's life, drawn with the
 * same per-segment easing the engine uses.
 */
export function KeyframeCurveGraph({
  keyframes,
  transform,
  timing,
  onChange,
}: {
  keyframes: KeyframeSettings;
  transform: TransformSettings;
  timing: Pick<TimingSettings, "duration" | "easing" | "customEasing">;
  onChange: (keyframes: KeyframeSettings) => void;
}) {
  const properties = curveProperties(transform.separateScale);
  const [selected, setSelected] = useState<CurveProperty>("size");
  const property = properties.includes(selected) ? selected : properties[0];
  const frames = keyframes.frames;
  const label = CURVE_PROPERTY_LABELS[property];

  return (
    <div className="curve-graph">
      <div className="curve-graph__header">
        <span>Curve</span>
        <div role="radiogroup" aria-label="Curve value">
          {properties.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={candidate === property}
              className={candidate === property ? "is-active" : ""}
              onClick={() => setSelected(candidate)}
            >
              {CURVE_PROPERTY_LABELS[candidate]}
            </button>
          ))}
        </div>
      </div>
      <CurvePlot
        label={label}
        points={frames.map((frame) => ({
          time: frame.time,
          value: curveValue(frame, property),
        }))}
        samples={sampleCurve(keyframes, timing, property)}
        range={curveRange(frames, property)}
        formatValue={(value) => formatCurveValue(property, value)}
        formatTime={(time) => `${Math.round(time * timing.duration)} ms`}
        valueStep={curveValueStep(property)}
        maxPoints={MAX_KEYFRAMES}
        onMovePoint={(index, time, value) =>
          onChange({
            ...keyframes,
            frames: dragCurvePoint(frames, index, property, time, value),
          })
        }
        onAddPoint={(time, value) => {
          const inserted = insertKeyframeAt(keyframes, transform, time);
          if (inserted === keyframes) return;
          onChange({
            ...inserted,
            frames: inserted.frames.map((frame) =>
              Math.abs(frame.time - time) < MIN_KEYFRAME_GAP / 2
                ? withCurveValue(frame, property, value)
                : frame,
            ),
          });
        }}
        onRemovePoint={(index) =>
          onChange({
            ...keyframes,
            frames: frames.filter((_, frameIndex) => frameIndex !== index),
          })
        }
        help={`Drag a point to change ${label.toLowerCase()} over ${timing.duration} ms.`}
      />
    </div>
  );
}
