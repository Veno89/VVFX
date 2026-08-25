"use client";

import { ChevronDown, CircleHelp, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";

export function HelpTip({
  text,
  dismissOnLeave = false,
}: {
  text: string;
  dismissOnLeave?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="help-tip"
      aria-label={`Help: ${text}`}
      onPointerEnter={dismissOnLeave ? () => setOpen(true) : undefined}
      onPointerLeave={dismissOnLeave ? () => setOpen(false) : undefined}
      onFocus={dismissOnLeave ? () => setOpen(true) : undefined}
      onBlur={dismissOnLeave ? () => setOpen(false) : undefined}
    >
      <CircleHelp size={13} aria-hidden="true" />
      {(!dismissOnLeave || open) && (
        <span className="help-tip__bubble" role="tooltip">
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
        {help && <HelpTip text={help} />}
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
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {help && <HelpTip text={help} />}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
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
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {help && <HelpTip text={help} />}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
  return (
    <label className="toggle-row">
      <button
        type="button"
        className={`switch ${checked ? "is-on" : ""}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <span>{label}</span>
      {help && <HelpTip text={help} />}
    </label>
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
