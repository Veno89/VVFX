import {
  MAX_ALPHA_MASK_CELLS,
  normalizeAssetAlphaMask,
} from "../../../src/vfx/alphaMask";
import { MAX_COLOR_STOPS } from "../../../src/vfx/color";
import { BUILT_IN_ASSETS } from "../../../src/vfx/defaults";
import { MAX_EVENTS_PER_LAYER } from "../../../src/vfx/events";
import { createRuntimeDefinition } from "../../../src/vfx/exporters";
import {
  isSafeVfxId,
  isSupportedVfxNumber,
  MAX_MOTION_PATH_POINTS,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_EMBEDDED_IMAGE_BYTES,
  MAX_PROJECT_IMAGE_PIXELS,
  MAX_PROJECT_LAYERS,
  MAX_RUNTIME_DEFINITION_BYTES,
  MAX_VFX_NAME_LENGTH,
  utf8ByteLength,
} from "../../../src/vfx/inputLimits";
import { MAX_KEYFRAMES } from "../../../src/vfx/keyframes";
import { inspectPortableImageDataUrl } from "../../../src/vfx/portableImage";
import { MAX_RENDERING_EFFECT_CLIPS } from "../../../src/vfx/renderingEffectsModel";
import { validateProject } from "../../../src/vfx/serialization";
import { MAX_SPRITE_SHEET_FRAMES } from "../../../src/vfx/spriteSheet";
import type { VfxAsset, VfxProject } from "../../../src/vfx/types";
import type { RuntimeValidationResult, VvfxRuntimeDefinition } from "./types";

type BuiltInKind = NonNullable<VfxAsset["builtIn"]>;

const SUPPORTED_RUNTIME_VERSIONS = new Set(
  Array.from({ length: 16 }, (_unused, index) => index + 1),
);
const BUILT_INS_BY_KIND = new Map<BuiltInKind, VfxAsset>(
  BUILT_IN_ASSETS.map((asset) => [asset.builtIn as BuiltInKind, asset]),
);
const BUILT_INS_BY_ID = new Map(
  BUILT_IN_ASSETS.map((asset) => [asset.id, asset]),
);
const MAX_ATLAS_FRAME_LENGTH = 160;
const MAX_RUNTIME_NESTING_DEPTH = 24;
const MAX_RUNTIME_OBJECT_PROPERTIES = 128;
const MAX_RUNTIME_STRUCTURE_NODES =
  MAX_PROJECT_ASSETS * (MAX_ALPHA_MASK_CELLS + 64) + MAX_PROJECT_LAYERS * 512;
const MAX_RUNTIME_NESTED_ARRAY_ENTRIES = MAX_ALPHA_MASK_CELLS;
const preparedRuntimeProjects = new WeakMap<object, VfxProject>();

const hasOwn = (record: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(record, key);

const ownValue = (record: Record<string, unknown>, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable === true && "value" in descriptor
    ? descriptor.value
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDenseArray = (value: readonly unknown[]) => {
  for (let index = 0; index < value.length; index += 1)
    if (!hasOwn(value, index)) return false;
  return true;
};

function isPlainDenseArray(value: readonly unknown[]): boolean {
  if (Object.getPrototypeOf(value) !== Array.prototype || !isDenseArray(value))
    return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) return false;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      !descriptor ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      descriptor.value === undefined
    )
      return false;
  }
  return true;
}

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const hasControlCharacters = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

function isSafeName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_VFX_NAME_LENGTH &&
    value.trim().length > 0
  );
}

interface RuntimeStructureBudget {
  bytes: number;
  nodes: number;
}

/**
 * Bounds direct JavaScript objects before the project migrator walks them.
 * String input has an exact UTF-8 boundary; this is a conservative equivalent
 * for callers that pass an already-parsed definition.
 */
