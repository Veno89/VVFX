"use client";

import {
  Check,
  Clipboard,
  Download,
  FileCode2,
  FileJson,
  Film,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  canRecordWebm,
  type PreviewRecording,
  type PreviewRecordingRequest,
} from "../previewRecording";
import { downloadBlob, downloadText, safeFilename } from "../download";
import {
  createRuntimeDefinition,
  generatePhaserCode,
} from "../../vfx/exporters";
import { serializeProject } from "../../vfx/serialization";
import { hasEnabledRenderingEffects } from "../../vfx/renderingEffects";
import type { VfxProject } from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

type ExportTab = "preview" | "runtime" | "phaser" | "project";
type PreviewFormat = PreviewRecordingRequest["format"];

const PREVIEW_SIZES = [
  { id: "game", label: "Game 16:9 · 640 × 360", width: 640, height: 360 },
  { id: "hd", label: "HD 16:9 · 1280 × 720", width: 1280, height: 720 },
  { id: "square", label: "Square 1:1 · 720 × 720", width: 720, height: 720 },
  {
    id: "vertical",
    label: "Vertical 9:16 · 720 × 1280",
    width: 720,
    height: 1280,
  },
  {
    id: "current",
    label: "Current preview size",
    width: undefined,
    height: undefined,
  },
] as const;

