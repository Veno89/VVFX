"use client";

import {
  Check,
  CircleCheck,
  CircleX,
  Clipboard,
  Download,
  FileCode2,
  FileJson,
  Film,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  analyzeGifRecordingWork,
  canRecordWebm,
  isPreviewRecordingCancellation,
  type PreviewRecording,
  type PreviewRecordingRequest,
} from "../previewRecording";
import { downloadBlob, downloadText, safeFilename } from "../download";
import {
  analyzeRuntimeExportCapabilities,
  generatePhaserCode,
  serializeRuntimeDefinition,
} from "../../vfx/exporters";
import { serializeProject } from "../../vfx/serialization";
import { hasEnabledRenderingEffects } from "../../vfx/renderingEffectsModel";
import {
  analyzeExportPreflight,
  EXPORT_PREFLIGHT_PROFILES,
  type ExportPreflightProfileId,
} from "../../vfx/exportPreflight";
import type { VfxProject } from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

type ExportTab = "preview" | "runtime" | "phaser" | "project";
type PreviewFormat = PreviewRecordingRequest["format"];

const EXPORT_TABS: ExportTab[] = ["preview", "runtime", "phaser", "project"];
const exportTabId = (tab: ExportTab) => `export-tab-${tab}`;
const exportPanelId = (tab: ExportTab) => `export-panel-${tab}`;

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
  currentPreviewSize,
}: {
  project: VfxProject;
  activeDuration: number;
  onRecordPreview: (
    request: PreviewRecordingRequest,
    onProgress: (progress: number) => void,
  ) => Promise<PreviewRecording>;
  onClose: () => void;
  currentPreviewSize?: { width: number; height: number } | null;
}) {
  const [tab, setTab] = useState<ExportTab>("preview");
  const [copiedTab, setCopiedTab] = useState<ExportTab | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const copyRequestRef = useRef(0);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const recordingRequestRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>("webm");
  const [previewSizeId, setPreviewSizeId] = useState("game");
  const [preflightProfileId, setPreflightProfileId] =
    useState<ExportPreflightProfileId>("balanced");
  const [lastRecording, setLastRecording] = useState<PreviewRecording | null>(
    null,
  );
  const [webmSupported, setWebmSupported] = useState<boolean | null>(null);
  const cancelRecording = () => recordingControllerRef.current?.abort();
  const dialogRef = useFocusRegion<HTMLElement>({
    onEscape: recording ? cancelRecording : onClose,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setWebmSupported(canRecordWebm()), 0);
    return () => {
      copyRequestRef.current += 1;
      recordingRequestRef.current += 1;
      recordingControllerRef.current?.abort();
      window.clearTimeout(timer);
      if (copyResetTimerRef.current !== null)
        window.clearTimeout(copyResetTimerRef.current);
    };
  }, []);
  const preparedExports = useMemo(() => {
    try {
      return {
        values: {
          runtime: serializeRuntimeDefinition(project),
          phaser: generatePhaserCode(project),
          project: serializeProject(project),
        },
        error: null,
      };
    } catch (error) {
      return {
        values: { runtime: "", phaser: "", project: "" },
        error:
          error instanceof Error
            ? error.message
            : "This project is not ready to export.",
      };
    }
  }, [project]);
  const values = preparedExports.values;
  const integrityError = preparedExports.error;
  const content = tab === "preview" ? "" : values[tab];
  const base = safeFilename(project.metadata.name);
  const runtimeCapabilities = useMemo(
    () => analyzeRuntimeExportCapabilities(project),
    [project],
  );
  const previewSize =
    PREVIEW_SIZES.find((preset) => preset.id === previewSizeId) ??
    PREVIEW_SIZES[0];
  const gifRecordingWork = useMemo(() => {
    const width = previewSize.width ?? currentPreviewSize?.width;
    const height = previewSize.height ?? currentPreviewSize?.height;
    return previewFormat === "gif" && width && height
      ? analyzeGifRecordingWork({
          duration: activeDuration,
          width,
          height,
        })
      : null;
  }, [
    activeDuration,
    currentPreviewSize?.height,
    currentPreviewSize?.width,
    previewFormat,
    previewSize.height,
    previewSize.width,
  ]);
  const gifBudgetError =
    gifRecordingWork && !gifRecordingWork.allowed
      ? gifRecordingWork.reason
      : null;
  const info =
    tab === "preview"
      ? "Export the clean Phaser preview at normal speed, without editor guides. Choose WebM video or an animated GIF plus a centered size and aspect preset."
      : tab === "runtime"
        ? `Recommended for game integration: drop this exact definition into your effect library and play it with @vvfx/phaser-runtime. ${runtimeCapabilities.beamEndpoints ? `It contains ${runtimeCapabilities.beamLayerCount} Beam layer${runtimeCapabilities.beamLayerCount === 1 ? "" : "s"}, so the game can supply world-space endpoints.` : "It has no Beam layers, so it plays at an origin x/y and does not advertise endpoint fitting."}`
        : tab === "phaser"
          ? `Advanced standalone source-file wrapper. It embeds the Runtime JSON and calls @vvfx/phaser-runtime; use it when you want one typed helper file instead of your game's shared effect loader. ${runtimeCapabilities.beamEndpoints ? "Its helper accepts world-space Beam endpoints." : "Because this effect has no Beam layers, its helper intentionally exposes only point placement."}`
          : "The complete editable project, including uploaded images. Re-import this .vvfx file to continue later.";
  const extension =
    tab === "runtime"
      ? ".vvfx-runtime.json"
      : tab === "phaser"
        ? ".ts"
        : ".vvfx";
  const hasExportableLayer = project.layers.some(
    (layer) => layer.enabled && layer.visible && layer.assetId,
  );
  const hasExperimentalRenderingEffects = project.layers.some(
    (layer) =>
      layer.enabled && hasEnabledRenderingEffects(layer.appearance.effects),
  );
  const preflight = useMemo(
    () => analyzeExportPreflight(project, preflightProfileId),
    [preflightProfileId, project],
  );
  const preflightBlocksExport =
    preflight.status === "error" && tab !== "project";

  const selectTab = (nextTab: ExportTab) => {
    copyRequestRef.current += 1;
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    setCopiedTab(null);
    setCopyError(null);
    setTab(nextTab);
  };

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const currentIndex = EXPORT_TABS.indexOf(tab);
    const nextTab =
      event.key === "Home"
        ? EXPORT_TABS[0]
        : event.key === "End"
          ? EXPORT_TABS.at(-1)!
          : EXPORT_TABS[
              (currentIndex +
                (event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 1) +
                EXPORT_TABS.length) %
                EXPORT_TABS.length
            ];
    selectTab(nextTab);
    window.requestAnimationFrame(() =>
      document.getElementById(exportTabId(nextTab))?.focus(),
    );
  };

  const copyCurrentExport = async () => {
    const request = ++copyRequestRef.current;
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    setCopiedTab(null);
    setCopyError(null);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(content);
      if (request !== copyRequestRef.current) return;
      setCopiedTab(tab);
      copyResetTimerRef.current = window.setTimeout(() => {
        if (request !== copyRequestRef.current) return;
        setCopiedTab(null);
        copyResetTimerRef.current = null;
      }, 1600);
    } catch (error) {
      if (request !== copyRequestRef.current) return;
      setCopyError(
        error instanceof Error
          ? error.message
          : "This export could not be copied to the clipboard.",
      );
    }
  };

  const recordPreview = async () => {
    if (integrityError) {
      setRecordingError(integrityError);
      return;
    }
    if (gifBudgetError) {
      setRecordingError(gifBudgetError);
      return;
    }
    const controller = new AbortController();
    const requestId = ++recordingRequestRef.current;
    recordingControllerRef.current = controller;
    setRecording(true);
    setRecordingProgress(0);
    setRecordingError(null);
    try {
      const result = await onRecordPreview(
        {
          format: previewFormat,
          size: { width: previewSize.width, height: previewSize.height },
          signal: controller.signal,
        },
        (progress) => {
          if (
            requestId === recordingRequestRef.current &&
            !controller.signal.aborted
          )
            setRecordingProgress(progress);
        },
      );
      if (
        controller.signal.aborted ||
        requestId !== recordingRequestRef.current
      )
        return;
      setLastRecording(result);
      downloadBlob(`${base}.${result.format}`, result.blob);
    } catch (error) {
      if (requestId !== recordingRequestRef.current) return;
      setRecordingError(
        isPreviewRecordingCancellation(error) || controller.signal.aborted
          ? "Preview export canceled."
          : error instanceof Error
            ? error.message
            : "The preview could not be recorded.",
      );
    } finally {
      if (requestId === recordingRequestRef.current) {
        recordingControllerRef.current = null;
        setRecording(false);
      }
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
        <div className="dialog-tabs" role="tablist" aria-label="Export type">
          <button
            id={exportTabId("preview")}
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            aria-controls={exportPanelId("preview")}
            tabIndex={tab === "preview" ? 0 : -1}
            className={tab === "preview" ? "is-active" : ""}
            onClick={() => selectTab("preview")}
            onKeyDown={moveTabFocus}
            disabled={recording}
          >
            <Film size={15} /> Preview video
          </button>
          <button
            id={exportTabId("runtime")}
            type="button"
            role="tab"
            aria-selected={tab === "runtime"}
            aria-controls={exportPanelId("runtime")}
            tabIndex={tab === "runtime" ? 0 : -1}
            className={tab === "runtime" ? "is-active" : ""}
            onClick={() => selectTab("runtime")}
            onKeyDown={moveTabFocus}
            disabled={recording}
          >
            <FileJson size={15} /> Runtime JSON
            <small className="export-tab-badge" aria-hidden="true">
              Recommended
            </small>
          </button>
          <button
            id={exportTabId("phaser")}
            type="button"
            role="tab"
            aria-selected={tab === "phaser"}
            aria-controls={exportPanelId("phaser")}
            tabIndex={tab === "phaser" ? 0 : -1}
            className={tab === "phaser" ? "is-active" : ""}
            onClick={() => selectTab("phaser")}
            onKeyDown={moveTabFocus}
            disabled={recording}
          >
            <FileCode2 size={15} /> Advanced TypeScript
          </button>
          <button
            id={exportTabId("project")}
            type="button"
            role="tab"
            aria-selected={tab === "project"}
            aria-controls={exportPanelId("project")}
            tabIndex={tab === "project" ? 0 : -1}
            className={tab === "project" ? "is-active" : ""}
            onClick={() => selectTab("project")}
            onKeyDown={moveTabFocus}
            disabled={recording}
          >
            <Download size={15} /> Vvfx project
          </button>
        </div>
        <p className="export-explainer">{info}</p>
        <section
          className={`export-preflight export-preflight--${preflight.status}`}
          aria-label="Export preflight"
        >
          <header>
            <span>
              <ShieldCheck size={15} />
              <strong>Target preflight</strong>
            </span>
            <label>
              Profile
              <select
                value={preflightProfileId}
                disabled={recording}
                onChange={(event) =>
                  setPreflightProfileId(
                    event.target.value as ExportPreflightProfileId,
                  )
                }
              >
                {EXPORT_PREFLIGHT_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          </header>
          <p>{preflight.profile.description}</p>
          <ul>
            {preflight.checks.map((check) => (
              <li key={check.id} className={`is-${check.severity}`}>
                {check.severity === "error" ? (
                  <CircleX size={13} />
                ) : check.severity === "warning" ? (
                  <TriangleAlert size={13} />
                ) : (
                  <CircleCheck size={13} />
                )}
                <span>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {integrityError && (
          <p className="preview-export-error" role="alert">
            {integrityError}
          </p>
        )}
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
          <div
            id={exportPanelId("preview")}
            className="preview-export-panel"
            role="tabpanel"
            aria-labelledby={exportTabId("preview")}
          >
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
                  onChange={(event) => {
                    setPreviewSizeId(event.target.value);
                    setRecordingError(null);
                  }}
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
                  Keep this window open. You can cancel here or press Escape;
                  the editor will restore your previous playback state.
                </small>
              </div>
            )}
            {gifBudgetError && !recording && (
              <p className="preview-export-error" role="alert">
                {gifBudgetError}
              </p>
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
            {previewFormat === "webm" && webmSupported === false && (
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
          <pre
            id={exportPanelId(tab)}
            className="code-preview"
            role="tabpanel"
            aria-labelledby={exportTabId(tab)}
            tabIndex={0}
          >
            <code>{content}</code>
          </pre>
        )}
        {tab !== "preview" && copyError && (
          <p className="preview-export-error" role="alert">
            {copyError}
          </p>
        )}
        <footer>
          {tab === "preview" ? (
            <>
              <span>Records locally in your browser · no upload</span>
              {recording ? (
                <button type="button" onClick={cancelRecording}>
                  <CircleX size={15} /> Cancel export
                </button>
              ) : (
                <button
                  className="primary-action"
                  type="button"
                  disabled={
                    (previewFormat === "webm" && webmSupported !== true) ||
                    !hasExportableLayer ||
                    preflightBlocksExport ||
                    Boolean(integrityError) ||
                    Boolean(gifBudgetError)
                  }
                  onClick={() => void recordPreview()}
                >
                  <Download size={15} /> Export & download .{previewFormat}
                </button>
              )}
            </>
          ) : (
            <>
              <span>
                {content.split("\n").length} lines ·{" "}
                {Math.ceil(new Blob([content]).size / 1024)} KB
              </span>
              <button
                type="button"
                disabled={Boolean(integrityError) || preflightBlocksExport}
                onClick={() => void copyCurrentExport()}
              >
                {copiedTab === tab ? (
                  <Check size={15} />
                ) : (
                  <Clipboard size={15} />
                )}{" "}
                {copiedTab === tab ? "Copied" : "Copy"}
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={Boolean(integrityError) || preflightBlocksExport}
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