function inspectRuntimeStructure(
  value: unknown,
  budget: RuntimeStructureBudget,
  active: Set<object>,
  depth = 0,
): string | null {
  budget.nodes += 1;
  budget.bytes += 8;
  if (
    budget.nodes > MAX_RUNTIME_STRUCTURE_NODES ||
    budget.bytes > MAX_RUNTIME_DEFINITION_BYTES
  )
    return "The Vvfx runtime definition is too large.";
  if (depth > MAX_RUNTIME_NESTING_DEPTH)
    return "The Vvfx runtime definition is nested too deeply.";

  if (value === null || value === undefined || typeof value === "boolean")
    return null;
  if (typeof value === "number")
    return isSupportedVfxNumber(value)
      ? null
      : "The Vvfx runtime definition contains a number outside the supported range.";
  if (typeof value === "string") {
    if (value.length > MAX_RUNTIME_DEFINITION_BYTES)
      return "The Vvfx runtime definition is too large.";
    budget.bytes += utf8ByteLength(value);
    return budget.bytes > MAX_RUNTIME_DEFINITION_BYTES
      ? "The Vvfx runtime definition is too large."
      : null;
  }
  if (typeof value !== "object")
    return "The Vvfx runtime definition contains an unsupported value.";

  if (active.has(value))
    return "The Vvfx runtime definition contains a circular value.";
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        value.length > MAX_RUNTIME_NESTED_ARRAY_ENTRIES ||
        !isPlainDenseArray(value)
      )
        return "The Vvfx runtime definition contains a damaged or oversized list.";
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (
          !descriptor ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true ||
          descriptor.value === undefined
        )
          return "The Vvfx runtime definition contains a damaged list.";
        const error = inspectRuntimeStructure(
          descriptor.value,
          budget,
          active,
          depth + 1,
        );
        if (error) return error;
      }
      return null;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      return "The Vvfx runtime definition contains an unsupported object.";
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_RUNTIME_OBJECT_PROPERTIES)
      return "The Vvfx runtime definition contains an oversized object.";
    for (const key of keys) {
      if (typeof key !== "string")
        return "The Vvfx runtime definition contains an unsupported object.";
      budget.bytes += utf8ByteLength(key) + 4;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      )
        return "The Vvfx runtime definition contains an unsupported object.";
      const error = inspectRuntimeStructure(
        descriptor.value,
        budget,
        active,
        depth + 1,
      );
      if (error) return error;
    }
    return null;
  } finally {
    active.delete(value);
  }
}

function sourceMimeType(
  source: string,
  builtIn: VfxAsset["builtIn"],
): VfxAsset["mimeType"] {
  if (builtIn) return "image/builtin";
  return source.startsWith("data:image/webp;base64,")
    ? "image/webp"
    : "image/png";
}

function nestedArrayLengthError(
  owner: unknown,
  key: string,
  maximum: number,
  label: string,
): string | null {
  if (!isRecord(owner)) return null;
  const value = ownValue(owner, key);
  if (value === undefined) return null;
  if (!Array.isArray(value)) return `${label} is damaged.`;
  if (value.length > maximum)
    return `${label} contains more than the supported ${maximum} entries.`;
  return isDenseArray(value) ? null : `${label} is damaged.`;
}

function validateLayerCollections(
  layer: Record<string, unknown>,
): string | null {
  const eventsError = nestedArrayLengthError(
    layer,
    "events",
    MAX_EVENTS_PER_LAYER,
    "A runtime layer's event list",
  );
  if (eventsError) return eventsError;
  const motionPathError = nestedArrayLengthError(
    ownValue(layer, "motionPath"),
    "points",
    MAX_MOTION_PATH_POINTS,
    "A runtime layer's motion path",
  );
  if (motionPathError) return motionPathError;
  const keyframesError = nestedArrayLengthError(
    ownValue(layer, "keyframes"),
    "frames",
    MAX_KEYFRAMES,
    "A runtime layer's keyframe list",
  );
  if (keyframesError) return keyframesError;
  const appearance = ownValue(layer, "appearance");
  const colorOverLifetime = isRecord(appearance)
    ? ownValue(appearance, "colorOverLifetime")
    : undefined;
  const colorStopsError = nestedArrayLengthError(
    colorOverLifetime,
    "stops",
    MAX_COLOR_STOPS,
    "A runtime layer's color-stop list",
  );
  if (colorStopsError) return colorStopsError;
  return nestedArrayLengthError(
    appearance,
    "effectClips",
    MAX_RENDERING_EFFECT_CLIPS,
    "A runtime layer's effect-clip list",
  );
}

function safeOptionalReference(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return isSafeVfxId(value) ? null : `A runtime layer has an unsafe ${label}.`;
}

