import { describe, expect, it, vi } from "vitest";
import {
  applyPreviewRestartRevision,
  destroyStalePreviewSprites,
} from "../src/preview/spriteLifecycle";

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
  it("ends sprite and path-handle drags so restart can restore positions", () => {
    const sprite = fakeSprite("live-layer", true);
    const handleData = new Map<string, unknown>([["vvfxDragging", true]]);
    const pathHandle = {
      circle: {
        setData: vi.fn((key: string, value: unknown) => {
          handleData.set(key, value);
        }),
      },
    };

    const sprites = [
      {
        setData: (_key: string, value: unknown) =>
          sprite.setDragging(Boolean(value)),
      },
    ];

    expect(applyPreviewRestartRevision(3, 3, sprites, [pathHandle])).toBe(3);
    expect(sprite.getData("vvfxDragging")).toBe(true);
    expect(pathHandle.circle.setData).not.toHaveBeenCalled();

    expect(applyPreviewRestartRevision(3, 4, sprites, [pathHandle])).toBe(4);

    expect(sprite.getData("vvfxDragging")).toBe(false);
    expect(pathHandle.circle.setData).toHaveBeenCalledWith(
      "vvfxDragging",
      false,
    );
    expect(handleData.get("vvfxDragging")).toBe(false);
  });

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
