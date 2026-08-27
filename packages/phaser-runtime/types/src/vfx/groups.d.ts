import type { VfxGroup, VfxLayer, VfxProject } from "./types";
export declare function groupForLayer(
  project: Pick<VfxProject, "groups">,
  layer: Pick<VfxLayer, "groupId">,
): VfxGroup | null;
export declare function resolveLayerGroup(
  project: Pick<VfxProject, "groups" | "layers">,
  layer: VfxLayer,
): VfxLayer;
export declare function resolveProjectGroups(project: VfxProject): VfxProject;
export declare function groupTimelineRange(
  group: VfxGroup,
  layers: VfxLayer[],
): {
  start: number;
  end: number;
};
