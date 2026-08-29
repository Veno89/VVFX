export interface PreviewSpriteLifecycle {
  destroy: () => void;
  getData: (key: string) => unknown;
}

export interface PreviewDragState {
  setData: (key: string, value: unknown) => unknown;
}

/**
 * Ends transient pointer ownership before a restart reapplies evaluated state.
 * This preserves the Phaser canvas while allowing sprites and path handles to
 * return to their deterministic positions on the next preview synchronization.
 */
export function resetPreviewDragState(
  sprites: Iterable<PreviewDragState>,
  pathHandles: Iterable<{ circle: PreviewDragState }>,
): void {
  for (const sprite of sprites) sprite.setData("vvfxDragging", false);
  for (const handle of pathHandles)
    handle.circle.setData("vvfxDragging", false);
}

export function applyPreviewRestartRevision(
  previousRevision: number,
  nextRevision: number,
  sprites: Iterable<PreviewDragState>,
  pathHandles: Iterable<{ circle: PreviewDragState }>,
): number {
  if (Object.is(previousRevision, nextRevision)) return previousRevision;
  resetPreviewDragState(sprites, pathHandles);
  return nextRevision;
}

/**
 * Removes preview objects that no longer have an evaluated instance. A drag may
 * temporarily outlive an instance while its layer is still active, but deleting
 * the owning layer is a hard lifecycle boundary and must always destroy it.
 */
export function destroyStalePreviewSprites<
  Sprite extends PreviewSpriteLifecycle,
>(
  sprites: Map<string, Sprite>,
  nextKeys: ReadonlySet<string>,
  currentLayerIds: ReadonlySet<string>,
): void {
  for (const [key, sprite] of sprites) {
    if (nextKeys.has(key)) continue;
    const layerId = sprite.getData("layerId");
    const ownerStillExists =
      typeof layerId === "string" && currentLayerIds.has(layerId);
    if (ownerStillExists && sprite.getData("vvfxDragging")) continue;
    sprite.destroy();
    sprites.delete(key);
  }
}