function runtimeEventsForProject(
  value: unknown,
  formatVersion: number,
): unknown {
  if (!Array.isArray(value)) return value ?? [];
  if (formatVersion >= 15) return value;
  const events: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const event = value[index];
    if (!isRecord(event)) {
      events.push(event);
      continue;
    }
    const percentage = ownValue(event, "percentage");
    const chance = ownValue(event, "chance");
    const maxTriggers = ownValue(event, "maxTriggers");
    const enabled = ownValue(event, "enabled");
    events.push({
      id: ownValue(event, "id"),
      enabled: typeof enabled === "boolean" ? enabled : true,
      trigger: ownValue(event, "trigger"),
      percentage:
        typeof percentage === "number" && Number.isFinite(percentage)
          ? percentage
          : 0.5,
      action: ownValue(event, "action"),
      targetLayerId: ownValue(event, "targetLayerId"),
      chance:
        typeof chance === "number" && Number.isFinite(chance) ? chance : 1,
      maxTriggers:
        typeof maxTriggers === "number" && Number.isFinite(maxTriggers)
          ? maxTriggers
          : 32,
    });
  }
  return events;
}

function validateRuntimeDefinitionUnchecked(
  input: unknown,
): RuntimeValidationResult {
  let value = input;
  if (typeof input === "string") {
    if (
      input.length > MAX_RUNTIME_DEFINITION_BYTES ||
      utf8ByteLength(input) > MAX_RUNTIME_DEFINITION_BYTES
    )
      return {
        ok: false,
        error: `Runtime definitions are limited to ${Math.floor(MAX_RUNTIME_DEFINITION_BYTES / 1024 / 1024)} MB.`,
      };
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return {
        ok: false,
        error: "The Vvfx runtime definition is not valid JSON.",
      };
    }
  }
  if (!isRecord(value) || ownValue(value, "format") !== "vvfx-runtime")
    return { ok: false, error: "This is not a Vvfx runtime definition." };

  const formatVersion = ownValue(value, "formatVersion");
  if (
    typeof formatVersion !== "number" ||
    !Number.isInteger(formatVersion) ||
    !SUPPORTED_RUNTIME_VERSIONS.has(formatVersion)
  )
    return {
      ok: false,
      error: "This Vvfx runtime version is not supported by this package.",
    };

  const name = ownValue(value, "name");
  const duration = ownValue(value, "duration");
  const seed = ownValue(value, "seed");
  const rawAssets = ownValue(value, "assets");
  const rawLayers = ownValue(value, "layers");
  if (
    !isSafeName(name) ||
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    typeof seed !== "number" ||
    !Number.isFinite(seed) ||
    !Array.isArray(rawAssets) ||
    !Array.isArray(rawLayers)
  )
    return {
      ok: false,
      error: "The Vvfx runtime definition is missing required fields.",
    };
  if (rawAssets.length > MAX_PROJECT_ASSETS)
    return {
      ok: false,
      error: `Runtime definitions are limited to ${MAX_PROJECT_ASSETS} images.`,
    };
  if (rawLayers.length > MAX_PROJECT_LAYERS)
    return {
      ok: false,
      error: `Runtime definitions are limited to ${MAX_PROJECT_LAYERS} layers.`,
    };
  if (!isDenseArray(rawAssets) || !isDenseArray(rawLayers))
    return {
      ok: false,
      error: "The Vvfx runtime definition contains a damaged list.",
    };

  const structureError = inspectRuntimeStructure(
    value,
    { bytes: 0, nodes: 0 },
    new Set(),
  );
  if (structureError) return { ok: false, error: structureError };

  const assets: VfxAsset[] = [];
  const assetIds = new Set<string>();
  let embeddedImageBytes = 0;
  let embeddedImagePixels = 0;
  for (let assetIndex = 0; assetIndex < rawAssets.length; assetIndex += 1) {
    const rawAsset = rawAssets[assetIndex];
    if (!isRecord(rawAsset))
      return { ok: false, error: "A runtime image entry is damaged." };
    const id = ownValue(rawAsset, "id");
    const assetName = ownValue(rawAsset, "name");
    const source = ownValue(rawAsset, "source");
    if (
      !isSafeVfxId(id) ||
      !isSafeName(assetName) ||
      typeof source !== "string"
    )
      return { ok: false, error: "A runtime image entry is damaged." };
    if (assetIds.has(id))
      return {
        ok: false,
        error: `The runtime image ID "${id}" is duplicated.`,
      };
    assetIds.add(id);

    const rawBuiltIn = ownValue(rawAsset, "builtIn");
    if (
      rawBuiltIn !== undefined &&
      !BUILT_INS_BY_KIND.has(rawBuiltIn as BuiltInKind)
    )
      return {
        ok: false,
        error: `The built-in image "${id}" is unknown.`,
      };
    const builtIn = rawBuiltIn as BuiltInKind | undefined;
    if (builtIn) {
      const canonical = BUILT_INS_BY_KIND.get(builtIn);
      if (
        !canonical ||
        id !== canonical.id ||
        source !== canonical.dataUrl ||
        (ownValue(rawAsset, "width") !== undefined &&
          ownValue(rawAsset, "width") !== null) ||
        (ownValue(rawAsset, "height") !== undefined &&
          ownValue(rawAsset, "height") !== null) ||
        (ownValue(rawAsset, "spriteSheet") !== undefined &&
          ownValue(rawAsset, "spriteSheet") !== null) ||
        (ownValue(rawAsset, "atlasFrame") !== undefined &&
          ownValue(rawAsset, "atlasFrame") !== null) ||
        (ownValue(rawAsset, "alphaMask") !== undefined &&
          ownValue(rawAsset, "alphaMask") !== null)
      )
        return {
          ok: false,
          error: `The built-in image "${id}" does not match Vvfx's canonical definition.`,
        };
      assets.push({
        ...canonical,
        name: assetName.trim(),
        spriteSheet: null,
        atlasFrame: null,
        alphaMask: null,
      });
      continue;
    }
    if (BUILT_INS_BY_ID.has(id) || source.startsWith("builtin:"))
      return {
        ok: false,
        error: `The built-in image "${id}" does not match Vvfx's canonical definition.`,
      };

    const inspection = inspectPortableImageDataUrl(source);
    if (!inspection.ok)
      return {
        ok: false,
        error: `The runtime image "${assetName}" is invalid. ${inspection.error}`,
      };
    embeddedImageBytes += inspection.byteLength;
    embeddedImagePixels += inspection.width * inspection.height;
    if (embeddedImageBytes > MAX_PROJECT_EMBEDDED_IMAGE_BYTES)
      return {
        ok: false,
        error: `Embedded runtime images are limited to ${Math.floor(MAX_PROJECT_EMBEDDED_IMAGE_BYTES / 1024 / 1024)} MB in total.`,
      };
    if (embeddedImagePixels > MAX_PROJECT_IMAGE_PIXELS)
      return {
        ok: false,
        error:
          "The runtime image library exceeds the supported decoded-pixel budget.",
      };

    const declaredWidth = ownValue(rawAsset, "width");
    const declaredHeight = ownValue(rawAsset, "height");
    if (
      (declaredWidth !== undefined && declaredWidth !== inspection.width) ||
      (declaredHeight !== undefined && declaredHeight !== inspection.height)
    )
      return {
        ok: false,
        error: `The runtime image "${assetName}" has inconsistent dimensions.`,
      };

    let spriteSheet: VfxAsset["spriteSheet"] = null;
    const rawSpriteSheet = ownValue(rawAsset, "spriteSheet");
    if (rawSpriteSheet !== undefined && rawSpriteSheet !== null) {
      if (!isRecord(rawSpriteSheet))
        return {
          ok: false,
          error: `The sprite-sheet settings for "${assetName}" are damaged.`,
        };
      const frameWidth = ownValue(rawSpriteSheet, "frameWidth");
      const frameHeight = ownValue(rawSpriteSheet, "frameHeight");
      const frameCount = ownValue(rawSpriteSheet, "frameCount");
      if (
        !isPositiveSafeInteger(frameWidth) ||
        !isPositiveSafeInteger(frameHeight) ||
        !isPositiveSafeInteger(frameCount) ||
        frameWidth > inspection.width ||
        frameHeight > inspection.height ||
        frameCount > MAX_SPRITE_SHEET_FRAMES
      )
        return {
          ok: false,
          error: `The sprite-sheet settings for "${assetName}" exceed the image bounds.`,
        };
      const capacity =
        Math.floor(inspection.width / frameWidth) *
        Math.floor(inspection.height / frameHeight);
      if (frameCount > capacity)
        return {
          ok: false,
          error: `The sprite-sheet settings for "${assetName}" exceed the image bounds.`,
        };
      spriteSheet = { frameWidth, frameHeight, frameCount };
    }

    const rawAtlasFrame = ownValue(rawAsset, "atlasFrame");
    if (
      rawAtlasFrame !== undefined &&
      rawAtlasFrame !== null &&
      (typeof rawAtlasFrame !== "string" ||
        !rawAtlasFrame.trim() ||
        rawAtlasFrame.length > MAX_ATLAS_FRAME_LENGTH ||
        hasControlCharacters(rawAtlasFrame))
    )
      return {
        ok: false,
        error: `The atlas-frame name for "${assetName}" is damaged.`,
      };
    const atlasFrame =
      typeof rawAtlasFrame === "string" ? rawAtlasFrame.trim() : null;

    const rawAlphaMask = ownValue(rawAsset, "alphaMask");
    const alphaMask = normalizeAssetAlphaMask(rawAlphaMask);
    if (rawAlphaMask !== undefined && rawAlphaMask !== null && !alphaMask)
      return {
        ok: false,
        error: `The image-silhouette data for "${assetName}" is damaged.`,
      };

    assets.push({
      id,
      name: assetName.trim(),
      dataUrl: source,
      mimeType: inspection.mimeType,
      transparency: "unknown",
      width: inspection.width,
      height: inspection.height,
      spriteSheet,
      atlasFrame,
      alphaMask,
    });
  }

  const missingBuiltInCount = BUILT_IN_ASSETS.reduce(
    (count, asset) => count + (assetIds.has(asset.id) ? 0 : 1),
    0,
  );
  if (assets.length + missingBuiltInCount > MAX_PROJECT_ASSETS)
    return {
      ok: false,
      error: `Runtime definitions are limited to ${MAX_PROJECT_ASSETS} images including Vvfx's built-ins.`,
    };

  const layerIds = new Set<string>();
  const orderedLayers: Array<{
    depth: number;
    inputIndex: number;
    layer: Record<string, unknown>;
  }> = [];
  for (let inputIndex = 0; inputIndex < rawLayers.length; inputIndex += 1) {
    const rawLayer = rawLayers[inputIndex];
    if (!isRecord(rawLayer))
      return { ok: false, error: "A runtime layer entry is damaged." };
    const id = ownValue(rawLayer, "id");
    const layerName = ownValue(rawLayer, "name");
    const type = ownValue(rawLayer, "type");
    const depth = ownValue(rawLayer, "depth");
    if (
      !isSafeVfxId(id) ||
      !isSafeName(layerName) ||
      typeof type !== "string" ||
      typeof depth !== "number" ||
      !Number.isSafeInteger(depth)
    )
      return { ok: false, error: "A runtime layer entry is damaged." };
    if (layerIds.has(id))
      return {
        ok: false,
        error: `The runtime layer ID "${id}" is duplicated.`,
      };
    layerIds.add(id);

    const collectionError = validateLayerCollections(rawLayer);
    if (collectionError) return { ok: false, error: collectionError };
    for (const [reference, label] of [
      [ownValue(rawLayer, "asset"), "image reference"],
      [ownValue(rawLayer, "attachTo"), "attachment reference"],
    ] as const) {
      const referenceError = safeOptionalReference(reference, label);
      if (referenceError) return { ok: false, error: referenceError };
    }
    const rawEvents = ownValue(rawLayer, "events");
    if (Array.isArray(rawEvents)) {
      for (let eventIndex = 0; eventIndex < rawEvents.length; eventIndex += 1) {
        const rawEvent = rawEvents[eventIndex];
        if (!isRecord(rawEvent))
          return { ok: false, error: "A runtime layer event is damaged." };
        if (
          !isSafeVfxId(ownValue(rawEvent, "id")) ||
          !isSafeVfxId(ownValue(rawEvent, "targetLayerId"))
        )
          return {
            ok: false,
            error: "A runtime layer event has an unsafe identifier or target.",
          };
      }
    }
    const spawn = ownValue(rawLayer, "spawn");
    if (isRecord(spawn)) {
      const referenceError = safeOptionalReference(
        ownValue(spawn, "maskAssetId"),
        "silhouette-image reference",
      );
      if (referenceError) return { ok: false, error: referenceError };
    }
    const appearance = ownValue(rawLayer, "appearance");
    const effects = isRecord(appearance)
      ? ownValue(appearance, "effects")
      : undefined;
    const visualMask = isRecord(effects)
      ? ownValue(effects, "visualMask")
      : undefined;
    if (isRecord(visualMask)) {
      const referenceError = safeOptionalReference(
        ownValue(visualMask, "maskAssetId"),
        "visual-mask image reference",
      );
      if (referenceError) return { ok: false, error: referenceError };
    }
    orderedLayers.push({ depth, inputIndex, layer: rawLayer });
  }
  orderedLayers.sort(
    (left, right) =>
      left.depth - right.depth || left.inputIndex - right.inputIndex,
  );

  const layers = orderedLayers.map(({ layer }) => ({
    id: ownValue(layer, "id") as string,
    name: (ownValue(layer, "name") as string).trim(),
    type: ownValue(layer, "type") as string,
    assetId:
      typeof ownValue(layer, "asset") === "string"
        ? (ownValue(layer, "asset") as string)
        : null,
    visible: true,
    enabled: ownValue(layer, "enabled") !== false,
    solo: false,
    startMode: ownValue(layer, "startMode"),
    events: runtimeEventsForProject(ownValue(layer, "events"), formatVersion),
    parentId:
      typeof ownValue(layer, "attachTo") === "string"
        ? (ownValue(layer, "attachTo") as string)
        : null,
    groupId: null,
    transform: ownValue(layer, "transform"),
    timing: ownValue(layer, "timing"),
    appearance: ownValue(layer, "appearance"),
    behavior: ownValue(layer, "behavior"),
    spawn: ownValue(layer, "spawn"),
    random: ownValue(layer, "random"),
    frameAnimation: ownValue(layer, "frameAnimation"),
    trail: ownValue(layer, "trail"),
    motionPath: ownValue(layer, "motionPath"),
    keyframes: ownValue(layer, "keyframes"),
    beam: ownValue(layer, "beam"),
  }));

  const now = new Date().toISOString();
  const candidate = {
    formatVersion: formatVersion >= 16 ? 18 : 17,
    metadata: {
      id: "runtime-project",
      name: name.trim(),
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
      duration,
      randomSeed: seed,
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

/** Runtime validation is a total boundary for JSON and direct JavaScript input. */
export function validateRuntimeDefinition(
  input: unknown,
): RuntimeValidationResult {
  try {
    if (typeof input === "object" && input !== null) {
      const prepared = preparedRuntimeProjects.get(input);
      if (prepared)
        return { ok: true, definition: input as VvfxRuntimeDefinition };
    }
    return validateRuntimeDefinitionUnchecked(input);
  } catch {
    return {
      ok: false,
      error:
        "The Vvfx runtime definition contains damaged or unsupported data.",
    };
  }
}

function normalizedRuntimeDefinitionToProject(
  normalized: VvfxRuntimeDefinition,
): VfxProject {
  const now = new Date().toISOString();
  return {
    formatVersion: 18,
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
      transparency:
        BUILT_INS_BY_ID.get(asset.id)?.transparency ?? ("unknown" as const),
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
    layers: normalized.layers.map(
      (layer) =>
        ({
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
        }) as VfxProject["layers"][number],
    ),
  };
}

/**
 * Internal playback boundary. The returned normalized definition is not
 * exposed to callers, so later asset loading and effect construction can reuse
 * its already-validated project without repeating the full structural walk.
 */
export function prepareRuntimeDefinition(
  input: unknown,
): RuntimeValidationResult {
  const result = validateRuntimeDefinition(input);
  if (result.ok && result.definition)
    preparedRuntimeProjects.set(
      result.definition,
      normalizedRuntimeDefinitionToProject(result.definition),
    );
  return result;
}

export function runtimeDefinitionToProject(
  definition: VvfxRuntimeDefinition,
): VfxProject {
  const prepared = preparedRuntimeProjects.get(definition);
  if (prepared) return prepared;
  const result = validateRuntimeDefinition(definition);
  if (!result.ok || !result.definition)
    throw new Error(result.error ?? "Invalid Vvfx runtime definition.");
  return normalizedRuntimeDefinitionToProject(result.definition);
}
