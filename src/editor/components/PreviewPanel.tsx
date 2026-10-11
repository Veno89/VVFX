"use client";

import {
  Dices,
  Gauge,
  Grid3X3,
  ImagePlus,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Focus,
  Trash2,
} from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { fitPreviewZoom } from "../../vfx/previewFit";
import { PhaserPreview } from "../../preview/PhaserPreview";
import { previewBackgroundHex } from "../../preview/previewBackground";
import { BACKDROP_PIXEL_SCALES } from "../../persistence/previewBackdrop";
import type {
  PreviewPerformanceSample,
  StressCopyCount,
} from "../../vfx/performance";
import type {
  PreviewBackground,
  PreviewSettings,
  VfxProject,
} from "../../vfx/types";
import { HelpTip } from "./Controls";
import { PerformanceInspector } from "./PerformanceInspector";
import { useFocusRegion } from "../useFocusRegion";
import { usePreviewBackdrop } from "../usePreviewBackdrop";

const PERFORMANCE_DIALOG_ID = "preview-performance-dialog";
const VIEW_DIALOG_ID = "preview-appearance-dialog";

const initialPerformanceSample = (): PreviewPerformanceSample => ({
  liveSprites: 0,
  baseSprites: 0,
  trailSprites: 0,
  newSpritesPerSecond: 0,
  requestedCopies: 1,
  effectiveCopies: 1,
  stressLimited: false,
});

