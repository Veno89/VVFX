import { describe, expect, it, vi } from "vitest";
import { destroyStalePreviewSprites } from "../src/preview/spriteLifecycle";

function fakeSprite(layerId: string, dragging: boolean) {
  const data = new Map<string, unknown>([
    ["layerId", layerId],
    ["vvfxDragging", dragging],
  ]);
  return {
    destroy: vi.fn(),
    getData: (key: string) => data.get(key),
    setDragging: (next: boolean) => data.set("vvfxDragging", next),
  };
}

describe("preview sprite lifecycle", () => {
  it("destroys a stale dragging sprite when its owning layer was deleted", () => {
    const deleted = fakeSprite("deleted-layer", true);
    const sprites = new Map([["deleted-instance", deleted]]);

    destroyStalePreviewSprites(sprites, new Set(), new Set());

    expect(deleted.destroy).toHaveBeenCalledOnce();
    expect(sprites.size).toBe(0);
  });

  it("preserves a stale drag only while its owning layer still exists", () => {
    const dragging = fakeSprite("live-layer", true);
    const sprites = new Map([["temporarily-stale-instance", dragging]]);
    const liveLayerIds = new Set(["live-layer"]);

    destroyStalePreviewSprites(sprites, new Set(), liveLayerIds);
    expect(dragging.destroy).not.toHaveBeenCalled();
    expect(sprites.has("temporarily-stale-instance")).toBe(true);

    dragging.setDragging(false);
    destroyStalePreviewSprites(sprites, new Set(), liveLayerIds);
    expect(dragging.destroy).toHaveBeenCalledOnce();
    expect(sprites.size).toBe(0);
  });
});
