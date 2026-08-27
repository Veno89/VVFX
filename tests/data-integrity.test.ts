import { describe, expect, it } from "vitest";
import {
  canAttachLayer,
  findLayerAttachmentCycle,
} from "../src/vfx/attachments";
import {
  layersAfterAssetChanged,
  sanitizeLayerAssetReferences,
  sanitizeLayerAssetReferencesWithReport,
} from "../src/vfx/assetReferences";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import {
  evaluateProject,
  MAX_EFFECT_INSTANCES,
  type EvaluationDiagnostics,
} from "../src/vfx/engine";
import { compileLayerActivations } from "../src/vfx/events";
import {
  createRuntimeDefinition,
  generatePhaserCode,
  generateStandalonePhaserCode,
} from "../src/vfx/exporters";
import { MAX_LAYER_REPEATS } from "../src/vfx/limits";
import { MAX_ATTACHMENT_DEPTH } from "../src/vfx/inputLimits";
import {
  serializeProject,
  validateCurrentProject,
  validateProject,
} from "../src/vfx/serialization";
import type { VfxAsset } from "../src/vfx/types";
import {
  TINY_PNG_DATA_URL,
  TINY_WEBP_DATA_URL,
  validPngDataUrl,
} from "./fixtures/portableImages";

describe("project data-integrity invariants", () => {
  it("rejects self, descendant, and already-cyclic attachment targets", () => {
    const parent = createLayer("animated", "Parent", "builtin-ring");
    const child = createLayer("animated", "Child", "builtin-spark");
    const grandchild = createLayer("animated", "Grandchild", "builtin-flash");
    child.parentId = parent.id;
    grandchild.parentId = child.id;
    const layers = [parent, child, grandchild];

    expect(canAttachLayer(layers, parent.id, null)).toBe(true);
    expect(canAttachLayer(layers, "missing-layer", null)).toBe(false);
    expect(canAttachLayer(layers, parent.id, child.id)).toBe(false);
    expect(canAttachLayer(layers, parent.id, grandchild.id)).toBe(false);
    expect(canAttachLayer(layers, child.id, child.id)).toBe(false);

    parent.parentId = grandchild.id;
    expect(findLayerAttachmentCycle(layers)).not.toBeNull();
    expect(canAttachLayer(layers, child.id, parent.id)).toBe(false);
  });

  it("allows updates at the exact attachment-depth limit but not one beyond", () => {
    const layers = Array.from(
      { length: MAX_ATTACHMENT_DEPTH + 1 },
      (_, index) => createLayer("animated", `Depth ${index}`, "builtin-ring"),
    );
    for (let index = 1; index < layers.length; index += 1)
      layers[index].parentId = layers[index - 1].id;
    const deepest = layers.at(-1)!;

    expect(canAttachLayer(layers, deepest.id, deepest.parentId)).toBe(true);

    const beyond = createLayer("animated", "Beyond limit", "builtin-ring");
    expect(canAttachLayer([...layers, beyond], beyond.id, deepest.id)).toBe(
      false,
    );
  });

  it("migrates oversized repeats but rejects them in current outbound state", () => {
    const project = createEmptyProject("Bounded repeats");
    const source = createLayer("animated", "Pulse", "builtin-ring");
    const target = createLayer("animated", "Echo", "builtin-flash");
    source.timing.duration = 100;
    source.timing.repeat = Number.MAX_SAFE_INTEGER;
    source.events = [
      {
        id: "pulse-halfway",
        enabled: true,
        trigger: "percentage",
        percentage: 0.5,
        action: "restart",
        targetLayerId: target.id,
        chance: 1,
        maxTriggers: 32,
      },
    ];
    target.startMode = "triggered";
    project.layers.push(source, target);

    const migrated = validateProject(project);
    expect(migrated.ok).toBe(true);
    expect(migrated.project?.layers[0].timing.repeat).toBe(MAX_LAYER_REPEATS);

    const current = validateCurrentProject(project);
    expect(current).toMatchObject({
      ok: false,
      path: expect.stringMatching(/timing\.repeat$/),
    });
    expect(() => serializeProject(project)).toThrow(/timing\.repeat/i);

    const schedule = compileLayerActivations(project, 350);
    expect(schedule.byLayer.get(target.id)).toHaveLength(4);
  });

  it("blocks invalid attachment graphs at every project export boundary", () => {
    const project = createEmptyProject("Circular export");
    const first = createLayer("animated", "First", "builtin-ring");
    const second = createLayer("animated", "Second", "builtin-spark");
    first.parentId = second.id;
    second.parentId = first.id;
    project.layers.push(first, second);

    expect(validateCurrentProject(project).ok).toBe(false);
    expect(() => serializeProject(project)).toThrow(/circular/i);
    expect(() => createRuntimeDefinition(project)).toThrow(/circular/i);
    expect(() => generateStandalonePhaserCode(project)).toThrow(/circular/i);
  });

  it("canonicalizes harmless authoring text without weakening strict checks", () => {
    const project = createEmptyProject("Safe text cleanup");
    const group = createGroup("  Lightning group  ");
    project.groups.push(group);
    project.timeline.notes = "n".repeat(12_001);
    project.timeline.markers.push({
      id: "marker-one",
      time: 100,
      label: "  Impact  ",
    });
    const asset: VfxAsset = {
      id: "atlas-image",
      name: "Atlas image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
      atlasFrame: "  vfx/spark  ",
    };
    project.assets.push(asset);

    const result = validateCurrentProject(project);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.groups[0].name).toBe("Lightning group");
    expect(result.project.timeline.notes).toHaveLength(12_000);
    expect(result.project.timeline.markers[0].label).toBe("Impact");
    expect(result.project.assets.at(-1)?.atlasFrame).toBe("vfx/spark");
  });

  it("validates generated-code metadata before reading it", () => {
    const project = createEmptyProject("Damaged metadata");
    const damaged = {
      ...project,
      metadata: { ...project.metadata, name: 42 },
    } as unknown as typeof project;

    expect(() => generatePhaserCode(damaged)).toThrow(
      /cannot be exported.*metadata\.name/i,
    );
  });

  it("uses own-only texture mappings in standalone Phaser code", () => {
    const project = createEmptyProject("Own texture lookup");
    project.assets.push({
      id: "toString",
      name: "Prototype-named image",
      mimeType: "image/png",
      dataUrl: TINY_PNG_DATA_URL,
      width: 1,
      height: 1,
    });
    project.layers.push(
      createLayer("static", "Prototype-named layer", "toString"),
    );

    const code = generateStandalonePhaserCode(project);
    expect(code).toContain("Object.getOwnPropertyDescriptor(textureKeys, id)");
    expect(code).toContain('resolveTextureKey("toString")');
    expect(code).not.toContain('textureKeys["toString"] ??');
  });

  it("returns boundary errors for malformed roots and sparse arrays", () => {
    expect(() =>
      serializeProject(
        null as unknown as ReturnType<typeof createEmptyProject>,
      ),
    ).toThrow(/cannot be exported/i);

    const sparse = createEmptyProject("Sparse layers");
    sparse.layers = new Array(1) as typeof sparse.layers;
    expect(validateCurrentProject(sparse)).toMatchObject({ ok: false });
    expect(() => serializeProject(sparse)).toThrow(/cannot be exported/i);
  });

  it("repairs dependent frame, silhouette, and pasted asset references atomically", () => {
    const sheet: VfxAsset = {
      id: "sheet",
      name: "Sheet",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(64, 32),
      width: 64,
      height: 32,
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 2 },
    };
    const animated = createLayer("animated", "Frames", sheet.id);
    animated.frameAnimation.startFrame = 8;
    animated.frameAnimation.endFrame = 12;

    const mask: VfxAsset = {
      id: "mask",
      name: "Mask",
      mimeType: "image/webp",
      dataUrl: TINY_WEBP_DATA_URL,
      width: 1,
      height: 1,
      spriteSheet: null,
      alphaMask: { columns: 1, rows: 1, alpha: [100] },
    };
    const burst = createLayer("burst", "Masked burst", "builtin-spark");
    burst.spawn.shape = "mask";
    burst.spawn.maskAssetId = mask.id;
    burst.spawn.maskThreshold = 0.5;

    const [normalizedFrames] = layersAfterAssetChanged([animated], sheet);
    expect(normalizedFrames.frameAnimation).toMatchObject({
      startFrame: 1,
      endFrame: 1,
    });
    const [clearedMask] = layersAfterAssetChanged([burst], mask);
    expect(clearedMask.type === "burst" && clearedMask.spawn).toMatchObject({
      shape: "point",
      distribution: "random",
      maskAssetId: null,
    });

    burst.assetId = "removed";
    burst.spawn.maskAssetId = "removed";
    burst.appearance.effects.visualMask = {
      ...burst.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: "removed",
    };
    const report = sanitizeLayerAssetReferencesWithReport(burst, []);
    expect(report.repairs).toEqual([
      "layer image",
      "visual mask",
      "spawn silhouette",
    ]);
    const sanitized = sanitizeLayerAssetReferences(burst, []);
    expect(sanitized.assetId).toBeNull();
    expect(sanitized.appearance.effects.visualMask).toMatchObject({
      enabled: false,
      maskAssetId: null,
    });
    expect(sanitized.type === "burst" && sanitized.spawn).toMatchObject({
      shape: "point",
      maskAssetId: null,
    });
  });

  it("stops inner evaluation before trails can exceed the shared 500-work budget", () => {
    const project = createEmptyProject("Hard evaluation budget");
    const first = createLayer("burst", "First burst", "builtin-spark");
    const second = createLayer("burst", "Second burst", "builtin-spark");
    first.spawn.count = 250;
    second.spawn.count = 250;
    first.timing.duration = 1_000;
    second.timing.duration = 1_000;
    first.trail = {
      ...first.trail,
      enabled: true,
      count: 1,
      spacing: 10,
      lifetime: 1_000,
    };
    project.layers.push(first, second);

    const diagnostics: EvaluationDiagnostics = {
      instanceEvaluations: 0,
      budgetExhausted: false,
    };
    const instances = evaluateProject(project, 100, null, {}, diagnostics);
    expect(instances).toHaveLength(MAX_EFFECT_INSTANCES);
    expect(instances.every((instance) => instance.trailIndex === null)).toBe(
      true,
    );
    expect(diagnostics).toEqual({
      instanceEvaluations: MAX_EFFECT_INSTANCES,
      budgetExhausted: true,
    });
  });
});
