export interface PreviewSpriteLifecycle {
  destroy: () => void;
  getData: (key: string) => unknown;
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
