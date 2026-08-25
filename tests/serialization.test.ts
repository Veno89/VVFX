import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createExampleProject,
  createGroup,
} from "../src/vfx/defaults";
import {
  deserializeProject,
  serializeProject,
  validateProject,
} from "../src/vfx/serialization";
import { createDefaultRenderingEffects } from "../src/vfx/renderingEffects";

describe("Vvfx project files", () => {
  it("starts new users with an empty composition and reusable practice shapes", () => {
    const project = createEmptyProject();
    expect(project.layers).toEqual([]);
    expect(project.metadata.name).toBe("Untitled Effect");
    expect(project.assets.every((asset) => asset.builtIn)).toBe(true);
  });
  it("round-trips a complete project and preserves uploaded image data", () => {
    const project = createExampleProject();
    project.assets.push({
      id: "user-image",
      name: "My spark",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,abc",
      transparency: "yes",
      width: 128,
      height: 32,
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
      atlasFrame: "vfx/spark-strip",
    });
    project.layers[0].assetId = "user-image";
    project.timeline = {
      notes: "40–120 ms ring vanishes",
      markers: [{ id: "ring-end", time: 120, label: "Ring ends" }],
    };
    const group = createGroup("Impact core");
    group.x = 24;
    group.delay = 180;
    project.groups.push(group);
    project.layers[0].groupId = group.id;
    const result = deserializeProject(serializeProject(project));
    expect(result.ok).toBe(true);
    expect(
      result.project?.assets.find((asset) => asset.id === "user-image")
        ?.dataUrl,
    ).toContain("base64,abc");
    expect(result.project?.layers[0].assetId).toBe("user-image");
    expect(
      result.project?.assets.find((asset) => asset.id === "user-image")
        ?.spriteSheet?.frameCount,
    ).toBe(4);
    expect(
      result.project?.assets.find((asset) => asset.id === "user-image")
        ?.atlasFrame,
    ).toBe("vfx/spark-strip");
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.groups[0]).toMatchObject({
      name: "Impact core",
      x: 24,
      delay: 180,
    });
    expect(result.project?.layers[0].groupId).toBe(group.id);
    expect(result.project?.timeline).toEqual(project.timeline);
  });

  it("migrates version 1 projects with still-image playback defaults", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 1;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => {
      delete layer.frameAnimation;
      delete layer.trail;
      delete layer.motionPath;
      if (typeof layer.timing === "object" && layer.timing)
        delete (layer.timing as Record<string, unknown>).customEasing;
    });

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers[0].frameAnimation.framesPerSecond).toBe(12);
    expect(result.project?.layers[0].trail.enabled).toBe(false);
  });

  it("migrates version 2 projects with motion trails disabled", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 2;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => {
      delete layer.trail;
      delete layer.motionPath;
      if (typeof layer.timing === "object" && layer.timing)
        delete (layer.timing as Record<string, unknown>).customEasing;
    });

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers.every((layer) => !layer.trail.enabled)).toBe(
      true,
    );
    expect(
      result.project?.layers.every((layer) => !layer.motionPath.enabled),
    ).toBe(true);
  });

  it("migrates version 3 projects with motion paths disabled", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 3;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => {
      delete layer.motionPath;
      if (typeof layer.timing === "object" && layer.timing)
        delete (layer.timing as Record<string, unknown>).customEasing;
    });

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers[0].motionPath).toMatchObject({
      enabled: false,
      mode: "curve",
    });
  });

  it("migrates version 4 projects with custom easing defaults", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 4;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => {
      if (typeof layer.timing === "object" && layer.timing)
        delete (layer.timing as Record<string, unknown>).customEasing;
    });

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers[0].timing.customEasing).toEqual({
      x1: 0.42,
      y1: 0,
      x2: 0.58,
      y2: 1,
    });
  });

  it("migrates version 5 projects with disabled keyframes", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 5;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => delete layer.keyframes);

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers[0].keyframes).toMatchObject({
      enabled: false,
      initialized: false,
    });
    expect(result.project?.layers[0].keyframes.frames).toHaveLength(2);
  });

  it("migrates version 6 projects with no effect groups", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 6;
    delete project.groups;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => delete layer.groupId);

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.groups).toEqual([]);
    expect(
      result.project?.layers.every((layer) => layer.groupId === null),
    ).toBe(true);
  });

  it("migrates version 7 assets with no runtime atlas frame", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 7;
    const assets = project.assets as Array<Record<string, unknown>>;
    assets.forEach((asset) => delete asset.atlasFrame);

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(
      result.project?.assets.every((asset) => asset.atlasFrame === null),
    ).toBe(true);
  });

  it("migrates version 8 projects with safe color, behavior, and spawn defaults", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 8;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.forEach((layer) => {
      delete layer.behavior;
      const appearance = layer.appearance as Record<string, unknown>;
      delete appearance.colorOverLifetime;
      if (layer.spawn && typeof layer.spawn === "object")
        delete (layer.spawn as Record<string, unknown>).distribution;
    });

    const result = validateProject(project);

    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers[0].appearance.colorOverLifetime).toEqual({
      enabled: false,
      stops: [
        { time: 0, color: "#ffffff" },
        { time: 1, color: "#ffffff" },
      ],
    });
    expect(result.project?.layers[0].behavior).toMatchObject({
      pulse: { enabled: false },
      flicker: { enabled: false },
      wobble: { enabled: false },
      physics: { gravity: 0, drag: 0 },
    });
    expect(
      result.project?.layers.find((layer) => layer.type === "burst")?.spawn
        ?.distribution,
    ).toBe("random");
  });

  it("migrates projects without rendering effects to disabled v12 defaults", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 11;
    for (const layer of project.layers as Array<Record<string, unknown>>) {
      delete (layer.appearance as Record<string, unknown>).effects;
    }

    const result = validateProject(project);

    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(result.project?.layers[0].appearance.effects).toEqual(
      createDefaultRenderingEffects(),
    );
  });

  it("migrates v14 directional wipes to the v15 pattern defaults", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 14;
    const layer = (project.layers as Array<Record<string, unknown>>)[0];
    const effects = (layer.appearance as Record<string, unknown>)
      .effects as Record<string, unknown>;
    const dissolve = effects.directionalDissolve as Record<string, unknown>;
    delete dissolve.pattern;
    delete dissolve.noiseScale;

    const result = validateProject(project);

    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(17);
    expect(
      result.project?.layers[0].appearance.effects.directionalDissolve,
    ).toMatchObject({
      pattern: "directional",
      noiseScale: 6,
    });
  });

  it("clamps unsafe imported rendering-effect controller values", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    const layer = (project.layers as Array<Record<string, unknown>>)[0];
    (layer.appearance as Record<string, unknown>).effects = {
      blur: {
        enabled: true,
        quality: 99,
        offsetX: -999,
        offsetY: 999,
        strength: 99,
        color: "not-a-color",
        steps: 99,
      },
      brightnessExposure: {
        enabled: true,
        brightness: 99,
        exposure: -99,
      },
      directionalDissolve: {
        enabled: true,
        start: -2,
        end: 4,
        softness: 9,
        pattern: "voronoi",
        noiseScale: 99,
        axis: "diagonal",
        reverse: true,
      },
      spriteWarp: {
        enabled: true,
        mode: "scene-refraction",
        barrel: 99,
        amountX: -4,
        amountY: 4,
        speed: 99,
      },
    };

    const effects =
      validateProject(project).project?.layers[0].appearance.effects;

    expect(effects?.blur).toMatchObject({
      enabled: true,
      quality: 2,
      offsetX: -12,
      offsetY: 12,
      strength: 4,
      color: "#ffffff",
      steps: 4,
    });
    expect(effects?.brightnessExposure).toMatchObject({
      brightness: 2,
      exposure: -2,
    });
    expect(effects?.directionalDissolve).toMatchObject({
      start: 0,
      end: 1,
      softness: 0.5,
      pattern: "directional",
      noiseScale: 16,
      axis: "horizontal",
      reverse: true,
    });
    expect(effects?.spriteWarp).toMatchObject({
      mode: "heat-shimmer",
      barrel: 1,
      amountX: -0.1,
      amountY: 0.1,
      speed: 8,
    });
  });

  it("normalizes imported colors and clamps unsafe behavior values", () => {
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    const layer = (project.layers as Array<Record<string, unknown>>)[0];
    layer.appearance = {
      tint: '"; globalThis.bad = true; //',
      tintStrength: 4,
      blendMode: "add",
      colorOverLifetime: {
        enabled: true,
        stops: [
          { time: 0.8, color: "#ABCDEF" },
          { time: -4, color: "not-a-color" },
          { time: 8, color: "#123456" },
        ],
      },
    };
    layer.behavior = {
      pulse: { enabled: true, scale: 99, opacity: -4, speed: 99 },
      flicker: { enabled: true, amount: 9, speed: 99, randomness: -1 },
      wobble: { enabled: true, x: 999, y: -3, rotation: 999, speed: 0 },
      physics: { gravity: 9999, drag: 7 },
    };

    const result = validateProject(project);
    const normalized = result.project?.layers[0];

    expect(result.ok).toBe(true);
    expect(normalized?.appearance).toMatchObject({
      tint: null,
      tintStrength: 1,
      blendMode: "add",
    });
    expect(normalized?.appearance.colorOverLifetime.stops).toEqual([
      { time: 0, color: "#ffffff" },
      { time: 0.8, color: "#abcdef" },
      { time: 1, color: "#123456" },
    ]);
    const disabledEnvelope = {
      enabled: false,
      start: 0,
      attackEnd: 0,
      releaseStart: 1,
      end: 1,
    };
    expect(normalized?.behavior).toEqual({
      pulse: {
        enabled: true,
        scale: 0.75,
        opacity: 0,
        speed: 12,
        envelope: disabledEnvelope,
      },
      flicker: {
        enabled: true,
        amount: 1,
        speed: 30,
        randomness: 0,
        envelope: disabledEnvelope,
      },
      wobble: {
        enabled: true,
        x: 250,
        y: 0,
        rotation: 180,
        speed: 0.1,
        style: "sway",
        smoothness: 0.7,
        envelope: disabledEnvelope,
      },
      physics: {
        gravity: 2000,
        drag: 1,
        gravityEnvelope: disabledEnvelope,
      },
    });
  });

  it("rejects duplicate IDs, missing assets, and circular attachments", () => {
    const duplicateLayers = createExampleProject();
    duplicateLayers.layers[1].id = duplicateLayers.layers[0].id;
    expect(validateProject(duplicateLayers).error).toMatch(/same identifier/i);

    const duplicateAssets = createExampleProject();
    duplicateAssets.assets.push({ ...duplicateAssets.assets[0] });
    expect(validateProject(duplicateAssets).error).toMatch(/same identifier/i);

    const missingAsset = createExampleProject();
    missingAsset.layers[0].assetId = "missing-image";
    expect(validateProject(missingAsset).error).toMatch(/image.*missing/i);

    const circular = createExampleProject();
    circular.layers[0].parentId = circular.layers[1].id;
    circular.layers[1].parentId = circular.layers[0].id;
    expect(validateProject(circular).error).toMatch(/circular/i);
  });

  it("rejects unknown formats and damaged layer types with friendly errors", () => {
    expect(
      validateProject({ formatVersion: 99, assets: [], layers: [] }).error,
    ).toMatch(/format version/i);
    const project = createExampleProject() as unknown as Record<
      string,
      unknown
    >;
    project.layers = [{ type: "laser-beam" }];
    expect(validateProject(project).error).toMatch(/unknown layer type/i);
    expect(deserializeProject("{not-json").error).toMatch(/not valid JSON/i);
  });

  it("clamps unsafe imported spawn counts", () => {
    const project = createExampleProject();
    const burst = project.layers.find((layer) => layer.type === "burst");
    if (burst?.spawn) burst.spawn.count = 100000;
    const result = deserializeProject(JSON.stringify(project));
    const importedBurst = result.project?.layers.find(
      (layer) => layer.type === "burst",
    );
    expect(importedBurst?.spawn?.count).toBe(250);
  });
});
