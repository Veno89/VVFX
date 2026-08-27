import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { insertKeyframeAt } from "../src/vfx/keyframes";
import { validateProject } from "../src/vfx/serialization";
import {
  millisecondsAsFrames,
  nextMarkerTime,
  parseTimingPlan,
  snapTimelineTime,
} from "../src/vfx/timelineTiming";
import type { TimelineMarker } from "../src/vfx/types";

const markers: TimelineMarker[] = [
  { id: "impact", time: 40, label: "Expansion peak" },
  { id: "settle", time: 250, label: "Splatter settled" },
];

describe("timeline precision helpers", () => {
  it("supports exact millisecond, frame, marker, and bypass snapping", () => {
    expect(
      snapTimelineTime({ value: 43.2, mode: "5", markers, duration: 1000 }),
    ).toBe(45);
    expect(
      snapTimelineTime({
        value: 34,
        mode: "30fps",
        markers,
        duration: 1000,
      }),
    ).toBe(33.33);
    expect(
      snapTimelineTime({
        value: 43,
        mode: "markers",
        markers,
        duration: 1000,
      }),
    ).toBe(40);
    expect(
      snapTimelineTime({
        value: 43.2,
        mode: "10",
        markers,
        duration: 1000,
        bypass: true,
      }),
    ).toBe(43.2);
  });

  it("jumps to the next choreography marker and reports secondary frames", () => {
    expect(nextMarkerTime(40, 1, markers, 1000)).toBe(250);
    expect(nextMarkerTime(250, -1, markers, 1000)).toBe(40);
    expect(millisecondsAsFrames(250, 60)).toBe("15f @ 60 FPS");
  });

  it("turns a pasted timing brief and continuation lines into milestones", () => {
    const result = parseTimingPlan(`
0 ms CRIT happens
0–40 ms flash expands
  blood splatter expands
40–120 ms ring vanishes
120–250 ms splatter settles
250–700 ms blood fades
`);

    expect(result.map((marker) => marker.time)).toEqual([0, 40, 120, 250, 700]);
    expect(result[0].label).toContain("CRIT happens");
    expect(result[0].label).toContain("blood splatter expands starts");
    expect(result[2].label).toContain("ring vanishes ends");
  });

  it("adds an exported property keyframe at an exact playhead moment", () => {
    const layer = createLayer("animated", "Splatter");
    const result = insertKeyframeAt(layer.keyframes, layer.transform, 0.4);

    expect(result.enabled).toBe(true);
    expect(result.initialized).toBe(true);
    expect(result.frames.map((frame) => frame.time)).toEqual([0, 0.4, 1]);
  });

  it("migrates v9 projects and safely normalizes saved timing notes", () => {
    const project = createEmptyProject() as unknown as Record<string, unknown>;
    project.formatVersion = 9;
    delete project.timeline;
    const migrated = validateProject(project);
    expect(migrated.project?.formatVersion).toBe(17);
    expect(migrated.project?.timeline).toEqual({ markers: [], notes: "" });

    const current = createEmptyProject() as unknown as Record<string, unknown>;
    // Duplicate markers were historically repaired; current v17 files reject
    // them so collision evidence is never silently discarded.
    current.formatVersion = 16;
    current.timeline = {
      notes: "Critical hit timing",
      markers: [
        { id: "impact", time: -20, label: "Impact" },
        { id: "impact", time: 99_000, label: "Duplicate" },
        { id: "fade", time: 700, label: "Fade complete" },
      ],
    };
    const normalized = validateProject(current);
    expect(normalized.project?.timeline).toEqual({
      notes: "Critical hit timing",
      markers: [
        { id: "impact", time: 0, label: "Impact" },
        { id: "fade", time: 700, label: "Fade complete" },
      ],
    });
  });
});
