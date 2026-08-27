import { alphaMaskThresholdByte, maximumAlphaMaskValue } from "./alphaMask";
import { DEFAULT_FRAME_ANIMATION } from "./defaults";
import { normalizeFrameAnimation } from "./spriteSheet";
import {
  isSpawnLayer,
  type VfxAsset,
  type VfxLayer,
  type VfxProject,
} from "./types";

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
export function referencedAssetIds(
  layers: readonly VfxLayer[],
): ReadonlySet<string> {
  const assetIds = new Set<string>();
  for (const layer of layers) {
    if (layer.assetId) assetIds.add(layer.assetId);
    const visualMaskAssetId = layer.appearance.effects.visualMask.maskAssetId;
    if (visualMaskAssetId) assetIds.add(visualMaskAssetId);
    if (isSpawnLayer(layer) && layer.spawn.maskAssetId)
      assetIds.add(layer.spawn.maskAssetId);
  }
  return assetIds;
}

/**
 * Reports every authoring reference to one asset. Each affected layer appears
 * once even when it uses the image in several roles. "Stored" mask choices are
 * retained preferences that are not currently enabled by that layer.
 */
export function analyzeAssetUsage(
  project: Pick<VfxProject, "layers">,
  assetId: string,
): AssetUsageReport {
  const layers: AssetLayerUsage[] = [];
  const counts: AssetUsageCounts = {
    affectedLayers: 0,
    artwork: 0,
    visualMaskActive: 0,
    visualMaskStored: 0,
    spawnSilhouetteActive: 0,
    spawnSilhouetteStored: 0,
  };

  for (const layer of project.layers) {
    const visualMask = layer.appearance.effects.visualMask;
    const usesVisualMask = visualMask.maskAssetId === assetId;
    const usesSpawnSilhouette =
      isSpawnLayer(layer) && layer.spawn.maskAssetId === assetId;
    const roles: AssetUsageRoleFlags = {
      artwork: layer.assetId === assetId,
      visualMaskActive: usesVisualMask && visualMask.enabled,
      visualMaskStored: usesVisualMask && !visualMask.enabled,
      spawnSilhouetteActive:
        usesSpawnSilhouette &&
        isSpawnLayer(layer) &&
        layer.spawn.shape === "mask",
      spawnSilhouetteStored:
        usesSpawnSilhouette &&
        isSpawnLayer(layer) &&
        layer.spawn.shape !== "mask",
    };
    if (!Object.values(roles).some(Boolean)) continue;

    layers.push({ layerId: layer.id, layerName: layer.name, roles });
    if (roles.artwork) counts.artwork += 1;
    if (roles.visualMaskActive) counts.visualMaskActive += 1;
    if (roles.visualMaskStored) counts.visualMaskStored += 1;
    if (roles.spawnSilhouetteActive) counts.spawnSilhouetteActive += 1;
    if (roles.spawnSilhouetteStored) counts.spawnSilhouetteStored += 1;
  }
  counts.affectedLayers = layers.length;
  return { assetId, layers, counts };
}

function clearVisualMaskReference(layer: VfxLayer, assetId: string): VfxLayer {
  const visualMask = layer.appearance.effects.visualMask;
  if (visualMask.maskAssetId !== assetId) return layer;
  return {
    ...layer,
    appearance: {
      ...layer.appearance,
      effects: {
        ...layer.appearance.effects,
        visualMask: {
          ...visualMask,
          enabled: false,
          maskAssetId: null,
        },
      },
    },
  };
}

/**
 * Reconciles every dependent layer when shared asset metadata changes. Visual
 * masks use the full GPU texture, while spawn masks and frame ranges depend on
 * the asset's current alpha sample and sprite-sheet geometry.
 */
export function layersAfterAssetChanged(
  layers: readonly VfxLayer[],
  asset: VfxAsset,
  previousAsset?: VfxAsset,
): VfxLayer[] {
  const spriteSheetWasRemoved = Boolean(
    previousAsset?.spriteSheet && !asset.spriteSheet,
  );
  return layers.map((layer) => {
    let next = layer;
    if (next.assetId === asset.id) {
      if (asset.spriteSheet)
        next = {
          ...next,
          frameAnimation: normalizeFrameAnimation(
            next.frameAnimation,
            asset.spriteSheet.frameCount,
          ),
        } as VfxLayer;
      else if (spriteSheetWasRemoved)
        next = {
          ...next,
          frameAnimation: { ...DEFAULT_FRAME_ANIMATION },
        } as VfxLayer;
    }
    const remainsUsableAsSpawnMask = Boolean(
      !asset.builtIn &&
      !asset.spriteSheet &&
      asset.alphaMask &&
      maximumAlphaMaskValue(asset.alphaMask) >=
        alphaMaskThresholdByte(
          isSpawnLayer(next) ? next.spawn.maskThreshold : 0,
        ),
    );
    if (
      !remainsUsableAsSpawnMask &&
      isSpawnLayer(next) &&
      next.spawn.maskAssetId === asset.id
    )
      next = {
        ...next,
        spawn: {
          ...next.spawn,
          shape: next.spawn.shape === "mask" ? "point" : next.spawn.shape,
          distribution:
            next.spawn.shape === "mask" ? "random" : next.spawn.distribution,
          maskAssetId: null,
        },
      };
    return asset.spriteSheet ? clearVisualMaskReference(next, asset.id) : next;
  });
}

/**
 * Removes or disables every asset reference that is invalid for the supplied
 * library. This is used when pasting settings captured before an asset edit.
 */
