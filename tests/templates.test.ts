import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import {
  createTemplateFromProject,
  deserializeTemplatePack,
  insertTemplateIntoProject,
  serializeTemplate,
  serializeTemplatePack,
  validateTemplate,
} from "../src/vfx/templates";
import { TINY_WEBP_DATA_URL, validPngDataUrl } from "./fixtures/portableImages";

describe("reusable effect templates", () => {
  it("reconciles and preserves rendering-effect clips in templates", () => {
    const source = createEmptyProject("Timed template glow");
    const layer = createLayer("animated", "Glow", "builtin-ring");
    layer.appearance.effects.outerGlow.enabled = true;
    layer.appearance.effectClips = [];
    source.layers = [layer];

    const template = createTemplateFromProject(source);
    expect(template.layers[0].appearance.effectClips).toMatchObject([
      { effect: "outerGlow", start: 0, end: 1 },
    ]);

    const destination = createEmptyProject("Destination");
    const inserted = insertTemplateIntoProject(destination, template);
    expect(inserted.project.layers[0].appearance.effectClips).toMatchObject([
      { effect: "outerGlow", start: 0, end: 1 },
    ]);
  });

  it("copies the complete effect and only the images its layers use", () => {
    const project = createEmptyProject("Blue impact");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    project.layers.push(createLayer("burst", "Sparks", "builtin-spark"));
    project.preview.duration = 1840;

    const template = createTemplateFromProject(
      project,
      "Enemy hit",
      "A short blue impact",
    );

    expect(template.layers).toHaveLength(2);
    expect(template.assets.map((asset) => asset.id)).toEqual([
      "builtin-flash",
      "builtin-spark",
    ]);
    expect(template.formatVersion).toBe(2);
    expect(template.projectFormatVersion).toBe(18);
    expect(template.scope).toBe("effect");
    expect(template.timelineAnchor).toBe(0);
    expect(template.duration).toBe(900);
    expect(template.description).toBe("A short blue impact");

    const restored = deserializeTemplatePack(serializeTemplatePack([template]));
    expect(restored.ok).toBe(true);
    expect(restored.pack?.templates[0].name).toBe("Enemy hit");
  });

  it("inserts a fresh, undoable copy without replacing existing layers", () => {
    const source = createEmptyProject("Grouped flare");
    const group = createGroup("Flare core");
    group.x = 30;
    const parent = createLayer("animated", "Core", "builtin-flash");
    const child = createLayer("animated", "Ring", "builtin-ring");
    parent.groupId = group.id;
    child.groupId = group.id;
    child.parentId = parent.id;
    child.solo = true;
    source.groups.push(group);
    source.layers.push(parent, child);
    source.preview.duration = 4200;
    const template = createTemplateFromProject(source);

    const target = createEmptyProject("Boss effect");
    const existing = createLayer("burst", "Existing sparks", "builtin-spark");
    target.layers.push(existing);
    const result = insertTemplateIntoProject(target, template);

    expect(result.project.layers).toHaveLength(3);
    expect(result.project.layers[0].id).toBe(existing.id);
    expect(result.insertedLayerIds).toHaveLength(2);
    expect(result.insertedLayerIds).not.toContain(parent.id);
    expect(result.project.layers[2].parentId).toBe(result.project.layers[1].id);
    expect(result.project.groups).toHaveLength(1);
    expect(result.project.groups[0]).toMatchObject({
      name: "Flare core",
      x: 30,
    });
    expect(result.project.groups[0].id).not.toBe(group.id);
    expect(result.project.layers[1].groupId).toBe(result.project.groups[0].id);
    expect(result.project.layers[2].groupId).toBe(result.project.groups[0].id);
    expect(result.project.layers[2].solo).toBe(false);
    expect(result.project.preview.duration).toBe(3000);
    expect(
      result.project.assets.filter((asset) => asset.id === "builtin-flash"),
    ).toHaveLength(1);
  });

  it("remaps a colliding uploaded-image id when its contents differ", () => {
    const source = createEmptyProject("New flame");
    source.assets.push({
      id: "uploaded-flame",
      name: "New flame strip",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(128, 32),
      width: 128,
      height: 32,
      transparency: "yes",
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
    });
    source.layers.push(createLayer("animated", "New flame", "uploaded-flame"));
    const template = createTemplateFromProject(source);

    const target = createEmptyProject("Existing flame");
    target.assets.push({
      id: "uploaded-flame",
      name: "Old flame",
      mimeType: "image/webp",
      dataUrl: TINY_WEBP_DATA_URL,
      width: 1,
      height: 1,
      transparency: "yes",
    });
    const result = insertTemplateIntoProject(target, template);
    const inserted = result.project.layers.at(-1);

    expect(inserted?.assetId).not.toBe("uploaded-flame");
    expect(
      result.project.assets.find((asset) => asset.id === inserted?.assetId)
        ?.dataUrl,
    ).toBe(source.assets.at(-1)?.dataUrl);
    expect(
      result.project.assets.find((asset) => asset.id === "uploaded-flame")
        ?.dataUrl,
    ).toBe(TINY_WEBP_DATA_URL);
  });

  it("keeps templates saved before effect groups compatible", () => {
    const project = createEmptyProject("Legacy template");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    const legacy = createTemplateFromProject(project) as unknown as Record<
      string,
      unknown
    >;
    legacy.formatVersion = 1;
    delete legacy.projectFormatVersion;
    delete legacy.scope;
    delete legacy.timelineAnchor;
    delete legacy.groups;

    const result = deserializeTemplatePack(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    expect(result.pack?.templates[0].formatVersion).toBe(2);
    expect(result.pack?.templates[0].projectFormatVersion).toBe(18);
    expect(result.pack?.templates[0].groups).toEqual([]);
    expect(result.pack?.templates[0].layers[0].groupId).toBeNull();
  });

  it("rejects templates whose layers refer to a missing uploaded image", () => {
    const project = createEmptyProject("Broken template");
    project.layers.push(createLayer("animated", "Missing", "not-in-pack"));
    expect(() => createTemplateFromProject(project)).toThrow(
      "One or more template layers refer to a missing image.",
    );
  });

  it("exports one raw template and accepts it through the shared importer", () => {
    const project = createEmptyProject("Solo ring");
    project.layers.push(createLayer("animated", "Ring", "builtin-ring"));
    const template = createTemplateFromProject(project);

    const raw = JSON.parse(serializeTemplate(template)) as Record<
      string,
      unknown
    >;
    expect(raw.format).toBe("vvfx-template");
    expect(raw.formatVersion).toBe(2);
    expect(raw).not.toHaveProperty("templates");
    expect(
      deserializeTemplatePack(JSON.stringify(raw)).pack?.templates,
    ).toHaveLength(1);
  });

  it("anchors a scoped Timeline layer at the destination playhead", () => {
    const source = createEmptyProject("Late ring");
    const ring = createLayer("animated", "Late ring", "builtin-ring");
    ring.timing = { ...ring.timing, delay: 2200, duration: 420 };
    source.layers.push(ring);
    source.preview.duration = 8000;

    const component = createTemplateFromProject(
      source,
      "Ring component",
      "",
      [ring.id],
      "layer",
    );
    expect(component.timelineAnchor).toBe(2200);
    expect(component.duration).toBe(420);

    const inserted = insertTemplateIntoProject(
      createEmptyProject("Destination"),
      component,
      350,
    );
    expect(inserted.project.layers[0].timing.delay).toBe(350);
  });

  it("keeps effect leading silence and Triggered timing relative", () => {
    const source = createEmptyProject("Delayed pair");
    const timeline = createLayer("animated", "Timeline", "builtin-ring");
    timeline.timing.delay = 600;
    const triggered = createLayer("animated", "Triggered", "builtin-flash");
    triggered.startMode = "triggered";
    triggered.timing.delay = 75;
    source.layers.push(timeline, triggered);

    const effect = createTemplateFromProject(source);
    expect(effect.timelineAnchor).toBe(0);
    const inserted = insertTemplateIntoProject(
      createEmptyProject("Destination"),
      effect,
      400,
    );
    expect(inserted.project.layers[0].timing.delay).toBe(1000);
    expect(inserted.project.layers[1].timing.delay).toBe(75);
  });

  it("refuses to serialize a template after its embedded image is damaged", () => {
    const project = createEmptyProject("Outbound image guard");
    project.assets.push({
      id: "uploaded-image",
      name: "Uploaded image",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(1, 1),
      transparency: "yes",
      width: 1,
      height: 1,
      spriteSheet: null,
      atlasFrame: null,
      alphaMask: null,
    });
    project.layers.push(
      createLayer("animated", "Uploaded image", "uploaded-image"),
    );
    const damaged = structuredClone(createTemplateFromProject(project));
    const uploaded = damaged.assets.find(
      (asset) => asset.id === "uploaded-image",
    );
    if (!uploaded) throw new Error("Missing uploaded template fixture");
    uploaded.dataUrl = "data:image/png;base64,AAAA";

    expect(() => serializeTemplate(damaged)).toThrow(/image/i);
  });

  it("rejects future project formats, duplicate pack IDs, and remote images", () => {
    const project = createEmptyProject("Safe template");
    project.layers.push(createLayer("animated", "Ring", "builtin-ring"));
    const template = createTemplateFromProject(project);
    const future = { ...template, projectFormatVersion: 999 };
    expect(validateTemplate(future).error).toMatch(
      /newer Vvfx project format/i,
    );

    expect(
      deserializeTemplatePack(
        JSON.stringify({
          format: "vvfx-template-pack",
          formatVersion: 2,
          templates: [template, template],
        }),
      ).error,
    ).toMatch(/identifier.*more than once/i);

    const uploadedProject = createEmptyProject("Remote image");
    uploadedProject.assets.push({
      id: "remote",
      name: "Remote",
      mimeType: "image/png",
      dataUrl: "https://example.com/private.png",
    });
    uploadedProject.layers.push(createLayer("animated", "Remote", "remote"));
    expect(() => createTemplateFromProject(uploadedProject)).toThrow(
      /embedded PNG or WebP data/i,
    );
  });
});
