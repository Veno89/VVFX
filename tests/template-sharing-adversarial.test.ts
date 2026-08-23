import { describe, expect, it } from "vitest";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  saveTemplates,
} from "../src/persistence/templates";
import { openDatabase, TEMPLATE_STORE } from "../src/persistence/database";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import { COMPOSITION_PRESETS } from "../src/vfx/presets";
import {
  MAX_TEMPLATE_ASSETS,
  MAX_TEMPLATE_GROUPS,
  MAX_TEMPLATE_LAYERS,
  MAX_TEMPLATES_PER_PACK,
  analyzeTemplateSelection,
  createTemplateFromProject,
  deserializeTemplatePack,
  insertTemplateIntoProject,
  serializeTemplate,
  validateTemplate,
  type VfxTemplate,
} from "../src/vfx/templates";
import type { VfxAsset } from "../src/vfx/types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function oneLayerTemplate(name: string): VfxTemplate {
  const project = createEmptyProject(name);
  project.layers = [createLayer("animated", `${name} layer`, "builtin-ring")];
  return createTemplateFromProject(project, name);
}

async function putRawTemplateRecord(record: Record<string, unknown>) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TEMPLATE_STORE, "readwrite");
    transaction.objectStore(TEMPLATE_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

describe("portable template format v2", () => {
  it("accepts a raw single-template document without requiring a pack wrapper", () => {
    const template = oneLayerTemplate("Raw single");
    const result = deserializeTemplatePack(serializeTemplate(template));

    expect(result.ok).toBe(true);
    expect(result.pack).toMatchObject({
      format: "vvfx-template-pack",
      formatVersion: 2,
    });
    expect(result.pack?.templates).toHaveLength(1);
    expect(result.pack?.templates[0]).toMatchObject({
      format: "vvfx-template",
      formatVersion: 2,
      projectFormatVersion: 16,
      id: template.id,
      scope: "effect",
      timelineAnchor: 0,
    });
  });

  it("migrates v1 safely and rejects future template, pack, and project versions", () => {
    const current = oneLayerTemplate("Legacy single");
    const legacy = clone(current) as unknown as Record<string, unknown>;
    legacy.formatVersion = 1;
    delete legacy.projectFormatVersion;
    delete legacy.scope;
    delete legacy.timelineAnchor;
    delete legacy.groups;

    const migrated = deserializeTemplatePack(JSON.stringify(legacy));
    expect(migrated.ok).toBe(true);
    expect(migrated.pack?.templates[0]).toMatchObject({
      formatVersion: 2,
      projectFormatVersion: 16,
      scope: "effect",
      timelineAnchor: 0,
      groups: [],
    });

    expect(
      deserializeTemplatePack(JSON.stringify({ ...current, formatVersion: 3 })),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not supported/i),
    });
    expect(
      deserializeTemplatePack(
        JSON.stringify({ ...current, projectFormatVersion: 17 }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/newer/i) });
    expect(
      deserializeTemplatePack(
        JSON.stringify({
          format: "vvfx-template-pack",
          formatVersion: 3,
          exportedAt: new Date().toISOString(),
          templates: [current],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not supported/i),
    });
  });

  it("rejects dependency collections and packs above their explicit caps", () => {
    const template = oneLayerTemplate("Bounded template");
    const tooManyLayers = clone(template);
    tooManyLayers.layers = Array.from(
      { length: MAX_TEMPLATE_LAYERS + 1 },
      (_, index) => ({
        ...clone(template.layers[0]),
        id: `layer-limit-${index}`,
      }),
    );
    expect(validateTemplate(tooManyLayers).error).toMatch(
      /more than 250 layers/i,
    );

    const tooManyAssets = clone(template);
    tooManyAssets.assets = Array.from(
      { length: MAX_TEMPLATE_ASSETS + 1 },
      (_, index) => ({
        ...clone(template.assets[0]),
        id: `asset-limit-${index}`,
      }),
    );
    expect(validateTemplate(tooManyAssets).error).toMatch(
      /more than 100 images/i,
    );

    const tooManyGroups = clone(template);
    tooManyGroups.groups = Array.from(
      { length: MAX_TEMPLATE_GROUPS + 1 },
      (_, index) => ({
        id: `group-limit-${index}`,
        name: `Group ${index}`,
        x: 0,
        y: 0,
        delay: 0,
      }),
    );
    expect(validateTemplate(tooManyGroups).error).toMatch(
      /more than 100 groups/i,
    );

    const oversizedPack = {
      format: "vvfx-template-pack",
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      templates: Array.from(
        { length: MAX_TEMPLATES_PER_PACK + 1 },
        (_, index) => ({ ...template, id: `template-limit-${index}` }),
      ),
    };
    expect(
      deserializeTemplatePack(JSON.stringify(oversizedPack)).error,
    ).toMatch(/more than the supported 100 templates/i);
  });
});

