"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
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

/**
 * A small graph of one keyframed value over the layer's life. Points drag
 * in time and value, the graph adds a point where it is clicked, and every
 * point also works from the keyboard.
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
  const [drag, setDrag] = useState<{
    index: number;
    range: { min: number; max: number };
  } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const frames = keyframes.frames;
  const range = drag?.range ?? curveRange(frames, property);
  const label = CURVE_PROPERTY_LABELS[property];
  const span = Math.max(Number.EPSILON, range.max - range.min);
  const toY = (value: number) => (1 - (value - range.min) / span) * 100;
  const samples = sampleCurve(keyframes, timing, property);
  const path = samples
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${(point.time * 100).toFixed(2)} ${toY(point.value).toFixed(2)}`,
    )
    .join(" ");
  const zeroY = range.min < 0 && range.max > 0 ? toY(0) : null;

  const fromPointer = (event: PointerEvent) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    const time = (event.clientX - bounds.left) / bounds.width;
    const ratio = (event.clientY - bounds.top) / bounds.height;
    return {
      time: Math.min(1, Math.max(0, time)),
      value: range.max - Math.min(1, Math.max(0, ratio)) * span,
    };
  };

  const commit = (nextFrames: KeyframeSettings["frames"]) =>
    onChange({ ...keyframes, frames: nextFrames });

  const handlePointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const point = fromPointer(event);
    if (!point) return;
    commit(
      dragCurvePoint(frames, drag.index, property, point.time, point.value),
    );
  };

  const addPointAt = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || frames.length >= MAX_KEYFRAMES)
      return;
    const point = fromPointer(event);
    if (!point) return;
    const inserted = insertKeyframeAt(keyframes, transform, point.time);
    if (inserted === keyframes) return;
    const index = inserted.frames.findIndex(
      (frame) => Math.abs(frame.time - point.time) < MIN_KEYFRAME_GAP / 2,
    );
    onChange(
      index < 0
        ? inserted
        : {
            ...inserted,
            frames: inserted.frames.map((frame, frameIndex) =>
              frameIndex === index
                ? withCurveValue(frame, property, point.value)
                : frame,
            ),
          },
    );
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const frame = frames[index];
    const middle = index > 0 && index < frames.length - 1;
    const scale = event.shiftKey ? 4 : 1;
    const value = curveValue(frame, property);
    let next: KeyframeSettings["frames"] | null = null;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const step = curveValueStep(property) * scale;
      next = dragCurvePoint(
        frames,
        index,
        property,
        frame.time,
        value + (event.key === "ArrowUp" ? step : -step),
      );
    } else if (
      middle &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      const step = 0.01 * scale;
      next = dragCurvePoint(
        frames,
        index,
        property,
        frame.time + (event.key === "ArrowRight" ? step : -step),
        value,
      );
    } else if (
      middle &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      next = frames.filter((_, frameIndex) => frameIndex !== index);
    }
    if (!next) return;
    event.preventDefault();
    commit(next);
  };

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
      <div className="curve-graph__frame">
        <span className="curve-graph__axis curve-graph__axis--top">
          {formatCurveValue(property, range.max)}
        </span>
        <span className="curve-graph__axis curve-graph__axis--bottom">
          {formatCurveValue(property, range.min)}
        </span>
        <div
          ref={plotRef}
          className="curve-graph__plot"
          aria-describedby={helpId}
          onPointerDown={addPointAt}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[25, 50, 75].map((x) => (
              <line
                key={x}
                className="curve-graph__grid"
                x1={x}
                x2={x}
                y1={0}
                y2={100}
              />
            ))}
            {zeroY !== null && (
              <line
                className="curve-graph__zero"
                x1={0}
                x2={100}
                y1={zeroY}
                y2={zeroY}
              />
            )}
            <path className="curve-graph__line" d={path} />
          </svg>
          {frames.map((frame, index) => {
            const value = curveValue(frame, property);
            const ms = Math.round(frame.time * timing.duration);
            return (
              <button
                key={index}
                type="button"
                className={`curve-graph__point${drag?.index === index ? " is-dragging" : ""}`}
                style={{
                  left: `${frame.time * 100}%`,
                  top: `${toY(value)}%`,
                }}
                aria-label={`${label} point ${index + 1} of ${frames.length}: ${formatCurveValue(property, value)} at ${ms} ms`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setDrag({ index, range });
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={() => setDrag(null)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              />
            );
          })}
        </div>
      </div>
      <p id={helpId} className="curve-graph__help">
        Drag a point to change {label.toLowerCase()} over {timing.duration} ms.
        Click the graph to add a point
        {frames.length >= MAX_KEYFRAMES ? " (the maximum is reached)" : ""}.
        Arrow keys nudge a focused point; Delete removes a middle one.
      </p>
    </div>
  );
}
