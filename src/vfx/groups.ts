import type { VfxGroup, VfxLayer, VfxProject } from "./types";

export function groupForLayer(
  project: Pick<VfxProject, "groups">,
  layer: Pick<VfxLayer, "groupId">,
): VfxGroup | null {
  if (!layer.groupId) return null;
  return project.groups.find((group) => group.id === layer.groupId) ?? null;
}

export function resolveLayerGroup(
  project: Pick<VfxProject, "groups" | "layers">,
  layer: VfxLayer,
): VfxLayer {
  const group = groupForLayer(project, layer);
  if (!group) return layer;
  const parent = layer.parentId
    ? project.layers.find((candidate) => candidate.id === layer.parentId)
    : null;
  const inheritsSharedPosition = parent?.groupId === group.id;
  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: layer.transform.x + (inheritsSharedPosition ? 0 : group.x),
      y: layer.transform.y + (inheritsSharedPosition ? 0 : group.y),
    },
    timing: {
      ...layer.timing,
      delay: layer.timing.delay + group.delay,
    },
  };
}

export function resolveProjectGroups(project: VfxProject): VfxProject {
  if (project.groups.length === 0) return project;
  return {
    ...project,
    layers: project.layers.map((layer) => resolveLayerGroup(project, layer)),
  };
}

export function groupTimelineRange(
  group: VfxGroup,
  layers: VfxLayer[],
): { start: number; end: number } {
  const members = layers.filter((layer) => layer.groupId === group.id);
  if (members.length === 0)
    return { start: group.delay, end: group.delay + 50 };
  return {
    start:
      group.delay + Math.min(...members.map((layer) => layer.timing.delay)),
    end:
      group.delay +
      Math.max(
        ...members.map(
          (layer) => layer.timing.delay + Math.max(50, layer.timing.duration),
        ),
      ),
  };
}
