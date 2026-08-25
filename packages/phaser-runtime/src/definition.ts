import { createRuntimeDefinition } from "../../../src/vfx/exporters";
import { validateProject } from "../../../src/vfx/serialization";
import { normalizeAssetAlphaMask } from "../../../src/vfx/alphaMask";
import type { VfxAsset, VfxProject } from "../../../src/vfx/types";
import type { RuntimeValidationResult, VvfxRuntimeDefinition } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function sourceMimeType(
  source: string,
  builtIn: unknown,
): VfxAsset["mimeType"] {
  if (typeof builtIn === "string" || source.startsWith("builtin:"))
    return "image/builtin";
  return source.startsWith("data:image/webp") ? "image/webp" : "image/png";
}

export function validateRuntimeDefinition(
  input: unknown,
): RuntimeValidationResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return {
        ok: false,
        error: "The Vvfx runtime definition is not valid JSON.",
      };
    }
  }
  if (!isRecord(value) || value.format !== "vvfx-runtime")
    return { ok: false, error: "This is not a Vvfx runtime definition." };
  if (
    value.formatVersion !== 1 &&
    value.formatVersion !== 2 &&
    value.formatVersion !== 3 &&
    value.formatVersion !== 4 &&
    value.formatVersion !== 5 &&
    value.formatVersion !== 6 &&
    value.formatVersion !== 7 &&
    value.formatVersion !== 8 &&
    value.formatVersion !== 9 &&
    value.formatVersion !== 10 &&
    value.formatVersion !== 11 &&
    value.formatVersion !== 12 &&
    value.formatVersion !== 13 &&
    value.formatVersion !== 14 &&
    value.formatVersion !== 15
  )
    return {
      ok: false,
      error: "This Vvfx runtime version is not supported by this package.",
    };
  if (
    typeof value.name !== "string" ||
    typeof value.duration !== "number" ||
    typeof value.seed !== "number" ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.layers)
  )
    return {
      ok: false,
      error: "The Vvfx runtime definition is missing required fields.",
    };

  const assets: VfxAsset[] = [];
  const assetIds = new Set<string>();
  for (const asset of value.assets) {
    if (
      !isRecord(asset) ||
      typeof asset.id !== "string" ||
      typeof asset.name !== "string" ||
      typeof asset.source !== "string"
    )
      return { ok: false, error: "A runtime image entry is damaged." };
    if (assetIds.has(asset.id))
      return {
        ok: false,
        error: `The runtime image ID “${asset.id}” is duplicated.`,
      };
    assetIds.add(asset.id);
    const builtIn = ["flash", "ring", "spark", "cloud"].includes(
      String(asset.builtIn),
    )
      ? (asset.builtIn as VfxAsset["builtIn"])
      : undefined;
    if (asset.source.startsWith("builtin:") && !builtIn)
      return {
        ok: false,
        error: `The built-in image “${asset.id}” is unknown.`,
      };
    assets.push({
      id: asset.id,
      name: asset.name,
      dataUrl: asset.source,
      mimeType: sourceMimeType(asset.source, builtIn),
      builtIn,
      transparency: "unknown",
      width:
        typeof asset.width === "number" && asset.width > 0
          ? asset.width
          : undefined,
      height:
        typeof asset.height === "number" && asset.height > 0
          ? asset.height
          : undefined,
      spriteSheet: isRecord(asset.spriteSheet)
        ? {
            frameWidth:
              typeof asset.spriteSheet.frameWidth === "number"
                ? asset.spriteSheet.frameWidth
                : 64,
            frameHeight:
              typeof asset.spriteSheet.frameHeight === "number"
                ? asset.spriteSheet.frameHeight
                : 64,
            frameCount:
              typeof asset.spriteSheet.frameCount === "number"
                ? asset.spriteSheet.frameCount
                : 1,
          }
        : null,
      atlasFrame:
        typeof asset.atlasFrame === "string" && asset.atlasFrame.trim()
          ? asset.atlasFrame.trim().slice(0, 160)
          : null,
      alphaMask: normalizeAssetAlphaMask(asset.alphaMask),
    });
  }

  const layerIds = new Set<string>();
  for (const layer of value.layers) {
    if (
      !isRecord(layer) ||
      typeof layer.id !== "string" ||
      typeof layer.name !== "string" ||
      typeof layer.type !== "string" ||
      typeof layer.depth !== "number"
    )
      return { ok: false, error: "A runtime layer entry is damaged." };
    if (layerIds.has(layer.id))
      return {
        ok: false,
        error: `The runtime layer ID “${layer.id}” is duplicated.`,
      };
    layerIds.add(layer.id);
  }
  const orderedLayers = [...value.layers].sort((left, right) => {
    const leftDepth =
      isRecord(left) && typeof left.depth === "number" ? left.depth : 0;
    const rightDepth =
      isRecord(right) && typeof right.depth === "number" ? right.depth : 0;
    return leftDepth - rightDepth;
  });
  const layers = orderedLayers.map((layer) => {
    if (
      !isRecord(layer) ||
      typeof layer.id !== "string" ||
      typeof layer.name !== "string" ||
      typeof layer.type !== "string"
    )
      return null;
    return {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      assetId: typeof layer.asset === "string" ? layer.asset : null,
      visible: true,
      enabled: layer.enabled !== false,
      solo: false,
      startMode: layer.startMode,
      events: layer.events,
      parentId: typeof layer.attachTo === "string" ? layer.attachTo : null,
      groupId: null,
      transform: layer.transform,
      timing: layer.timing,
      appearance: layer.appearance,
      behavior: layer.behavior,
      spawn: layer.spawn,
      random: layer.random,
      frameAnimation: layer.frameAnimation,
      trail: layer.trail,
      motionPath: layer.motionPath,
      keyframes: layer.keyframes,
      beam: layer.beam,
    };
  });
  if (layers.some((layer) => layer === null))
    return { ok: false, error: "A runtime layer entry is damaged." };

  const now = new Date().toISOString();
  const candidate = {
    formatVersion: 17,
    metadata: {
      id: "runtime-project",
      name: value.name,
      createdAt: now,
      updatedAt: now,
    },
    assets,
    preview: {
      background: "checkerboard",
      customColor: "#000000",
      showGrid: false,
      zoom: 1,
      loop: false,
      duration: value.duration,
      randomSeed: value.seed,
    },
    timeline: { markers: [], notes: "" },
    groups: [],
    layers,
  };
  const validated = validateProject(candidate);
  if (!validated.ok || !validated.project)
    return {
      ok: false,
      error:
        validated.error ?? "The runtime definition could not be normalized.",
    };
  return { ok: true, definition: createRuntimeDefinition(validated.project) };
}

