import type { VfxLayer } from "./types";
/** Returns the first closed parent chain, including its repeated endpoint. */
export declare function findLayerAttachmentCycle(
  layers: readonly VfxLayer[],
): string[] | null;
/**
 * Checks one proposed parent edge without mutating the graph. Unknown parents
 * and already-cyclic parent chains are rejected as invalid authoring targets.
 */
export declare function attachmentWouldCycle(
  layers: readonly VfxLayer[],
  layerId: string,
  parentId: string | null,
): boolean;
export declare function maximumLayerAttachmentDepth(
  layers: readonly VfxLayer[],
): number;
export declare function canAttachLayer(
  layers: readonly VfxLayer[],
  layerId: string,
  parentId: string | null,
): boolean;
