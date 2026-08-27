import { BUILT_IN_ASSETS, makeId } from "./defaults";
import { finiteLayerCycleCount } from "./limits";
import { activeTimelineEnd } from "./projectState";
import { validateProject } from "./serialization";
import {
  isSafeVfxId,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_GROUPS,
  MAX_PROJECT_IMAGE_PIXELS,
  MAX_PROJECT_LAYERS,
  MAX_VFX_NAME_LENGTH,
  utf8ByteLength,
} from "./inputLimits";
import { inspectPortableImageDataUrl } from "./portableImage";
import type { VfxAsset, VfxGroup, VfxLayer, VfxProject } from "./types";

export const TEMPLATE_FORMAT_VERSION = 2 as const;
export const TEMPLATE_PACK_FORMAT_VERSION = 2 as const;
export const CURRENT_PROJECT_FORMAT_VERSION = 17 as const;
export const MAX_TEMPLATES_PER_PACK = 100;
export const MAX_TEMPLATE_LAYERS = 250;
export const MAX_TEMPLATE_ASSETS = 100;
export const MAX_TEMPLATE_GROUPS = 100;
export const MAX_TEMPLATE_EMBEDDED_BYTES = 12 * 1024 * 1024;
export const MAX_TEMPLATE_PACK_EMBEDDED_BYTES = 20 * 1024 * 1024;
export const MAX_TEMPLATE_FILE_BYTES = 24 * 1024 * 1024;

export type TemplateScope = "effect" | "layer" | "group";

export interface VfxTemplate {
  format: "vvfx-template";
  formatVersion: typeof TEMPLATE_FORMAT_VERSION;
  projectFormatVersion: typeof CURRENT_PROJECT_FORMAT_VERSION;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  scope: TemplateScope;
  /** Absolute source Timeline time represented by zero at insertion. */
  timelineAnchor: number;
  /** Content length measured from timelineAnchor, not source preview length. */
  duration: number;
  assets: VfxAsset[];
  groups: VfxGroup[];
  layers: VfxLayer[];
}

export interface VfxTemplatePack {
  format: "vvfx-template-pack";
  formatVersion: typeof TEMPLATE_PACK_FORMAT_VERSION;
  exportedAt: string;
  templates: VfxTemplate[];
}

export interface TemplateDependencySummary {
  layerCount: number;
  groupCount: number;
  assetCount: number;
  uploadedAssetCount: number;
  omittedParentLinks: number;
  omittedEventLinks: number;
  timelineAnchor: number;
  duration: number;
}

export interface TemplateValidationResult {
  ok: boolean;
  template?: VfxTemplate;
  error?: string;
}