export function runtimeDefinitionToProject(
  definition: VvfxRuntimeDefinition,
): VfxProject {
  const result = validateRuntimeDefinition(definition);
  if (!result.ok || !result.definition)
    throw new Error(result.error ?? "Invalid Vvfx runtime definition.");
  const normalized = result.definition;
  const now = new Date().toISOString();
  const candidate = {
    formatVersion: 17,
    metadata: {
      id: "runtime-project",
      name: normalized.name,
      createdAt: now,
      updatedAt: now,
    },
    assets: normalized.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      dataUrl: asset.source,
      mimeType: sourceMimeType(asset.source, asset.builtIn),
      builtIn: asset.builtIn,
      transparency: "unknown" as const,
      width: asset.width,
      height: asset.height,
      spriteSheet: asset.spriteSheet,
      atlasFrame: asset.atlasFrame,
      alphaMask: asset.alphaMask,
    })),
    preview: {
      background: "checkerboard" as const,
      customColor: "#000000",
      showGrid: false,
      zoom: 1,
      loop: false,
      duration: normalized.duration,
      randomSeed: normalized.seed,
    },
    timeline: { markers: [], notes: "" },
    groups: [],
    layers: normalized.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      assetId: layer.asset,
      visible: true,
      enabled: layer.enabled,
      solo: false,
      startMode: layer.startMode,
      events: layer.events,
      parentId: layer.attachTo,
      groupId: null,
      transform: layer.transform,
      timing: layer.timing,
      appearance: layer.appearance,
      behavior: layer.behavior,
      spawn: layer.spawn,
      random: layer.random,
      frameAnimation: layer.frameAnimation,
      trail: layer.trail,
      motionPath: layer.motionPath,
      keyframes: layer.keyframes,
      beam: layer.beam,
    })),
  };
  const project = validateProject(candidate);
  if (!project.ok || !project.project)
    throw new Error(project.error ?? "Invalid Vvfx runtime definition.");
  return project.project;
}
