import type { KeyboardEvent, PointerEvent } from "react";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- A focusable ARIA separator is the prescribed keyboard-adjustable splitter pattern. */

export function PanelResizeHandle({
  className,
  orientation,
  label,
  value,
  minimum,
  maximum,
  valueText,
  onChange,
  onPointerStart,
}: {
  className: string;
  orientation: "horizontal" | "vertical";
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  valueText?: string;
  onChange: (value: number) => void;
  onPointerStart: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const negative =
      orientation === "vertical"
        ? event.key === "ArrowLeft"
        : event.key === "ArrowUp";
    const positive =
      orientation === "vertical"
        ? event.key === "ArrowRight"
        : event.key === "ArrowDown";
    if (!negative && !positive && event.key !== "Home" && event.key !== "End")
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? minimum
        : event.key === "End"
          ? maximum
          : value + (positive ? 12 : -12);
    onChange(Math.max(minimum, Math.min(maximum, next)));
  };
  return (
    <div
      className={`panel-resize-handle ${className}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText ?? `${Math.round(value)} pixels`}
      data-editor-shortcuts="off"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerStart}
    />
  );
}
