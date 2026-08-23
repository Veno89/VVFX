import { makeId } from "./defaults";
import { activationEffectiveEnd, compileLayerActivations } from "./events";
import { resolveProjectGroups } from "./groups";
import type { VfxAsset, VfxProject } from "./types";

export type LayerCreationSource = "asset" | "manual";

export function newLayerName(
  assets: VfxAsset[],
  assetId: string | null,
  source: LayerCreationSource,
): string {
  if (source === "manual" || !assetId) return "Unnamed";

  return assets.find((asset) => asset.id === assetId)?.name.trim() || "Unnamed";
}

export function projectFingerprint(project: VfxProject): string {
  return JSON.stringify({
    ...project,
    metadata: { ...project.metadata, updatedAt: "" },
    preview: {
      ...project.preview,
      background: "checkerboard",
      customColor: "",
      showGrid: false,
      zoom: 1,
      loop: true,
    },
    assets: project.assets.map(({ dataUrl, ...asset }) => ({
      ...asset,
      dataSignature: `${dataUrl.length}:${dataUrl.slice(0, 32)}`,
    })),
  });
}

export function hasMeaningfulProjectWork(project: VfxProject): boolean {
  return (
    project.layers.length > 0 ||
    project.groups.length > 0 ||
    project.timeline.markers.length > 0 ||
    project.timeline.notes.trim().length > 0 ||
    project.assets.some((asset) => !asset.builtIn) ||
    project.metadata.name.trim() !== "Untitled Effect"
  );
}

export function activeTimelineEnd(project: VfxProject): number {
  const resolvedProject = resolveProjectGroups(project);
  const soloIds = new Set(
    resolvedProject.layers
      .filter((layer) => layer.solo)
      .map((layer) => layer.id),
  );
  const activeLayers = resolvedProject.layers.filter(
    (layer) =>
      layer.enabled &&
      layer.visible &&
      (soloIds.size === 0 || soloIds.has(layer.id)),
  );
  if (activeLayers.length === 0) return project.preview.duration;
  const activeIds = new Set(activeLayers.map((layer) => layer.id));
  const layersById = new Map(
    resolvedProject.layers.map((layer) => [layer.id, layer]),
  );
  const schedule = compileLayerActivations(
    resolvedProject,
    project.preview.duration,
  );
  const activeActivations = schedule.activations.filter((activation) =>
    activeIds.has(activation.layerId),
  );
  if (schedule.truncated) return project.preview.duration;
  if (activeActivations.length === 0) return project.preview.duration;
  if (
    activeActivations.some(
      (activation) => !Number.isFinite(activationEffectiveEnd(activation)),
    )
  )
    return project.preview.duration;

  const contentEnd = Math.max(
    ...activeActivations.map((activation) => {
      const layer = layersById.get(activation.layerId);
      if (!layer) return 0;
      const trailTail = layer.trail.enabled
        ? Math.min(
            layer.trail.lifetime,
            layer.trail.count * layer.trail.spacing,
          )
        : 0;
      return (
        activationEffectiveEnd(activation) +
        layer.random.duration +
        layer.random.delay +
        trailTail
      );
    }),
  );
  return Math.max(50, Math.min(project.preview.duration, contentEnd));
}

export function copyProject(
  project: VfxProject,
  name = `${project.metadata.name} copy`,
): VfxProject {
  const now = new Date().toISOString();
  return {
    ...JSON.parse(JSON.stringify(project)),
    metadata: {
      id: makeId("project"),
      name: name.trim() || `${project.metadata.name} copy`,
      createdAt: now,
      updatedAt: now,
    },
  } as VfxProject;
}
