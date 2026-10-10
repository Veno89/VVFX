import { useEffect, useRef } from "react";
import type { VfxLayer } from "../../vfx/types";
import {
  createThumbnailScene,
  drawThumbnailFrame,
  type ThumbnailScene,
} from "../effectThumbnail";

const sceneCache = new Map<string, ThumbnailScene>();

function sceneFor(id: string, createLayers: () => VfxLayer[]) {
  const cached = sceneCache.get(id);
  if (cached) return cached;
  const scene = createThumbnailScene(createLayers());
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
 * A small preview of a preset: a still, busy frame at rest that plays its
 * real motion while the surrounding choice is hovered or focused.
 */
export function EffectThumbnail({
  id,
  createLayers,
  size = 56,
  playing = false,
}: {
  /** Stable cache key, usually the preset id. */
  id: string;
  createLayers: () => VfxLayer[];
  size?: number;
  playing?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const createLayersRef = useRef(createLayers);
  useEffect(() => {
    createLayersRef.current = createLayers;
  }, [createLayers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let scene: ThumbnailScene;
    try {
      scene = sceneFor(id, createLayersRef.current);
    } catch {
      return;
    }
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * pixelRatio);
    canvas.height = Math.round(size * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (!playing || prefersReducedMotion()) {
      drawThumbnailFrame(context, scene, scene.posterTime, size);
      return;
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
