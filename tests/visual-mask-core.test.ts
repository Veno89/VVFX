import { describe, expect, it } from "vitest";
import { validateRuntimeDefinition } from "../packages/phaser-runtime/src/definition";
import {
  layersAfterAssetChanged,
  layersAfterAssetRemoved,
} from "../src/vfx/assetReferences";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import {
  createRuntimeDefinition,
  generateStandalonePhaserCode,
} from "../src/vfx/exporters";
import { createDefaultRenderingEffects } from "../src/vfx/renderingEffects";
import { validateProject } from "../src/vfx/serialization";
import {
  createTemplateFromProject,
  insertTemplateIntoProject,
} from "../src/vfx/templates";
import type { VfxAsset, VfxLayer } from "../src/vfx/types";

function stillMask(
  id = "visual-mask-source",
  source = "data:image/png;base64,bWFzaw==",
): VfxAsset {
  return {
    id,
    name: "Soft mask",
    mimeType: "image/png",
    dataUrl: source,
    transparency: "yes",
    width: 128,
    height: 64,
    spriteSheet: null,
    atlasFrame: null,
    alphaMask: null,
  };
}

function maskedLayer(maskAssetId = "visual-mask-source"): VfxLayer {
  const layer = createLayer("animated", "Masked glow", "builtin-flash");
  layer.appearance.effects.visualMask = {
    enabled: true,
    maskAssetId,
    channel: "luminance",
    invert: true,
    fit: "cover",
    offsetX: 0.25,
    offsetY: -0.5,
    scale: 1.75,
    rotation: 35,
    strength: 0.65,
  };
  return layer;
}

describe("visual-mask project and runtime schema", () => {
  it("migrates project v15 and Runtime JSON v13 to disabled visual-mask defaults", () => {
    const project = createEmptyProject(
      "Legacy visual mask",
    ) as unknown as Record<string, unknown>;
    project.formatVersion = 15;
    const layer = createLayer(
      "animated",
      "Legacy",
      "builtin-flash",
    ) as unknown as Record<string, unknown>;
    const appearance = layer.appearance as Record<string, unknown>;
    const effects = appearance.effects as Record<string, unknown>;
    delete effects.visualMask;
    project.layers = [layer];

    const migrated = validateProject(project);
    expect(migrated.ok).toBe(true);
    expect(migrated.project?.formatVersion).toBe(17);
    expect(migrated.project?.layers[0].appearance.effects.visualMask).toEqual(
      createDefaultRenderingEffects().visualMask,
    );

    const legacyRuntime = createRuntimeDefinition(
      migrated.project!,
    ) as unknown as Record<string, unknown>;
    legacyRuntime.formatVersion = 13;
    const runtimeLayer = (
      legacyRuntime.layers as Array<Record<string, unknown>>
    )[0];
    const runtimeAppearance = runtimeLayer.appearance as Record<
      string,
      unknown
    >;
    delete (runtimeAppearance.effects as Record<string, unknown>).visualMask;
    const runtimeResult = validateRuntimeDefinition(legacyRuntime);
    expect(runtimeResult.ok).toBe(true);
    expect(runtimeResult.definition?.formatVersion).toBe(15);
    expect(
      runtimeResult.definition?.layers[0].appearance.effects.visualMask,
    ).toEqual(createDefaultRenderingEffects().visualMask);
  });

  it("round-trips exact settings and mask-only assets through Runtime JSON", () => {
    const project = createEmptyProject("Runtime visual mask");
    const mask = stillMask();
    const layer = maskedLayer(mask.id);
    project.assets.push(mask);
    project.layers.push(layer);

    const definition = createRuntimeDefinition(project);
    const validated = validateRuntimeDefinition(definition);
    expect(definition.formatVersion).toBe(15);
    expect(definition.layers[0].appearance.effects.visualMask).toEqual(
      layer.appearance.effects.visualMask,
    );
    expect(
      definition.assets.find((asset) => asset.id === mask.id)?.source,
    ).toBe(mask.dataUrl);
    expect(validated.ok).toBe(true);
    expect(
      validated.definition?.layers[0].appearance.effects.visualMask,
    ).toEqual(layer.appearance.effects.visualMask);
    expect(() => generateStandalonePhaserCode(project)).toThrow(
      /experimental WebGL pixel effects/i,
    );
  });

  it("rejects enabled empty, missing, and sprite-sheet mask references", () => {
    const empty = createEmptyProject("Empty mask");
    empty.layers.push(maskedLayer(""));
    empty.layers[0].appearance.effects.visualMask.maskAssetId = null;
    expect(validateProject(empty).error).toMatch(/no mask image selected/i);

    const missing = createEmptyProject("Missing mask");
    missing.layers.push(maskedLayer("gone"));
    expect(validateProject(missing).error).toMatch(/visual mask.*missing/i);

    const sheet = stillMask();
    sheet.spriteSheet = { frameWidth: 32, frameHeight: 32, frameCount: 4 };
    const animated = createEmptyProject("Animated mask");
    animated.assets.push(sheet);
    animated.layers.push(maskedLayer(sheet.id));
    expect(validateProject(animated).error).toMatch(
      /visual mask.*still image.*sprite sheet/i,
    );
  });

  it("accepts built-in and still atlas-frame mask assets without alpha grids", () => {
    const builtIn = createEmptyProject("Built-in mask");
    builtIn.layers.push(maskedLayer("builtin-ring"));
    expect(validateProject(builtIn).ok).toBe(true);

    const atlas = createEmptyProject("Atlas mask");
    const mask = { ...stillMask(), atlasFrame: "soft-mask-frame" };
    atlas.assets.push(mask);
    atlas.layers.push(maskedLayer(mask.id));
    expect(validateProject(atlas).ok).toBe(true);
  });
});

