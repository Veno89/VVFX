import type { TimelineMarker } from "./types";

export type TimelineSnapMode =
  "off" | "1" | "5" | "10" | "markers" | "30fps" | "60fps";

export interface TimingMarkerDraft {
  time: number;
  label: string;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const cleanPrecision = (value: number) => Math.round(value * 100) / 100;

export function snapTimelineTime({
  value,
  mode,
  markers,
  duration,
  bypass = false,
}: {
  value: number;
  mode: TimelineSnapMode;
  markers: TimelineMarker[];
  duration: number;
  bypass?: boolean;
}): number {
  const safeValue = clamp(value, 0, duration);
  if (bypass || mode === "off") return cleanPrecision(safeValue);
  if (mode === "markers") {
    const closest = markers.reduce<TimelineMarker | null>((winner, marker) => {
      if (!winner) return marker;
      return Math.abs(marker.time - safeValue) <
        Math.abs(winner.time - safeValue)
        ? marker
        : winner;
    }, null);
    const magneticRange = Math.max(5, duration * 0.008);
    return closest && Math.abs(closest.time - safeValue) <= magneticRange
      ? closest.time
      : cleanPrecision(safeValue);
  }
  const step =
    mode === "30fps" ? 1000 / 30 : mode === "60fps" ? 1000 / 60 : Number(mode);
  return cleanPrecision(
    clamp(Math.round(safeValue / step) * step, 0, duration),
  );
}

export function nextMarkerTime(
  current: number,
  direction: -1 | 1,
  markers: TimelineMarker[],
  duration: number,
): number {
  const ordered = [...new Set(markers.map((marker) => marker.time))].sort(
    (left, right) => left - right,
  );
  if (direction > 0)
    return ordered.find((time) => time > current + 0.01) ?? duration;
  return [...ordered].reverse().find((time) => time < current - 0.01) ?? 0;
}

export function millisecondsAsFrames(milliseconds: number, fps: 30 | 60) {
  return `${cleanPrecision((milliseconds / 1000) * fps)}f @ ${fps} FPS`;
}

interface ParsedPhase {
  start: number;
  end: number | null;
  descriptions: string[];
}

const normalizeDescription = (value: string) =>
  value
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function parseTimingPlan(notes: string): TimingMarkerDraft[] {
  const phases: ParsedPhase[] = [];
  let active: ParsedPhase | null = null;
  const finishActive = () => {
    if (!active) return;
    phases.push(active);
    active = null;
  };

  for (const rawLine of notes.replace(/\r/g, "").split("\n")) {
    const line = rawLine.replace(/&#x20;|&nbsp;/gi, " ").trim();
    if (!line) continue;
    const match = line.match(
      /^(\d+(?:\.\d+)?)\s*(?:[-–—]\s*(\d+(?:\.\d+)?)\s*)?ms\b\s*[:\-–—]?\s*(.*)$/i,
    );
    if (match) {
      finishActive();
      active = {
        start: clamp(Number(match[1]), 0, 30_000),
        end: match[2] ? clamp(Number(match[2]), 0, 30_000) : null,
        descriptions: normalizeDescription(match[3])
          ? [normalizeDescription(match[3])]
          : [],
      };
      continue;
    }
    if (active) {
      const description = normalizeDescription(line);
      if (description) active.descriptions.push(description);
    }
  }
  finishActive();

  const byTime = new Map<number, string[]>();
  const add = (time: number, label: string) => {
    const labels = byTime.get(time) ?? [];
    if (!labels.includes(label)) labels.push(label);
    byTime.set(time, labels);
  };
  for (const phase of phases) {
    const description =
      phase.descriptions.join(" · ") ||
      (phase.end === null ? "Timing marker" : "Phase");
    if (phase.end === null) {
      add(phase.start, description);
      continue;
    }
    const start = Math.min(phase.start, phase.end);
    const end = Math.max(phase.start, phase.end);
    add(start, `${description} starts`);
    add(end, `${description} ends`);
  }
  return [...byTime.entries()]
    .sort(([left], [right]) => left - right)
    .slice(0, 60)
    .map(([time, labels]) => ({
      time,
      label: labels.join(" · ").slice(0, 120),
    }));
}