describe("scoped template dependencies and timing anchors", () => {
  it("prunes outside attachments/events while retaining visual and mask-only assets", () => {
    const project = createEmptyProject("Scoped dependencies");
    const visual: VfxAsset = {
      id: "template-visual",
      name: "Portable visual",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
      transparency: "yes",
      spriteSheet: null,
      atlasFrame: null,
      alphaMask: null,
    };
    const mask: VfxAsset = {
      ...visual,
      id: "template-mask",
      name: "Portable mask",
      alphaMask: { columns: 2, rows: 1, alpha: [0, 255] },
    };
    const unused: VfxAsset = {
      ...visual,
      id: "template-unused",
      name: "Unused image",
    };
    const group = createGroup("Selected component");
    const outsideParent = createLayer(
      "animated",
      "Outside parent",
      "builtin-ring",
    );
    const outsideTarget = createLayer(
      "animated",
      "Outside target",
      "builtin-flash",
    );
    const selected = createLayer("burst", "Selected burst", visual.id);
    selected.groupId = group.id;
    selected.parentId = outsideParent.id;
    selected.spawn.shape = "mask";
    selected.spawn.maskAssetId = mask.id;
    selected.events = [
      {
        id: "outside-event",
        enabled: true,
        trigger: "finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: outsideTarget.id,
        chance: 1,
        maxTriggers: 32,
      },
    ];
    project.assets.push(visual, mask, unused);
    project.groups.push(group);
    project.layers.push(outsideParent, outsideTarget, selected);

    const summary = analyzeTemplateSelection(project, [selected.id], "layer");
    expect(summary).toMatchObject({
      layerCount: 1,
      groupCount: 1,
      assetCount: 2,
      uploadedAssetCount: 2,
      omittedParentLinks: 1,
      omittedEventLinks: 1,
    });

    const template = createTemplateFromProject(
      project,
      "Portable component",
      "",
      [selected.id],
      "layer",
    );
    expect(template.assets.map((asset) => asset.id).sort()).toEqual([
      mask.id,
      visual.id,
    ]);
    expect(template.groups.map((candidate) => candidate.id)).toEqual([
      group.id,
    ]);
    expect(template.layers[0]).toMatchObject({ parentId: null, events: [] });
    expect(selected.parentId).toBe(outsideParent.id);
    expect(selected.events).toHaveLength(1);
  });

  it("anchors group-scoped Timeline layers while preserving Triggered timing", () => {
    const source = createEmptyProject("Timed component");
    const group = createGroup("Mixed starts");
    group.delay = 600;
    const first = createLayer("animated", "First", "builtin-ring");
    first.groupId = group.id;
    first.timing.delay = 150;
    first.timing.duration = 200;
    const second = createLayer("animated", "Second", "builtin-flash");
    second.groupId = group.id;
    second.timing.delay = 350;
    const triggered = createLayer("animated", "Triggered", "builtin-flash");
    triggered.groupId = group.id;
    triggered.startMode = "triggered";
    triggered.timing.delay = 40;
    first.events = [
      {
        id: "play-triggered",
        enabled: true,
        trigger: "finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: triggered.id,
        chance: 1,
        maxTriggers: 32,
      },
    ];
    source.groups = [group];
    source.layers = [first, second, triggered];
    const template = createTemplateFromProject(
      source,
      "Timed group",
      "",
      source.layers.map((layer) => layer.id),
      "group",
    );

    expect(template.timelineAnchor).toBe(750);
    const later = insertTemplateIntoProject(
      createEmptyProject("Later destination"),
      template,
      2_000,
    );
    const [laterFirst, laterSecond, laterTriggered] = later.project.layers;
    expect(later.project.groups[0].delay + laterFirst.timing.delay).toBe(2_000);
    expect(later.project.groups[0].delay + laterSecond.timing.delay).toBe(
      2_200,
    );
    expect(later.project.groups[0].delay).toBe(600);
    expect(laterTriggered.timing.delay).toBe(40);
    expect(laterFirst.events[0].targetLayerId).toBe(laterTriggered.id);

    const earlier = insertTemplateIntoProject(
      createEmptyProject("Earlier destination"),
      template,
      100,
    );
    const [earlierFirst, earlierSecond, earlierTriggered] =
      earlier.project.layers;
    expect(earlier.project.groups[0].delay + earlierFirst.timing.delay).toBe(
      100,
    );
    expect(earlier.project.groups[0].delay + earlierSecond.timing.delay).toBe(
      300,
    );
    expect(
      earlier.project.groups[0].delay + earlierTriggered.timing.delay,
    ).toBe(group.delay + triggered.timing.delay);

    const wholeEffect = createTemplateFromProject(
      source,
      "Whole effect",
      "",
      undefined,
      "effect",
    );
    expect(wholeEffect.timelineAnchor).toBe(0);
    const withLeadingSilence = insertTemplateIntoProject(
      createEmptyProject("Effect destination"),
      wholeEffect,
      2_000,
    );
    expect(
      withLeadingSilence.project.groups[0].delay +
        withLeadingSilence.project.layers[0].timing.delay,
    ).toBe(2_750);
  });

  it("inserts a built-in composition at the playhead with fresh editable IDs", () => {
    const preset = COMPOSITION_PRESETS.find(
      (candidate) => candidate.id === "critical-hit",
    );
    if (!preset) throw new Error("Missing built-in critical-hit composition");
    const source = createEmptyProject(preset.name);
    source.layers = preset.create();
    const template = createTemplateFromProject(
      source,
      preset.name,
      preset.description,
      undefined,
      "effect",
    );
    const destination = createEmptyProject("Destination");
    destination.preview.duration = 500;
    const existing = createLayer("animated", "Existing", "builtin-ring");
    destination.layers = [existing];
    const playhead = 1_234;

    const inserted = insertTemplateIntoProject(destination, template, playhead);
    const copies = inserted.project.layers.slice(1);
    expect(inserted.project.layers[0]).toEqual(existing);
    expect(copies.map((layer) => layer.timing.delay)).toEqual(
      source.layers.map((layer) => layer.timing.delay + playhead),
    );
    expect(inserted.insertedLayerIds).toEqual(copies.map((layer) => layer.id));
    expect(inserted.insertedLayerIds).not.toEqual(
      source.layers.map((layer) => layer.id),
    );
    expect(inserted.project.preview.duration).toBe(
      playhead + template.duration,
    );
  });

  it("keeps the built-in spark-to-smoke event exact when inserted away from zero", () => {
    const preset = COMPOSITION_PRESETS.find(
      (candidate) => candidate.id === "spark-to-smoke-firework",
    );
    if (!preset)
      throw new Error("Missing built-in spark-to-smoke-firework composition");
    const source = createEmptyProject(preset.name);
    source.layers = preset.create();
    expect(source.layers).toHaveLength(2);
    const [sourceSparks, sourceSmoke] = source.layers;
    expect(sourceSparks.type).toBe("burst");
    expect(sourceSparks.events).toHaveLength(1);
    expect(sourceSparks.events[0]).toMatchObject({
      trigger: "copy-finish",
      action: "play",
      targetLayerId: sourceSmoke.id,
      chance: 0.65,
      maxTriggers: 8,
    });
    expect(sourceSmoke).toMatchObject({
      type: "animated",
      startMode: "triggered",
      timing: {
        repeat: 0,
        repeatForever: false,
        loop: false,
      },
    });

    const template = createTemplateFromProject(
      source,
      preset.name,
      preset.description,
      undefined,
      "effect",
    );
    const playhead = 1_875;
    const inserted = insertTemplateIntoProject(
      createEmptyProject("Firework destination"),
      template,
      playhead,
    );
    expect(inserted.insertedLayerIds).toHaveLength(2);
    const [insertedSparks, insertedSmoke] = inserted.project.layers;
    expect(insertedSparks.id).not.toBe(sourceSparks.id);
    expect(insertedSmoke.id).not.toBe(sourceSmoke.id);
    expect(insertedSparks.timing.delay).toBe(
      playhead + sourceSparks.timing.delay,
    );
    expect(insertedSmoke.timing.delay).toBe(sourceSmoke.timing.delay);
    expect(insertedSmoke.startMode).toBe("triggered");
    expect(insertedSparks.events).toHaveLength(1);
    expect(insertedSparks.events[0]).toMatchObject({
      trigger: "copy-finish",
      action: "play",
      targetLayerId: insertedSmoke.id,
      chance: 0.65,
      maxTriggers: 8,
    });
    expect(insertedSparks.events[0].id).not.toBe(sourceSparks.events[0].id);
  });
});

