import type { VfxLayer } from "./types";
import { MAX_ATTACHMENT_DEPTH } from "./inputLimits";

/** Returns the first closed parent chain, including its repeated endpoint. */
export function findLayerAttachmentCycle(
  layers: readonly VfxLayer[],
): string[] | null {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const completed = new Set<string>();

  for (const layer of layers) {
    if (completed.has(layer.id)) continue;
    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let currentId: string | null = layer.id;

    while (currentId && byId.has(currentId)) {
      const cycleStart = pathIndex.get(currentId);
      if (cycleStart !== undefined)
        return [...path.slice(cycleStart), currentId];
      if (completed.has(currentId)) break;
      pathIndex.set(currentId, path.length);
      path.push(currentId);
      currentId = byId.get(currentId)?.parentId ?? null;
    }

    path.forEach((id) => completed.add(id));
  }

  return null;
}

/**
 * Checks one proposed parent edge without mutating the graph. Unknown parents
 * and already-cyclic parent chains are rejected as invalid authoring targets.
 */
export function attachmentWouldCycle(
  layers: readonly VfxLayer[],
  layerId: string,
  parentId: string | null,
): boolean {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  if (!byId.has(layerId)) return true;
  if (parentId === null) return false;
  if (!byId.has(parentId)) return true;

  const visited = new Set<string>();
  let currentId: string | null = parentId;
  while (currentId) {
    if (currentId === layerId || visited.has(currentId)) return true;
    visited.add(currentId);
    if (visited.size > MAX_ATTACHMENT_DEPTH) return true;
    const current = byId.get(currentId);
    if (!current) return true;
    currentId = current.parentId;
  }
  return false;
}

export function maximumLayerAttachmentDepth(
  layers: readonly VfxLayer[],
): number {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  let maximum = 0;
  for (const layer of layers) {
    const visited = new Set<string>();
    let current: VfxLayer | undefined = layer;
    while (current?.parentId) {
      if (visited.has(current.id)) return Number.POSITIVE_INFINITY;
      visited.add(current.id);
      maximum = Math.max(maximum, visited.size);
      current = byId.get(current.parentId);
    }
  }
  return maximum;
}

export function canAttachLayer(
  layers: readonly VfxLayer[],
  layerId: string,
  parentId: string | null,
): boolean {
  return !attachmentWouldCycle(layers, layerId, parentId);
}
