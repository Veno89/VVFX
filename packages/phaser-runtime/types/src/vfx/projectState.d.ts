import type { VfxAsset, VfxProject } from "./types";
export type LayerCreationSource = "asset" | "manual";
export declare function newLayerName(
  assets: VfxAsset[],
  assetId: string | null,
  source: LayerCreationSource,
): string;
export declare function projectFingerprint(project: VfxProject): string;
export declare function hasMeaningfulProjectWork(project: VfxProject): boolean;
/**
 * Last moment with visible editor content: enabled layers that are also shown
 * and, when any layer is soloed, part of the solo set.
 */
export declare function activeTimelineEnd(project: VfxProject): number;
/**
 * Duration a game-facing export should play. With "Loop active range" on, the
 * export ends where enabled content ends, matching the editor loop instead of
 * carrying trailing silence. Eye visibility and Solo are editor-only, so they
 * never trim exported playback.
 */
export declare function exportPlaybackDuration(project: VfxProject): number;
export declare function copyProject(
  project: VfxProject,
  name?: string,
): VfxProject;
