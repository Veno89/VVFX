import { describe, expect, it } from "vitest";
import { runtimeDefinitionToProject } from "../packages/phaser-runtime/src/definition";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  createRuntimeDefinition,
  generatePhaserCode,
  generateStandalonePhaserCode,
  serializeRuntimeDefinition,
} from "../src/vfx/exporters";
import { validateProject } from "../src/vfx/serialization";
import {
  createTemplateFromProject,
  insertTemplateIntoProject,
} from "../src/vfx/templates";
import type { VfxAsset } from "../src/vfx/types";
import { TINY_WEBP_DATA_URL, validPngDataUrl } from "./fixtures/portableImages";

const maskAsset = (id = "mask-source"): VfxAsset => ({
  id,
  name: "Lightning silhouette",
  mimeType: "image/png",
  dataUrl: validPngDataUrl(200, 100),
  transparency: "yes",
  width: 200,
  height: 100,
  spriteSheet: null,
  atlasFrame: null,
  alphaMask: { columns: 2, rows: 1, alpha: [0, 255] },
});

function maskedProject() {
  const project = createEmptyProject("Mask parity");
  const mask = maskAsset();
  const sparks = createLayer("burst", "Silhouette sparks", "builtin-spark");
  sparks.spawn = {
    ...sparks.spawn,
    count: 12,
    shape: "mask",
    distribution: "random",
    maskAssetId: mask.id,
    maskSize: 200,
    maskThreshold: 0.2,
  };
  project.assets.push(mask);
  project.layers.push(sparks);
  return { project, sparks, mask };
}

describe("alpha-mask spawning integration", () => {
  it("places every copy inside eligible cells with stable seeded replay", () => {
    const { project } = maskedProject();
    const first = evaluateProject(project, 0, null);
    expect(first).toHaveLength(12);
    expect(first.every(({ x }) => x >= 0 && x <= 100)).toBe(true);
    expect(first.every(({ y }) => y >= -50 && y <= 50)).toBe(true);
    expect(evaluateProject(project, 0, null)).toEqual(first);
  });

  it("rejects missing, unprepared, and empty silhouette references", () => {
    const missing = maskedProject();
    missing.sparks.spawn.maskAssetId = "gone";
    expect(validateProject(missing.project).error).toMatch(
      /silhouette.*missing/i,
    );

    const unprepared = maskedProject();
    unprepared.mask.alphaMask = null;
    expect(validateProject(unprepared.project).error).toMatch(
      /not been prepared/i,
    );

    const empty = maskedProject();
    empty.mask.alphaMask = { columns: 1, rows: 1, alpha: [20] };
    empty.sparks.spawn.maskThreshold = 0.5;
    expect(validateProject(empty.project).error).toMatch(/no visible pixels/i);
  });

  it("round-trips the exact grid and evaluated positions through current Runtime JSON", () => {
    const { project, mask } = maskedProject();
    const definition = createRuntimeDefinition(project);
    const restored = runtimeDefinitionToProject(definition);
    expect(definition.formatVersion).toBe(16);
    expect(
      definition.assets.find((asset) => asset.id === mask.id)?.alphaMask,
    ).toEqual(mask.alphaMask);
    expect(evaluateProject(restored, 0, null)).toEqual(
      evaluateProject(project, 0, null),
    );
    expect(generatePhaserCode(project)).toContain('"shape": "mask"');
    expect(() => generateStandalonePhaserCode(project)).toThrow(
      /does not support image-silhouette spawning/i,
    );
  });

  it("keeps stored silhouette grids but omits grids used only by artwork and visual masks", () => {
    const project = createEmptyProject("Compact runtime masks");
    const artwork = maskAsset("artwork-with-unused-grid");
    const visualMask = maskAsset("visual-mask-with-unused-grid");
    const spawnMask = maskAsset("stored-spawn-mask");
    const layer = createLayer("emitter", "Compact layer", artwork.id);
    layer.appearance.effects.visualMask = {
      ...layer.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: visualMask.id,
    };
    layer.spawn.shape = "point";
    layer.spawn.maskAssetId = spawnMask.id;
    project.assets.push(artwork, visualMask, spawnMask);
    project.layers.push(layer);

    const definition = createRuntimeDefinition(project);
    const byId = new Map(definition.assets.map((asset) => [asset.id, asset]));
    const compactJson = serializeRuntimeDefinition(project);

    expect(byId.get(artwork.id)).not.toHaveProperty("alphaMask");
    expect(byId.get(visualMask.id)).not.toHaveProperty("alphaMask");
    expect(byId.get(spawnMask.id)?.alphaMask).toEqual(spawnMask.alphaMask);
    expect(definition.layers[0].asset).toBe(artwork.id);
    expect(definition.layers[0].appearance.effects.visualMask.maskAssetId).toBe(
      visualMask.id,
    );
    expect(definition.layers[0].spawn?.maskAssetId).toBe(spawnMask.id);
    expect(compactJson).not.toContain("\n");
    expect(JSON.parse(compactJson)).toEqual(definition);
    expect(runtimeDefinitionToProject(definition).layers[0]).toMatchObject({
      assetId: artwork.id,
      spawn: { shape: "point", maskAssetId: spawnMask.id },
      appearance: {
        effects: { visualMask: { maskAssetId: visualMask.id } },
      },
    });
  });

  it("includes mask-only assets in templates and remaps conflicting IDs", () => {
    const { project, sparks, mask } = maskedProject();
    const template = createTemplateFromProject(
      project,
      "Silhouette sparks",
      "",
      [sparks.id],
    );
    expect(template.assets.map((asset) => asset.id)).toContain(mask.id);

    const destination = createEmptyProject("Destination");
    destination.assets.push({
      ...maskAsset(mask.id),
      mimeType: "image/webp",
      dataUrl: TINY_WEBP_DATA_URL,
      width: 1,
      height: 1,
      alphaMask: { columns: 1, rows: 1, alpha: [255] },
    });
    const inserted = insertTemplateIntoProject(destination, template);
    const insertedLayer = inserted.project.layers.at(-1);
    if (!insertedLayer || insertedLayer.type !== "burst")
      throw new Error("Missing inserted mask layer");
    expect(insertedLayer.spawn.maskAssetId).not.toBe(mask.id);
    expect(
      inserted.project.assets.find(
        (asset) => asset.id === insertedLayer.spawn.maskAssetId,
      )?.alphaMask,
    ).toEqual(mask.alphaMask);
    expect(validateProject(inserted.project).ok).toBe(true);
  });
});