export function PreviewPanel({
  project,
  time,
  playing,
  speed,
  loopEnd,
  selectedId,
  onProjectChange,
  onViewChange,
  onMoveLayer,
  onMovePathPoint,
  onPlayToggle,
  onRestart,
  restartRevision = 0,
  onSpeedChange,
  captureMode = false,
  onCanvasReady,
  lockedLayerIds = [],
  emptyState,
}: {
  project: VfxProject;
  time: number;
  playing: boolean;
  speed: number;
  loopEnd: number;
  selectedId: string | null;
  onProjectChange: (project: VfxProject) => void;
  onViewChange: (
    patch: Partial<
      Pick<
        PreviewSettings,
        "background" | "customColor" | "showGrid" | "zoom" | "loop"
      >
    >,
  ) => void;
  onMoveLayer: (layerId: string, x: number, y: number) => void;
  onMovePathPoint: (
    layerId: string,
    target: "control" | "end" | "beam-end" | number,
    x: number,
    y: number,
  ) => void;
  onPlayToggle: () => void;
  onRestart: () => void;
  restartRevision?: number;
  onSpeedChange: (speed: number) => void;
  captureMode?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  lockedLayerIds?: string[];
  /** Overlay shown on the canvas while the effect has nothing to play. */
  emptyState?: ReactNode;
}) {
  const backgroundFieldId = useId();
  const seedFieldId = useId();
  const backdropScaleId = useId();
  const backdropOpacityId = useId();
  const backdropInputRef = useRef<HTMLInputElement>(null);
  const backdropState = usePreviewBackdrop();
  const { backdrop } = backdropState;
  // Recording captures only the canvas, so hide the backdrop while it runs
  // rather than suggest it will appear in the video.
  const showBackdrop = Boolean(backdrop && backdropState.url && !captureMode);
  const [viewOpen, setViewOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [stressCopies, setStressCopies] = useState<StressCopyCount>(1);
  const [performanceSample, setPerformanceSample] =
    useState<PreviewPerformanceSample>(initialPerformanceSample);
  const [peakSprites, setPeakSprites] = useState(0);
  const backgroundSelectRef = useRef<HTMLSelectElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const performanceTriggerRef = useRef<HTMLButtonElement>(null);
  const viewTriggerRef = useRef<HTMLButtonElement>(null);
  const performanceDialogRef = useFocusRegion<HTMLElement>({
    active: performanceOpen,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: performanceTriggerRef,
    onEscape: () => setPerformanceOpen(false),
  });
  const viewDialogRef = useFocusRegion<HTMLDivElement>({
    active: viewOpen,
    initialFocusRef: backgroundSelectRef,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: viewTriggerRef,
    onEscape: () => setViewOpen(false),
  });

  const handlePerformanceSample = useCallback(
    (sample: PreviewPerformanceSample) => {
      setPerformanceSample(sample);
      setPeakSprites((current) => Math.max(current, sample.liveSprites));
    },
    [],
  );

  return (
    <main className="preview-panel">
      <div className="preview-heading">
        <div>
          <span className="live-dot" /> LIVE PREVIEW{" "}
          <small>{(time / 1000).toFixed(2)}s</small>
        </div>
        <div className="preview-tools">
          <div className="menu-wrap">
            <button
              ref={performanceTriggerRef}
              type="button"
              className={performanceOpen ? "is-active" : ""}
              onClick={() => {
                setPerformanceOpen((open) => !open);
                setViewOpen(false);
              }}
              title="Effect performance and stress test"
              aria-label="Effect performance and stress test"
              aria-controls={PERFORMANCE_DIALOG_ID}
              aria-expanded={performanceOpen}
              aria-haspopup="dialog"
            >
              <Gauge size={15} />
            </button>
            {performanceOpen && (
              <PerformanceInspector
                project={project}
                selectedLayerId={selectedId}
                sample={performanceSample}
                peakSprites={peakSprites}
                requestedCopies={stressCopies}
                captureMode={captureMode}
                onCopiesChange={setStressCopies}
                onResetPeak={() =>
                  setPeakSprites(performanceSample.liveSprites)
                }
                dialogRef={performanceDialogRef}
                dialogId={PERFORMANCE_DIALOG_ID}
              />
            )}
          </div>
          <button
            type="button"
            className={project.preview.showGrid ? "is-active" : ""}
            aria-pressed={project.preview.showGrid}
            aria-label="Show preview grid"
            onClick={() =>
              onViewChange({ showGrid: !project.preview.showGrid })
            }
            title="Show or hide the grid"
          >
            <Grid3X3 size={15} />
          </button>
          <button
            type="button"
            onClick={() =>
              onViewChange({
                zoom: Math.max(0.25, project.preview.zoom - 0.25),
              })
            }
            title="Zoom out"
          >
            <Minus size={14} />
          </button>
          <span className="zoom-readout">
            {Math.round(project.preview.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() =>
              onViewChange({
                zoom: Math.min(3, project.preview.zoom + 0.25),
              })
            }
            title="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              const shell = canvasShellRef.current?.getBoundingClientRect();
              if (!shell?.width || !shell.height) return;
              onViewChange({
                zoom: fitPreviewZoom(project, shell.width, shell.height),
              });
            }}
            title="Zoom to fit the whole effect"
            aria-label="Zoom to fit the effect"
          >
            <Focus size={14} />
          </button>
          <button
            type="button"
            onClick={() => onViewChange({ zoom: 1 })}
            title="Reset zoom to 100%"
            aria-label="Reset zoom"
          >
            <Maximize2 size={14} />
          </button>
          <div className="menu-wrap">
            <button
              ref={viewTriggerRef}
              type="button"
              className={viewOpen ? "is-active" : ""}
              onClick={() => {
                setViewOpen((open) => !open);
                setPerformanceOpen(false);
              }}
              title="Preview appearance"
              aria-label="Preview appearance"
              aria-controls={VIEW_DIALOG_ID}
              aria-expanded={viewOpen}
              aria-haspopup="dialog"
            >
              <SlidersHorizontal size={15} />
            </button>
            {viewOpen && (
              <div
                ref={viewDialogRef}
                id={VIEW_DIALOG_ID}
                className="view-menu"
                role="dialog"
                aria-label="Preview appearance"
              >
                <span className="menu-label">Canvas only — not exported</span>
                <p className="view-menu-note">
                  Background, screenshot, grid, and zoom only help you inspect
                  the effect. None of them become part of the exported VFX.
                </p>
                <div className="view-menu-field">
                  <span className="view-menu-field__label">
                    <label htmlFor={backgroundFieldId}>Background</label>{" "}
                    <HelpTip
                      label="Background"
                      text="Bright effects can look completely different on light and dark backgrounds. Check both before you finish."
                    />
                  </span>
                  <select
                    id={backgroundFieldId}
                    ref={backgroundSelectRef}
                    value={project.preview.background}
                    onChange={(event) =>
                      onViewChange({
                        background: event.target.value as PreviewBackground,
                      })
                    }
                  >
                    <option value="checkerboard">
                      Transparent checkerboard
                    </option>
                    <option value="black">Black</option>
                    <option value="dark">Dark grey</option>
                    <option value="white">White</option>
                    <option value="custom">Custom color</option>
                  </select>
                </div>
                {project.preview.background === "custom" && (
                  <label>
                    Custom color{" "}
                    <input
                      type="color"
                      value={project.preview.customColor}
                      onChange={(event) =>
                        onViewChange({ customColor: event.target.value })
                      }
                    />
                  </label>
                )}
                <div className="view-menu-field backdrop-field">
                  <span className="view-menu-field__label">
                    Game screenshot{" "}
                    <HelpTip
                      label="Game screenshot"
                      text="Put a screenshot of your game behind the effect to judge its size and colors in context. It is centered on the effect's origin, stays in this browser, and is never saved in projects or exports."
                    />
                  </span>
                  {backdrop ? (
                    <>
                      <span
                        className="backdrop-field__name"
                        title={backdrop.name}
                      >
                        {backdrop.name} · {backdrop.width}×{backdrop.height}
                      </span>
                      <label htmlFor={backdropScaleId}>
                        Screenshot pixel size
                      </label>
                      <select
                        id={backdropScaleId}
                        value={backdrop.pixelScale}
                        onChange={(event) =>
                          backdropState.update({
                            pixelScale: Number(event.target.value),
                          })
                        }
                      >
                        {BACKDROP_PIXEL_SCALES.map((scale) => (
                          <option key={scale} value={scale}>
                            {scale === 1
                              ? "1× (same as effect pixels)"
                              : `${scale}×`}
                          </option>
                        ))}
                      </select>
                      <label htmlFor={backdropOpacityId}>
                        Screenshot opacity {Math.round(backdrop.opacity * 100)}%
                      </label>
                      <input
                        id={backdropOpacityId}
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={Math.round(backdrop.opacity * 100)}
                        onChange={(event) =>
                          backdropState.update({
                            opacity: Number(event.target.value) / 100,
                          })
                        }
                      />
                      <span className="backdrop-field__actions">
                        <button
                          type="button"
                          onClick={() => backdropInputRef.current?.click()}
                        >
                          <ImagePlus size={14} aria-hidden="true" /> Replace
                        </button>
                        <button type="button" onClick={backdropState.remove}>
                          <Trash2 size={14} aria-hidden="true" /> Remove
                        </button>
                      </span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => backdropInputRef.current?.click()}
                    >
                      <ImagePlus size={14} aria-hidden="true" /> Add game
                      screenshot
                    </button>
                  )}
                  {backdropState.error && (
                    <span className="backdrop-field__error" role="alert">
                      {backdropState.error}
                    </span>
                  )}
                </div>
                <span className="menu-label">Effect variation — exported</span>
                <div className="seed-field view-menu-field">
                  <span className="view-menu-field__label">
                    <label htmlFor={seedFieldId}>Random seed</label>{" "}
                    <HelpTip
                      label="Random seed"
                      text="A seed lets you replay the exact same random version while adjusting settings."
                    />
                  </span>
                  <span>
                    <input
                      id={seedFieldId}
                      type="number"
                      value={project.preview.randomSeed}
                      onChange={(event) =>
                        onProjectChange({
                          ...project,
                          preview: {
                            ...project.preview,
                            randomSeed: Number(event.target.value),
                          },
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onProjectChange({
                          ...project,
                          preview: {
                            ...project.preview,
                            randomSeed: Math.floor(Math.random() * 999999),
                          },
                        })
                      }
                    >
                      <Dices size={14} /> New version
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <input
        ref={backdropInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        aria-label="Choose a game screenshot"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void backdropState.choose(file);
        }}
      />
      <div
        className={`preview-canvas-shell${showBackdrop ? " has-backdrop" : ""}${showBackdrop && project.preview.background === "checkerboard" ? " is-checkerboard" : ""}`}
        ref={canvasShellRef}
        style={
          showBackdrop && project.preview.background !== "checkerboard"
            ? { backgroundColor: previewBackgroundHex(project) }
            : undefined
        }
      >
        {showBackdrop && backdrop && backdropState.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="preview-backdrop"
            src={backdropState.url}
            alt=""
            width={backdrop.width}
            height={backdrop.height}
            style={{
              opacity: backdrop.opacity,
              transform: `translate(-50%, -50%) scale(${backdrop.pixelScale * project.preview.zoom})`,
            }}
          />
        )}
        <PhaserPreview
          transparentBackground={showBackdrop}
          project={project}
          time={time}
          restartRevision={restartRevision}
          selectedId={selectedId}
          onMoveLayer={onMoveLayer}
          onMovePathPoint={onMovePathPoint}
          captureMode={captureMode}
          stressCopies={stressCopies}
          onPerformanceSample={handlePerformanceSample}
          onCanvasReady={onCanvasReady}
          lockedLayerIds={lockedLayerIds}
        />
        {emptyState}
        <div className="canvas-hint" hidden={Boolean(emptyState)}>
          {captureMode
            ? "Recording one clean effect copy"
            : stressCopies > 1
              ? "Stress preview · editing handles are paused"
              : selectedId && lockedLayerIds.includes(selectedId)
                ? "Layer locked · unlock it in the Layers panel to edit"
                : project.layers.find((layer) => layer.id === selectedId)
                      ?.type === "beam"
                  ? "Drag endpoint B to reshape the selected beam"
                  : project.layers.find((layer) => layer.id === selectedId)
                        ?.motionPath.enabled
                    ? "Drag path points to reshape the selected route"
                    : "Drag a visible part to move its layer"}
        </div>
      </div>
      <div className="transport-bar">
        <button className="transport-main" type="button" onClick={onPlayToggle}>
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}{" "}
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onRestart}>
          <RotateCcw size={14} /> Restart
        </button>
        <span className="transport-divider" />
        <span className="speed-label">Speed</span>
        {[0.25, 0.5, 1, 2].map((value) => (
          <button
            key={value}
            type="button"
            className={speed === value ? "is-active" : ""}
            aria-pressed={speed === value}
            onClick={() => onSpeedChange(value)}
          >
            {value}×
          </button>
        ))}
        <label
          className="loop-control"
          title={`Loop from 0 to ${(loopEnd / 1000).toFixed(2)} seconds, based on the active layers`}
        >
          <input
            type="checkbox"
            checked={project.preview.loop}
            onChange={(event) => onViewChange({ loop: event.target.checked })}
          />{" "}
          Loop active range
          <small>{(loopEnd / 1000).toFixed(2)}s</small>
        </label>
      </div>
    </main>
  );
}
