"use client";

import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import { tintNumber } from "../vfx/color";
import { evaluateProject } from "../vfx/engine";
import { resolveLayerGroup } from "../vfx/groups";
import {
  evaluateSpawnOffset,
  layerInstanceSeed,
} from "../vfx/instanceEvaluation";
import { sampleMotionPath } from "../vfx/motionPath";
import {
  alphaMaskOverlaySamples,
  alphaMaskWorldDimensions,
} from "../vfx/alphaMask";
import { applySpriteSheetFrames } from "../vfx/phaserFrames";
import { VVFX_INTERNAL_MISSING_TEXTURE_KEY } from "../vfx/inputLimits";
import {
  clearPhaserRenderingEffects,
  syncPhaserRenderingEffects,
  type PhaserRenderingAssetFrameResolver,
} from "../vfx/renderingEffects";
import {
  countRecentCreations,
  replicateInstancesForStress,
  type PreviewPerformanceSample,
} from "../vfx/performance";
import { isSpawnLayer, type VfxProject } from "../vfx/types";
import type { EvaluatedRenderingEffects } from "../vfx/renderingEffects";
import {
  layerPositionAfterPreviewDrag,
  pathPointAfterPreviewDrag,
} from "./dragPosition";
import { destroyStalePreviewSprites } from "./spriteLifecycle";

