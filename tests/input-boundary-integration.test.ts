import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createGroup,
  createLayer,
  makeId,
} from "../src/vfx/defaults";
import {
  MAX_ATTACHMENT_DEPTH,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_GROUPS,
  MAX_PROJECT_LAYERS,
  MAX_TIMELINE_MARKERS,
  isSafeVfxId,
} from "../src/vfx/inputLimits";
import { serializeProject, validateProject } from "../src/vfx/serialization";
import {
  createTemplateFromProject,
  serializeTemplate,
} from "../src/vfx/templates";
import type { VfxAsset } from "../src/vfx/types";
import {
  pngWithDimensions,
  portableImageDataUrl,
  TINY_PNG_DATA_URL,
  TINY_WEBP_DATA_URL,
} from "./fixtures/portableImages";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function uploadedAsset(
  id: string,
  dataUrl = TINY_PNG_DATA_URL,
  width = 1,
  height = 1,
): VfxAsset {
  return {
    id,
    name: id,
    mimeType: "image/png",
    dataUrl,
    transparency: "unknown",
    width,
    height,
    spriteSheet: null,
    atlasFrame: null,
    alphaMask: null,
  };
}

describe("project input boundaries", () => {
  it("rejects oversized root and nested collections before normalization", () => {
    const project = createEmptyProject("Limits");
    expect(
      validateProject({
        ...project,
        layers: Array.from({ length: MAX_PROJECT_LAYERS + 1 }, () => null),
      }).error,
    ).toMatch(/limited.*layers/i);
    expect(
      validateProject({
        ...project,
        assets: Array.from({ length: MAX_PROJECT_ASSETS + 1 }, () => null),
      }).error,
    ).toMatch(/limited.*images/i);
    expect(
      validateProject({
        ...project,
        groups: Array.from({ length: MAX_PROJECT_GROUPS + 1 }, () => null),
      }).error,
    ).toMatch(/limited.*groups/i);
    expect(
      validateProject({
        ...project,
        timeline: {
          markers: Array.from({ length: MAX_TIMELINE_MARKERS + 1 }, () => null),
          notes: "",
        },
      }).error,
    ).toMatch(/limited.*markers/i);

    const layer = createLayer("animated", "Too many moments", "builtin-ring");
    layer.keyframes.frames = Array.from({ length: 9 }, (_, index) => ({
      time: index / 8,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      rotation: 0,
    }));
    expect(validateProject({ ...project, layers: [layer] }).error).toMatch(
      /keyframe.*more than/i,
    );
  });

  it("rejects prototype-reserved IDs, duplicate current IDs, and spoofed built-ins", () => {
    const project = createEmptyProject("Identifiers");
    expect(
      validateProject({
        ...project,
        metadata: { ...project.metadata, id: "__proto__" },
      }).error,
    ).toMatch(/identifier.*safe/i);

    const group = createGroup("Group");
    expect(
      validateProject({
        ...project,
        groups: [group, clone(group)],
      }).error,
    ).toMatch(/groups share/i);

    const marker = { id: "marker-impact", time: 10, label: "Impact" };
    expect(
      validateProject({
        ...project,
        timeline: { markers: [marker, clone(marker)], notes: "" },
      }).error,
    ).toMatch(/markers share/i);

    const altered = clone(project);
    altered.assets[0].dataUrl = "builtin:cloud";
    expect(validateProject(altered).error).toMatch(/built-in.*altered/i);
  });

  it("requires MIME-matched portable images and enforces aggregate decoded pixels", () => {
    const project = createEmptyProject("Images");
    expect(
      validateProject({
        ...project,
        assets: [
          ...project.assets,
          uploadedAsset("wrong-mime", TINY_WEBP_DATA_URL),
        ],
      }).error,
    ).toMatch(/canonical|could not be imported/i);

    const width = 4096;
    const height = 2048;
    const largeHeader = portableImageDataUrl(
      "image/png",
      pngWithDimensions(width, height),
    );
    const largeAssets = Array.from({ length: 5 }, (_, index) =>
      uploadedAsset(`large-${index}`, largeHeader, width, height),
    );
    expect(
      validateProject({
        ...project,
        assets: [...project.assets, ...largeAssets],
      }).error,
    ).toMatch(/decoded-pixel budget/i);
  });

  it("rejects attachment chains deeper than the shared limit", () => {
    const project = createEmptyProject("Attachments");
    const layers = Array.from(
      { length: MAX_ATTACHMENT_DEPTH + 2 },
      (_, index) =>
        createLayer("animated", `Layer ${index + 1}`, "builtin-ring"),
    );
    for (let index = 1; index < layers.length; index += 1)
      layers[index].parentId = layers[index - 1].id;
    expect(
      validateProject({
        ...project,
        layers: layers.slice(0, MAX_ATTACHMENT_DEPTH + 1),
      }).ok,
    ).toBe(true);
    expect(validateProject({ ...project, layers }).error).toMatch(
      /attachment.*deeper/i,
    );
  });

  it("refuses invalid outbound projects and templates", () => {
    const project = createEmptyProject("Outbound");
    project.metadata.id = "constructor";
    expect(() => serializeProject(project)).toThrow(/cannot be exported/i);

    const templateProject = createEmptyProject("Template");
    templateProject.layers.push(
      createLayer("animated", "Ring", "builtin-ring"),
    );
    const template = createTemplateFromProject(templateProject);
    template.id = "prototype";
    expect(() => serializeTemplate(template)).toThrow(/identifier|missing/i);
  });

  it("generates bounded, safe, collision-free authoring IDs", () => {
    const ids = Array.from({ length: 100 }, () => makeId("layer"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isSafeVfxId)).toBe(true);
  });
});
