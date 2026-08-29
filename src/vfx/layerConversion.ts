import { DEFAULT_BEAM, DEFAULT_SPAWN } from "./defaults";
import { MAX_VFX_POSITION_MAGNITUDE } from "./inputLimits";
import { canonicalizeLayerCapabilities } from "./layerLifecycle";
import type { LayerType, VfxAsset, VfxLayer } from "./types";

const clampPosition = (value: number) =>
  Math.max(
    -MAX_VFX_POSITION_MAGNITUDE,
    Math.min(MAX_VFX_POSITION_MAGNITUDE, value),
  );

function authoredBeamGeometry(
  layer: VfxLayer,
  asset: VfxAsset | null | undefined,
): Pick<VfxLayer, "transform"> & {
  beam: NonNullable<VfxLayer["beam"]>;
} {
  if (layer.beam) {
    return {
      transform: layer.transform,
      beam: { ...layer.beam },
    };
  }

  const sourceWidth =
    asset?.id === layer.assetId
      ? (asset.spriteSheet?.frameWidth ?? asset.width)
      : undefined;
  const horizontalScale = layer.transform.separateScale
    ? layer.transform.startScaleX
    : layer.transform.startScale;
  const authoredLength = (sourceWidth ?? Number.NaN) * horizontalScale;
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(authoredLength) ||
    (sourceWidth ?? 0) <= 0 ||
    authoredLength <= 0
  ) {
    return {
      transform: layer.transform,
      beam: { ...DEFAULT_BEAM },
    };
  }

  const length = Math.min(authoredLength, MAX_VFX_POSITION_MAGNITUDE);
  const angle = (layer.transform.rotation * Math.PI) / 180;
  const endX = clampPosition(Math.cos(angle) * length);
  const endY = clampPosition(Math.sin(angle) * length);

  return {
    // Ordinary sprites store their center. A Beam stores endpoint A in x/y,
    // so move A half a vector backward to keep the artwork centered.
    transform: {
      ...layer.transform,
      x: clampPosition(layer.transform.x - endX / 2),
      y: clampPosition(layer.transform.y - endY / 2),
    },
    beam: { endX, endY },
  };
}

/**
 * Changes only the layer's capability discriminator, then applies the same
 * canonical capability rules used by edit, save, preview, and export paths.
 * The caller keeps array position, selection, and workspace organization.
 */
export function convertLayerType(
  layer: VfxLayer,
  targetType: LayerType,
  asset?: VfxAsset | null,
): VfxLayer {
  if (layer.type === targetType) return layer;

  if (targetType === "beam") {
    const geometry = authoredBeamGeometry(layer, asset);
    return canonicalizeLayerCapabilities({
      ...layer,
      type: targetType,
      transform: geometry.transform,
      spawn: null,
      beam: geometry.beam,
    } as VfxLayer);
  }

  if (targetType === "burst" || targetType === "emitter") {
    const spawn =
      layer.type === "burst" || layer.type === "emitter"
        ? { ...layer.spawn }
        : { ...DEFAULT_SPAWN };
    return canonicalizeLayerCapabilities({
      ...layer,
      type: targetType,
      spawn: {
        ...spawn,
        // Burst supports a larger one-shot batch than a repeating emitter.
        count:
          targetType === "emitter" ? Math.min(25, spawn.count) : spawn.count,
      },
      beam: null,
    } as VfxLayer);
  }

  return canonicalizeLayerCapabilities({
    ...layer,
    type: targetType,
    spawn: null,
    beam: null,
  } as VfxLayer);
}

export interface LayerTypeConversionBatchResult {
  layers: VfxLayer[];
  converted: number;
  skipped: number;
}

/** Converts a unique set of unlocked layers without changing array order. */
export function convertLayerTypes(
  layers: VfxLayer[],
  assets: VfxAsset[],
  requestedLayerIds: readonly string[],
  targetType: LayerType,
  lockedLayerIds: readonly string[] = [],
): LayerTypeConversionBatchResult {
  const requestedIds = new Set(requestedLayerIds);
  const lockedIds = new Set(lockedLayerIds);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  let converted = 0;
  const nextLayers = layers.map((layer) => {
    if (
      !requestedIds.has(layer.id) ||
      lockedIds.has(layer.id) ||
      layer.type === targetType
    )
      return layer;
    converted += 1;
    return convertLayerType(
      layer,
      targetType,
      layer.assetId ? assetsById.get(layer.assetId) : undefined,
    );
  });

  return {
    layers: converted > 0 ? nextLayers : layers,
    converted,
    skipped: requestedIds.size - converted,
  };
}