interface PhaserPreviewProps {
  project: VfxProject;
  time: number;
  selectedId: string | null;
  onMoveLayer: (layerId: string, x: number, y: number) => void;
  onMovePathPoint: (
    layerId: string,
    target: "control" | "end" | "beam-end" | number,
    x: number,
    y: number,
  ) => void;
  captureMode?: boolean;
  stressCopies?: number;
  onPerformanceSample?: (sample: PreviewPerformanceSample) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

interface PathHandle {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

interface LiveScene {
  scene: Phaser.Scene;
  sprites: Map<string, Phaser.GameObjects.Image>;
  overlay: Phaser.GameObjects.Graphics;
  grid: Phaser.GameObjects.Graphics;
  pathHandles: Map<string, PathHandle>;
  assetTextures: PreviewAssetTextureState;
}

interface PreviewAssetTextureSignature {
  source: string;
  width: number | null;
  height: number | null;
  atlasFrame: string | null;
  frameWidth: number | null;
  frameHeight: number | null;
  frameCount: number | null;
}

interface PendingPreviewAssetTexture {
  signature: PreviewAssetTextureSignature;
  addedEvent: string;
  onAdded: (texture: Phaser.Textures.Texture) => void;
  onError: (key: string) => void;
}

export interface PreviewAssetTextureState {
  installed: Map<string, PreviewAssetTextureSignature>;
  pending: Map<string, PendingPreviewAssetTexture>;
  currentAssets: () => VfxProject["assets"];
  onRevision: () => void;
  beforeRemove?: (assetId: string) => void;
  disposed: boolean;
}

const previewAssetTextureSignature = (
  asset: VfxProject["assets"][number],
): PreviewAssetTextureSignature => ({
  // Keep the project's immutable source string instead of joining/copying up
  // to 24 MiB of Base64 data into another signature on every asset sync.
  source: asset.dataUrl,
  width: asset.width ?? null,
  height: asset.height ?? null,
  atlasFrame: asset.atlasFrame ?? null,
  frameWidth: asset.spriteSheet?.frameWidth ?? null,
  frameHeight: asset.spriteSheet?.frameHeight ?? null,
  frameCount: asset.spriteSheet?.frameCount ?? null,
});

const previewAssetTextureSignaturesEqual = (
  left: PreviewAssetTextureSignature | undefined,
  right: PreviewAssetTextureSignature,
) =>
  Boolean(
    left &&
    left.source === right.source &&
    left.width === right.width &&
    left.height === right.height &&
    left.atlasFrame === right.atlasFrame &&
    left.frameWidth === right.frameWidth &&
    left.frameHeight === right.frameHeight &&
    left.frameCount === right.frameCount,
  );

const previewAssetById = (assets: VfxProject["assets"], assetId: string) =>
  assets.find(
    (asset) => asset.id === assetId && asset.mimeType !== "image/builtin",
  );

export function createPreviewAssetTextureState(
  currentAssets: () => VfxProject["assets"],
): PreviewAssetTextureState {
  return {
    installed: new Map(),
    pending: new Map(),
    currentAssets,
    onRevision: () => undefined,
    disposed: false,
  };
}

function removePreviewAssetTexture(
  scene: Phaser.Scene,
  state: PreviewAssetTextureState,
  assetId: string,
) {
  state.installed.delete(assetId);
  if (!scene.textures.exists(assetId)) return;
  state.beforeRemove?.(assetId);
  scene.textures.remove(assetId);
}

/**
 * Keeps preview-owned texture keys aligned with the current project library.
 * Pending Base64 decodes cannot be aborted through Phaser's TextureManager, so
 * their keyed completion handlers consult the latest assets and immediately
 * discard a late or superseded texture instead of resurrecting it.
 */
export function syncPreviewAssetTextures(
  scene: Phaser.Scene,
  assets: VfxProject["assets"],
  state: PreviewAssetTextureState,
  onRevision: () => void,
  beforeRemove?: (assetId: string) => void,
) {
  if (state.disposed) return;
  state.onRevision = onRevision;
  state.beforeRemove = beforeRemove;

  const customAssets = assets.filter(
    (asset) => asset.mimeType !== "image/builtin",
  );
  const desired = new Map(
    customAssets.map((asset) => [
      asset.id,
      previewAssetTextureSignature(asset),
    ]),
  );

  for (const [assetId, installedSignature] of state.installed) {
    if (
      previewAssetTextureSignaturesEqual(
        desired.get(assetId),
        installedSignature,
      )
    )
      continue;
    removePreviewAssetTexture(scene, state, assetId);
  }

  for (const asset of customAssets) {
    const signature = desired.get(asset.id) as PreviewAssetTextureSignature;
    if (scene.textures.exists(asset.id)) {
      state.installed.set(asset.id, signature);
      applySpriteSheetFrames(scene.textures.get(asset.id), asset, true);
      continue;
    }

    // Let an older in-flight decode finish. Its handler will either accept the
    // still-current source or remove it and request a fresh synchronization.
    if (state.pending.has(asset.id)) continue;

    const addedEvent = `addtexture-${asset.id}`;
    const cleanup = () => {
      if (state.pending.get(asset.id) !== pending) return;
      scene.textures.off(addedEvent, pending.onAdded);
      scene.textures.off("onerror", pending.onError);
      state.pending.delete(asset.id);
    };
    const onAdded = (texture: Phaser.Textures.Texture) => {
      cleanup();
      if (state.disposed) return;
      const current = previewAssetById(state.currentAssets(), asset.id);
      if (
        !current ||
        !previewAssetTextureSignaturesEqual(
          previewAssetTextureSignature(current),
          pending.signature,
        )
      ) {
        removePreviewAssetTexture(scene, state, asset.id);
        state.onRevision();
        return;
      }
      state.installed.set(asset.id, pending.signature);
      applySpriteSheetFrames(texture, current, true);
      state.onRevision();
    };
    const onError = (key: string) => {
      if (key !== asset.id) return;
      cleanup();
      if (state.disposed) return;
      const current = previewAssetById(state.currentAssets(), asset.id);
      if (
        current &&
        !previewAssetTextureSignaturesEqual(
          previewAssetTextureSignature(current),
          pending.signature,
        )
      )
        state.onRevision();
    };
    const pending: PendingPreviewAssetTexture = {
      signature,
      addedEvent,
      onAdded,
      onError,
    };
    state.pending.set(asset.id, pending);
    scene.textures.once(addedEvent, onAdded);
    scene.textures.on("onerror", onError);
    try {
      scene.textures.addBase64(asset.id, asset.dataUrl);
    } catch (error) {
      cleanup();
      throw error;
    }
  }
}

export function disposePreviewAssetTextureState(
  scene: Phaser.Scene,
  state: PreviewAssetTextureState,
) {
  state.disposed = true;
  for (const pending of state.pending.values()) {
    scene.textures.off(pending.addedEvent, pending.onAdded);
    scene.textures.off("onerror", pending.onError);
  }
  state.pending.clear();
  state.installed.clear();
}

function createBuiltInTextures(scene: Phaser.Scene) {
  const make = (
    key: string,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ) => {
    if (scene.textures.exists(key)) return;
    const graphics = scene.add.graphics().setVisible(false);
    draw(graphics);
    graphics.generateTexture(key, 128, 128);
    graphics.destroy();
  };

  make("builtin-flash", (g) => {
    g.fillStyle(0xffffff, 0.08).fillCircle(64, 64, 60);
    g.fillStyle(0xffffff, 0.16).fillCircle(64, 64, 46);
    g.fillStyle(0xffffff, 0.35).fillCircle(64, 64, 30);
    g.fillStyle(0xffffff, 0.95).fillCircle(64, 64, 13);
  });
  make("builtin-ring", (g) => {
    g.lineStyle(9, 0xffffff, 0.17).strokeCircle(64, 64, 46);
    g.lineStyle(3, 0xffffff, 0.95).strokeCircle(64, 64, 46);
  });
  make("builtin-spark", (g) => {
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(9, 51, 110, 26, 13);
    g.fillStyle(0xffffff, 0.95).fillRoundedRect(17, 59, 94, 10, 5);
  });
  make("builtin-cloud", (g) => {
    g.fillStyle(0xffffff, 0.18)
      .fillCircle(44, 68, 34)
      .fillCircle(76, 54, 38)
      .fillCircle(92, 76, 28);
    g.fillStyle(0xffffff, 0.34).fillCircle(61, 69, 29).fillCircle(79, 70, 24);
  });
  make(VVFX_INTERNAL_MISSING_TEXTURE_KEY, (g) => {
    g.fillStyle(0x211f30, 1).fillRoundedRect(20, 20, 88, 88, 16);
    g.lineStyle(5, 0xff6d8d, 0.9).strokeRoundedRect(20, 20, 88, 88, 16);
    g.lineBetween(40, 40, 88, 88).lineBetween(88, 40, 40, 88);
  });
}

function backgroundColor(project: VfxProject): number {
  const value =
    project.preview.background === "black"
      ? "#000000"
      : project.preview.background === "dark"
        ? "#11151f"
        : project.preview.background === "white"
          ? "#ffffff"
          : project.preview.background === "custom"
            ? project.preview.customColor
            : "#141723";
  return Number.parseInt(value.replace("#", ""), 16);
}

export function previewDisplayState(
  captureMode: boolean,
  zoom: number,
  showGrid: boolean,
  selectedId: string | null,
  stressCopies = 1,
) {
  if (captureMode) return { zoom: 1, showGrid: false, selectedId: null };
  return {
    zoom,
    showGrid,
    selectedId: stressCopies > 1 ? null : selectedId,
  };
}

export function syncPreviewRenderingEffects(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  effects: EvaluatedRenderingEffects,
  resolveAssetFrame?: PhaserRenderingAssetFrameResolver,
) {
  return syncPhaserRenderingEffects({
    scene,
    sprite,
    effects,
    resolveAssetFrame,
  });
}

export function resolvePreviewRenderingAssetFrame(
  scene: Phaser.Scene,
  assets: VfxProject["assets"],
  assetId: string,
): Phaser.Textures.Frame | null {
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.spriteSheet || !scene.textures.exists(assetId))
    return null;
  const texture = scene.textures.get(assetId);
  return texture.has("__BASE") ? texture.get("__BASE") : null;
}

export function PhaserPreview({
  project,
  time,
  selectedId,
  onMoveLayer,
  onMovePathPoint,
  captureMode = false,
  stressCopies = 1,
  onPerformanceSample,
  onCanvasReady,
}: PhaserPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const liveRef = useRef<LiveScene | null>(null);
  const moveRef = useRef(onMoveLayer);
  const movePathPointRef = useRef(onMovePathPoint);
  const canvasReadyRef = useRef(onCanvasReady);
  const performanceSampleRef = useRef(onPerformanceSample);
  const creationTimestampsRef = useRef<number[]>([]);
  const lastPerformanceSampleAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lastPerformanceSignatureRef = useRef("");
  const idlePerformanceTimerRef = useRef<number | null>(null);
  const [textureRevision, setTextureRevision] = useState(0);
  const latestAssetsRef = useRef(project.assets);
  latestAssetsRef.current = project.assets;

  useEffect(() => {
    moveRef.current = onMoveLayer;
  }, [onMoveLayer]);

  useEffect(() => {
    movePathPointRef.current = onMovePathPoint;
  }, [onMovePathPoint]);

  useEffect(() => {
    canvasReadyRef.current = onCanvasReady;
    if (gameRef.current) onCanvasReady?.(gameRef.current.canvas);
  }, [onCanvasReady]);

  useEffect(() => {
    performanceSampleRef.current = onPerformanceSample;
  }, [onPerformanceSample]);

  useEffect(() => {
    creationTimestampsRef.current = [];
    lastPerformanceSampleAtRef.current = Number.NEGATIVE_INFINITY;
    lastPerformanceSignatureRef.current = "";
  }, [project.metadata.id]);

  useEffect(
    () => () => {
      if (idlePerformanceTimerRef.current !== null)
        window.clearTimeout(idlePerformanceTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!mountRef.current || gameRef.current) return;
    let cancelled = false;
    void import("phaser").then((module) => {
      if (cancelled || !mountRef.current) return;
      const PhaserLib = module.default;
      const config: Phaser.Types.Core.GameConfig = {
        type: PhaserLib.AUTO,
        parent: mountRef.current,
        width: 820,
        height: 470,
        transparent: true,
        render: { antialias: true, pixelArt: false },
        scale: {
          mode: PhaserLib.Scale.RESIZE,
          autoCenter: PhaserLib.Scale.CENTER_BOTH,
        },
        scene: {
          create(this: Phaser.Scene) {
            createBuiltInTextures(this);
            liveRef.current = {
              scene: this,
              sprites: new Map(),
              overlay: this.add.graphics().setDepth(10002),
              grid: this.add.graphics().setDepth(-100),
              pathHandles: new Map(),
              assetTextures: createPreviewAssetTextureState(
                () => latestAssetsRef.current,
              ),
            };
          },
        },
      };
      gameRef.current = new PhaserLib.Game(config);
      canvasReadyRef.current?.(gameRef.current.canvas);
    });
    return () => {
      cancelled = true;
      if (liveRef.current)
        disposePreviewAssetTextureState(
          liveRef.current.scene,
          liveRef.current.assetTextures,
        );
      liveRef.current = null;
      canvasReadyRef.current?.(null);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const live = liveRef.current;
    if (!live) {
      const timer = window.setTimeout(
        () => setTextureRevision((revision) => revision + 1),
        40,
      );
      return () => window.clearTimeout(timer);
    }
    syncPreviewAssetTextures(
      live.scene,
      project.assets,
      live.assetTextures,
      () => setTextureRevision((revision) => revision + 1),
      (assetId) => {
        for (const sprite of live.sprites.values()) {
          clearPhaserRenderingEffects(sprite);
          if (sprite.texture.key === assetId)
            sprite.setTexture(VVFX_INTERNAL_MISSING_TEXTURE_KEY, "__BASE");
        }
      },
    );
  }, [project.assets, textureRevision]);

  useEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    const { scene, sprites, grid, overlay, pathHandles } = live;
    const width = scene.scale.width;
    const height = scene.scale.height;
    const display = previewDisplayState(
      captureMode,
      project.preview.zoom,
      project.preview.showGrid,
      selectedId,
      stressCopies,
    );
    const zoom = display.zoom;
    scene.cameras.main.setBackgroundColor(
      project.preview.background === "checkerboard"
        ? "rgba(0,0,0,0)"
        : backgroundColor(project),
    );

    grid.clear();
    if (display.showGrid) {
      grid.lineStyle(1, 0xffffff, 0.055);
      const spacing = Math.max(16, 40 * zoom);
      for (let x = (width / 2) % spacing; x < width; x += spacing)
        grid.lineBetween(x, 0, x, height);
      for (let y = (height / 2) % spacing; y < height; y += spacing)
        grid.lineBetween(0, y, width, y);
      grid
        .lineStyle(1, 0xffffff, 0.17)
        .lineBetween(width / 2, 0, width / 2, height)
        .lineBetween(0, height / 2, width, height / 2);
    }

    const baseInstances = evaluateProject(project, time, display.selectedId);
    const replication = replicateInstancesForStress(
      baseInstances,
      stressCopies,
      width / Math.max(0.01, display.zoom),
      height / Math.max(0.01, display.zoom),
      captureMode,
    );
    const instances = replication.instances;
    const trailSprites = instances.reduce(
      (count, instance) => count + (instance.trailIndex === null ? 0 : 1),
      0,
    );
    const resolveRenderingAssetFrame: PhaserRenderingAssetFrameResolver = (
      assetId,
    ) => resolvePreviewRenderingAssetFrame(scene, project.assets, assetId);
    const editingEnabled = !captureMode && stressCopies === 1;
    const sampleTime = window.performance.now();
    const nextKeys = new Set(instances.map((instance) => instance.key));
    const currentAssetIds = new Set(project.assets.map((asset) => asset.id));
    const currentLayerIds = new Set(project.layers.map((layer) => layer.id));
    destroyStalePreviewSprites(sprites, nextKeys, currentLayerIds);

    instances.forEach((instance) => {
      const texture =
        instance.assetId &&
        currentAssetIds.has(instance.assetId) &&
        scene.textures.exists(instance.assetId)
          ? instance.assetId
          : VVFX_INTERNAL_MISSING_TEXTURE_KEY;
      let sprite = sprites.get(instance.key);
      if (!sprite) {
        const draggableSprite = scene.add.image(
          0,
          0,
          texture,
          instance.frame ?? "__BASE",
        );
        draggableSprite.setData("layerId", instance.layerId);
        if (editingEnabled && instance.trailIndex === null) {
          draggableSprite.setInteractive({ useHandCursor: true });
          scene.input.setDraggable(draggableSprite);
          draggableSprite.on("dragstart", () => {
            draggableSprite.setData("vvfxDragging", true);
            draggableSprite.setData("vvfxDragStartX", draggableSprite.x);
            draggableSprite.setData("vvfxDragStartY", draggableSprite.y);
          });
          draggableSprite.on(
            "drag",
            (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
              draggableSprite.setPosition(dragX, dragY);
            },
          );
          draggableSprite.on("dragend", () => {
            const layerId = String(draggableSprite.getData("layerId"));
            const nextPosition = layerPositionAfterPreviewDrag({
              layerX: Number(draggableSprite.getData("vvfxLayerX")),
              layerY: Number(draggableSprite.getData("vvfxLayerY")),
              startPreviewX: Number(draggableSprite.getData("vvfxDragStartX")),
              startPreviewY: Number(draggableSprite.getData("vvfxDragStartY")),
              // Phaser 3.90 replaces dragX/dragY with the local grab offset
              // before emitting dragend. The sprite retains the real drop point.
              endPreviewX: draggableSprite.x,
              endPreviewY: draggableSprite.y,
              zoom: Number(draggableSprite.getData("vvfxZoom")),
            });
            draggableSprite.setData("vvfxDragging", false);
            moveRef.current(layerId, nextPosition.x, nextPosition.y);
          });
        }
        sprite = draggableSprite;
        sprites.set(instance.key, draggableSprite);
        creationTimestampsRef.current.push(sampleTime);
      } else if (
        sprite.texture.key !== texture ||
        sprite.frame.name !== (instance.frame ?? "__BASE")
      ) {
        sprite.setTexture(texture, instance.frame ?? "__BASE");
      }

      const sourceLayer = project.layers.find(
        (layer) => layer.id === instance.layerId,
      );
      const layerDepth = project.layers.findIndex(
        (layer) => layer.id === instance.layerId,
      );
      const dragging = Boolean(sprite.getData("vvfxDragging"));
      if (!dragging) {
        sprite.setData("vvfxLayerX", sourceLayer?.transform.x ?? 0);
        sprite.setData("vvfxLayerY", sourceLayer?.transform.y ?? 0);
        sprite.setData("vvfxZoom", zoom);
        sprite.setPosition(
          width / 2 + instance.x * zoom,
          height / 2 + instance.y * zoom,
        );
      }
      sprite
        .setScale(instance.scaleX * zoom, instance.scaleY * zoom)
        .setAlpha(instance.opacity)
        .setAngle(instance.rotation);
      if (instance.tint)
        sprite.setTint(tintNumber(instance.tint, instance.tintStrength));
      else sprite.clearTint();
      sprite
        .setBlendMode(instance.blendMode === "add" ? 1 : 0)
        .setDepth(
          Math.max(0, layerDepth) +
            (instance.trailIndex === null
              ? 0
              : -0.01 - instance.trailIndex * 0.001),
        );
      syncPreviewRenderingEffects(
        scene,
        sprite,
        instance.effects,
        resolveRenderingAssetFrame,
      );
    });

    overlay.clear();
    const selectedSource = display.selectedId
      ? project.layers.find((layer) => layer.id === display.selectedId)
      : null;
    const selected = selectedSource
      ? resolveLayerGroup(project, selectedSource)
      : null;
    if (selected) {
      const anchorX = width / 2 + selected.transform.x * zoom;
      const anchorY = height / 2 + selected.transform.y * zoom;
      overlay.lineStyle(1.5, 0x66e3ff, 0.9).strokeCircle(anchorX, anchorY, 6);
      overlay
        .lineBetween(anchorX - 11, anchorY, anchorX + 11, anchorY)
        .lineBetween(anchorX, anchorY - 11, anchorX, anchorY + 11);
      if (selected.motionPath.enabled) {
        const movement = {
          x: selected.transform.movementX,
          y: selected.transform.movementY,
        };
        const path = sampleMotionPath(selected.motionPath, movement);
        overlay.lineStyle(2, 0x66e3ff, 0.7);
        for (let index = 1; index < path.length; index += 1) {
          overlay.lineBetween(
            anchorX + path[index - 1].x * zoom,
            anchorY + path[index - 1].y * zoom,
            anchorX + path[index].x * zoom,
            anchorY + path[index].y * zoom,
          );
        }
        const endpoint = path.at(-1);
        if (endpoint) {
          overlay
            .lineStyle(2, 0x8df4c5, 0.9)
            .strokeCircle(
              anchorX + endpoint.x * zoom,
              anchorY + endpoint.y * zoom,
              5,
            );
        }
        if (selected.motionPath.mode === "curve") {
          const controlX = anchorX + selected.motionPath.controlX * zoom;
          const controlY = anchorY + selected.motionPath.controlY * zoom;
          overlay
            .lineStyle(1, 0x66e3ff, 0.22)
            .lineBetween(anchorX, anchorY, controlX, controlY)
            .lineBetween(
              controlX,
              controlY,
              anchorX + movement.x * zoom,
              anchorY + movement.y * zoom,
            );
        }
      }
      if (selected.type === "beam") {
        const endpointX = anchorX + selected.beam.endX * zoom;
        const endpointY = anchorY + selected.beam.endY * zoom;
        overlay
          .lineStyle(2, 0x71a7ff, 0.82)
          .lineBetween(anchorX, anchorY, endpointX, endpointY)
          .lineStyle(2, 0x8df4c5, 0.95)
          .strokeCircle(endpointX, endpointY, 6);
      }
      if (isSpawnLayer(selected)) {
        overlay.lineStyle(1.5, 0x8df4c5, 0.72);
        if (selected.spawn.shape === "circle")
          overlay.strokeCircle(anchorX, anchorY, selected.spawn.radius * zoom);
        if (selected.spawn.shape === "rectangle") {
          overlay.strokeRect(
            anchorX - (selected.spawn.width * zoom) / 2,
            anchorY - (selected.spawn.height * zoom) / 2,
            selected.spawn.width * zoom,
            selected.spawn.height * zoom,
          );
        }
        if (selected.spawn.shape === "line") {
          const angle = (selected.spawn.lineAngle * Math.PI) / 180;
          const halfLength = (selected.spawn.lineLength * zoom) / 2;
          const offsetX = Math.cos(angle) * halfLength;
          const offsetY = Math.sin(angle) * halfLength;
          overlay.lineBetween(
            anchorX - offsetX,
            anchorY - offsetY,
            anchorX + offsetX,
            anchorY + offsetY,
          );
        }
        if (selected.spawn.shape === "arc") {
          const start = (selected.spawn.arcStartAngle * Math.PI) / 180;
          const end =
            ((selected.spawn.arcStartAngle + selected.spawn.arcSweep) *
              Math.PI) /
            180;
          overlay
            .beginPath()
            .arc(
              anchorX,
              anchorY,
              selected.spawn.radius * zoom,
              start,
              end,
              selected.spawn.arcSweep < 0,
            )
            .strokePath();
        }
        if (
          selected.spawn.distribution === "stratified" ||
          selected.spawn.distribution === "clusters"
        ) {
          const copyCount = Math.max(
            1,
            Math.min(
              selected.type === "emitter" ? 25 : 250,
              Math.floor(selected.spawn.count),
            ),
          );
          const overlayCount = Math.min(copyCount, 64);
          const batchSeed = layerInstanceSeed(project, selected, 0, 0);
          overlay.fillStyle(0x8df4c5, 0.38);
          for (
            let sampleIndex = 0;
            sampleIndex < overlayCount;
            sampleIndex += 1
          ) {
            const copyIndex =
              selected.spawn.distribution === "clusters"
                ? sampleIndex
                : Math.min(
                    copyCount - 1,
                    Math.floor(
                      ((sampleIndex + 0.5) * copyCount) / overlayCount,
                    ),
                  );
            const seed = layerInstanceSeed(project, selected, 0, copyIndex);
            const offset = evaluateSpawnOffset(
              project,
              selected,
              seed,
              copyIndex,
              batchSeed,
            );
            if (offset)
              overlay.fillCircle(
                anchorX + offset.x * zoom,
                anchorY + offset.y * zoom,
                2.25,
              );
          }
        }
        if (selected.spawn.shape === "mask") {
          const mask = project.assets.find(
            (asset) => asset.id === selected.spawn.maskAssetId,
          )?.alphaMask;
          if (mask) {
            const dimensions = alphaMaskWorldDimensions(
              mask,
              selected.spawn.maskSize,
            );
            overlay.strokeRect(
              anchorX - (dimensions.width * zoom) / 2,
              anchorY - (dimensions.height * zoom) / 2,
              dimensions.width * zoom,
              dimensions.height * zoom,
            );
            overlay.fillStyle(0x8df4c5, 0.25);
            for (const sample of alphaMaskOverlaySamples(
              mask,
              selected.spawn.maskThreshold,
              selected.spawn.maskSize,
            ))
              overlay.fillCircle(
                anchorX + sample.x * zoom,
                anchorY + sample.y * zoom,
                Math.max(
                  1,
                  Math.min(
                    3,
                    Math.min(sample.width, sample.height) * zoom * 0.35,
                  ),
                ),
              );
          }
        }
      }
    }

    const nextPathHandleKeys = new Set<string>();
    const editablePoints:
      | Array<{
          key: string;
          label: string;
          target: "control" | "end" | "beam-end" | number;
          x: number;
          y: number;
        }>
      | undefined =
      selected?.type === "beam"
        ? [
            {
              key: `${selected.id}:beam-end`,
              label: "B",
              target: "beam-end" as const,
              x: selected.beam.endX,
              y: selected.beam.endY,
            },
          ]
        : selected?.motionPath.enabled && selected.motionPath.mode === "curve"
          ? [
              {
                key: `${selected.id}:control`,
                label: "B",
                target: "control",
                x: selected.motionPath.controlX,
                y: selected.motionPath.controlY,
              },
              {
                key: `${selected.id}:end`,
                label: "E",
                target: "end",
                x: selected.transform.movementX,
                y: selected.transform.movementY,
              },
            ]
          : selected?.motionPath.enabled &&
              selected.motionPath.mode === "custom"
            ? [
                ...selected.motionPath.points.map((point, index) => ({
                  key: `${selected.id}:point:${index}`,
                  label: String(index + 1),
                  target: index,
                  x: point.x,
                  y: point.y,
                })),
                {
                  key: `${selected.id}:end`,
                  label: "E",
                  target: "end" as const,
                  x: selected.transform.movementX,
                  y: selected.transform.movementY,
                },
              ]
            : selected?.motionPath.enabled
              ? [
                  {
                    key: `${selected.id}:end`,
                    label: "E",
                    target: "end",
                    x: selected.transform.movementX,
                    y: selected.transform.movementY,
                  },
                ]
              : undefined;

    for (const point of editablePoints ?? []) {
      nextPathHandleKeys.add(point.key);
      let handle = pathHandles.get(point.key);
      if (!handle) {
        const circle = scene.add
          .circle(0, 0, 9, 0x132433, 0.96)
          .setStrokeStyle(2, point.target === "end" ? 0x8df4c5 : 0x66e3ff, 1)
          .setDepth(10003)
          .setInteractive({ useHandCursor: true });
        const label = scene.add
          .text(0, 0, point.label, {
            color: point.target === "end" ? "#dfffee" : "#dffbff",
            fontFamily: "system-ui, sans-serif",
            fontSize: "9px",
            fontStyle: "bold",
          })
          .setOrigin(0.5)
          .setDepth(10004);
        scene.input.setDraggable(circle);
        circle.on(
          "drag",
          (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            circle.setPosition(dragX, dragY);
            label.setPosition(dragX, dragY);
          },
        );
        circle.on("dragstart", () => circle.setData("vvfxDragging", true));
        circle.on("dragend", () => {
          const point = pathPointAfterPreviewDrag({
            layerX: Number(circle.getData("vvfxLayerX")),
            layerY: Number(circle.getData("vvfxLayerY")),
            previewCenterX: Number(circle.getData("vvfxCenterX")),
            previewCenterY: Number(circle.getData("vvfxCenterY")),
            endPreviewX: circle.x,
            endPreviewY: circle.y,
            zoom: Number(circle.getData("vvfxZoom")),
          });
          circle.setData("vvfxDragging", false);
          movePathPointRef.current(
            String(circle.getData("vvfxLayerId")),
            circle.getData("vvfxTarget") as
              "control" | "end" | "beam-end" | number,
            point.x,
            point.y,
          );
        });
        handle = { circle, label };
        pathHandles.set(point.key, handle);
      }
      handle.circle.setData("vvfxLayerId", selected?.id);
      handle.circle.setData("vvfxTarget", point.target);
      handle.circle.setData("vvfxCenterX", width / 2);
      handle.circle.setData("vvfxCenterY", height / 2);
      handle.circle.setData("vvfxLayerX", selected?.transform.x ?? 0);
      handle.circle.setData("vvfxLayerY", selected?.transform.y ?? 0);
      handle.circle.setData("vvfxZoom", zoom);
      if (!handle.circle.getData("vvfxDragging")) {
        const handleX =
          width / 2 + ((selected?.transform.x ?? 0) + point.x) * zoom;
        const handleY =
          height / 2 + ((selected?.transform.y ?? 0) + point.y) * zoom;
        handle.circle.setPosition(handleX, handleY);
        handle.label.setPosition(handleX, handleY).setText(point.label);
      }
    }
    for (const [key, handle] of pathHandles) {
      if (nextPathHandleKeys.has(key)) continue;
      handle.circle.destroy();
      handle.label.destroy();
      pathHandles.delete(key);
    }

    creationTimestampsRef.current = creationTimestampsRef.current.filter(
      (timestamp) => timestamp >= sampleTime - 1_000,
    );
    const performanceSignature = `${replication.requestedCopies}:${replication.effectiveCopies}:${replication.limited}`;
    if (
      sampleTime - lastPerformanceSampleAtRef.current >= 250 ||
      performanceSignature !== lastPerformanceSignatureRef.current
    ) {
      lastPerformanceSampleAtRef.current = sampleTime;
      lastPerformanceSignatureRef.current = performanceSignature;
      performanceSampleRef.current?.({
        liveSprites: sprites.size,
        baseSprites: baseInstances.length,
        trailSprites,
        newSpritesPerSecond: countRecentCreations(
          creationTimestampsRef.current,
          sampleTime,
        ),
        requestedCopies: replication.requestedCopies,
        effectiveCopies: replication.effectiveCopies,
        stressLimited: replication.limited,
      });
    }
    if (idlePerformanceTimerRef.current !== null)
      window.clearTimeout(idlePerformanceTimerRef.current);
    idlePerformanceTimerRef.current = window.setTimeout(() => {
      performanceSampleRef.current?.({
        liveSprites: liveRef.current?.sprites.size ?? 0,
        baseSprites: baseInstances.length,
        trailSprites,
        newSpritesPerSecond: 0,
        requestedCopies: replication.requestedCopies,
        effectiveCopies: replication.effectiveCopies,
        stressLimited: replication.limited,
      });
    }, 1_050);
  }, [captureMode, project, selectedId, stressCopies, textureRevision, time]);

  return (
    <div
      ref={mountRef}
      className={`phaser-mount ${project.preview.background === "checkerboard" ? "is-checkerboard" : ""}`}
      aria-label={
        stressCopies > 1
          ? "Live VFX stress preview. Editing handles are paused."
          : "Live VFX preview. Drag a visible part to reposition its layer."
      }
    />
  );
}
