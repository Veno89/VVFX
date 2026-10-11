import { useEffect, useRef } from "react";
import type { VfxAsset, VfxLayer } from "../../vfx/types";
import {
  createThumbnailScene,
  drawThumbnailFrame,
  type ThumbnailScene,
} from "../effectThumbnail";

const sceneCache = new Map<string, ThumbnailScene>();

function sceneFor(
  id: string,
  createLayers: () => VfxLayer[],
  assets: VfxAsset[] | undefined,
) {
  const cached = sceneCache.get(id);
  if (cached) return cached;
  // Saved templates come and go; keep the cache from growing without bound.
  if (sceneCache.size > 64) sceneCache.clear();
  const scene = createThumbnailScene(createLayers(), assets);
  sceneCache.set(id, scene);
  return scene;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A small preview of a preset or template: a still, busy frame at rest that
 * plays its real motion while the surrounding choice is hovered or focused.
 */
export function EffectThumbnail({
  id,
  createLayers,
  size = 56,
  playing = false,
  assets,
}: {
  /** Stable cache key, such as a preset id or a template id plus revision. */
  id: string;
  createLayers: () => VfxLayer[];
  /** Images the layers use; built-in art is always available. */
  assets?: VfxAsset[];
  size?: number;
  playing?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const createLayersRef = useRef(createLayers);
  const assetsRef = useRef(assets);
  useEffect(() => {
    createLayersRef.current = createLayers;
    assetsRef.current = assets;
  }, [assets, createLayers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let scene: ThumbnailScene;
    try {
      scene = sceneFor(id, createLayersRef.current, assetsRef.current);
    } catch {
      return;
    }
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * pixelRatio);
    canvas.height = Math.round(size * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (!playing || prefersReducedMotion()) {
      let current = true;
      const drawPoster = () =>
        drawThumbnailFrame(context, scene, scene.posterTime, size);
      drawPoster();
      // Uploaded images decode asynchronously; redraw once they can.
      void scene.ready.then(() => {
        if (current) drawPoster();
      });
      return () => {
        current = false;
      };
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      // A short pause after each pass makes the loop read as one effect.
      const loopLength = scene.duration + 300;
      const time = Math.min(scene.duration, (now - started) % loopLength);
      drawThumbnailFrame(context, scene, time, size);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [id, playing, size]);

  return (
    <canvas
      ref={canvasRef}
      className="effect-thumbnail"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