describe("visual-mask asset dependencies", () => {
  it("clears visual and spawn references when a mask becomes a sprite sheet", () => {
    const asset = {
      ...stillMask(),
      alphaMask: { columns: 1, rows: 1, alpha: [255] },
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
    };
    const visual = maskedLayer(asset.id);
    const spawn = createLayer("burst", "Masked sparks", "builtin-spark");
    spawn.spawn.maskAssetId = asset.id;
    spawn.spawn.shape = "mask";

    const next = layersAfterAssetChanged([visual, spawn], asset);
    expect(next[0].appearance.effects.visualMask).toMatchObject({
      enabled: false,
      maskAssetId: null,
    });
    expect(next[1].type === "burst" && next[1].spawn).toMatchObject({
      shape: "point",
      distribution: "random",
      maskAssetId: null,
    });
  });

  it("keeps a full-texture visual mask when only its spawn-alpha grid is lost", () => {
    const asset = stillMask();
    const visual = maskedLayer(asset.id);
    const next = layersAfterAssetChanged([visual], asset);
    expect(next[0].appearance.effects.visualMask).toEqual(
      visual.appearance.effects.visualMask,
    );
  });

  it("clears target, spawn, and visual references together on removal", () => {
    const asset = stillMask();
    const layer = createLayer("burst", "All references", asset.id);
    layer.spawn.maskAssetId = asset.id;
    layer.spawn.shape = "mask";
    layer.appearance.effects.visualMask = maskedLayer(
      asset.id,
    ).appearance.effects.visualMask;

    const [removed] = layersAfterAssetRemoved([layer], asset.id);
    expect(removed.assetId).toBeNull();
    expect(removed.appearance.effects.visualMask).toMatchObject({
      enabled: false,
      maskAssetId: null,
    });
    expect(removed.type === "burst" && removed.spawn).toMatchObject({
      shape: "point",
      distribution: "random",
      maskAssetId: null,
    });
  });

  it("includes and collision-remaps a visual-mask-only template asset", () => {
    const project = createEmptyProject("Portable visual mask");
    const mask = stillMask();
    const layer = maskedLayer(mask.id);
    project.assets.push(mask);
    project.layers.push(layer);
    const template = createTemplateFromProject(project, "Masked glow", "", [
      layer.id,
    ]);
    expect(template.projectFormatVersion).toBe(17);
    expect(template.assets.map((asset) => asset.id)).toContain(mask.id);

    const destination = createEmptyProject("Destination");
    destination.assets.push(
      stillMask(mask.id, "data:image/png;base64,ZGlmZmVyZW50"),
    );
    const inserted = insertTemplateIntoProject(destination, template);
    const insertedMaskId =
      inserted.project.layers.at(-1)?.appearance.effects.visualMask.maskAssetId;
    expect(insertedMaskId).toBeTruthy();
    expect(insertedMaskId).not.toBe(mask.id);
    expect(
      inserted.project.assets.find((asset) => asset.id === insertedMaskId)
        ?.dataUrl,
    ).toBe(mask.dataUrl);
    expect(validateProject(inserted.project).ok).toBe(true);
  });
});
