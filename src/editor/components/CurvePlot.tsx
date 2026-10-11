"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export interface PlotPoint {
  /** Normalized 0–1. */
  time: number;
  value: number;
}

/**
 * Draggable value-over-time plot shared by the keyframe, speed, and emission
 * curves. Points drag in time and value, a click on empty space adds one,
 * and focused points take arrow keys (Shift for bigger steps) and Delete.
 * The first and last points stay at the start and end of time.
 */
export function CurvePlot({
  label,
  points,
  samples,
  range,
  formatValue,
  formatTime,
  valueStep,
  maxPoints,
  onMovePoint,
  onAddPoint,
  onRemovePoint,
  help,
}: {
  label: string;
  points: readonly PlotPoint[];
  /** The drawn line, usually sampled from the same evaluator as playback. */
  samples: readonly PlotPoint[];
  range: { min: number; max: number };
  formatValue: (value: number) => string;
  formatTime: (time: number) => string;
  valueStep: number;
  maxPoints: number;
  onMovePoint: (index: number, time: number, value: number) => void;
  onAddPoint: (time: number, value: number) => void;
  onRemovePoint: (index: number) => void;
  help: ReactNode;
}) {
  const [drag, setDrag] = useState<{
    index: number;
    range: { min: number; max: number };
  } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  // The scale stays put while dragging so a point does not run away.
  const shown = drag?.range ?? range;
  const span = Math.max(Number.EPSILON, shown.max - shown.min);
  const toY = (value: number) => (1 - (value - shown.min) / span) * 100;
  const path = samples
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${(point.time * 100).toFixed(2)} ${toY(point.value).toFixed(2)}`,
    )
    .join(" ");
  const zeroY = shown.min < 0 && shown.max > 0 ? toY(0) : null;
  const full = points.length >= maxPoints;

  const fromPointer = (event: PointerEvent) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    const ratio = (event.clientY - bounds.top) / bounds.height;
    return {
      time: Math.min(
        1,
        Math.max(0, (event.clientX - bounds.left) / bounds.width),
      ),
      value: shown.max - Math.min(1, Math.max(0, ratio)) * span,
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const point = fromPointer(event);
    if (point) onMovePoint(drag.index, point.time, point.value);
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const point = points[index];
    const middle = index > 0 && index < points.length - 1;
    const scale = event.shiftKey ? 4 : 1;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const step = valueStep * scale * (event.key === "ArrowUp" ? 1 : -1);
      onMovePoint(index, point.time, point.value + step);
    } else if (
      middle &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      const step = 0.01 * scale * (event.key === "ArrowRight" ? 1 : -1);
      onMovePoint(index, point.time + step, point.value);
    } else if (
      middle &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      onRemovePoint(index);
    } else return;
    event.preventDefault();
  };

  return (
    <>
      <div className="curve-graph__frame">
        <span className="curve-graph__axis curve-graph__axis--top">
          {formatValue(shown.max)}
        </span>
        <span className="curve-graph__axis curve-graph__axis--bottom">
          {formatValue(shown.min)}
        </span>
        <div
          ref={plotRef}
          className="curve-graph__plot"
          aria-describedby={helpId}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget || full) return;
            const point = fromPointer(event);
            if (point) onAddPoint(point.time, point.value);
          }}
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
          {points.map((point, index) => (
            <button
              key={index}
              type="button"
              className={`curve-graph__point${drag?.index === index ? " is-dragging" : ""}`}
              style={{
                left: `${point.time * 100}%`,
                top: `${toY(point.value)}%`,
              }}
              aria-label={`${label} point ${index + 1} of ${points.length}: ${formatValue(point.value)} at ${formatTime(point.time)}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                setDrag({ index, range: shown });
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDrag(null)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            />
          ))}
        </div>
      </div>
      <p id={helpId} className="curve-graph__help">
        {help} Click the graph to add a point
        {full ? " (the maximum is reached)" : ""}. Arrow keys nudge a focused
        point; Delete removes a middle one.
      </p>
    </>
  );
}
