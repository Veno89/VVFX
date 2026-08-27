"use client";

import {
  Braces,
  CheckCircle2,
  CircleX,
  Info,
  TriangleAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clearRecoveryDraft,
  deleteInvalidProjectRecord,
  deleteInvalidRecoveryDraft,
  deleteProject,
  inspectStoredProjects,
  InvalidRecoveryDraftError,
  loadRecoveryDraft,
  saveRecoveryDraft,
  saveProject,
  type InvalidStoredProjectRecord,
  type RecoveryDraft,
} from "../persistence/projects";
import {
  deleteInvalidTemplateRecord,
  deleteTemplate,
  inspectStoredTemplates,
  saveTemplate,
  saveTemplates,
  type InvalidStoredTemplateRecord,
} from "../persistence/templates";
import {
  createEmptyProject,
  createGroup,
  createLayer,
  makeId,
} from "../vfx/defaults";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../vfx/presets";
import {
  analyzeAssetUsage,
  projectAfterAssetChanged,
  projectAfterAssetRelinked,
  projectAfterAssetRemoved,
  sanitizeLayerAssetReferencesWithReport,
} from "../vfx/assetReferences";
import { canAttachLayer, findLayerAttachmentCycle } from "../vfx/attachments";
import {
  canonicalizeLayerCapabilities,
  mergeCompatibleLayerSettings,
  type CopyableLayerSettings,
} from "../vfx/layerLifecycle";
import {
  findLayerEventCycle,
  MAX_EVENT_DEPTH,
  maximumLayerEventDepth,
} from "../vfx/events";
import {
  activeTimelineEnd,
  copyProject,
  hasMeaningfulProjectWork,
  newLayerName,
  projectFingerprint,
  type LayerCreationSource,
} from "../vfx/projectState";
import {
  deserializeProject,
  requireCurrentProject,
  validateProject,
} from "../vfx/serialization";
import {
  MAX_PROJECT_FILE_BYTES,
  MAX_VFX_NAME_LENGTH,
} from "../vfx/inputLimits";
import {
  analyzeTemplateSelection,
  createTemplateFromProject,
  deserializeTemplatePack,
  insertTemplateIntoProject,
  MAX_TEMPLATE_FILE_BYTES,
  serializeTemplate,
  serializeTemplatePack,
  type VfxTemplate,
} from "../vfx/templates";
import type {
  LayerType,
  VfxAsset,
  VfxGroup,
  VfxLayer,
  VfxProject,
  TimelineAuthoringSettings,
} from "../vfx/types";
import {
  AssetPanel,
  type PreparedAssetMetadata,
} from "./components/AssetPanel";
import {
  DEFINITION_DRAWER_ID,
  DefinitionDrawer,
} from "./components/DefinitionDrawer";
import { ExportDialog } from "./components/ExportDialog";
import { GroupInspector } from "./components/GroupInspector";
import { Inspector } from "./components/Inspector";
import {
  FirstEffectGuide,
  OnboardingOverlay,
  TOUR_STEPS,
  TutorialCenter,
  type TourFocus,
} from "./components/LearningCenter";
import { LayerPanel } from "./components/LayerPanel";
import { PanelResizeHandle } from "./components/PanelResizeHandle";
import { PreviewPanel } from "./components/PreviewPanel";
import {
  AssetRemovalDialog,
  NewProjectDialog,
  RecoveryDialog,
  SaveAsDialog,
} from "./components/ProjectSafetyDialogs";
import { ProjectsDialog } from "./components/ProjectsDialog";
import { Timeline } from "./components/Timeline";
import {
  TemplateLibraryDialog,
  type TemplateSaveScope,
} from "./components/TemplateLibraryDialog";
import { TopBar, type ProjectSaveStatus } from "./components/TopBar";
import { downloadText } from "./download";
import { verifyEmbeddedAssetImages } from "./embeddedImageValidation";
import {
  recordCanvasAsGif,
  recordCanvasAsWebm,
  waitForAnimationFrames,
  type PreviewRecordingRequest,
} from "./previewRecording";
import { useHistoryState } from "./useHistoryState";
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  loadWorkspacePreferences,
  saveWorkspacePreferences,
  updateWorkspaceProjectView,
  workspaceProjectView,
  type ProjectWorkspaceView,
} from "./workspace";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const upsertSavedProject = (
  projects: VfxProject[],
  project: VfxProject,
): VfxProject[] =>
  [
    project,
    ...projects.filter(
      (candidate) => candidate.metadata.id !== project.metadata.id,
    ),
  ].sort((left, right) =>
    right.metadata.updatedAt.localeCompare(left.metadata.updatedAt),
  );

const upsertSavedTemplate = (
  templates: VfxTemplate[],
  template: VfxTemplate,
): VfxTemplate[] =>
  [
    template,
    ...templates.filter((candidate) => candidate.id !== template.id),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

type NoticeTone = "success" | "info" | "warning" | "error";

interface EditorNotice {
  message: string;
  tone: NoticeTone;
}

function isCoalescedHistoryInput(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ["number", "range", "text", "search"].includes(target.type);
}

function shouldHandleEditorShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (
    target?.closest(
      "input, textarea, select, [contenteditable='true'], [data-editor-shortcuts='off']",
    )
  )
    return false;
  if (
    document.querySelector(
      "[role='dialog'], [role='alertdialog'], [role='menu']",
    )
  )
    return false;
  if (
    target?.closest(
      "[role='slider'], [role='spinbutton'], [role='menuitem'], [role='tab'], [role='switch']",
    )
  )
    return false;
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier && target?.closest("button, a[href], summary, [role='button']"))
    return false;
  return true;
}

function activeEventGraphIssue(layers: VfxLayer[]): string | null {
  const cycle = findLayerEventCycle(layers);
  if (cycle) {
    const names = new Map(layers.map((layer) => [layer.id, layer.name]));
    return `That change would create a circular active layer-event chain: ${cycle
      .map((id) => names.get(id) ?? id)
      .join(" -> ")}. Disable another event first.`;
  }
  if (maximumLayerEventDepth(layers) > MAX_EVENT_DEPTH)
    return `That change would make the active layer-event chain deeper than the supported ${MAX_EVENT_DEPTH} steps.`;
  return null;
}

