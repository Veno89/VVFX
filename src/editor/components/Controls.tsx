"use client";

import { ChevronDown, CircleHelp, RotateCcw } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

export function HelpTip({ label, text }: { label: string; text: string }) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = (hovered || focused) && !dismissed;

  useEffect(() => {
    if (!visible) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDismissed(true);
    };
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => window.removeEventListener("keydown", dismissOnEscape, true);
  }, [visible]);

  return (
    <button
      type="button"
      className="help-tip"
      data-focus-region-escape-owner={visible ? "" : undefined}
      aria-label={`Help for ${label}`}
      aria-describedby={visible ? tooltipId : undefined}
      onPointerEnter={() => {
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => {
        setDismissed(false);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setDismissed(true);
      }}
    >
      <CircleHelp size={13} aria-hidden="true" />
      {visible && (
        <span id={tooltipId} className="help-tip__bubble" role="tooltip">
          {text}
        </span>
      )}
    </button>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  help?: string;
  defaultValue?: number;
  onChange: (value: number) => void;
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  help,
  defaultValue,
  onChange,
}: RangeFieldProps) {
  const isDefault =
    defaultValue === undefined || Math.abs(value - defaultValue) < 0.0001;
  return (
    <div className="field range-field">
      <span className="field__label">
        {label}
        {help && <HelpTip label={label} text={help} />}
        {defaultValue !== undefined && (
          <button
            type="button"
            className="reset-value"
            disabled={isDefault}
            onClick={() => onChange(defaultValue)}
            title={`Reset ${label.toLowerCase()} to ${defaultValue}${unit}`}
            aria-label={`Reset ${label} to default`}
          >
            <RotateCcw size={11} />
          </button>
        )}
      </span>
      <span className="range-field__controls">
        <input
          aria-label={`${label} slider`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="number-wrap">
          <input
            aria-label={label}
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number(value.toFixed(step < 1 ? 2 : 0))}
            onChange={(event) =>
              onChange(Math.max(min, Math.min(max, Number(event.target.value))))
            }
          />
          <span>{unit}</span>
        </span>
      </span>
    </div>
  );
}

export function SelectField({
  label,
  value,
  help,
  children,
  onChange,
}: {
  label: string;
  value: string;
  help?: string;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <span className="field__label">
        <label htmlFor={fieldId}>{label}</label>
        {help && <HelpTip label={label} text={help} />}
      </span>
      <select
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

export function TextField({
  label,
  value,
  help,
  onChange,
}: {
  label: string;
  value: string;
  help?: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <span className="field__label">
        <label htmlFor={fieldId}>{label}</label>
        {help && <HelpTip label={label} text={help} />}
      </span>
      <input
        id={fieldId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  help,
  onChange,
}: {
  label: string;
  checked: boolean;
  help?: string;
  onChange: (checked: boolean) => void;
}) {
  const switchId = useId();
  const labelId = useId();
  return (
    <div className="toggle-row">
      <button
        id={switchId}
        type="button"
        className={`switch ${checked ? "is-on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <label id={labelId} htmlFor={switchId}>
        {label}
      </label>
      {help && <HelpTip label={label} text={help} />}
    </div>
  );
}

export function SettingsSection({
  title,
  icon,
  badge,
  badgeTone = "neutral",
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  badgeTone?: "neutral" | "experimental";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="settings-section" open={defaultOpen}>
      <summary>
        {icon}
        <span>{title}</span>
        {badge && (
          <span
            className={`settings-section__badge settings-section__badge--${badgeTone}`}
          >
            {badge}
          </span>
        )}
        <ChevronDown size={15} className="summary-chevron" />
      </summary>
      <div className="settings-section__body">{children}</div>
    </details>
  );
}