describe("atomic collision-safe template import", () => {
  it("preserves an existing template and imports different same-ID content as a copy", async () => {
    const original = await saveTemplate(oneLayerTemplate("Collision original"));
    const conflicting = {
      ...clone(original),
      name: "Collision incoming",
      description: "Different semantic content",
    };
    let importedId: string | undefined;
    try {
      expect(await saveTemplates([original])).toEqual({
        added: 0,
        alreadyHere: 1,
        importedAsCopy: 0,
      });
      expect(await saveTemplates([conflicting])).toEqual({
        added: 0,
        alreadyHere: 0,
        importedAsCopy: 1,
      });
      const relevant = (await listTemplates()).filter(
        (template) =>
          template.id === original.id ||
          template.name === "Collision incoming (imported)",
      );
      expect(relevant).toHaveLength(2);
      expect(
        relevant.find((template) => template.id === original.id)?.name,
      ).toBe("Collision original");
      const imported = relevant.find((template) => template.id !== original.id);
      expect(imported).toMatchObject({
        name: "Collision incoming (imported)",
        description: "Different semantic content",
      });
      importedId = imported?.id;
    } finally {
      await deleteTemplate(original.id);
      if (importedId) await deleteTemplate(importedId);
    }
  });

  it("keeps the whole import atomic when any candidate is invalid", async () => {
    const valid = oneLayerTemplate("Atomic valid");
    const invalid = {
      ...clone(oneLayerTemplate("Atomic invalid")),
      layers: [],
    } as VfxTemplate;

    await expect(saveTemplates([valid, invalid])).rejects.toThrow();
    expect(
      (await listTemplates()).some((template) => template.id === valid.id),
    ).toBe(false);
  });

  it("remaps around an invalid reserved IndexedDB identifier without overwriting it", async () => {
    const incoming = oneLayerTemplate("Reserved collision");
    await putRawTemplateRecord({
      id: incoming.id,
      format: "damaged-template-record",
      sentinel: "keep-me",
    });
    let importedId: string | undefined;
    try {
      expect(await saveTemplates([incoming])).toEqual({
        added: 0,
        alreadyHere: 0,
        importedAsCopy: 1,
      });
      const imported = (await listTemplates()).find(
        (template) => template.name === "Reserved collision (imported)",
      );
      expect(imported?.id).not.toBe(incoming.id);
      importedId = imported?.id;

      const database = await openDatabase();
      const raw = await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction(TEMPLATE_STORE, "readonly")
          .objectStore(TEMPLATE_STORE)
          .get(incoming.id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      expect(raw).toMatchObject({ sentinel: "keep-me" });
    } finally {
      await deleteTemplate(incoming.id);
      if (importedId) await deleteTemplate(importedId);
    }
  });
});
