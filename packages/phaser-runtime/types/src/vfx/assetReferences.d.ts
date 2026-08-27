import { type VfxAsset, type VfxLayer, type VfxProject } from "./types";
export interface AssetUsageRoleFlags {
  artwork: boolean;
  visualMaskActive: boolean;
  visualMaskStored: boolean;
  spawnSilhouetteActive: boolean;
  spawnSilhouetteStored: boolean;
}
export interface AssetLayerUsage {
  layerId: string;
  layerName: string;
  roles: AssetUsageRoleFlags;
}
export interface AssetUsageCounts {
  affectedLayers: number;
  artwork: number;
  visualMaskActive: number;
  visualMaskStored: number;
  spawnSilhouetteActive: number;
  spawnSilhouetteStored: number;
}
export interface AssetUsageReport {
  assetId: string;
  layers: AssetLayerUsage[];
  counts: AssetUsageCounts;
}
/**
 * Returns every image needed to preserve the authored layer definitions.
 * Disabled mask features still retain their selected image, so those stored
 * references must travel with an exact runtime export as well.
 */
export declare function referencedAssetIds(
  layers: readonly VfxLayer[],
): ReadonlySet<string>;
/**
 * Reports every authoring reference to one asset. Each affected layer appears
 * once even when it uses the image in several roles. "Stored" mask choices are
 * retained preferences that are not currently enabled by that layer.
 */
export declare function analyzeAssetUsage(
  project: Pick<VfxProject, "layers">,
  assetId: string,
): AssetUsageReport;
/**
 * Reconciles every dependent layer when shared asset metadata changes. Visual
 * masks use the full GPU texture, while spawn masks and frame ranges depend on
 * the asset's current alpha sample and sprite-sheet geometry.
 */
export declare function layersAfterAssetChanged(
  layers: readonly VfxLayer[],
  asset: VfxAsset,
  previousAsset?: VfxAsset,
): VfxLayer[];
/**
 * Removes or disables every asset reference that is invalid for the supplied
 * library. This is used when pasting settings captured before an asset edit.
 */
export type LayerAssetReferenceRepair =
  "layer image" | "visual mask" | "spawn silhouette" | "frame range";
export declare function sanitizeLayerAssetReferencesWithReport(
  layer: VfxLayer,
  assets: readonly VfxAsset[],
): {
  layer: VfxLayer;
  repairs: LayerAssetReferenceRepair[];
};
export declare function sanitizeLayerAssetReferences(
  layer: VfxLayer,
  assets: readonly VfxAsset[],
): VfxLayer;
/** Updates an asset and all dependent authoring state in one history value. */
export declare function projectAfterAssetChanged(
  project: VfxProject,
  asset: VfxAsset,
): VfxProject;
export interface AssetRelinkResult {
  project: VfxProject;
  affectedLayers: number;
  repairs: LayerAssetReferenceRepair[];
}
/** Moves every authored role to another image while keeping both assets. */
export declare function projectAfterAssetRelinked(
  project: VfxProject,
  sourceAssetId: string,
  targetAssetId: string,
): AssetRelinkResult;
/** Removes every layer-level reference to an asset in one undoable mutation. */
export declare function layersAfterAssetRemoved(
  layers: readonly VfxLayer[],
  assetId: string,
): VfxLayer[];
/** Removes an asset and all dependent authoring state in one history value. */
export declare function projectAfterAssetRemoved(
  project: VfxProject,
  assetId: string,
): VfxProject;