export type LayerAssetReferenceRepair =
  "layer image" | "visual mask" | "spawn silhouette" | "frame range";

export function sanitizeLayerAssetReferencesWithReport(
  layer: VfxLayer,
  assets: readonly VfxAsset[],
): { layer: VfxLayer; repairs: LayerAssetReferenceRepair[] } {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const primaryAsset = layer.assetId ? byId.get(layer.assetId) : undefined;
  let next: VfxLayer = {
    ...layer,
    assetId: primaryAsset ? layer.assetId : null,
    frameAnimation: primaryAsset?.spriteSheet
      ? normalizeFrameAnimation(
          layer.frameAnimation,
          primaryAsset.spriteSheet.frameCount,
        )
      : { ...DEFAULT_FRAME_ANIMATION },
  } as VfxLayer;

  const visualMask = next.appearance.effects.visualMask;
  const visualMaskAsset = visualMask.maskAssetId
    ? byId.get(visualMask.maskAssetId)
    : undefined;
  if (!visualMaskAsset || visualMaskAsset.spriteSheet)
    next = clearVisualMaskReference(next, visualMask.maskAssetId ?? "");
  if (visualMask.enabled && !visualMaskAsset)
    next = {
      ...next,
      appearance: {
        ...next.appearance,
        effects: {
          ...next.appearance.effects,
          visualMask: { ...visualMask, enabled: false, maskAssetId: null },
        },
      },
    };

  if (isSpawnLayer(next) && next.spawn.maskAssetId) {
    const maskAsset = byId.get(next.spawn.maskAssetId);
    const maskIsUsable = Boolean(
      maskAsset &&
      !maskAsset.builtIn &&
      !maskAsset.spriteSheet &&
      maskAsset.alphaMask &&
      maximumAlphaMaskValue(maskAsset.alphaMask) >=
        alphaMaskThresholdByte(next.spawn.maskThreshold),
    );
    if (!maskIsUsable)
      next = {
        ...next,
        spawn: {
          ...next.spawn,
          shape: next.spawn.shape === "mask" ? "point" : next.spawn.shape,
          distribution:
            next.spawn.shape === "mask" ? "random" : next.spawn.distribution,
          maskAssetId: null,
        },
      };
  }

  const repairs: LayerAssetReferenceRepair[] = [];
  if (layer.assetId && next.assetId !== layer.assetId)
    repairs.push("layer image");
  const originalVisualMask = layer.appearance.effects.visualMask;
  const nextVisualMask = next.appearance.effects.visualMask;
  if (
    (originalVisualMask.enabled !== nextVisualMask.enabled ||
      originalVisualMask.maskAssetId !== nextVisualMask.maskAssetId) &&
    (originalVisualMask.enabled || originalVisualMask.maskAssetId !== null)
  )
    repairs.push("visual mask");
  if (
    isSpawnLayer(layer) &&
    isSpawnLayer(next) &&
    layer.spawn.maskAssetId &&
    next.spawn.maskAssetId !== layer.spawn.maskAssetId
  )
    repairs.push("spawn silhouette");
  if (
    layer.frameAnimation.startFrame !== next.frameAnimation.startFrame ||
    layer.frameAnimation.endFrame !== next.frameAnimation.endFrame
  )
    repairs.push("frame range");
  return { layer: next, repairs };
}

export function sanitizeLayerAssetReferences(
  layer: VfxLayer,
  assets: readonly VfxAsset[],
): VfxLayer {
  return sanitizeLayerAssetReferencesWithReport(layer, assets).layer;
}

/** Updates an asset and all dependent authoring state in one history value. */
export function projectAfterAssetChanged(
  project: VfxProject,
  asset: VfxAsset,
): VfxProject {
  const previousAsset = project.assets.find(
    (candidate) => candidate.id === asset.id,
  );
  if (!previousAsset)
    throw new Error(`The image “${asset.name}” is no longer in this project.`);
  return {
    ...project,
    assets: project.assets.map((candidate) =>
      candidate.id === asset.id ? asset : candidate,
    ),
    layers: layersAfterAssetChanged(project.layers, asset, previousAsset),
  };
}

/** Removes every layer-level reference to an asset in one undoable mutation. */
export function layersAfterAssetRemoved(
  layers: readonly VfxLayer[],
  assetId: string,
): VfxLayer[] {
  return layers.map((layer) => {
    let next: VfxLayer =
      layer.assetId === assetId
        ? {
            ...layer,
            assetId: null,
            frameAnimation: { ...DEFAULT_FRAME_ANIMATION },
          }
        : layer;
    if (isSpawnLayer(next) && next.spawn.maskAssetId === assetId)
      next = {
        ...next,
        spawn: {
          ...next.spawn,
          shape: next.spawn.shape === "mask" ? "point" : next.spawn.shape,
          distribution:
            next.spawn.shape === "mask" ? "random" : next.spawn.distribution,
          maskAssetId: null,
        },
      };
    return clearVisualMaskReference(next, assetId);
  });
}

/** Removes an asset and all dependent authoring state in one history value. */
export function projectAfterAssetRemoved(
  project: VfxProject,
  assetId: string,
): VfxProject {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error("That image is no longer in this project.");
  if (asset.builtIn) throw new Error("Built-in Vvfx images cannot be removed.");
  return {
    ...project,
    assets: project.assets.filter((candidate) => candidate.id !== assetId),
    layers: layersAfterAssetRemoved(project.layers, assetId),
  };
}
