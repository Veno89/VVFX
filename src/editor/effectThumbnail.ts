import { createEmptyProject } from "../vfx/defaults";
import { createProjectEvaluator, type ProjectEvaluator } from "../vfx/engine";
import { activeTimelineEnd } from "../vfx/projectState";
import { tintNumber } from "../vfx/color";
import type { EvaluatedInstance, VfxLayer } from "../vfx/types";

/**
 * Canvas 2D thumbnails for presets. They reuse the deterministic evaluator,
 * so motion and timing match the editor; experimental WebGL effects are left
 * out and built-in artwork is redrawn with the same geometry as the preview.
 */

const TEXTURE_SIZE = 128;

type BuiltInKind = "flash" | "ring" | "spark" | "cloud";

const BUILT_IN_KINDS: Record<string, BuiltInKind> = {
  "builtin-flash": "flash",
  "builtin-ring": "ring",
  "builtin-spark": "spark",
  "builtin-cloud": "cloud",
};

function circle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawBuiltIn(context: CanvasRenderingContext2D, kind: BuiltInKind) {
  if (kind === "flash") {
    circle(context, 64, 64, 60, 0.08);
    circle(context, 64, 64, 46, 0.16);
    circle(context, 64, 64, 30, 0.35);
    circle(context, 64, 64, 13, 0.95);
  } else if (kind === "ring") {
    for (const [width, alpha] of [
      [9, 0.17],
      [3, 0.95],
    ] as const) {
      context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      context.lineWidth = width;
      context.beginPath();
      context.arc(64, 64, 46, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (kind === "spark") {
    context.fillStyle = "rgba(255, 255, 255, 0.16)";
    context.beginPath();
    context.roundRect(9, 51, 110, 26, 13);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.beginPath();
    context.roundRect(17, 59, 94, 10, 5);
    context.fill();
  } else {
    circle(context, 44, 68, 34, 0.18);
    circle(context, 76, 54, 38, 0.18);
    circle(context, 92, 76, 28, 0.18);
    circle(context, 61, 69, 29, 0.34);
    circle(context, 79, 70, 24, 0.34);
  }
}

export interface ThumbnailScene {
  evaluator: ProjectEvaluator;
  duration: number;
  layerOrder: Map<string, number>;
  /** Pixels per effect unit at a 100 px thumbnail. */
  fitScale: number;
  /** A busy, representative moment for the still frame. */
  posterTime: number;
}

function instanceExtent(instance: EvaluatedInstance) {
  // Built-in art fades out well inside its 128 px square; fit the bright core.
  const half =
    TEXTURE_SIZE *
    0.36 *
    Math.max(Math.abs(instance.scaleX), Math.abs(instance.scaleY));
  return Math.max(Math.abs(instance.x), Math.abs(instance.y)) + half;
}

export function createThumbnailScene(layers: VfxLayer[]): ThumbnailScene {
  const project = createEmptyProject("Thumbnail");
  project.layers = layers;
  const evaluator = createProjectEvaluator(project);
  const duration = Math.max(200, activeTimelineEnd(project));
  let extent = 1;
  let posterTime = duration * 0.3;
  let busiest = -1;
  for (let step = 0; step <= 16; step += 1) {
    const time = (duration * step) / 16;
    const instances = evaluator.evaluate(time, null);
    let presence = 0;
    for (const instance of instances) {
      presence += instance.opacity;
      // Faint stragglers should not shrink the whole effect.
      if (instance.opacity < 0.2) continue;
      extent = Math.max(extent, instanceExtent(instance));
    }
    if (presence > busiest) {
      busiest = presence;
      posterTime = time;
    }
  }
  return {
    evaluator,
    duration,
    layerOrder: new Map(layers.map((layer, index) => [layer.id, index])),
    fitScale: Math.min(1.4, 48 / extent),
    posterTime,
  };
}

const textureCache = new Map<string, HTMLCanvasElement>();

function builtInTexture(kind: BuiltInKind, tint: number | null) {
  const key = `${kind}|${tint ?? "none"}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (tint !== null && tint !== 0xffffff) {
    // Built-in art is pure white, so Phaser's multiplicative tint is simply
    // the tint color under the artwork's own alpha.
    const mask = builtInTexture(kind, null);
    if (!mask) return null;
    context.fillStyle = `#${tint.toString(16).padStart(6, "0")}`;
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
  } else {
    drawBuiltIn(context, kind);
  }
  // Tints change every frame with color-over-lifetime; keep the cache bounded.
  if (textureCache.size > 256) textureCache.clear();
  textureCache.set(key, canvas);
  return canvas;
}

/** Quantizes tints to 4 bits per channel so cached textures stay few. */
function quantizedTint(instance: EvaluatedInstance): number | null {
  if (!instance.tint) return null;
  const value = tintNumber(instance.tint, instance.tintStrength);
  const channel = (shift: number) => (value >> shift) & 0xff & 0xf0;
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function drawThumbnailFrame(
  context: CanvasRenderingContext2D,
  scene: ThumbnailScene,
  time: number,
  size: number,
) {
  const zoom = scene.fitScale * (size / 100);
  context.clearRect(0, 0, size, size);
  const instances = scene.evaluator
    .evaluate(time, null)
    .filter((instance) => instance.opacity > 0.005)
    .sort(
      (left, right) =>
        (scene.layerOrder.get(left.layerId) ?? 0) -
          (scene.layerOrder.get(right.layerId) ?? 0) ||
        (right.trailIndex ?? -1) - (left.trailIndex ?? -1),
    );
  for (const instance of instances) {
    const kind = instance.assetId
      ? BUILT_IN_KINDS[instance.assetId]
      : undefined;
    if (!kind) continue;
    const texture = builtInTexture(kind, quantizedTint(instance));
    if (!texture) continue;
    context.save();
    context.globalAlpha = Math.min(1, instance.opacity);
    context.globalCompositeOperation =
      instance.blendMode === "add" ? "lighter" : "source-over";
    context.translate(
      size / 2 + instance.x * zoom,
      size / 2 + instance.y * zoom,
    );
    context.rotate((instance.rotation * Math.PI) / 180);
    context.scale(instance.scaleX * zoom, instance.scaleY * zoom);
    context.drawImage(texture, -TEXTURE_SIZE / 2, -TEXTURE_SIZE / 2);
    context.restore();
  }
}
