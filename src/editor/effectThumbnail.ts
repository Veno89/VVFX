import { createEmptyProject } from "../vfx/defaults";
import { createProjectEvaluator, type ProjectEvaluator } from "../vfx/engine";
import { activeTimelineEnd } from "../vfx/projectState";
import { tintNumber } from "../vfx/color";
import type { EvaluatedInstance, VfxAsset, VfxLayer } from "../vfx/types";

/**
 * Canvas 2D thumbnails for presets. They reuse the deterministic evaluator,
 * so motion and timing match the editor; experimental WebGL effects are left
 * out, built-in artwork is redrawn with the same geometry as the preview, and
 * uploaded images draw once decoded, with Phaser's multiplicative tint.
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
  assets: Map<string, VfxAsset>;
  images: Map<string, HTMLImageElement>;
  /** Settles when every uploaded image has decoded or failed. */
  ready: Promise<void>;
  duration: number;
  layerOrder: Map<string, number>;
  /** Pixels per effect unit at a 100 px thumbnail. */
  fitScale: number;
  /** A busy, representative moment for the still frame. */
  posterTime: number;
}

function instanceExtent(
  instance: EvaluatedInstance,
  assets: Map<string, VfxAsset>,
) {
  const asset = instance.assetId ? assets.get(instance.assetId) : undefined;
  const sheet = asset?.spriteSheet;
  const size =
    asset && !asset.builtIn
      ? Math.max(
          sheet?.frameWidth ?? asset.width ?? TEXTURE_SIZE,
          sheet?.frameHeight ?? asset.height ?? TEXTURE_SIZE,
        )
      : TEXTURE_SIZE;
  // Built-in art fades out well inside its square; fit the bright core.
  const half =
    size *
    0.36 *
    Math.max(Math.abs(instance.scaleX), Math.abs(instance.scaleY));
  return Math.max(Math.abs(instance.x), Math.abs(instance.y)) + half;
}

export function createThumbnailScene(
  layers: VfxLayer[],
  assets: VfxAsset[] = [],
): ThumbnailScene {
  const project = createEmptyProject("Thumbnail");
  project.layers = layers;
  if (assets.length > 0) project.assets = assets;
  const assetMap = new Map(project.assets.map((asset) => [asset.id, asset]));
  const images = new Map<string, HTMLImageElement>();
  const loads: Promise<void>[] = [];
  for (const asset of project.assets) {
    if (asset.builtIn || !asset.dataUrl) continue;
    const image = new Image();
    loads.push(
      new Promise((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      }),
    );
    image.src = asset.dataUrl;
    images.set(asset.id, image);
  }
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
      extent = Math.max(extent, instanceExtent(instance, assetMap));
    }
    if (presence > busiest) {
      busiest = presence;
      posterTime = time;
    }
  }
  return {
    evaluator,
    assets: assetMap,
    images,
    ready: Promise.all(loads).then(() => undefined),
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

const uploadedCache = new Map<string, HTMLCanvasElement>();

/** The visible source rectangle: one sprite-sheet frame, then any crop. */
function sourceRect(
  asset: VfxAsset,
  image: HTMLImageElement,
  instance: EvaluatedInstance,
) {
  const sheet = asset.spriteSheet;
  let x = 0;
  let y = 0;
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (sheet && instance.frame !== null) {
    const columns = Math.max(1, Math.floor(width / sheet.frameWidth));
    x = (instance.frame % columns) * sheet.frameWidth;
    y = Math.floor(instance.frame / columns) * sheet.frameHeight;
    width = sheet.frameWidth;
    height = sheet.frameHeight;
  }
  const frame = { width, height };
  const crop = instance.sourceCrop;
  if (crop) {
    x += crop.x * width;
    y += crop.y * height;
    width *= crop.width;
    height *= crop.height;
  }
  return {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
    frame,
    offsetX: crop ? crop.x * frame.width : 0,
    offsetY: crop ? crop.y * frame.height : 0,
  };
}

function uploadedTexture(
  asset: VfxAsset,
  image: HTMLImageElement,
  rect: ReturnType<typeof sourceRect>,
  tint: number | null,
) {
  const key = `${asset.id}|${rect.x},${rect.y},${rect.width},${rect.height}|${tint ?? "none"}`;
  const cached = uploadedCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(rect.width);
  canvas.height = Math.ceil(rect.height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  const drawSource = () =>
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
  drawSource();
  if (tint !== null && tint !== 0xffffff) {
    // Phaser multiplies texture color by the tint; keep the image's alpha.
    context.globalCompositeOperation = "multiply";
    context.fillStyle = `#${tint.toString(16).padStart(6, "0")}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "destination-in";
    drawSource();
  }
  if (uploadedCache.size > 256) uploadedCache.clear();
  uploadedCache.set(key, canvas);
  return canvas;
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
    const asset = instance.assetId
      ? scene.assets.get(instance.assetId)
      : undefined;
    const kind = instance.assetId
      ? (BUILT_IN_KINDS[instance.assetId] ??
        (asset?.builtIn as BuiltInKind | undefined))
      : undefined;
    let texture: HTMLCanvasElement | null = null;
    let drawX = -TEXTURE_SIZE / 2;
    let drawY = -TEXTURE_SIZE / 2;
    if (kind) {
      texture = builtInTexture(kind, quantizedTint(instance));
    } else if (asset && instance.assetId) {
      const image = scene.images.get(instance.assetId);
      if (!image?.complete || image.naturalWidth === 0) continue;
      const rect = sourceRect(asset, image, instance);
      texture = uploadedTexture(asset, image, rect, quantizedTint(instance));
      drawX = -rect.frame.width / 2 + rect.offsetX;
      drawY = -rect.frame.height / 2 + rect.offsetY;
    }
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
    context.drawImage(texture, drawX, drawY);
    context.restore();
  }
}