export interface TemplatePackValidationResult {
  ok: boolean;
  pack?: VfxTemplatePack;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

function allocateUniqueId(prefix: string, usedIds: Set<string>): string {
  let id = makeId(prefix);
  while (usedIds.has(id)) id = makeId(prefix);
  usedIds.add(id);
  return id;
}

const groupDelayForLayer = (
  project: Pick<VfxProject, "groups">,
  layer: Pick<VfxLayer, "groupId">,
): number =>
  layer.groupId
    ? (project.groups.find((group) => group.id === layer.groupId)?.delay ?? 0)
    : 0;

function referencedAssetIds(layers: VfxLayer[]): Set<string> {
  return new Set(
    layers.flatMap((layer) => [
      ...(layer.assetId ? [layer.assetId] : []),
      ...(layer.appearance.effects.visualMask.maskAssetId
        ? [layer.appearance.effects.visualMask.maskAssetId]
        : []),
      ...((layer.type === "burst" || layer.type === "emitter") &&
      layer.spawn.maskAssetId
        ? [layer.spawn.maskAssetId]
        : []),
    ]),
  );
}

function timelineAnchorFor(
  project: VfxProject,
  layers: VfxLayer[],
  scope: TemplateScope,
): number {
  if (scope === "effect") return 0;
  const timelineStarts = layers.flatMap((layer) =>
    layer.startMode === "timeline"
      ? [groupDelayForLayer(project, layer) + layer.timing.delay]
      : [],
  );
  return timelineStarts.length > 0 ? Math.min(...timelineStarts) : 0;
}

function directLayerSpan(layer: VfxLayer): number {
  const repeats =
    layer.timing.repeatForever || layer.timing.loop
      ? 1
      : finiteLayerCycleCount(layer.timing.repeat);
  const trailTail = layer.trail.enabled
    ? Math.min(
        Math.max(0, layer.trail.lifetime),
        Math.max(0, layer.trail.count * layer.trail.spacing),
      )
    : 0;
  return (
    Math.max(50, layer.timing.duration) * repeats +
    Math.max(0, layer.random.delay) +
    Math.max(0, layer.random.duration) +
    trailTail
  );
}

function contentDurationFor(
  project: VfxProject,
  layers: VfxLayer[],
  groups: VfxGroup[],
  timelineAnchor: number,
): number {
  const scopedProject: VfxProject = {
    ...project,
    groups,
    layers,
  };
  const hasTimelineLayer = layers.some(
    (layer) => layer.startMode === "timeline",
  );
  const directEnd = Math.max(
    50,
    ...layers.map((layer) =>
      layer.startMode === "timeline"
        ? groupDelayForLayer(scopedProject, layer) +
          layer.timing.delay +
          directLayerSpan(layer)
        : directLayerSpan(layer),
    ),
  );
  const scheduledEnd = hasTimelineLayer
    ? activeTimelineEnd(scopedProject)
    : directEnd;
  return clamp(Math.max(directEnd, scheduledEnd) - timelineAnchor, 50, 30_000);
}

export function analyzeTemplateSelection(
  project: VfxProject,
  layerIds?: string[],
  scope: TemplateScope = layerIds ? "layer" : "effect",
): TemplateDependencySummary {
  const requestedLayerIds = layerIds ? new Set(layerIds) : null;
  const selectedLayers = project.layers.filter(
    (layer) => !requestedLayerIds || requestedLayerIds.has(layer.id),
  );
  const selectedLayerIds = new Set(selectedLayers.map((layer) => layer.id));
  const groupIds = new Set(
    selectedLayers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
  );
  const groups = project.groups.filter((group) => groupIds.has(group.id));
  const assetIds = referencedAssetIds(selectedLayers);
  const assets = project.assets.filter((asset) => assetIds.has(asset.id));
  const timelineAnchor = timelineAnchorFor(project, selectedLayers, scope);
  return {
    layerCount: selectedLayers.length,
    groupCount: groups.length,
    assetCount: assets.length,
    uploadedAssetCount: assets.filter((asset) => !asset.builtIn).length,
    omittedParentLinks: selectedLayers.filter(
      (layer) => layer.parentId && !selectedLayerIds.has(layer.parentId),
    ).length,
    omittedEventLinks: selectedLayers.reduce(
      (count, layer) =>
        count +
        layer.events.filter(
          (event) => !selectedLayerIds.has(event.targetLayerId),
        ).length,
      0,
    ),
    timelineAnchor,
    duration: contentDurationFor(
      project,
      selectedLayers,
      groups,
      timelineAnchor,
    ),
  };
}

function assetsAreInterchangeable(left: VfxAsset, right: VfxAsset): boolean {
  return (
    left.dataUrl === right.dataUrl &&
    left.mimeType === right.mimeType &&
    Boolean(left.builtIn) === Boolean(right.builtIn) &&
    JSON.stringify(left.spriteSheet ?? null) ===
      JSON.stringify(right.spriteSheet ?? null) &&
    JSON.stringify(left.alphaMask ?? null) ===
      JSON.stringify(right.alphaMask ?? null) &&
    (left.atlasFrame ?? null) === (right.atlasFrame ?? null)
  );
}

function portableAssetError(asset: unknown): string | null {
  if (
    !isRecord(asset) ||
    !isSafeVfxId(asset.id) ||
    typeof asset.mimeType !== "string" ||
    typeof asset.dataUrl !== "string"
  )
    return "A template image is missing its identifier, type, or embedded data.";
  const builtIn = BUILT_IN_ASSETS.find(
    (candidate) => candidate.id === asset.id,
  );
  if (builtIn) {
    if (
      asset.mimeType !== "image/builtin" ||
      asset.builtIn !== builtIn.builtIn ||
      asset.dataUrl !== builtIn.dataUrl
    )
      return `The built-in image “${builtIn.name}” is not the canonical Vvfx version.`;
    return null;
  }
  if (asset.mimeType === "image/builtin" || typeof asset.builtIn === "string")
    return "A template contains an unknown built-in image.";
  if (asset.mimeType !== "image/png" && asset.mimeType !== "image/webp")
    return "Shared template images must be embedded PNG or WebP files.";
  const inspection = inspectPortableImageDataUrl(asset.dataUrl, asset.mimeType);
  if (!inspection.ok) return inspection.error;
  return null;
}

function embeddedAssetUsage(assets: VfxAsset[]): {
  bytes: number;
  pixels: number;
} {
  return assets.reduce(
    (usage, asset) => {
      if (asset.builtIn) return usage;
      const inspection = inspectPortableImageDataUrl(
        asset.dataUrl,
        asset.mimeType === "image/webp" ? "image/webp" : "image/png",
      );
      if (!inspection.ok)
        return {
          bytes: Number.POSITIVE_INFINITY,
          pixels: Number.POSITIVE_INFINITY,
        };
      return {
        bytes: usage.bytes + inspection.byteLength,
        pixels: usage.pixels + inspection.width * inspection.height,
      };
    },
    { bytes: 0, pixels: 0 },
  );
}

export function createTemplateFromProject(
  project: VfxProject,
  name = project.metadata.name,
  description = "",
  layerIds?: string[],
  scope: TemplateScope = layerIds ? "layer" : "effect",
): VfxTemplate {
  const requestedLayerIds = layerIds ? new Set(layerIds) : null;
  const selectedLayers = project.layers.filter(
    (layer) => !requestedLayerIds || requestedLayerIds.has(layer.id),
  );
  if (selectedLayers.length === 0)
    throw new Error("Add at least one layer before saving a template.");
  const selectedLayerIds = new Set(selectedLayers.map((layer) => layer.id));
  const templateLayers = clone(selectedLayers).map((layer) => ({
    ...layer,
    parentId:
      layer.parentId && selectedLayerIds.has(layer.parentId)
        ? layer.parentId
        : null,
    events: layer.events.filter((event) =>
      selectedLayerIds.has(event.targetLayerId),
    ),
  })) as VfxLayer[];
  const now = new Date().toISOString();
  const assetIds = referencedAssetIds(templateLayers);
  const groupIds = new Set(
    templateLayers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
  );
  const groups = clone(
    project.groups.filter((group) => groupIds.has(group.id)),
  );
  const timelineAnchor = timelineAnchorFor(project, templateLayers, scope);
  const candidate: VfxTemplate = {
    format: "vvfx-template",
    formatVersion: TEMPLATE_FORMAT_VERSION,
    projectFormatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    id: makeId("template"),
    name:
      name.trim().slice(0, MAX_VFX_NAME_LENGTH) || "Untitled effect template",
    description: description.trim().slice(0, 280),
    createdAt: now,
    updatedAt: now,
    scope,
    timelineAnchor,
    duration: contentDurationFor(
      project,
      templateLayers,
      groups,
      timelineAnchor,
    ),
    assets: clone(project.assets.filter((asset) => assetIds.has(asset.id))),
    groups,
    layers: templateLayers,
  };
  const result = validateTemplate(candidate);
  if (!result.ok || !result.template)
    throw new Error(result.error ?? "This template could not be created.");
  return result.template;
}

function sourceProjectVersion(input: Record<string, unknown>): number | null {
  if (input.formatVersion === 1) return 13;
  if (
    typeof input.projectFormatVersion !== "number" ||
    !Number.isInteger(input.projectFormatVersion)
  )
    return null;
  return input.projectFormatVersion;
}

function validateTemplateUnchecked(input: unknown): TemplateValidationResult {
  if (!isRecord(input) || input.format !== "vvfx-template")
    return { ok: false, error: "This is not a Vvfx effect template." };
  if (input.formatVersion !== 1 && input.formatVersion !== 2)
    return {
      ok: false,
      error: "This template version is not supported by this app yet.",
    };
  const projectFormatVersion = sourceProjectVersion(input);
  if (projectFormatVersion === null)
    return {
      ok: false,
      error: "This template is missing its source project format version.",
    };
  if (projectFormatVersion > CURRENT_PROJECT_FORMAT_VERSION)
    return {
      ok: false,
      error:
        "This template was made by a newer Vvfx project format. Update Vvfx before importing it.",
    };
  if (projectFormatVersion < 1)
    return {
      ok: false,
      error: "This template has an invalid source project format version.",
    };
  if (
    input.formatVersion === 2 &&
    input.scope !== "effect" &&
    input.scope !== "layer" &&
    input.scope !== "group"
  )
    return {
      ok: false,
      error: "This template has an unknown save scope.",
    };
  if (
    input.formatVersion === 2 &&
    (typeof input.timelineAnchor !== "number" ||
      !Number.isFinite(input.timelineAnchor))
  )
    return {
      ok: false,
      error: "This template is missing its Timeline anchor.",
    };
  const scope: TemplateScope =
    input.formatVersion === 1
      ? "effect"
      : input.scope === "effect" ||
          input.scope === "layer" ||
          input.scope === "group"
        ? input.scope
        : "effect";
  if (
    !isSafeVfxId(input.id) ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > MAX_VFX_NAME_LENGTH ||
    (typeof input.description === "string" && input.description.length > 280) ||
    (typeof input.createdAt === "string" && input.createdAt.length > 64) ||
    (typeof input.updatedAt === "string" && input.updatedAt.length > 64) ||
    !Array.isArray(input.assets) ||
    !Array.isArray(input.layers) ||
    input.layers.length === 0
  )
    return {
      ok: false,
      error: "This template is missing its name, layers, or image library.",
    };
  if (input.layers.length > MAX_TEMPLATE_LAYERS)
    return {
      ok: false,
      error: `A template cannot contain more than ${MAX_TEMPLATE_LAYERS} layers.`,
    };
  if (input.assets.length > MAX_TEMPLATE_ASSETS)
    return {
      ok: false,
      error: `A template cannot contain more than ${MAX_TEMPLATE_ASSETS} images.`,
    };
  if (Array.isArray(input.groups) && input.groups.length > MAX_TEMPLATE_GROUPS)
    return {
      ok: false,
      error: `A template cannot contain more than ${MAX_TEMPLATE_GROUPS} groups.`,
    };
  for (const asset of input.assets) {
    const error = portableAssetError(asset);
    if (error) return { ok: false, error };
  }

  const now = new Date().toISOString();
  const duration =
    typeof input.duration === "number" && Number.isFinite(input.duration)
      ? clamp(input.duration, 50, 30_000)
      : 3000;
  const timelineAnchor =
    input.formatVersion === 2 &&
    typeof input.timelineAnchor === "number" &&
    Number.isFinite(input.timelineAnchor)
      ? clamp(input.timelineAnchor, 0, 30_000)
      : 0;
  const suppliedAssetIds = new Set([
    ...BUILT_IN_ASSETS.map((asset) => asset.id),
    ...input.assets.flatMap((asset) =>
      isRecord(asset) && typeof asset.id === "string" ? [asset.id] : [],
    ),
  ]);
  if (
    input.layers.some(
      (layer) =>
        isRecord(layer) &&
        ((typeof layer.assetId === "string" &&
          !suppliedAssetIds.has(layer.assetId)) ||
          (isRecord(layer.spawn) &&
            typeof layer.spawn.maskAssetId === "string" &&
            !suppliedAssetIds.has(layer.spawn.maskAssetId)) ||
          (isRecord(layer.appearance) &&
            isRecord(layer.appearance.effects) &&
            isRecord(layer.appearance.effects.visualMask) &&
            typeof layer.appearance.effects.visualMask.maskAssetId ===
              "string" &&
            !suppliedAssetIds.has(
              layer.appearance.effects.visualMask.maskAssetId,
            ))),
    )
  )
    return {
      ok: false,
      error: "One or more template layers refer to a missing image.",
    };
  const project = validateProject({
    formatVersion: projectFormatVersion,
    metadata: {
      id: "template-validation",
      name: input.name,
      createdAt: now,
      updatedAt: now,
    },
    assets: input.assets,
    groups: Array.isArray(input.groups) ? input.groups : [],
    preview: {
      background: "checkerboard",
      customColor: "#142039",
      showGrid: false,
      zoom: 1,
      loop: true,
      duration: clamp(timelineAnchor + duration, 500, 30_000),
      randomSeed: 8421,
    },
    timeline: { markers: [], notes: "" },
    layers: input.layers,
  });
  if (!project.ok || !project.project)
    return {
      ok: false,
      error: project.error ?? "This template contains damaged effect settings.",
    };
  const projectAssetIds = new Set(
    project.project.assets.map((asset) => asset.id),
  );
  if (
    project.project.layers.some(
      (layer) => layer.assetId && !projectAssetIds.has(layer.assetId),
    )
  )
    return {
      ok: false,
      error: "One or more template layers refer to a missing image.",
    };
  const usedAssetIds = referencedAssetIds(project.project.layers);
  const assets = project.project.assets.filter((asset) =>
    usedAssetIds.has(asset.id),
  );
  const embeddedUsage = embeddedAssetUsage(assets);
  if (embeddedUsage.bytes > MAX_TEMPLATE_EMBEDDED_BYTES)
    return {
      ok: false,
      error: "This template contains more than 12 MB of embedded image data.",
    };
  if (embeddedUsage.pixels > MAX_PROJECT_IMAGE_PIXELS)
    return {
      ok: false,
      error: "This template's images exceed the decoded texture budget.",
    };
  const usedGroupIds = new Set(
    project.project.layers.flatMap((layer) =>
      layer.groupId ? [layer.groupId] : [],
    ),
  );
  return {
    ok: true,
    template: {
      format: "vvfx-template",
      formatVersion: TEMPLATE_FORMAT_VERSION,
      projectFormatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      id: input.id,
      name: input.name.trim(),
      description:
        typeof input.description === "string"
          ? input.description.trim().slice(0, 280)
          : "",
      createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
      scope,
      timelineAnchor,
      duration,
      assets,
      groups: project.project.groups.filter((group) =>
        usedGroupIds.has(group.id),
      ),
      layers: project.project.layers,
    },
  };
}

export function validateTemplate(input: unknown): TemplateValidationResult {
  try {
    return validateTemplateUnchecked(input);
  } catch {
    return {
      ok: false,
      error: "This template contains damaged or unsupported data.",
    };
  }
}

export function createTemplatePack(templates: VfxTemplate[]): VfxTemplatePack {
  return {
    format: "vvfx-template-pack",
    formatVersion: TEMPLATE_PACK_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    templates: clone(templates),
  };
}

export function serializeTemplate(template: VfxTemplate): string {
  const result = validateTemplate(template);
  if (!result.ok || !result.template)
    throw new Error(result.error ?? "This template could not be exported.");
  const text = JSON.stringify(result.template, null, 2);
  if (
    text.length > MAX_TEMPLATE_FILE_BYTES ||
    utf8ByteLength(text) > MAX_TEMPLATE_FILE_BYTES
  )
    throw new Error("This template is larger than the supported 24 MB limit.");
  return text;
}

export function serializeTemplatePack(templates: VfxTemplate[]): string {
  if (templates.length === 0)
    throw new Error("A template pack must contain at least one template.");
  if (templates.length > MAX_TEMPLATES_PER_PACK)
    throw new Error(
      `A template pack cannot contain more than ${MAX_TEMPLATES_PER_PACK} templates.`,
    );
  const normalized: VfxTemplate[] = [];
  const ids = new Set<string>();
  let embeddedBytes = 0;
  let decodedPixels = 0;
  for (const template of templates) {
    const result = validateTemplate(template);
    if (!result.ok || !result.template)
      throw new Error(result.error ?? "A template could not be exported.");
    if (ids.has(result.template.id))
      throw new Error(
        `The template identifier "${result.template.id}" appears more than once.`,
      );
    ids.add(result.template.id);
    const usage = embeddedAssetUsage(result.template.assets);
    embeddedBytes += usage.bytes;
    decodedPixels += usage.pixels;
    if (embeddedBytes > MAX_TEMPLATE_PACK_EMBEDDED_BYTES)
      throw new Error(
        "This template pack contains more than 20 MB of embedded image data.",
      );
    if (decodedPixels > MAX_PROJECT_IMAGE_PIXELS)
      throw new Error("This template pack exceeds the decoded texture budget.");
    normalized.push(result.template);
  }
  const text = JSON.stringify(createTemplatePack(normalized), null, 2);
  if (
    text.length > MAX_TEMPLATE_FILE_BYTES ||
    utf8ByteLength(text) > MAX_TEMPLATE_FILE_BYTES
  )
    throw new Error(
      "This template pack is larger than the supported 24 MB limit.",
    );
  return text;
}

export function deserializeTemplatePack(
  text: string,
): TemplatePackValidationResult {
  if (typeof text !== "string")
    return {
      ok: false,
      error: "This template or pack is not valid JSON.",
    };
  if (
    text.length > MAX_TEMPLATE_FILE_BYTES ||
    utf8ByteLength(text) > MAX_TEMPLATE_FILE_BYTES
  )
    return {
      ok: false,
      error: "This template file is larger than the supported 24 MB limit.",
    };
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      error: "This template or pack is not valid JSON.",
    };
  }
  if (isRecord(input) && input.format === "vvfx-template") {
    const single = validateTemplate(input);
    return single.ok && single.template
      ? { ok: true, pack: createTemplatePack([single.template]) }
      : { ok: false, error: single.error };
  }
  if (!isRecord(input) || input.format !== "vvfx-template-pack")
    return { ok: false, error: "This is not a Vvfx template or pack." };
  if (
    (input.formatVersion !== 1 && input.formatVersion !== 2) ||
    !Array.isArray(input.templates)
  )
    return {
      ok: false,
      error: "This template pack version is not supported by this app yet.",
    };
  if (input.templates.length === 0)
    return { ok: false, error: "This template pack is empty." };
  if (input.templates.length > MAX_TEMPLATES_PER_PACK)
    return {
      ok: false,
      error: `This pack contains more than the supported ${MAX_TEMPLATES_PER_PACK} templates.`,
    };
  const templates: VfxTemplate[] = [];
  const templateIds = new Set<string>();
  let embeddedBytes = 0;
  let decodedPixels = 0;
  for (const candidate of input.templates) {
    const result = validateTemplate(candidate);
    if (!result.ok || !result.template)
      return {
        ok: false,
        error: result.error ?? "A template in this pack is damaged.",
      };
    if (templateIds.has(result.template.id))
      return {
        ok: false,
        error: `This pack contains the template identifier “${result.template.id}” more than once.`,
      };
    templateIds.add(result.template.id);
    const usage = embeddedAssetUsage(result.template.assets);
    embeddedBytes += usage.bytes;
    if (embeddedBytes > MAX_TEMPLATE_PACK_EMBEDDED_BYTES)
      return {
        ok: false,
        error:
          "This template pack contains more than 20 MB of embedded image data.",
      };
    decodedPixels += usage.pixels;
    if (decodedPixels > MAX_PROJECT_IMAGE_PIXELS)
      return {
        ok: false,
        error: "This template pack exceeds the decoded texture budget.",
      };
    templates.push(result.template);
  }
  return {
    ok: true,
    pack: {
      format: "vvfx-template-pack",
      formatVersion: TEMPLATE_PACK_FORMAT_VERSION,
      exportedAt:
        typeof input.exportedAt === "string"
          ? input.exportedAt
          : new Date().toISOString(),
      templates,
    },
  };
}

