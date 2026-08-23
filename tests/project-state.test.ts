import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import {
  activeTimelineEnd,
  copyProject,
  hasMeaningfulProjectWork,
  newLayerName,
  projectFingerprint,
} from "../src/vfx/projectState";

describe("project safety helpers", () => {
  it("ignores save timestamps while detecting meaningful edits", () => {
    const project = createEmptyProject();
    const original = projectFingerprint(project);
    project.metadata.updatedAt = new Date(Date.now() + 5000).toISOString();
    expect(projectFingerprint(project)).toBe(original);

    project.layers.push(createLayer("animated", "Moving ring"));
    expect(projectFingerprint(project)).not.toBe(original);
    expect(hasMeaningfulProjectWork(project)).toBe(true);
  });

  it("protects a timing brief before the first visual layer is added", () => {
    const project = createEmptyProject();
    project.timeline.notes = "0–40 ms impact flash";
    expect(hasMeaningfulProjectWork(project)).toBe(true);
  });

  it("does not mark preview workspace preferences as authoring edits", () => {
    const project = createEmptyProject("Workspace test");
    const original = projectFingerprint(project);
    project.preview.zoom = 2;
    project.preview.background = "white";
    project.preview.showGrid = true;
    project.preview.loop = false;
    expect(projectFingerprint(project)).toBe(original);

    project.preview.randomSeed += 1;
    expect(projectFingerprint(project)).not.toBe(original);
  });

  it("creates an independent project copy with fresh identity", () => {
    const project = createEmptyProject("Shockwave");
    project.layers.push(createLayer("animated", "Ring"));
    const copy = copyProject(project, "Shockwave variation");

    expect(copy.metadata.id).not.toBe(project.metadata.id);
    expect(copy.metadata.name).toBe("Shockwave variation");
    expect(copy.layers).toEqual(project.layers);
    expect(copy.layers).not.toBe(project.layers);
  });

  it("names asset-created layers after the current asset name", () => {
    const project = createEmptyProject();
    const ring = project.assets.find((asset) => asset.id === "builtin-ring");
    expect(ring).toBeDefined();

    ring!.name = "My energy ring";
    expect(newLayerName(project.assets, ring!.id, "asset")).toBe(
      "My energy ring",
    );
  });

  it("calls manual layers unnamed and safely falls back for missing assets", () => {
    const project = createEmptyProject();

    expect(newLayerName(project.assets, "builtin-ring", "manual")).toBe(
      "Unnamed",
    );
    expect(newLayerName(project.assets, "missing-asset", "asset")).toBe(
      "Unnamed",
    );
  });

  it("finds the end of the visible active timeline for preview looping", () => {
    const project = createEmptyProject();
    const flash = createLayer("animated", "Flash");
    flash.timing = { ...flash.timing, delay: 100, duration: 400, repeat: 1 };
    const smoke = createLayer("animated", "Smoke");
    smoke.timing = { ...smoke.timing, delay: 200, duration: 1000 };
    project.layers.push(flash, smoke);

    expect(activeTimelineEnd(project)).toBe(1200);
    smoke.enabled = false;
    expect(activeTimelineEnd(project)).toBe(900);
    flash.trail = {
      enabled: true,
      count: 3,
      spacing: 50,
      lifetime: 400,
      opacity: 0.5,
      scaleFalloff: 0.05,
    };
    expect(activeTimelineEnd(project)).toBe(1050);
    flash.visible = false;
    expect(activeTimelineEnd(project)).toBe(project.preview.duration);
  });

  it("includes shared group timing in the active preview range", () => {
    const project = createEmptyProject();
    const group = createGroup("Delayed impact");
    group.delay = 400;
    const layer = createLayer("animated", "Flash");
    layer.groupId = group.id;
    layer.timing.delay = 100;
    layer.timing.duration = 600;
    project.groups.push(group);
    project.layers.push(layer);

    expect(activeTimelineEnd(project)).toBe(1100);
  });
});
