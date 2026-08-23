import { maximumAlphaMaskValue } from "./alphaMask";
import { isSpawnLayer, type VfxAsset, type VfxLayer } from "./types";

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
 * Clears references that became invalid when one asset changed kind. Visual
 * masks use the full GPU texture, so losing the compact spawn-alpha sample is
 * irrelevant; only conversion to a sprite sheet makes the visual mask invalid.
 */
export function layersAfterAssetChanged(
  layers: readonly VfxLayer[],
  asset: VfxAsset,
): VfxLayer[] {
  const remainsUsableAsSpawnMask = Boolean(
    !asset.builtIn &&
    !asset.spriteSheet &&
    asset.alphaMask &&
    maximumAlphaMaskValue(asset.alphaMask) > 0,
  );

  return layers.map((layer) => {
    let next = layer;
    if (
      !remainsUsableAsSpawnMask &&
      isSpawnLayer(next) &&
      next.spawn.maskAssetId === asset.id
    )
      next = {
        ...next,
        spawn: {
          ...next.spawn,
          shape: "point",
          distribution: "random",
          maskAssetId: null,
        },
      };
    return asset.spriteSheet ? clearVisualMaskReference(next, asset.id) : next;
  });
}

/** Removes every layer-level reference to an asset in one undoable mutation. */
export function layersAfterAssetRemoved(
  layers: readonly VfxLayer[],
  assetId: string,
): VfxLayer[] {
  return layers.map((layer) => {
    let next: VfxLayer =
      layer.assetId === assetId ? { ...layer, assetId: null } : layer;
    if (isSpawnLayer(next) && next.spawn.maskAssetId === assetId)
      next = {
        ...next,
        spawn: {
          ...next.spawn,
          shape: "point",
          distribution: "random",
          maskAssetId: null,
        },
      };
    return clearVisualMaskReference(next, assetId);
  });
}
