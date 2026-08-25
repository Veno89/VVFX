"use client";

import {
  Dices,
  Gauge,
  Grid3X3,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { PhaserPreview } from "../../preview/PhaserPreview";
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

const PERFORMANCE_DIALOG_ID = "preview-performance-dialog";
const VIEW_DIALOG_ID = "preview-appearance-dialog";

const initialPerformanceSample = (): PreviewPerformanceSample => ({
  liveSprites: 0,
  baseSprites: 0,
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
  onSpeedChange,
  captureMode = false,
  onCanvasReady,
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
  onSpeedChange: (speed: number) => void;
  captureMode?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [stressCopies, setStressCopies] = useState<StressCopyCount>(1);
  const [performanceSample, setPerformanceSample] =
    useState<PreviewPerformanceSample>(initialPerformanceSample);
  const [peakSprites, setPeakSprites] = useState(0);
  const backgroundSelectRef = useRef<HTMLSelectElement>(null);
  const performanceDialogRef = useFocusRegion<HTMLElement>({
    active: performanceOpen,
    trapFocus: false,
    onEscape: () => setPerformanceOpen(false),
  });
  const viewDialogRef = useFocusRegion<HTMLDivElement>({
    active: viewOpen,
    initialFocusRef: backgroundSelectRef,
    trapFocus: false,
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
            onClick={() => onViewChange({ zoom: 1 })}
            title="Reset zoom"
          >
            <Maximize2 size={14} />
          </button>
          <div className="menu-wrap">
            <button
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
                  Background, grid, and zoom only help you inspect the effect.
                  The background never becomes part of the exported VFX.
                </p>
                <label>
                  Background{" "}
                  <HelpTip text="Bright effects can look completely different on light and dark backgrounds. Check both before you finish." />
                  <select
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
                </label>
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
                <span className="menu-label">Effect variation — exported</span>
                <label className="seed-field">
                  Random seed{" "}
                  <HelpTip
                    text="A seed lets you replay the exact same random version while adjusting settings."
                    dismissOnLeave
                  />
                  <span>
                    <input
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
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="preview-canvas-shell">
        <PhaserPreview
          project={project}
          time={time}
          selectedId={selectedId}
          onMoveLayer={onMoveLayer}
          onMovePathPoint={onMovePathPoint}
          captureMode={captureMode}
          stressCopies={stressCopies}
          onPerformanceSample={handlePerformanceSample}
          onCanvasReady={onCanvasReady}
        />
        <div className="canvas-hint">
          {captureMode
            ? "Recording one clean effect copy"
            : stressCopies > 1
              ? "Stress preview · editing handles are paused"
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
