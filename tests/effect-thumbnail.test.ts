import { describe, expect, it } from "vitest";
import { createThumbnailScene } from "../src/editor/effectThumbnail";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../src/vfx/presets";

describe("preset thumbnails", () => {
  it("fits every preset and picks a busy poster moment inside its playback", () => {
    const presets = [
      ...COMPOSITION_PRESETS.map((preset) => ({
        id: preset.id,
        layers: preset.create(),
      })),
      ...LAYER_PRESETS.map((preset) => ({
        id: preset.id,
        layers: [preset.create()],
      })),
    ];
    for (const { id, layers } of presets) {
      const scene = createThumbnailScene(layers);
      expect(Number.isFinite(scene.fitScale), id).toBe(true);
      expect(scene.fitScale, id).toBeGreaterThan(0);
      expect(scene.posterTime, id).toBeGreaterThanOrEqual(0);
      expect(scene.posterTime, id).toBeLessThanOrEqual(scene.duration);
      expect(
        scene.evaluator
          .evaluate(scene.posterTime, null)
          .some((instance) => instance.opacity > 0),
        id,
      ).toBe(true);
    }
  });
});
