import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import {
  fitPreviewZoom,
  PREVIEW_MAX_ZOOM,
  PREVIEW_MIN_ZOOM,
} from "../src/vfx/previewFit";

describe("fit preview zoom", () => {
  it("keeps 100% when nothing is visible", () => {
    expect(fitPreviewZoom(createEmptyProject(), 800, 480)).toBe(1);
  });

  it("zooms out for effects that travel beyond the viewport", () => {
    const project = createEmptyProject();
    const layer = createLayer("animated", "Wide", "builtin-flash");
    layer.transform.movementX = 900;
    project.layers.push(layer);
    const zoom = fitPreviewZoom(project, 800, 480);
    expect(zoom).toBeLessThan(1);
    expect(zoom).toBeGreaterThanOrEqual(PREVIEW_MIN_ZOOM);
    expect(Math.round(zoom * 20)).toBe(zoom * 20);
  });

  it("zooms in on small effects up to the editor limit", () => {
    const project = createEmptyProject();
    const layer = createLayer("animated", "Speck", "builtin-flash");
    layer.transform.startScale = 0.05;
    layer.transform.endScale = 0.05;
    project.layers.push(layer);
    expect(fitPreviewZoom(project, 800, 480)).toBe(PREVIEW_MAX_ZOOM);
  });
});
