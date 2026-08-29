import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import {
  analyzeExportPreflight,
  EXPORT_PREFLIGHT_PROFILES,
} from "../src/vfx/exportPreflight";

describe("export preflight profiles", () => {
  it("blocks an empty export and exposes stable target profiles", () => {
    const report = analyzeExportPreflight(createEmptyProject(), "balanced");
    expect(EXPORT_PREFLIGHT_PROFILES.map((profile) => profile.id)).toEqual([
      "mobile",
      "balanced",
      "showcase",
    ]);
    expect(report.status).toBe("error");
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "content", severity: "error" }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "placement",
        severity: "pass",
        label: "Point placement only",
      }),
    );
  });

  it("warns for a mobile-heavy effect without blocking a valid export", () => {
    const project = createEmptyProject("Heavy mobile effect");
    const burst = createLayer("burst", "Heavy burst", "builtin-spark");
    burst.spawn.count = 250;
    burst.trail.enabled = true;
    burst.trail.count = 8;
    project.layers.push(burst);

    const report = analyzeExportPreflight(project, "mobile");

    expect(report.status).toBe("warning");
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "sprites", severity: "warning" }),
    );
  });

  it("reports endpoint capability only when the export contains a Beam layer", () => {
    const project = createEmptyProject("Endpoint effect");
    project.layers.push(createLayer("beam", "Bolt", "builtin-spark"));

    const report = analyzeExportPreflight(project, "balanced");

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "placement",
        severity: "pass",
        label: "Point + endpoint placement",
        detail: expect.stringMatching(/1 Beam layer/),
      }),
    );
  });
});