export function ExportDialog({
  project,
  activeDuration,
  onRecordPreview,
  onClose,
}: {
  project: VfxProject;
  activeDuration: number;
  onRecordPreview: (
    request: PreviewRecordingRequest,
    onProgress: (progress: number) => void,
  ) => Promise<PreviewRecording>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ExportTab>("preview");
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>("webm");
  const [previewSizeId, setPreviewSizeId] = useState("game");
  const [lastRecording, setLastRecording] = useState<PreviewRecording | null>(
    null,
  );
  const [webmSupported, setWebmSupported] = useState(false);
  const dialogRef = useFocusRegion<HTMLElement>({
    escapeEnabled: !recording,
    onEscape: onClose,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setWebmSupported(canRecordWebm()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const values = useMemo(
    () => ({
      runtime: JSON.stringify(createRuntimeDefinition(project), null, 2),
      phaser: generatePhaserCode(project),
      project: serializeProject(project),
    }),
    [project],
  );
  const content = tab === "preview" ? "" : values[tab];
  const base = safeFilename(project.metadata.name);
  const previewSize =
    PREVIEW_SIZES.find((preset) => preset.id === previewSizeId) ??
    PREVIEW_SIZES[0];
  const info =
    tab === "preview"
      ? "Export the clean Phaser preview at normal speed, without editor guides. Choose WebM video or an animated GIF plus a centered size and aspect preset."
      : tab === "runtime"
        ? "Exact game-ready settings for the local @vvfx/phaser-runtime package, without editor-only state."
        : tab === "phaser"
          ? "Exact runtime-backed Phaser TypeScript. It embeds this effect definition and calls the local @vvfx/phaser-runtime helper, so preview features are not silently omitted."
          : "The complete editable project, including uploaded images. Re-import this .vvfx file to continue later.";
  const extension =
    tab === "runtime" ? ".runtime.json" : tab === "phaser" ? ".ts" : ".vvfx";
  const hasExportableLayer = project.layers.some(
    (layer) => layer.enabled && layer.visible && layer.assetId,
  );
  const hasExperimentalRenderingEffects = project.layers.some((layer) =>
    hasEnabledRenderingEffects(layer.appearance.effects),
  );

  const recordPreview = async () => {
    setRecording(true);
    setRecordingProgress(0);
    setRecordingError(null);
    try {
      const result = await onRecordPreview(
        {
          format: previewFormat,
          size: { width: previewSize.width, height: previewSize.height },
        },
        setRecordingProgress,
      );
      setLastRecording(result);
      downloadBlob(`${base}.${result.format}`, result.blob);
    } catch (error) {
      setRecordingError(
        error instanceof Error
          ? error.message
          : "The preview could not be recorded.",
      );
    } finally {
      setRecording(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!recording && event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <header>
          <div>
            <span className="eyebrow">Take it with you</span>
            <h2 id="export-title">Export effect</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export"
            disabled={recording}
          >
            <X size={18} />
          </button>
        </header>
        <div className="dialog-tabs">
          <button
            type="button"
            className={tab === "preview" ? "is-active" : ""}
            onClick={() => setTab("preview")}
            disabled={recording}
          >
            <Film size={15} /> Preview video
          </button>
          <button
            type="button"
            className={tab === "runtime" ? "is-active" : ""}
            onClick={() => setTab("runtime")}
            disabled={recording}
          >
            <FileJson size={15} /> Runtime JSON
          </button>
          <button
            type="button"
            className={tab === "phaser" ? "is-active" : ""}
            onClick={() => setTab("phaser")}
            disabled={recording}
          >
            <FileCode2 size={15} /> Phaser code
          </button>
          <button
            type="button"
            className={tab === "project" ? "is-active" : ""}
            onClick={() => setTab("project")}
            disabled={recording}
          >
            <Download size={15} /> Vvfx project
          </button>
        </div>
        <p className="export-explainer">{info}</p>
        {hasExperimentalRenderingEffects && (
          <p className="export-explainer" role="note">
            Experimental pixel effects require Phaser WebGL. Runtime JSON,
            runtime-backed Phaser code, and WebGL preview recordings preserve
            them; Canvas playback keeps the ordinary unmasked and un-eroded
            sprites, omits the pixel effects, and reports a one-time
            compatibility warning.
          </p>
        )}
        {tab === "preview" ? (
          <div className="preview-export-panel">
            <div className="preview-export-options">
              <label>
                Format
                <select
                  value={previewFormat}
                  disabled={recording}
                  onChange={(event) => {
                    setPreviewFormat(event.target.value as PreviewFormat);
                    setRecordingError(null);
                  }}
                >
                  <option value="webm">WebM video · 30 FPS</option>
                  <option value="gif">Animated GIF · 15 FPS</option>
                </select>
              </label>
              <label>
                Size and aspect ratio
                <select
                  value={previewSizeId}
                  disabled={recording}
                  onChange={(event) => setPreviewSizeId(event.target.value)}
                >
                  {PREVIEW_SIZES.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="preview-export-summary">
              <span className="preview-export-icon">
                <Film size={23} />
              </span>
              <div>
                <strong>
                  {previewFormat === "webm" ? "WebM video" : "Animated GIF"}
                </strong>
                <p>
                  {(activeDuration / 1000).toFixed(2)} seconds at{" "}
                  {previewFormat === "webm" ? 30 : 15} FPS · {previewSize.label}{" "}
                  · normal playback speed
                </p>
              </div>
              <span className="preview-export-format">.{previewFormat}</span>
            </div>
            <ul className="preview-export-details">
              <li>
                Uses the active layer range instead of empty timeline space.
              </li>
              <li>
                Removes the grid, selection outline, and motion-path handles.
              </li>
              <li>
                Aspect changes use a centered crop, keeping the effect origin in
                the middle of the exported frame.
              </li>
              <li>
                {previewFormat === "webm"
                  ? "Transparent checkerboard backgrounds remain transparent where the browser and video player support WebM alpha."
                  : "GIF uses a compact 255-color palette plus transparency and loops automatically."}
              </li>
            </ul>
            {recording && (
              <div className="preview-export-progress">
                <div>
                  <span>
                    {previewFormat === "webm"
                      ? "Recording preview…"
                      : "Rendering GIF frames…"}
                  </span>
                  <strong>{Math.round(recordingProgress * 100)}%</strong>
                </div>
                <progress value={recordingProgress} max={1}>
                  {Math.round(recordingProgress * 100)}%
                </progress>
                <small>
                  Keep this window open. Larger sizes and longer effects take
                  more time and create larger files.
                </small>
              </div>
            )}
            {recordingError && (
              <p className="preview-export-error" role="alert">
                {recordingError}
              </p>
            )}
            {lastRecording && !recording && !recordingError && (
              <p className="preview-export-success" role="status">
                Downloaded {lastRecording.width} × {lastRecording.height}{" "}
                {lastRecording.format.toUpperCase()} ·{" "}
                {Math.max(1, Math.ceil(lastRecording.blob.size / 1024))} KB
              </p>
            )}
            {previewFormat === "webm" && !webmSupported && (
              <p className="preview-export-error" role="alert">
                WebM recording is unavailable in this browser. GIF export still
                works, or use the latest Chrome, Edge, or Firefox.
              </p>
            )}
            {!hasExportableLayer && (
              <p className="preview-export-error" role="alert">
                Add and enable a visible image layer before recording.
              </p>
            )}
          </div>
        ) : (
          <pre className="code-preview">
            <code>{content}</code>
          </pre>
        )}
        <footer>
          {tab === "preview" ? (
            <>
              <span>Records locally in your browser · no upload</span>
              <button
                className="primary-action"
                type="button"
                disabled={
                  recording ||
                  (previewFormat === "webm" && !webmSupported) ||
                  !hasExportableLayer
                }
                onClick={() => void recordPreview()}
              >
                {recording ? <Film size={15} /> : <Download size={15} />}
                {recording
                  ? "Exporting…"
                  : `Export & download .${previewFormat}`}
              </button>
            </>
          ) : (
            <>
              <span>
                {content.split("\n").length} lines ·{" "}
                {Math.ceil(new Blob([content]).size / 1024)} KB
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(content);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? <Check size={15} /> : <Clipboard size={15} />}{" "}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() =>
                  downloadText(
                    `${base}${extension}`,
                    content,
                    tab === "phaser" ? "text/typescript" : "application/json",
                  )
                }
              >
                <Download size={15} /> Download {extension}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