export function VfxEditor() {
  const initial = useMemo(() => createEmptyProject(), []);
  const history = useHistoryState(initial);
  const project = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.layers[0]?.id ?? null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    initial.assets[0]?.id ?? null,
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [previewRestartRevision, setPreviewRestartRevision] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingPreview, setExportingPreview] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [newProjectRequest, setNewProjectRequest] = useState<
    "toolbar" | "guide" | null
  >(null);
  const [assetRemovalId, setAssetRemovalId] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [learningOpen, setLearningOpen] = useState(false);
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [guideActionStep, setGuideActionStep] = useState<number | null>(null);
  const [savedProjects, setSavedProjects] = useState<VfxProject[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<VfxTemplate[]>([]);
  const [invalidStoredProjects, setInvalidStoredProjects] = useState<
    InvalidStoredProjectRecord[]
  >([]);
  const [invalidStoredTemplates, setInvalidStoredTemplates] = useState<
    InvalidStoredTemplateRecord[]
  >([]);
  const [excessStoredProjects, setExcessStoredProjects] = useState(0);
  const [excessStoredTemplates, setExcessStoredTemplates] = useState(0);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(
    null,
  );
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<
    "idle" | "saving" | "protected" | "error"
  >("idle");
  const [recoveryStorageBlocked, setRecoveryStorageBlocked] = useState(false);
  const [renderedProjectGeneration, setRenderedProjectGeneration] = useState(0);
  const recoveryGeneration = useRef(0);
  const recoveryStorageCheckedRef = useRef(false);
  const recoveryStorageBlockedRef = useRef(false);
  const projectGeneration = useRef(0);
  const projectImportRequest = useRef(0);
  const projectImageValidation = useRef<AbortController | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideContinueRef = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<EditorNotice | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [settingsClipboard, setSettingsClipboard] =
    useState<CopyableLayerSettings | null>(null);
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE_PREFERENCES);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  useEffect(
    () => () => {
      projectImageValidation.current?.abort();
      projectImageValidation.current = null;
      if (toastTimerRef.current !== null)
        window.clearTimeout(toastTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWorkspace(loadWorkspacePreferences(window.localStorage));
      setWorkspaceLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (workspaceLoaded)
      saveWorkspacePreferences(window.localStorage, workspace);
  }, [workspace, workspaceLoaded]);
  const selectedGroup =
    project.groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedLayer = selectedGroup
    ? null
    : (project.layers.find((layer) => layer.id === selectedId) ??
      project.layers[0] ??
      null);
  const effectiveSelectedAssetId =
    project.assets.find((asset) => asset.id === selectedAssetId)?.id ??
    project.assets[0]?.id ??
    null;
  const pendingRemovalAsset = assetRemovalId
    ? (project.assets.find(
        (asset) => asset.id === assetRemovalId && !asset.builtIn,
      ) ?? null)
    : null;
  const pendingRemovalUsage = useMemo(
    () =>
      pendingRemovalAsset
        ? analyzeAssetUsage(project, pendingRemovalAsset.id)
        : null,
    [pendingRemovalAsset, project],
  );
  const assetUsageCounts = useMemo(
    () =>
      Object.fromEntries(
        project.assets.map((asset) => [
          asset.id,
          analyzeAssetUsage(project, asset.id).counts.affectedLayers,
        ]),
      ),
    [project],
  );
  const templateSaveSummaries = useMemo(
    () => ({
      effect: analyzeTemplateSelection(project, undefined, "effect"),
      ...(selectedLayer
        ? {
            layer: analyzeTemplateSelection(
              project,
              [selectedLayer.id],
              "layer",
            ),
          }
        : {}),
      ...(selectedGroup
        ? {
            group: analyzeTemplateSelection(
              project,
              project.layers
                .filter((layer) => layer.groupId === selectedGroup.id)
                .map((layer) => layer.id),
              "group",
            ),
          }
        : {}),
    }),
    [project, selectedGroup, selectedLayer],
  );
  const effectiveSelectedId = selectedLayer?.id ?? null;
  const effectiveSelectedGroupId = selectedGroup?.id ?? null;
  const projectWorkspace = useMemo(
    () =>
      workspaceProjectView(
        workspace,
        project.metadata.id,
        project.layers.map((layer) => layer.id),
        project.preview.duration,
      ),
    [workspace, project.metadata.id, project.layers, project.preview.duration],
  );
  const updateProjectWorkspace = useCallback(
    (
      update:
        | Partial<ProjectWorkspaceView>
        | ((current: ProjectWorkspaceView) => ProjectWorkspaceView),
    ) => {
      setWorkspace((current) => {
        const view = workspaceProjectView(
          current,
          project.metadata.id,
          project.layers.map((layer) => layer.id),
          project.preview.duration,
        );
        const next =
          typeof update === "function" ? update(view) : { ...view, ...update };
        return updateWorkspaceProjectView(current, project.metadata.id, next);
      });
    },
    [project.metadata.id, project.layers, project.preview.duration],
  );
  const beginResize = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      resize: (clientX: number, clientY: number) => void,
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const move = (moveEvent: PointerEvent) =>
        resize(moveEvent.clientX, moveEvent.clientY);
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.classList.remove("is-resizing-workspace");
      };
      document.body.classList.add("is-resizing-workspace");
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [],
  );
  const currentFingerprint = useMemo(
    () => projectFingerprint(project),
    [project],
  );
  const hasMeaningfulWork = useMemo(
    () => hasMeaningfulProjectWork(project),
    [project],
  );
  const activePlaybackEnd = useMemo(
    () => activeTimelineEnd(project),
    [project],
  );
  const playbackStart = Math.max(
    0,
    Math.min(project.preview.duration - 50, projectWorkspace.workStart),
  );
  const playbackEnd = Math.max(
    playbackStart + 50,
    Math.min(
      project.preview.duration,
      projectWorkspace.workEnd ??
        (project.preview.loop ? activePlaybackEnd : project.preview.duration),
    ),
  );
  const hasUnsavedChanges =
    hasMeaningfulWork &&
    (savedFingerprint === null || currentFingerprint !== savedFingerprint);
  const saveStatus: ProjectSaveStatus =
    !hasMeaningfulWork && savedFingerprint === null
      ? "new"
      : !hasUnsavedChanges
        ? "saved"
        : recoveryStatus === "saving"
          ? "recovering"
          : recoveryStatus === "protected"
            ? "protected"
            : recoveryStatus === "error"
              ? "error"
              : "unsaved";
  const editorModalOpen =
    exportOpen ||
    projectsOpen ||
    templatesOpen ||
    saveAsOpen ||
    newProjectRequest !== null ||
    pendingRemovalAsset !== null ||
    learningOpen ||
    onboardingStep !== null ||
    guideStep !== null ||
    recoveryDraft !== null;
  const restartPreview = useCallback(() => {
    setPreviewRestartRevision((revision) => revision + 1);
    setTime(playbackStart);
    setPlaying(true);
  }, [playbackStart]);

  useEffect(() => {
    if (guideStep === 0 && guideActionStep === 0)
      guideContinueRef.current?.focus({ preventScroll: true });
  }, [guideActionStep, guideStep]);
  const latestProjectRef = useRef(project);
  const savedFingerprintRef = useRef(savedFingerprint);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const activeSaveFingerprintRef = useRef<string | null>(null);
  const queuedSaveProjectRef = useRef<VfxProject | null>(null);
  useEffect(() => {
    latestProjectRef.current = project;
  }, [project]);
  useEffect(() => {
    const activeValidation = projectImageValidation.current;
    if (!activeValidation) return;
    activeValidation.abort();
    projectImageValidation.current = null;
  }, [currentFingerprint]);
  useEffect(() => {
    savedFingerprintRef.current = savedFingerprint;
  }, [savedFingerprint]);

  const notify = useCallback((message: string, tone: NoticeTone) => {
    if (toastTimerRef.current !== null)
      window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(
      () => {
        toastTimerRef.current = null;
        setToast(null);
      },
      tone === "error" || tone === "warning" ? 4200 : 2600,
    );
  }, []);
  const refreshStoredProjects = useCallback(async () => {
    const inspection = await inspectStoredProjects();
    setSavedProjects(inspection.projects);
    setInvalidStoredProjects(inspection.invalidRecords);
    setExcessStoredProjects(inspection.excessRecords);
    return inspection.projects;
  }, []);
  const refreshStoredTemplates = useCallback(async () => {
    const inspection = await inspectStoredTemplates();
    setSavedTemplates(inspection.templates);
    setInvalidStoredTemplates(inspection.invalidRecords);
    setExcessStoredTemplates(inspection.excessRecords);
    return inspection.templates;
  }, []);
  const handlePreviewCanvasReady = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      previewCanvasRef.current = canvas;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void loadRecoveryDraft()
      .then((draft) => {
        if (cancelled) return;
        recoveryStorageCheckedRef.current = true;
        setRecoveryDraft(draft);
        setRecoveryChecked(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const invalidDraft =
          error instanceof InvalidRecoveryDraftError ||
          (error instanceof Error &&
            error.name === "InvalidRecoveryDraftError");
        recoveryStorageBlockedRef.current = invalidDraft;
        setRecoveryStorageBlocked(invalidDraft);
        setRecoveryStatus("error");
        setRecoveryChecked(true);
        notify(
          invalidDraft
            ? error.message
            : error instanceof Error
              ? error.message
              : "Recovery autosave could not be checked.",
          invalidDraft ? "warning" : "error",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    if (!recoveryChecked || recoveryDraft) return;
    const timer = window.setTimeout(() => {
      if (!window.localStorage.getItem("vvfx-onboarding-complete-v1")) {
        setOnboardingStep(0);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [recoveryChecked, recoveryDraft]);

  useEffect(() => {
    if (
      !recoveryChecked ||
      !recoveryStorageCheckedRef.current ||
      recoveryDraft ||
      recoveryStorageBlockedRef.current
    )
      return;
    const generation = ++recoveryGeneration.current;
    if (!hasUnsavedChanges) {
      void clearRecoveryDraft()
        .then(() => {
          if (recoveryGeneration.current === generation)
            setRecoveryStatus("idle");
        })
        .catch(() => setRecoveryStatus("error"));
      return;
    }
    const statusTimer = window.setTimeout(() => {
      if (recoveryGeneration.current === generation)
        setRecoveryStatus("saving");
    }, 0);
    const timer = window.setTimeout(() => {
      void saveRecoveryDraft(latestProjectRef.current)
        .then(() => {
          if (recoveryGeneration.current === generation)
            setRecoveryStatus("protected");
        })
        .catch(() => {
          if (recoveryGeneration.current === generation)
            setRecoveryStatus("error");
        });
    }, 800);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
    };
  }, [
    currentFingerprint,
    hasUnsavedChanges,
    recoveryChecked,
    recoveryDraft,
    recoveryStorageBlocked,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeClosing = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [hasUnsavedChanges]);

  const finishOnboarding = useCallback(() => {
    window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
    setOnboardingStep(null);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(80, now - previous) * speed;
      previous = now;
      setTime((current) => {
        const next = Math.max(current, playbackStart) + delta;
        if (next < playbackEnd) return next;
        if (project.preview.loop)
          return (
            playbackStart +
            ((next - playbackStart) % (playbackEnd - playbackStart))
          );
        window.setTimeout(() => setPlaying(false), 0);
        return playbackEnd;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playbackEnd, playbackStart, playing, project.preview.loop, speed]);

  const recordPreview = useCallback(
    async (
      request: PreviewRecordingRequest,
      onProgress: (progress: number) => void,
    ) => {
      requireCurrentProject(project, "preview-export");
      const canvas = previewCanvasRef.current;
      if (!canvas)
        throw new Error(
          "The live preview is still starting. Wait a moment and try again.",
        );
      const previousTime = time;
      const wasPlaying = playing;
      setPlaying(false);
      setTime(playbackStart);
      setExportingPreview(true);
      try {
        await waitForAnimationFrames(2);
        const recordingOptions = {
          source: canvas,
          duration: playbackEnd - playbackStart,
          size: request.size,
          renderFrame: async (frameTime: number) => {
            setTime(playbackStart + frameTime);
            await waitForAnimationFrames(2);
          },
          onProgress,
        };
        return request.format === "gif"
          ? await recordCanvasAsGif(recordingOptions)
          : await recordCanvasAsWebm(recordingOptions);
      } finally {
        setExportingPreview(false);
        setTime(previousTime);
        setPlaying(wasPlaying);
      }
    },
    [playbackEnd, playbackStart, playing, project, time],
  );

  const updateProject = useCallback(
    (next: VfxProject) =>
      history.setCoalesced({
        ...next,
        metadata: { ...next.metadata, updatedAt: new Date().toISOString() },
      }),
    [history],
  );
  const updateLayer = useCallback(
    (nextLayer: VfxLayer) => {
      const canonicalLayer = canonicalizeLayerCapabilities(nextLayer);
      if (!project.layers.some((layer) => layer.id === canonicalLayer.id)) {
        notify("That layer is no longer in this project.", "error");
        return;
      }
      if (
        !canAttachLayer(
          project.layers,
          canonicalLayer.id,
          canonicalLayer.parentId,
        )
      ) {
        notify(
          "That attachment would create a circular layer chain.",
          "warning",
        );
        return;
      }
      const nextLayers = project.layers.map((layer) =>
        layer.id === canonicalLayer.id ? canonicalLayer : layer,
      );
      const eventIssue = activeEventGraphIssue(nextLayers);
      if (eventIssue) {
        notify(eventIssue, "warning");
        return;
      }
      history.setCoalesced((current) => {
        if (
          !current.layers.some((layer) => layer.id === canonicalLayer.id) ||
          !canAttachLayer(
            current.layers,
            canonicalLayer.id,
            canonicalLayer.parentId,
          )
        )
          return current;
        const currentLayers = current.layers.map((layer) =>
          layer.id === canonicalLayer.id ? canonicalLayer : layer,
        );
        if (activeEventGraphIssue(currentLayers)) return current;
        return {
          ...current,
          layers: currentLayers,
          metadata: {
            ...current.metadata,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [history, notify, project.layers],
  );
  const updateLayers = useCallback(
    (nextLayers: VfxLayer[]) => {
      const canonicalLayers = nextLayers.map(canonicalizeLayerCapabilities);
      if (findLayerAttachmentCycle(canonicalLayers)) {
        notify(
          "That change would create a circular layer attachment.",
          "warning",
        );
        return;
      }
      const eventIssue = activeEventGraphIssue(canonicalLayers);
      if (eventIssue) {
        notify(eventIssue, "warning");
        return;
      }
      history.setCoalesced((current) => ({
        ...current,
        layers: canonicalLayers,
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
    },
    [history, notify],
  );
  const updateTimeline = useCallback(
    (timeline: TimelineAuthoringSettings, duration?: number) => {
      history.setCoalesced((current) => ({
        ...current,
        timeline,
        preview:
          duration === undefined
            ? current.preview
            : { ...current.preview, duration },
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
    },
    [history],
  );
  const updateGroup = useCallback(
    (nextGroup: VfxGroup) => {
      history.setCoalesced((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === nextGroup.id ? nextGroup : group,
        ),
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
    },
    [history],
  );
  const assignLayerToGroup = useCallback(
    (layerId: string, groupId: string | null) => {
      history.set((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === layerId ? ({ ...layer, groupId } as VfxLayer) : layer,
        ),
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
    },
    [history],
  );
  const addGroup = useCallback(() => {
    const group = createGroup(`Group ${project.groups.length + 1}`);
    history.set((current) => ({
      ...current,
      groups: [...current.groups, group],
      layers: current.layers.map((layer) =>
        layer.id === effectiveSelectedId
          ? ({ ...layer, groupId: group.id } as VfxLayer)
          : layer,
      ),
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setSelectedGroupId(group.id);
    notify(
      effectiveSelectedId
        ? "Group created with the selected layer."
        : "Empty effect group created.",
      "success",
    );
  }, [effectiveSelectedId, history, notify, project.groups.length]);
  const deleteGroupById = useCallback(
    (id: string) => {
      const group = project.groups.find((candidate) => candidate.id === id);
      if (!group) return;
      if (
        !window.confirm(
          `Delete “${group.name}”? Its layers will stay in the project.`,
        )
      )
        return;
      history.set((current) => ({
        ...current,
        groups: current.groups.filter((candidate) => candidate.id !== id),
        layers: current.layers.map((layer) =>
          layer.groupId === id
            ? ({ ...layer, groupId: null } as VfxLayer)
            : layer,
        ),
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
      setSelectedGroupId(null);
      notify(`Deleted “${group.name}”; its layers were kept.`, "success");
    },
    [history, notify, project.groups],
  );
  const patchLayer = useCallback(
    (id: string, patch: Partial<VfxLayer>) => {
      const currentLayer = project.layers.find((layer) => layer.id === id);
      if (!currentLayer) return;
      const nextLayer = { ...currentLayer, ...patch } as VfxLayer;
      if (!canAttachLayer(project.layers, id, nextLayer.parentId)) {
        notify(
          "That attachment would create a circular layer chain.",
          "warning",
        );
        return;
      }
      const nextLayers = project.layers.map((layer) =>
        layer.id === id ? nextLayer : layer,
      );
      const eventIssue = activeEventGraphIssue(nextLayers);
      if (eventIssue) {
        notify(eventIssue, "warning");
        return;
      }
      history.setCoalesced((current) => {
        const currentLayer = current.layers.find((layer) => layer.id === id);
        if (!currentLayer) return current;
        const currentNext = { ...currentLayer, ...patch } as VfxLayer;
        if (!canAttachLayer(current.layers, id, currentNext.parentId))
          return current;
        const currentLayers = current.layers.map((layer) =>
          layer.id === id ? currentNext : layer,
        );
        if (activeEventGraphIssue(currentLayers)) return current;
        return {
          ...current,
          layers: currentLayers,
        };
      });
    },
    [history, notify, project.layers],
  );

  const updateAsset = useCallback(
    (nextAsset: VfxAsset) => {
      if (
        !latestProjectRef.current.assets.some(
          (asset) => asset.id === nextAsset.id,
        )
      ) {
        notify(
          `The image “${nextAsset.name}” is no longer in this project.`,
          "error",
        );
        return;
      }
      history.setCoalesced((current) => {
        if (!current.assets.some((asset) => asset.id === nextAsset.id))
          return current;
        return {
          ...projectAfterAssetChanged(current, nextAsset),
          metadata: {
            ...current.metadata,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [history, notify],
  );
  const prepareAsset = useCallback(
    (
      assetId: string,
      metadata: PreparedAssetMetadata,
      sourceProjectGeneration: number,
    ): boolean => {
      if (
        sourceProjectGeneration !== projectGeneration.current ||
        !latestProjectRef.current.assets.some((asset) => asset.id === assetId)
      )
        return false;
      history.set((current) => {
        if (sourceProjectGeneration !== projectGeneration.current)
          return current;
        const currentAsset = current.assets.find(
          (asset) => asset.id === assetId,
        );
        if (!currentAsset) return current;
        return {
          ...projectAfterAssetChanged(current, {
            ...currentAsset,
            ...metadata,
          }),
          metadata: {
            ...current.metadata,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return true;
    },
    [history],
  );
  const uploadAssets = useCallback(
    (assets: VfxAsset[], sourceProjectGeneration: number): boolean => {
      const currentProject = latestProjectRef.current;
      if (sourceProjectGeneration !== projectGeneration.current) return false;
      const existingIds = new Set(
        currentProject.assets.map((asset) => asset.id),
      );
      if (
        assets.some(
          (asset, index) =>
            existingIds.has(asset.id) ||
            assets.findIndex((candidate) => candidate.id === asset.id) !==
              index,
        )
      ) {
        notify("One or more imported images reuse an existing ID.", "error");
        return false;
      }
      const candidate = validateProject({
        ...currentProject,
        assets: [...currentProject.assets, ...assets],
        metadata: {
          ...currentProject.metadata,
          updatedAt: new Date().toISOString(),
        },
      });
      if (!candidate.ok || !candidate.project) {
        notify(
          candidate.error ?? "Those images do not fit in this project.",
          "error",
        );
        return false;
      }
      if (sourceProjectGeneration !== projectGeneration.current) return false;
      history.set(candidate.project);
      setSelectedAssetId(assets[0]?.id ?? null);
      notify(
        `${assets.length} image${assets.length === 1 ? "" : "s"} added.`,
        "success",
      );
      return true;
    },
    [history, notify],
  );
  const addLayer = useCallback(
    (
      type: LayerType,
      assetId = effectiveSelectedAssetId,
      source: LayerCreationSource = "manual",
    ) => {
      const layer = createLayer(
        type,
        newLayerName(project.assets, assetId, source),
        assetId,
      );
      history.set((current) => ({
        ...current,
        layers: [...current.layers, layer],
      }));
      setSelectedId(layer.id);
      setSelectedGroupId(null);
      setTime(0);
      setPlaying(true);
    },
    [effectiveSelectedAssetId, history, project.assets],
  );
  const addPreset = useCallback(
    (presetId: string) => {
      const composition = COMPOSITION_PRESETS.find(
        (candidate) => candidate.id === presetId,
      );
      if (composition) {
        const source = createEmptyProject(composition.name);
        source.layers = composition.create();
        const template = createTemplateFromProject(
          source,
          composition.name,
          composition.description,
          undefined,
          "effect",
        );
        const inserted = insertTemplateIntoProject(project, template, time);
        const firstLayer = inserted.project.layers.find(
          (layer) => layer.id === inserted.insertedLayerIds[0],
        );
        history.set(inserted.project);
        setSelectedId(firstLayer?.id ?? null);
        setSelectedGroupId(null);
        setSelectedAssetId(firstLayer?.assetId ?? effectiveSelectedAssetId);
        setTime(time);
        setPlaying(true);
        notify(
          `${composition.name} inserted at ${Math.round(time)} ms — ${composition.description}`,
          "success",
        );
        return;
      }
      const preset = LAYER_PRESETS.find(
        (candidate) => candidate.id === presetId,
      );
      if (!preset) return;
      const layer = preset.create(effectiveSelectedAssetId ?? undefined);
      history.set((current) => ({
        ...current,
        layers: [...current.layers, layer],
      }));
      setSelectedId(layer.id);
      setSelectedGroupId(null);
      setTime(0);
      setPlaying(true);
      notify(`${preset.name} added — ${preset.description}`, "success");
    },
    [effectiveSelectedAssetId, history, notify, project, time],
  );
  const duplicateLayer = useCallback(
    (id: string) => {
      const source = project.layers.find((layer) => layer.id === id);
      if (!source) return;
      const copy = clone(source);
      copy.id = makeId("layer");
      copy.name = `${source.name} copy`;
      const index = project.layers.findIndex((layer) => layer.id === id);
      const layers = [...project.layers];
      layers.splice(index + 1, 0, copy);
      history.set({ ...project, layers });
      updateProjectWorkspace((current) => ({
        ...current,
        folders: current.folders.map((folder) => {
          const sourceIndex = folder.layerIds.indexOf(id);
          if (sourceIndex < 0) return folder;
          const layerIds = [...folder.layerIds];
          layerIds.splice(sourceIndex + 1, 0, copy.id);
          return { ...folder, layerIds };
        }),
      }));
      setSelectedId(copy.id);
      setSelectedGroupId(null);
    },
    [history, project, updateProjectWorkspace],
  );
  const deleteLayerById = useCallback(
    (id: string) => {
      if (projectWorkspace.lockedLayerIds.includes(id)) {
        notify("Unlock this layer before deleting it.", "warning");
        return;
      }
      const index = project.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return;
      const removedLinks = project.layers.reduce(
        (total, layer) =>
          total +
          layer.events.filter((event) => event.targetLayerId === id).length,
        0,
      );
      const layers = project.layers
        .filter((layer) => layer.id !== id)
        .map(
          (layer) =>
            ({
              ...layer,
              parentId: layer.parentId === id ? null : layer.parentId,
              events: layer.events.filter(
                (event) => event.targetLayerId !== id,
              ),
            }) as VfxLayer,
        ) as VfxLayer[];
      history.set({ ...project, layers });
      updateProjectWorkspace((current) => ({
        ...current,
        lockedLayerIds: current.lockedLayerIds.filter(
          (layerId) => layerId !== id,
        ),
        folders: current.folders.map((folder) => ({
          ...folder,
          layerIds: folder.layerIds.filter((layerId) => layerId !== id),
        })),
      }));
      setSelectedId(layers[Math.min(index, layers.length - 1)]?.id ?? null);
      if (removedLinks > 0)
        notify(
          `Layer deleted. Removed ${removedLinks} event link${removedLinks === 1 ? "" : "s"} that targeted it.`,
          "warning",
        );
    },
    [
      history,
      notify,
      project,
      projectWorkspace.lockedLayerIds,
      updateProjectWorkspace,
    ],
  );

  const confirmProjectReplacement = useCallback(
    (action: string) =>
      !hasUnsavedChanges ||
      window.confirm(
        `You have unsaved changes. ${action} will replace them in the editor. Continue?`,
      ),
    [hasUnsavedChanges],
  );

  const activateProject = useCallback(
    (next: VfxProject, manuallySaved: boolean, preserveRecovery = false) => {
      recoveryGeneration.current += 1;
      projectGeneration.current += 1;
      projectImportRequest.current += 1;
      projectImageValidation.current?.abort();
      projectImageValidation.current = null;
      setRenderedProjectGeneration(projectGeneration.current);
      history.replace(next);
      setSelectedId(next.layers[0]?.id ?? null);
      setSelectedGroupId(null);
      setSelectedAssetId(next.assets[0]?.id ?? null);
      setAssetRemovalId(null);
      setTime(0);
      setPlaying(false);
      setSavedFingerprint(manuallySaved ? projectFingerprint(next) : null);
      setRecoveryStatus("idle");
      setRecoveryDraft(null);
      if (
        !preserveRecovery &&
        recoveryStorageCheckedRef.current &&
        !recoveryStorageBlockedRef.current
      )
        void clearRecoveryDraft().catch(() => setRecoveryStatus("error"));
    },
    [history],
  );

  const createNewProject = useCallback(() => {
    const next = createEmptyProject();
    activateProject(next, false);
    notify("New empty project ready.", "success");
  }, [activateProject, notify]);

  const completeNewProject = useCallback(
    (source: "toolbar" | "guide") => {
      createNewProject();
      if (source === "guide") setGuideActionStep(0);
    },
    [createNewProject],
  );

  const requestNewProject = useCallback(
    (source: "toolbar" | "guide") => {
      if (hasUnsavedChanges) {
        setNewProjectRequest(source);
        return;
      }
      completeNewProject(source);
    },
    [completeNewProject, hasUnsavedChanges],
  );

  const persistProjectSnapshot = useCallback(
    async (projectToSave: VfxProject) => {
      const sourceVersion = projectFingerprint(projectToSave);
      let storedProject: VfxProject;
      try {
        storedProject = await saveProject(projectToSave);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "This project could not be saved.",
          "error",
        );
        return;
      }

      const savedVersion = projectFingerprint(storedProject);
      recoveryGeneration.current += 1;
      history.setTransient((current) => {
        if (projectFingerprint(current) !== sourceVersion) return current;
        return {
          ...storedProject,
          preview: {
            ...storedProject.preview,
            background: current.preview.background,
            customColor: current.preview.customColor,
            showGrid: current.preview.showGrid,
            zoom: current.preview.zoom,
            loop: current.preview.loop,
          },
        };
      });
      setSavedFingerprint(savedVersion);
      setSavedProjects((current) => upsertSavedProject(current, storedProject));

      let recoveryCleanupFailed = false;
      if (
        recoveryStorageCheckedRef.current &&
        !recoveryStorageBlockedRef.current &&
        projectFingerprint(latestProjectRef.current) === sourceVersion
      ) {
        try {
          await clearRecoveryDraft();
          setRecoveryStatus("idle");
        } catch {
          recoveryCleanupFailed = true;
          setRecoveryStatus("error");
        }
      }

      let projectRefreshFailed = false;
      try {
        await refreshStoredProjects();
      } catch {
        projectRefreshFailed = true;
      }

      const followUpWarnings = [
        ...(recoveryStorageBlocked
          ? [
              "unreadable recovery data remains preserved until you remove it from Load",
            ]
          : []),
        ...(recoveryCleanupFailed
          ? ["its previous recovery draft could not be cleared"]
          : []),
        ...(projectRefreshFailed
          ? ["the saved-project list could not be refreshed yet"]
          : []),
      ];
      notify(
        followUpWarnings.length > 0
          ? `Project saved, but ${followUpWarnings.join(" and ")}.`
          : "Project saved in this browser.",
        followUpWarnings.length > 0 ? "warning" : "success",
      );
    },
    [history, notify, recoveryStorageBlocked, refreshStoredProjects],
  );

  const save = useCallback((): Promise<void> => {
    const requestedProject = latestProjectRef.current;
    const requestedFingerprint = projectFingerprint(requestedProject);
    const inFlight = saveInFlightRef.current;
    if (inFlight) {
      const queuedFingerprint = queuedSaveProjectRef.current
        ? projectFingerprint(queuedSaveProjectRef.current)
        : activeSaveFingerprintRef.current;
      if (queuedFingerprint !== requestedFingerprint) {
        queuedSaveProjectRef.current = requestedProject;
        notify(
          "A project save is already in progress. Your latest changes will save next.",
          "info",
        );
      } else {
        notify("This project version is already being saved.", "info");
      }
      return inFlight;
    }

    notify("Saving project...", "info");
    const run = async () => {
      let nextProject: VfxProject | null = requestedProject;
      while (nextProject) {
        activeSaveFingerprintRef.current = projectFingerprint(nextProject);
        try {
          await persistProjectSnapshot(nextProject);
        } catch (error) {
          notify(
            error instanceof Error
              ? error.message
              : "This project could not be saved.",
            "error",
          );
        }
        nextProject = queuedSaveProjectRef.current;
        queuedSaveProjectRef.current = null;
      }
    };
    const pending = run().finally(() => {
      if (saveInFlightRef.current !== pending) return;
      saveInFlightRef.current = null;
      activeSaveFingerprintRef.current = null;
      queuedSaveProjectRef.current = null;
    });
    saveInFlightRef.current = pending;
    return pending;
  }, [notify, persistProjectSnapshot]);

  const saveAs = useCallback(
    async (name: string) => {
      const copy = copyProject(project, name);
      let storedCopy: VfxProject;
      try {
        storedCopy = await saveProject(copy);
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error("This copy could not be saved.");
      }
      activateProject(storedCopy, true);
      setSavedProjects((current) => upsertSavedProject(current, storedCopy));
      setSaveAsOpen(false);
      notify(`Saved as “${storedCopy.metadata.name}”.`, "success");
      void refreshStoredProjects().catch(() =>
        notify(
          `Saved as “${storedCopy.metadata.name}”, but the saved-project list could not be refreshed yet.`,
          "warning",
        ),
      );
    },
    [activateProject, notify, project, refreshStoredProjects],
  );

  const openProjects = useCallback(async () => {
    try {
      await refreshStoredProjects();
      setProjectsOpen(true);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Saved projects could not be opened.",
        "error",
      );
    }
  }, [notify, refreshStoredProjects]);

  const openTemplateLibrary = useCallback(async () => {
    try {
      await refreshStoredTemplates();
      setTemplatesOpen(true);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "The template library could not be opened.",
        "error",
      );
    }
  }, [notify, refreshStoredTemplates]);

  const saveCurrentTemplate = useCallback(
    async (name: string, description: string, scope: TemplateSaveScope) => {
      const layerIds =
        scope === "layer" && selectedLayer
          ? [selectedLayer.id]
          : scope === "group" && selectedGroup
            ? project.layers
                .filter((layer) => layer.groupId === selectedGroup.id)
                .map((layer) => layer.id)
            : undefined;
      const template = createTemplateFromProject(
        project,
        name,
        description,
        layerIds,
        scope,
      );
      const storedTemplate = await saveTemplate(template);
      setSavedTemplates((current) =>
        upsertSavedTemplate(current, storedTemplate),
      );
      try {
        await refreshStoredTemplates();
        notify(
          `Saved “${storedTemplate.name}” as a reusable template.`,
          "success",
        );
      } catch {
        notify(
          `Saved “${storedTemplate.name}” as a reusable template, but the template list could not be refreshed yet.`,
          "warning",
        );
      }
    },
    [notify, project, refreshStoredTemplates, selectedGroup, selectedLayer],
  );

  const insertSavedTemplate = useCallback(
    async (template: VfxTemplate) => {
      const sourceFingerprint = projectFingerprint(project);
      projectImageValidation.current?.abort();
      const controller = new AbortController();
      projectImageValidation.current = controller;
      try {
        await verifyEmbeddedAssetImages(template.assets, controller.signal);
        if (
          projectImageValidation.current !== controller ||
          projectFingerprint(latestProjectRef.current) !== sourceFingerprint
        )
          return;
        const inserted = insertTemplateIntoProject(project, template, time);
        const firstLayer = inserted.project.layers.find(
          (layer) => layer.id === inserted.insertedLayerIds[0],
        );
        history.set({
          ...inserted.project,
          metadata: {
            ...inserted.project.metadata,
            updatedAt: new Date().toISOString(),
          },
        });
        setSelectedId(firstLayer?.id ?? null);
        setSelectedGroupId(null);
        setSelectedAssetId(firstLayer?.assetId ?? effectiveSelectedAssetId);
        setTime(time);
        setPlaying(true);
        setTemplatesOpen(false);
        notify(
          `Inserted “${template.name}” as ${inserted.insertedLayerIds.length} new layer${inserted.insertedLayerIds.length === 1 ? "" : "s"}.`,
          "success",
        );
      } catch (error) {
        if (!isAbortError(error))
          notify(
            error instanceof Error
              ? error.message
              : "This template's images could not be checked.",
            "error",
          );
      } finally {
        if (projectImageValidation.current === controller)
          projectImageValidation.current = null;
      }
    },
    [effectiveSelectedAssetId, history, notify, project, time],
  );

  const importTemplateFile = useCallback(
    async (file: File) => {
      projectImageValidation.current?.abort();
      const controller = new AbortController();
      projectImageValidation.current = controller;
      try {
        if (file.size > MAX_TEMPLATE_FILE_BYTES)
          throw new Error(
            "This template file is larger than the supported 24 MB limit.",
          );
        const result = deserializeTemplatePack(await file.text());
        if (!result.ok || !result.pack)
          throw new Error(
            result.error ?? "This template or pack could not be imported.",
          );
        await verifyEmbeddedAssetImages(
          result.pack.templates.flatMap((template) => template.assets),
          controller.signal,
        );
        const importResult = await saveTemplates(result.pack.templates);
        setSavedTemplates((current) =>
          importResult.committedTemplates.reduce(upsertSavedTemplate, current),
        );
        try {
          await refreshStoredTemplates();
        } catch {
          notify(
            "Template import completed and its changes are saved. The template list could not be refreshed yet; no retry is needed.",
            "warning",
          );
        }
        return importResult;
      } finally {
        if (projectImageValidation.current === controller)
          projectImageValidation.current = null;
      }
    },
    [notify, refreshStoredTemplates],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (editorModalOpen) return;
      if (!shouldHandleEditorShortcut(event)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key.toLowerCase() === "r" && !modifier) {
        restartPreview();
      } else if (event.key === "Delete" && effectiveSelectedGroupId)
        deleteGroupById(effectiveSelectedGroupId);
      else if (event.key === "Delete" && effectiveSelectedId)
        deleteLayerById(effectiveSelectedId);
      else if (
        modifier &&
        event.key.toLowerCase() === "d" &&
        effectiveSelectedId
      ) {
        event.preventDefault();
        duplicateLayer(effectiveSelectedId);
      } else if (
        ((modifier && !event.shiftKey) ||
          (event.altKey && !event.ctrlKey && !event.metaKey)) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        history.undo();
      } else if (
        (modifier && event.key.toLowerCase() === "y") ||
        (modifier && event.shiftKey && event.key.toLowerCase() === "z")
      ) {
        event.preventDefault();
        history.redo();
      } else if (
        modifier &&
        event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        setSaveAsOpen(true);
      } else if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    deleteGroupById,
    deleteLayerById,
    duplicateLayer,
    editorModalOpen,
    effectiveSelectedId,
    effectiveSelectedGroupId,
    history,
    restartPreview,
    save,
  ]);

  const performanceWarning = project.layers.some(
    (layer) =>
      (layer.type === "burst" && layer.spawn.count >= 200) ||
      (layer.type === "emitter" && layer.spawn.maxAlive >= 400),
  );

  const guideFocuses: TourFocus[] = [
    "projects",
    "assets",
    "layers",
    "inspector",
    "preview",
    "projects",
  ];
  const activeFocus =
    onboardingStep !== null
      ? TOUR_STEPS[onboardingStep].focus
      : guideStep !== null
        ? guideFocuses[guideStep]
        : null;
  const learningClass =
    onboardingStep !== null
      ? `has-tour tour-focus-${activeFocus}`
      : guideStep !== null
        ? `guide-active guide-focus-${activeFocus}`
        : "";

  const runGuideAction = (step: number) => {
    if (step === 0) {
      requestNewProject("guide");
      return;
    }
    if (step === 1) setSelectedAssetId("builtin-ring");
    if (step === 2) addLayer("animated", "builtin-ring", "asset");
    if (step === 3 && selectedLayer) {
      const preset = LAYER_PRESETS.find(
        (candidate) => candidate.id === "shockwave",
      );
      const shockwave = preset?.create(selectedLayer.assetId);
      if (!shockwave) return;
      updateLayer({
        ...shockwave,
        id: selectedLayer.id,
        name: "My first shockwave",
        assetId: selectedLayer.assetId,
        groupId: selectedLayer.groupId,
        parentId: selectedLayer.parentId,
      });
    }
    if (step === 4) {
      setTime(0);
      setPlaying(true);
    }
    if (step === 5) void save();
    setGuideActionStep(step);
  };

  return (
    <div
      className={`vvfx-app ${learningClass}`}
      style={
        {
          "--vvfx-left-width": `${workspace.leftWidth}px`,
          "--vvfx-inspector-width": `${workspace.inspectorWidth}px`,
          "--vvfx-timeline-height": `${workspace.timelineHeight}px`,
          "--vvfx-asset-split": `${workspace.assetSplit}%`,
        } as CSSProperties
      }
      onFocusCapture={(event) => {
        if (isCoalescedHistoryInput(event.target)) history.beginInteraction();
        else history.endInteraction();
      }}
      onBlurCapture={(event) => {
        if (isCoalescedHistoryInput(event.target)) history.endInteraction();
      }}
    >
      <TopBar
        projectName={project.metadata.name}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        saveStatus={saveStatus}
        onNameChange={(name) =>
          history.setCoalesced({
            ...project,
            metadata: { ...project.metadata, name },
          })
        }
        onUndo={history.undo}
        onRedo={history.redo}
        onSave={() => {
          void save();
        }}
        onSaveAs={() => setSaveAsOpen(true)}
        onOpenProjects={() => {
          void openProjects();
        }}
        onOpenTemplates={() => {
          void openTemplateLibrary();
        }}
        onNewProject={() => {
          requestNewProject("toolbar");
        }}
        onLearn={() => setLearningOpen(true)}
        onImport={(file) => {
          const request = ++projectImportRequest.current;
          const sourceProjectGeneration = projectGeneration.current;
          projectImageValidation.current?.abort();
          projectImageValidation.current = null;
          if (file.size > MAX_PROJECT_FILE_BYTES) {
            notify(
              `This project file is larger than the supported ${Math.floor(MAX_PROJECT_FILE_BYTES / 1024 / 1024)} MB limit.`,
              "error",
            );
            return;
          }
          void (async () => {
            let text: string;
            try {
              text = await file.text();
            } catch {
              if (
                request === projectImportRequest.current &&
                sourceProjectGeneration === projectGeneration.current
              )
                notify("This file could not be read.", "error");
              return;
            }
            if (
              request !== projectImportRequest.current ||
              sourceProjectGeneration !== projectGeneration.current
            )
              return;
            const result = deserializeProject(text);
            if (!result.ok || !result.project) {
              notify(
                result.error ?? "This project could not be opened.",
                "error",
              );
              return;
            }
            const controller = new AbortController();
            projectImageValidation.current = controller;
            try {
              await verifyEmbeddedAssetImages(
                result.project.assets,
                controller.signal,
              );
            } catch (error) {
              if (
                request === projectImportRequest.current &&
                sourceProjectGeneration === projectGeneration.current &&
                !isAbortError(error)
              )
                notify(
                  error instanceof Error
                    ? error.message
                    : "This project's images could not be checked.",
                  "error",
                );
              return;
            } finally {
              if (projectImageValidation.current === controller)
                projectImageValidation.current = null;
            }
            if (
              request !== projectImportRequest.current ||
              sourceProjectGeneration !== projectGeneration.current
            )
              return;
            const currentProject = latestProjectRef.current;
            const currentFingerprint = projectFingerprint(currentProject);
            const currentHasUnsavedChanges =
              hasMeaningfulProjectWork(currentProject) &&
              (savedFingerprintRef.current === null ||
                currentFingerprint !== savedFingerprintRef.current);
            if (
              currentHasUnsavedChanges &&
              !window.confirm(
                "You have unsaved changes. Importing this project will replace them in the editor. Continue?",
              )
            )
              return;
            activateProject(result.project, false);
            notify("Project imported successfully.", "success");
          })();
        }}
        onExport={() => setExportOpen(true)}
      />

      <div className="editor-workspace">
        <div className="left-rail">
          <AssetPanel
            assets={project.assets}
            projectGeneration={renderedProjectGeneration}
            selectedId={effectiveSelectedAssetId}
            onSelect={setSelectedAssetId}
            onUpload={uploadAssets}
            onRename={(id, name) =>
              history.setCoalesced((current) => ({
                ...current,
                assets: current.assets.map((asset) =>
                  asset.id === id ? { ...asset, name } : asset,
                ),
                metadata: {
                  ...current.metadata,
                  updatedAt: new Date().toISOString(),
                },
              }))
            }
            onChangeAsset={updateAsset}
            onPrepareAsset={prepareAsset}
            onRemove={(id) => {
              const currentAsset = latestProjectRef.current.assets.find(
                (asset) => asset.id === id,
              );
              if (!currentAsset || currentAsset.builtIn) {
                notify("That image is no longer available to remove.", "error");
                return;
              }
              setAssetRemovalId(id);
            }}
            onCreateLayer={(assetId) => addLayer("animated", assetId, "asset")}
            usageCounts={assetUsageCounts}
            onRelink={(sourceAssetId, targetAssetId) => {
              try {
                const result = projectAfterAssetRelinked(
                  project,
                  sourceAssetId,
                  targetAssetId,
                );
                history.set({
                  ...result.project,
                  metadata: {
                    ...result.project.metadata,
                    updatedAt: new Date().toISOString(),
                  },
                });
                notify(
                  result.repairs.length === 0
                    ? `Relinked ${result.affectedLayers} affected layer${result.affectedLayers === 1 ? "" : "s"}.`
                    : `Relinked ${result.affectedLayers} affected layer${result.affectedLayers === 1 ? "" : "s"}; repaired ${result.repairs.join(", ")}.`,
                  result.repairs.length === 0 ? "success" : "warning",
                );
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "Those image references could not be relinked.",
                  "error",
                );
              }
            }}
            onError={() => {
              // AssetPanel already exposes its local failure as the single
              // assertive live alert, avoiding duplicate screen-reader output.
            }}
          />
          <PanelResizeHandle
            className="asset-split-resizer"
            orientation="horizontal"
            label="Resize image library and layer list"
            value={workspace.assetSplit}
            valueText={`${Math.round(workspace.assetSplit)} percent for the image library`}
            minimum={25}
            maximum={70}
            onChange={(assetSplit) =>
              setWorkspace((current) => ({ ...current, assetSplit }))
            }
            onPointerStart={(event) =>
              beginResize(event, (_clientX, clientY) => {
                const rect = document
                  .querySelector(".left-rail")
                  ?.getBoundingClientRect();
                if (!rect || rect.height <= 0) return;
                const assetSplit = Math.max(
                  25,
                  Math.min(70, ((clientY - rect.top) / rect.height) * 100),
                );
                setWorkspace((current) => ({ ...current, assetSplit }));
              })
            }
          />
          <LayerPanel
            layers={project.layers}
            groups={project.groups}
            selectedId={effectiveSelectedId}
            selectedGroupId={effectiveSelectedGroupId}
            onSelect={(id) => {
              setSelectedId(id);
              setSelectedGroupId(null);
            }}
            onSelectGroup={(id) => setSelectedGroupId(id)}
            onCreateGroup={addGroup}
            onAdd={(type) => addLayer(type, effectiveSelectedAssetId, "manual")}
            onAddPreset={addPreset}
            onUpdate={patchLayer}
            onDuplicate={duplicateLayer}
            onDelete={deleteLayerById}
            onReorder={(from, to) => {
              const layers = [...project.layers];
              const [moved] = layers.splice(from, 1);
              layers.splice(to, 0, moved);
              history.set({ ...project, layers });
            }}
            search={projectWorkspace.layerSearch}
            onSearchChange={(layerSearch) =>
              updateProjectWorkspace({ layerSearch })
            }
            lockedLayerIds={projectWorkspace.lockedLayerIds}
            folders={projectWorkspace.folders}
            onCreateFolder={() =>
              updateProjectWorkspace((current) => ({
                ...current,
                folders: [
                  ...current.folders,
                  {
                    id: makeId("folder"),
                    name: `Folder ${current.folders.length + 1}`,
                    layerIds: effectiveSelectedId ? [effectiveSelectedId] : [],
                    collapsed: false,
                  },
                ].map((folder, index, folders) =>
                  index === folders.length - 1
                    ? folder
                    : {
                        ...folder,
                        layerIds: folder.layerIds.filter(
                          (id) => id !== effectiveSelectedId,
                        ),
                      },
                ),
              }))
            }
            onUpdateFolder={(id, patch) =>
              updateProjectWorkspace((current) => ({
                ...current,
                folders: current.folders.map((folder) =>
                  folder.id === id ? { ...folder, ...patch } : folder,
                ),
              }))
            }
            onDeleteFolder={(id) =>
              updateProjectWorkspace((current) => ({
                ...current,
                folders: current.folders.filter((folder) => folder.id !== id),
              }))
            }
            onMoveToFolder={(layerId, folderId) =>
              updateProjectWorkspace((current) => ({
                ...current,
                folders: current.folders.map((folder) => ({
                  ...folder,
                  layerIds: [
                    ...folder.layerIds.filter((id) => id !== layerId),
                    ...(folder.id === folderId ? [layerId] : []),
                  ],
                })),
              }))
            }
            onToggleLock={(layerId) =>
              updateProjectWorkspace((current) => ({
                ...current,
                lockedLayerIds: current.lockedLayerIds.includes(layerId)
                  ? current.lockedLayerIds.filter((id) => id !== layerId)
                  : [...current.lockedLayerIds, layerId],
              }))
            }
          />
        </div>

        <PreviewPanel
          key={project.metadata.id}
          project={project}
          time={time}
          playing={playing}
          speed={speed}
          loopEnd={activePlaybackEnd}
          selectedId={effectiveSelectedId}
          captureMode={exportingPreview}
          onCanvasReady={handlePreviewCanvasReady}
          onProjectChange={updateProject}
          onViewChange={(patch) =>
            history.setTransient((current) => ({
              ...current,
              preview: { ...current.preview, ...patch },
            }))
          }
          onMoveLayer={(layerId, x, y) => {
            setSelectedId(layerId);
            setSelectedGroupId(null);
            const layer = project.layers.find(
              (candidate) => candidate.id === layerId,
            );
            if (!layer) return;
            const nextX = Math.round(x);
            const nextY = Math.round(y);
            if (nextX === layer.transform.x && nextY === layer.transform.y)
              return;
            updateLayer({
              ...layer,
              transform: {
                ...layer.transform,
                x: nextX,
                y: nextY,
              },
            });
          }}
          onMovePathPoint={(layerId, target, x, y) => {
            setSelectedId(layerId);
            setSelectedGroupId(null);
            const layer = project.layers.find(
              (candidate) => candidate.id === layerId,
            );
            if (!layer) return;
            const nextX = Math.round(x);
            const nextY = Math.round(y);
            if (target === "beam-end") {
              if (
                layer.type !== "beam" ||
                (nextX === layer.beam.endX && nextY === layer.beam.endY)
              )
                return;
              updateLayer({
                ...layer,
                beam: { ...layer.beam, endX: nextX, endY: nextY },
              });
              return;
            }
            if (target === "end") {
              if (
                nextX === layer.transform.movementX &&
                nextY === layer.transform.movementY
              )
                return;
              updateLayer({
                ...layer,
                transform: {
                  ...layer.transform,
                  movementX: nextX,
                  movementY: nextY,
                },
              });
              return;
            }
            if (target === "control") {
              if (
                nextX === layer.motionPath.controlX &&
                nextY === layer.motionPath.controlY
              )
                return;
              updateLayer({
                ...layer,
                motionPath: {
                  ...layer.motionPath,
                  controlX: nextX,
                  controlY: nextY,
                },
              });
              return;
            }
            const point = layer.motionPath.points[target];
            if (!point || (nextX === point.x && nextY === point.y)) return;
            updateLayer({
              ...layer,
              motionPath: {
                ...layer.motionPath,
                points: layer.motionPath.points.map((candidate, index) =>
                  index === target ? { x: nextX, y: nextY } : candidate,
                ),
              },
            });
          }}
          onPlayToggle={() =>
            setPlaying((value) => {
              if (!value && (time < playbackStart || time >= playbackEnd))
                setTime(playbackStart);
              return !value;
            })
          }
          onRestart={restartPreview}
          restartRevision={previewRestartRevision}
          onSpeedChange={setSpeed}
          lockedLayerIds={projectWorkspace.lockedLayerIds}
        />

        {selectedGroup ? (
          <GroupInspector
            group={selectedGroup}
            layers={project.layers}
            onChange={updateGroup}
            onLayerGroupChange={assignLayerToGroup}
            onDelete={() => deleteGroupById(selectedGroup.id)}
          />
        ) : (
          <Inspector
            layer={selectedLayer}
            assets={project.assets}
            groups={project.groups}
            layers={project.layers}
            onChange={updateLayer}
            onAssetChange={updateAsset}
            onCopy={() => {
              if (!selectedLayer) return;
              setSettingsClipboard(
                clone({
                  assetId: selectedLayer.assetId,
                  transform: selectedLayer.transform,
                  timing: selectedLayer.timing,
                  appearance: selectedLayer.appearance,
                  behavior: selectedLayer.behavior,
                  random: selectedLayer.random,
                  frameAnimation: selectedLayer.frameAnimation,
                  trail: selectedLayer.trail,
                  motionPath: selectedLayer.motionPath,
                  keyframes: selectedLayer.keyframes,
                  beam: selectedLayer.beam,
                  spawn: selectedLayer.spawn,
                  parentId: selectedLayer.parentId,
                }),
              );
              notify("Layer settings copied.", "success");
            }}
            onPaste={() => {
              if (!selectedLayer || !settingsClipboard) return;
              const copied = clone(settingsClipboard);
              const parentId = canAttachLayer(
                project.layers,
                selectedLayer.id,
                copied.parentId,
              )
                ? copied.parentId
                : selectedLayer.parentId;
              const sanitized = sanitizeLayerAssetReferencesWithReport(
                mergeCompatibleLayerSettings(selectedLayer, {
                  ...copied,
                  parentId,
                }),
                project.assets,
              );
              updateLayer(sanitized.layer);
              const repairs = [
                ...(parentId === copied.parentId ? [] : ["unsafe attachment"]),
                ...sanitized.repairs,
              ];
              notify(
                repairs.length === 0
                  ? "Settings pasted."
                  : `Settings pasted; repaired ${repairs.join(", ")}.`,
                repairs.length === 0 ? "success" : "warning",
              );
            }}
            canPaste={settingsClipboard !== null}
            locked={
              selectedLayer
                ? projectWorkspace.lockedLayerIds.includes(selectedLayer.id)
                : false
            }
          />
        )}
        <PanelResizeHandle
          className="workspace-left-resizer"
          orientation="vertical"
          label="Resize left workspace rail"
          value={workspace.leftWidth}
          minimum={210}
          maximum={420}
          onChange={(leftWidth) =>
            setWorkspace((current) => ({ ...current, leftWidth }))
          }
          onPointerStart={(event) =>
            beginResize(event, (clientX) =>
              setWorkspace((current) => ({
                ...current,
                leftWidth: Math.max(210, Math.min(420, clientX)),
              })),
            )
          }
        />
        <PanelResizeHandle
          className="workspace-right-resizer"
          orientation="vertical"
          label="Resize inspector"
          value={workspace.inspectorWidth}
          minimum={300}
          maximum={540}
          onChange={(inspectorWidth) =>
            setWorkspace((current) => ({ ...current, inspectorWidth }))
          }
          onPointerStart={(event) =>
            beginResize(event, (clientX) =>
              setWorkspace((current) => ({
                ...current,
                inspectorWidth: Math.max(
                  300,
                  Math.min(540, window.innerWidth - clientX),
                ),
              })),
            )
          }
        />
      </div>

      <PanelResizeHandle
        className="timeline-resizer"
        orientation="horizontal"
        label="Resize timeline"
        value={workspace.timelineHeight}
        minimum={180}
        maximum={480}
        onChange={(timelineHeight) =>
          setWorkspace((current) => ({ ...current, timelineHeight }))
        }
        onPointerStart={(event) =>
          beginResize(event, (_clientX, clientY) =>
            setWorkspace((current) => ({
              ...current,
              timelineHeight: Math.max(
                180,
                Math.min(480, window.innerHeight - 29 - clientY),
              ),
            })),
          )
        }
      />
      <Timeline
        layers={project.layers}
        groups={project.groups}
        duration={project.preview.duration}
        time={time}
        selectedId={effectiveSelectedId}
        selectedGroupId={effectiveSelectedGroupId}
        onSelect={(id) => {
          setSelectedId(id);
          setSelectedGroupId(null);
        }}
        onSelectGroup={(id) => setSelectedGroupId(id)}
        onSeek={(nextTime) => {
          setTime(nextTime);
          setPlaying(false);
        }}
        onLayerChange={updateLayer}
        onLayersChange={updateLayers}
        onGroupChange={updateGroup}
        timeline={project.timeline}
        onTimelineChange={updateTimeline}
        zoom={projectWorkspace.timelineZoom}
        workStart={projectWorkspace.workStart}
        workEnd={projectWorkspace.workEnd}
        onViewChange={(patch) =>
          updateProjectWorkspace((current) => ({
            ...current,
            ...(patch.zoom === undefined ? {} : { timelineZoom: patch.zoom }),
            ...(patch.workStart === undefined
              ? {}
              : { workStart: patch.workStart }),
            ...(patch.workEnd === undefined ? {} : { workEnd: patch.workEnd }),
          }))
        }
        lockedLayerIds={projectWorkspace.lockedLayerIds}
        onDurationChange={(duration) =>
          updateProject({
            ...project,
            preview: { ...project.preview, duration },
          })
        }
      />

      <footer className="statusbar">
        <span>
          <CheckCircle2 size={13} /> Ready · {project.layers.length} layers ·
          {project.groups.length} groups · seed {project.preview.randomSeed}
        </span>
        {performanceWarning && (
          <span className="performance-note">
            <Info size={13} /> Preview is safely limited to 500 sprites at once.
          </span>
        )}
        <span className="shortcut-hints">
          <kbd>Space</kbd> play <kbd>R</kbd> restart <kbd>Ctrl D</kbd> duplicate{" "}
          <kbd>Del</kbd> delete
        </span>
        <button
          type="button"
          className={jsonOpen ? "is-active" : ""}
          onClick={() => setJsonOpen((open) => !open)}
          aria-controls={DEFINITION_DRAWER_ID}
          aria-expanded={jsonOpen}
          aria-haspopup="dialog"
        >
          <Braces size={13} /> Definition
        </button>
      </footer>

      {jsonOpen && (
        <DefinitionDrawer
          project={project}
          onClose={() => setJsonOpen(false)}
        />
      )}
      {newProjectRequest !== null && (
        <NewProjectDialog
          projectName={project.metadata.name}
          onClose={() => setNewProjectRequest(null)}
          onConfirm={() => {
            const source = newProjectRequest;
            setNewProjectRequest(null);
            completeNewProject(source);
          }}
        />
      )}
      {pendingRemovalAsset !== null && pendingRemovalUsage !== null && (
        <AssetRemovalDialog
          assetName={pendingRemovalAsset.name}
          usage={pendingRemovalUsage}
          onClose={() => setAssetRemovalId(null)}
          onConfirm={() => {
            const assetId = pendingRemovalAsset.id;
            const current = latestProjectRef.current;
            const targetIndex = current.assets.findIndex(
              (asset) => asset.id === assetId && !asset.builtIn,
            );
            if (targetIndex < 0) {
              setAssetRemovalId(null);
              notify("That image is no longer available to remove.", "error");
              return;
            }
            const usage = analyzeAssetUsage(current, assetId);
            const remainingAssets = current.assets.filter(
              (asset) => asset.id !== assetId,
            );
            const fallbackAssetId =
              remainingAssets[Math.min(targetIndex, remainingAssets.length - 1)]
                ?.id ?? null;
            try {
              const next = projectAfterAssetRemoved(current, assetId);
              history.set({
                ...next,
                metadata: {
                  ...next.metadata,
                  updatedAt: new Date().toISOString(),
                },
              });
            } catch (error) {
              setAssetRemovalId(null);
              notify(
                error instanceof Error
                  ? error.message
                  : "That image could not be removed.",
                "error",
              );
              return;
            }
            setAssetRemovalId(null);
            setSelectedAssetId((selected) =>
              selected === assetId ? fallbackAssetId : selected,
            );
            window.requestAnimationFrame(() => {
              const nextAsset = Array.from(
                document.querySelectorAll<HTMLButtonElement>(
                  "[data-asset-select]",
                ),
              ).find(
                (button) => button.dataset.assetSelect === fallbackAssetId,
              );
              const upload = document.querySelector<HTMLButtonElement>(
                "[data-asset-dropzone]",
              );
              (nextAsset ?? upload)?.focus({ preventScroll: true });
            });
            const affected = usage.counts.affectedLayers;
            notify(
              affected > 0
                ? `Removed “${pendingRemovalAsset.name}” and updated ${affected} dependent layer${affected === 1 ? "" : "s"}. Undo restores both.`
                : `Removed “${pendingRemovalAsset.name}”. Undo restores it.`,
              affected > 0 ? "warning" : "success",
            );
          }}
        />
      )}
      {exportOpen && (
        <ExportDialog
          project={project}
          activeDuration={playbackEnd - playbackStart}
          onRecordPreview={recordPreview}
          onClose={() => setExportOpen(false)}
        />
      )}
      {projectsOpen && (
        <ProjectsDialog
          projects={savedProjects}
          invalidSavedCount={
            invalidStoredProjects.length + (recoveryStorageBlocked ? 1 : 0)
          }
          excessSavedCount={excessStoredProjects}
          onClose={() => {
            projectImportRequest.current += 1;
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            setProjectsOpen(false);
          }}
          onLoad={(next) => {
            if (!confirmProjectReplacement("Loading another project")) return;
            const request = ++projectImportRequest.current;
            const sourceProjectGeneration = projectGeneration.current;
            projectImageValidation.current?.abort();
            const controller = new AbortController();
            projectImageValidation.current = controller;
            void verifyEmbeddedAssetImages(next.assets, controller.signal)
              .then(() => {
                if (
                  request !== projectImportRequest.current ||
                  sourceProjectGeneration !== projectGeneration.current
                )
                  return;
                activateProject(next, true);
                setProjectsOpen(false);
                notify("Saved project loaded.", "success");
              })
              .catch((error: unknown) => {
                if (
                  request === projectImportRequest.current &&
                  sourceProjectGeneration === projectGeneration.current &&
                  !isAbortError(error)
                )
                  notify(
                    error instanceof Error
                      ? error.message
                      : "This project's images could not be checked.",
                    "error",
                  );
              })
              .finally(() => {
                if (projectImageValidation.current === controller)
                  projectImageValidation.current = null;
              });
          }}
          onDuplicate={async (source) => {
            projectImportRequest.current += 1;
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            const copy = copyProject(source);
            let storedCopy: VfxProject;
            try {
              storedCopy = await saveProject(copy);
            } catch {
              throw new Error("The project could not be duplicated.");
            }
            setSavedProjects((current) =>
              upsertSavedProject(current, storedCopy),
            );
            try {
              await refreshStoredProjects();
              notify(`Duplicated “${source.metadata.name}”.`, "success");
            } catch {
              notify(
                `Duplicated “${source.metadata.name}”, but the saved-project list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
          onDelete={async (id) => {
            projectImportRequest.current += 1;
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            const target = savedProjects.find(
              (candidate) => candidate.metadata.id === id,
            );
            if (
              !target ||
              !window.confirm(
                `Delete “${target.metadata.name}” from this browser? This cannot be undone.`,
              )
            )
              return;
            try {
              await deleteProject(id);
            } catch {
              throw new Error("The saved project could not be removed.");
            }
            setSavedProjects((current) =>
              current.filter((candidate) => candidate.metadata.id !== id),
            );
            setExcessStoredProjects((current) => Math.max(0, current - 1));
            if (id === project.metadata.id) setSavedFingerprint(null);
            try {
              await refreshStoredProjects();
              notify(`Deleted “${target.metadata.name}”.`, "success");
            } catch {
              notify(
                `Deleted “${target.metadata.name}”, but the saved-project list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
          onRemoveInvalidSaved={async () => {
            projectImportRequest.current += 1;
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            const invalidRecords = invalidStoredProjects;
            const removeRecoveryDraft = recoveryStorageBlocked;
            const count = invalidRecords.length + (removeRecoveryDraft ? 1 : 0);
            if (
              !window.confirm(
                `Remove ${count} unreadable project ${count === 1 ? "save" : "saves"} from this browser? The stored data cannot be recovered afterward.`,
              )
            )
              return;

            for (const record of invalidRecords) {
              await deleteInvalidProjectRecord(record.key);
              setInvalidStoredProjects((current) =>
                current.filter((candidate) => candidate.key !== record.key),
              );
              setExcessStoredProjects((current) => Math.max(0, current - 1));
            }
            if (removeRecoveryDraft) {
              await deleteInvalidRecoveryDraft();
              recoveryStorageCheckedRef.current = true;
              recoveryStorageBlockedRef.current = false;
              setRecoveryStorageBlocked(false);
              setRecoveryStatus("idle");
            }
            try {
              await refreshStoredProjects();
              notify(
                `Removed ${count} unreadable project ${count === 1 ? "save" : "saves"}.`,
                "success",
              );
            } catch {
              notify(
                `Removed ${count} unreadable project ${count === 1 ? "save" : "saves"}, but the saved-project list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
        />
      )}
      {templatesOpen && (
        <TemplateLibraryDialog
          projectName={project.metadata.name}
          selectedLayerName={selectedLayer?.name}
          selectedGroupName={
            selectedGroup &&
            project.layers.some((layer) => layer.groupId === selectedGroup.id)
              ? selectedGroup.name
              : undefined
          }
          canSaveCurrent={project.layers.length > 0}
          templates={savedTemplates}
          invalidSavedCount={invalidStoredTemplates.length}
          excessSavedCount={excessStoredTemplates}
          saveSummaries={templateSaveSummaries}
          onSaveCurrent={saveCurrentTemplate}
          onInsert={insertSavedTemplate}
          onInsertBuiltIn={(presetId) => {
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            addPreset(presetId);
            setTemplatesOpen(false);
          }}
          onRename={async (template, name) => {
            const storedTemplate = await saveTemplate({
              ...template,
              name,
              updatedAt: new Date().toISOString(),
            });
            setSavedTemplates((current) =>
              upsertSavedTemplate(current, storedTemplate),
            );
            try {
              await refreshStoredTemplates();
              notify(`Renamed template to “${name}”.`, "success");
            } catch {
              notify(
                `Renamed template to “${name}”, but the template list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
          onDuplicate={async (template) => {
            const now = new Date().toISOString();
            const copy = await saveTemplate({
              ...clone(template),
              id: makeId("template"),
              name: `${template.name.slice(0, MAX_VFX_NAME_LENGTH - 5).trimEnd()} copy`,
              createdAt: now,
              updatedAt: now,
            });
            setSavedTemplates((current) => upsertSavedTemplate(current, copy));
            try {
              await refreshStoredTemplates();
              notify(`Duplicated “${copy.name}”.`, "success");
            } catch {
              notify(
                `Duplicated “${copy.name}”, but the template list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
          onExportOne={(template) => {
            downloadText(
              `${template.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vvfx-template"}.vvfx-template`,
              serializeTemplate(template),
              "application/json",
            );
            notify(`Exported “${template.name}”.`, "success");
          }}
          onDelete={async (template) => {
            await deleteTemplate(template.id);
            setSavedTemplates((current) =>
              current.filter((candidate) => candidate.id !== template.id),
            );
            setExcessStoredTemplates((current) => Math.max(0, current - 1));
            try {
              await refreshStoredTemplates();
              notify(`Deleted “${template.name}”.`, "success");
            } catch {
              notify(
                `Deleted “${template.name}”, but the template list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
          onRemoveInvalidSaved={async () => {
            const invalidRecords = invalidStoredTemplates;
            const count = invalidRecords.length;
            if (
              !window.confirm(
                `Remove ${count} unreadable ${count === 1 ? "template" : "templates"} from this browser? The stored data cannot be recovered afterward.`,
              )
            )
              return;
            let removed = 0;
            for (const record of invalidRecords) {
              try {
                await deleteInvalidTemplateRecord(record.key);
              } catch (error) {
                const remaining = count - removed;
                if (removed === 0)
                  throw error instanceof Error
                    ? error
                    : new Error(
                        "The unreadable templates could not be removed.",
                      );
                throw new Error(
                  `Removed ${removed} unreadable ${removed === 1 ? "template" : "templates"} before cleanup stopped. ${remaining} ${remaining === 1 ? "template remains" : "templates remain"} unreadable. ${
                    error instanceof Error
                      ? error.message
                      : "The remaining stored data could not be removed."
                  }`,
                );
              }
              removed += 1;
              setInvalidStoredTemplates((current) =>
                current.filter((candidate) => candidate !== record),
              );
              setExcessStoredTemplates((current) => Math.max(0, current - 1));
            }
            try {
              await refreshStoredTemplates();
              notify(
                `Removed ${count} unreadable ${count === 1 ? "template" : "templates"}.`,
                "success",
              );
            } catch {
              notify(
                `Removed ${count} unreadable ${count === 1 ? "template" : "templates"}, but the template list could not be refreshed yet.`,
                "warning",
              );
            }
          }}
          onImport={importTemplateFile}
          onExport={() => {
            downloadText(
              "vvfx-effect-templates.vvfx-templates",
              serializeTemplatePack(savedTemplates),
              "application/json",
            );
            notify(
              `Exported ${savedTemplates.length} template${savedTemplates.length === 1 ? "" : "s"}.`,
              "success",
            );
          }}
          onClose={() => {
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            setTemplatesOpen(false);
          }}
        />
      )}
      {saveAsOpen && (
        <SaveAsDialog
          suggestedName={`${project.metadata.name} copy`}
          onClose={() => setSaveAsOpen(false)}
          onSave={saveAs}
        />
      )}
      {recoveryDraft && (
        <RecoveryDialog
          draft={recoveryDraft}
          onRestore={() => {
            const request = ++projectImportRequest.current;
            const sourceProjectGeneration = projectGeneration.current;
            projectImageValidation.current?.abort();
            const controller = new AbortController();
            projectImageValidation.current = controller;
            void verifyEmbeddedAssetImages(
              recoveryDraft.project.assets,
              controller.signal,
            )
              .then(() => {
                if (
                  request !== projectImportRequest.current ||
                  sourceProjectGeneration !== projectGeneration.current
                )
                  return;
                activateProject(recoveryDraft.project, false, true);
                setRecoveryStatus("protected");
                notify("Unsaved session restored.", "success");
              })
              .catch((error: unknown) => {
                if (
                  request === projectImportRequest.current &&
                  sourceProjectGeneration === projectGeneration.current &&
                  !isAbortError(error)
                )
                  notify(
                    error instanceof Error
                      ? error.message
                      : "The recovery images could not be checked.",
                    "error",
                  );
              })
              .finally(() => {
                if (projectImageValidation.current === controller)
                  projectImageValidation.current = null;
              });
          }}
          onDiscard={() => {
            recoveryGeneration.current += 1;
            projectImportRequest.current += 1;
            projectImageValidation.current?.abort();
            projectImageValidation.current = null;
            setRecoveryDraft(null);
            setRecoveryStatus("idle");
            void clearRecoveryDraft().catch(() =>
              notify("Recovery data could not be cleared.", "error"),
            );
          }}
        />
      )}
      {learningOpen && (
        <TutorialCenter
          onClose={() => setLearningOpen(false)}
          onStartTour={() => {
            setLearningOpen(false);
            setGuideStep(null);
            setOnboardingStep(0);
          }}
          onStartFirstEffect={() => {
            setLearningOpen(false);
            setOnboardingStep(null);
            setGuideActionStep(null);
            setGuideStep(0);
          }}
          onBuildRecipe={(recipeId) => {
            addPreset(recipeId);
            setLearningOpen(false);
          }}
        />
      )}
      {onboardingStep !== null && (
        <OnboardingOverlay
          step={onboardingStep}
          onBack={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}
          onNext={() => {
            if (onboardingStep === TOUR_STEPS.length - 1) finishOnboarding();
            else setOnboardingStep(onboardingStep + 1);
          }}
          onSkip={finishOnboarding}
        />
      )}
      {guideStep !== null && (
        <FirstEffectGuide
          step={guideStep}
          actionComplete={guideActionStep === guideStep}
          continueRef={guideContinueRef}
          onStepChange={setGuideStep}
          onAction={runGuideAction}
          onClose={() => {
            setGuideStep(null);
            setGuideActionStep(null);
          }}
        />
      )}
      {toast && (
        <div
          className={`toast toast--${toast.tone}`}
          data-modal-live-region
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 size={16} />
          ) : toast.tone === "warning" ? (
            <TriangleAlert size={16} />
          ) : toast.tone === "error" ? (
            <CircleX size={16} />
          ) : (
            <Info size={16} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