export function insertTemplateIntoProject(
  project: VfxProject,
  template: VfxTemplate,
  insertionTimeMs = 0,
): { project: VfxProject; insertedLayerIds: string[] } {
  const projectResult = validateProject(project);
  if (!projectResult.ok || !projectResult.project)
    throw new Error(projectResult.error ?? "The current project is damaged.");
  const templateResult = validateTemplate(template);
  if (!templateResult.ok || !templateResult.template)
    throw new Error(templateResult.error ?? "This template is damaged.");
  project = projectResult.project;
  template = templateResult.template;
  if (project.layers.length + template.layers.length > MAX_PROJECT_LAYERS)
    throw new Error(
      `A project can contain at most ${MAX_PROJECT_LAYERS} layers.`,
    );
  const insertionTime = clamp(
    Number.isFinite(insertionTimeMs) ? insertionTimeMs : 0,
    0,
    30_000,
  );
  const insertionOffset = insertionTime - template.timelineAnchor;
  const assets = clone(project.assets);
  const usedAssetIds = new Set(assets.map((asset) => asset.id));
  const assetIdMap = new Map<string, string>();
  for (const templateAsset of template.assets) {
    const matchingId = assets.find((asset) => asset.id === templateAsset.id);
    if (matchingId && assetsAreInterchangeable(matchingId, templateAsset)) {
      assetIdMap.set(templateAsset.id, matchingId.id);
      continue;
    }
    const matchingSource = assets.find((asset) =>
      assetsAreInterchangeable(asset, templateAsset),
    );
    if (matchingSource) {
      assetIdMap.set(templateAsset.id, matchingSource.id);
      continue;
    }
    const id = matchingId
      ? allocateUniqueId("asset", usedAssetIds)
      : templateAsset.id;
    usedAssetIds.add(id);
    assets.push({ ...clone(templateAsset), id });
    assetIdMap.set(templateAsset.id, id);
  }
  if (assets.length > MAX_PROJECT_ASSETS)
    throw new Error(
      `A project can contain at most ${MAX_PROJECT_ASSETS} images.`,
    );

  const groups = clone(project.groups);
  const usedGroupIds = new Set(groups.map((group) => group.id));
  const groupIdMap = new Map(
    template.groups.map((group) => [
      group.id,
      allocateUniqueId("group", usedGroupIds),
    ]),
  );
  if (groups.length + template.groups.length > MAX_PROJECT_GROUPS)
    throw new Error(
      `A project can contain at most ${MAX_PROJECT_GROUPS} groups.`,
    );
  const groupDelayMap = new Map<string, number>();
  for (const templateGroup of template.groups) {
    const members = template.layers.filter(
      (layer) => layer.groupId === templateGroup.id,
    );
    const timelineMembers = members.filter(
      (layer) => layer.startMode === "timeline",
    );
    let delay = templateGroup.delay;
    if (timelineMembers.length > 0) {
      const desired = Math.max(0, templateGroup.delay + insertionOffset);
      // Preserve authored group/Triggered timing for normal later inserts.
      // Only lower the group delay when an earlier playhead would otherwise
      // require a negative Timeline-layer delay.
      delay = Math.min(templateGroup.delay, desired);
    }
    groupDelayMap.set(templateGroup.id, delay);
    groups.push({
      ...clone(templateGroup),
      id: groupIdMap.get(templateGroup.id) ?? makeId("group"),
      delay,
    });
  }

  const usedLayerIds = new Set(project.layers.map((layer) => layer.id));
  const layerIdMap = new Map(
    template.layers.map((layer) => [
      layer.id,
      allocateUniqueId("layer", usedLayerIds),
    ]),
  );
  const usedEventIds = new Set(
    project.layers.flatMap((layer) => layer.events.map((event) => event.id)),
  );
  const insertedLayers = template.layers.map((source) => {
    const layer = clone(source);
    layer.id = layerIdMap.get(source.id) ?? makeId("layer");
    layer.assetId = source.assetId
      ? (assetIdMap.get(source.assetId) ?? source.assetId)
      : null;
    if (layer.appearance.effects.visualMask.maskAssetId)
      layer.appearance.effects.visualMask.maskAssetId =
        assetIdMap.get(layer.appearance.effects.visualMask.maskAssetId) ??
        layer.appearance.effects.visualMask.maskAssetId;
    if (
      (layer.type === "burst" || layer.type === "emitter") &&
      layer.spawn.maskAssetId
    )
      layer.spawn.maskAssetId =
        assetIdMap.get(layer.spawn.maskAssetId) ?? layer.spawn.maskAssetId;
    layer.parentId = source.parentId
      ? (layerIdMap.get(source.parentId) ?? null)
      : null;
    layer.events = source.events.map((event) => ({
      ...event,
      id: allocateUniqueId("event", usedEventIds),
      targetLayerId: layerIdMap.get(event.targetLayerId) ?? event.targetLayerId,
    }));
    layer.groupId = source.groupId
      ? (groupIdMap.get(source.groupId) ?? null)
      : null;
    const sourceGroup = source.groupId
      ? template.groups.find((group) => group.id === source.groupId)
      : null;
    const insertedGroupDelay = source.groupId
      ? (groupDelayMap.get(source.groupId) ?? sourceGroup?.delay ?? 0)
      : 0;
    if (source.startMode === "timeline") {
      const sourceGroupDelay = sourceGroup?.delay ?? 0;
      layer.timing = {
        ...layer.timing,
        delay: Math.max(
          0,
          source.timing.delay +
            sourceGroupDelay +
            insertionOffset -
            insertedGroupDelay,
        ),
      };
    } else if (sourceGroup) {
      layer.timing = {
        ...layer.timing,
        delay: Math.max(
          0,
          source.timing.delay + sourceGroup.delay - insertedGroupDelay,
        ),
      };
    }
    layer.solo = false;
    return layer;
  });
  const combined = validateProject({
    ...project,
    assets,
    groups,
    layers: [...project.layers, ...insertedLayers],
    preview: {
      ...project.preview,
      duration: clamp(
        Math.max(project.preview.duration, insertionTime + template.duration),
        500,
        30_000,
      ),
    },
  });
  if (!combined.ok || !combined.project)
    throw new Error(
      combined.error ?? "This template does not fit in the current project.",
    );
  return {
    project: combined.project,
    insertedLayerIds: insertedLayers.map((layer) => layer.id),
  };
}
