"use client";

import { Braces, CheckCircle2, Info, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearRecoveryDraft,
  deleteProject,
  listProjects,
  loadRecoveryDraft,
  saveRecoveryDraft,
  saveProject,
  type RecoveryDraft,
} from "../persistence/projects";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  saveTemplates,
} from "../persistence/templates";
import {
  createEmptyProject,
  createGroup,
  createLayer,
  makeId,
} from "../vfx/defaults";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../vfx/presets";
import {
  layersAfterAssetChanged,
  layersAfterAssetRemoved,
} from "../vfx/assetReferences";
import {
  activeTimelineEnd,
  copyProject,
  hasMeaningfulProjectWork,
  newLayerName,
  projectFingerprint,
  type LayerCreationSource,
} from "../vfx/projectState";
import { deserializeProject } from "../vfx/serialization";
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
import { AssetPanel } from "./components/AssetPanel";
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
import { PreviewPanel } from "./components/PreviewPanel";
import {
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
import {
  recordCanvasAsGif,
  recordCanvasAsWebm,
  waitForAnimationFrames,
  type PreviewRecordingRequest,
} from "./previewRecording";
import { useHistoryState } from "./useHistoryState";

type LayerSettingsClipboard = Pick<
  VfxLayer,
  | "assetId"
  | "transform"
  | "timing"
  | "appearance"
  | "behavior"
  | "random"
  | "frameAnimation"
  | "trail"
  | "motionPath"
  | "keyframes"
  | "parentId"
> & { spawn: VfxLayer["spawn"] };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingPreview, setExportingPreview] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [learningOpen, setLearningOpen] = useState(false);
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [guideActionStep, setGuideActionStep] = useState<number | null>(null);
  const [savedProjects, setSavedProjects] = useState<VfxProject[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<VfxTemplate[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(
    null,
  );
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<
    "idle" | "saving" | "protected" | "error"
  >("idle");
  const recoveryGeneration = useRef(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsClipboard, setSettingsClipboard] =
    useState<LayerSettingsClipboard | null>(null);
  const selectedGroup =
    project.groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedLayer = selectedGroup
    ? null
    : (project.layers.find((layer) => layer.id === selectedId) ??
      project.layers[0] ??
      null);
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
    learningOpen ||
    onboardingStep !== null ||
    guideStep !== null ||
    recoveryDraft !== null;
  const latestProjectRef = useRef(project);
  useEffect(() => {
    latestProjectRef.current = project;
  }, [project]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
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
        setRecoveryDraft(draft);
        setRecoveryChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRecoveryStatus("error");
        setRecoveryChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!recoveryChecked || recoveryDraft) return;
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
  }, [currentFingerprint, hasUnsavedChanges, recoveryChecked, recoveryDraft]);

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
        const next = current + delta;
        const playbackEnd = project.preview.loop
          ? activePlaybackEnd
          : project.preview.duration;
        if (next < playbackEnd) return next;
        if (project.preview.loop) return next % playbackEnd;
        window.setTimeout(() => setPlaying(false), 0);
        return playbackEnd;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    activePlaybackEnd,
    playing,
    project.preview.duration,
    project.preview.loop,
    speed,
  ]);

  const recordPreview = useCallback(
    async (
      request: PreviewRecordingRequest,
      onProgress: (progress: number) => void,
    ) => {
      const canvas = previewCanvasRef.current;
      if (!canvas)
        throw new Error(
          "The live preview is still starting. Wait a moment and try again.",
        );
      const previousTime = time;
      const wasPlaying = playing;
      setPlaying(false);
      setTime(0);
      setExportingPreview(true);
      try {
        await waitForAnimationFrames(2);
        const recordingOptions = {
          source: canvas,
          duration: activePlaybackEnd,
          size: request.size,
          renderFrame: async (frameTime: number) => {
            setTime(frameTime);
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
    [activePlaybackEnd, playing, time],
  );

  const updateProject = useCallback(
    (next: VfxProject) =>
      history.set({
        ...next,
        metadata: { ...next.metadata, updatedAt: new Date().toISOString() },
      }),
    [history],
  );
  const updateLayer = useCallback(
    (nextLayer: VfxLayer) => {
      history.set((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === nextLayer.id ? nextLayer : layer,
        ),
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
    },
    [history],
  );
  const updateLayers = useCallback(
    (nextLayers: VfxLayer[]) => {
      history.set((current) => ({
        ...current,
        layers: nextLayers,
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      }));
    },
    [history],
  );
  const updateTimeline = useCallback(
    (timeline: TimelineAuthoringSettings, duration?: number) => {
      history.set((current) => ({
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
      history.set((current) => ({
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
      notify(`Deleted “${group.name}”; its layers were kept.`);
    },
    [history, notify, project.groups],
  );
  const patchLayer = useCallback(
    (id: string, patch: Partial<VfxLayer>) => {
      history.set((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === id ? ({ ...layer, ...patch } as VfxLayer) : layer,
        ),
      }));
    },
    [history],
  );
  const addLayer = useCallback(
    (
      type: LayerType,
      assetId = selectedAssetId,
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
    [history, project.assets, selectedAssetId],
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
        setSelectedAssetId(firstLayer?.assetId ?? selectedAssetId);
        setTime(time);
        setPlaying(true);
        notify(
          `${composition.name} inserted at ${Math.round(time)} ms — ${composition.description}`,
        );
        return;
      }
      const preset = LAYER_PRESETS.find(
        (candidate) => candidate.id === presetId,
      );
      if (!preset) return;
      const layer = preset.create(selectedAssetId ?? undefined);
      history.set((current) => ({
        ...current,
        layers: [...current.layers, layer],
      }));
      setSelectedId(layer.id);
      setSelectedGroupId(null);
      setTime(0);
      setPlaying(true);
      notify(`${preset.name} added — ${preset.description}`);
    },
    [history, notify, project, selectedAssetId, time],
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
      setSelectedId(copy.id);
      setSelectedGroupId(null);
    },
    [history, project],
  );
  const deleteLayerById = useCallback(
    (id: string) => {
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
      setSelectedId(layers[Math.min(index, layers.length - 1)]?.id ?? null);
      if (removedLinks > 0)
        notify(
          `Layer deleted. Removed ${removedLinks} event link${removedLinks === 1 ? "" : "s"} that targeted it.`,
        );
    },
    [history, notify, project],
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
      history.replace(next);
      setSelectedId(next.layers[0]?.id ?? null);
      setSelectedGroupId(null);
      setSelectedAssetId(next.assets[0]?.id ?? null);
      setTime(0);
      setPlaying(false);
      setSavedFingerprint(manuallySaved ? projectFingerprint(next) : null);
      setRecoveryStatus("idle");
      setRecoveryDraft(null);
      if (!preserveRecovery)
        void clearRecoveryDraft().catch(() => setRecoveryStatus("error"));
    },
    [history],
  );

  const startEmptyProject = useCallback(
    (askBeforeClearing = true) => {
      if (askBeforeClearing && !confirmProjectReplacement("Starting over"))
        return false;
      const next = createEmptyProject();
      activateProject(next, false);
      notify("New empty project ready.");
      return true;
    },
    [activateProject, confirmProjectReplacement, notify],
  );

  const save = useCallback(async () => {
    const projectToSave = project;
    const savedVersion = projectFingerprint(projectToSave);
    try {
      await saveProject(projectToSave);
      recoveryGeneration.current += 1;
      setSavedFingerprint(savedVersion);
      if (projectFingerprint(latestProjectRef.current) === savedVersion) {
        await clearRecoveryDraft();
        setRecoveryStatus("idle");
      }
      setSavedProjects(await listProjects());
      notify("Project saved in this browser.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "This project could not be saved.",
      );
    }
  }, [notify, project]);

  const saveAs = useCallback(
    async (name: string) => {
      const copy = copyProject(project, name);
      try {
        const storedCopy = await saveProject(copy);
        activateProject(storedCopy, true);
        setSavedProjects(await listProjects());
        setSaveAsOpen(false);
        notify(`Saved as “${storedCopy.metadata.name}”.`);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "This copy could not be saved.",
        );
      }
    },
    [activateProject, notify, project],
  );

  const openProjects = useCallback(async () => {
    try {
      setSavedProjects(await listProjects());
      setProjectsOpen(true);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Saved projects could not be opened.",
      );
    }
  }, [notify]);

  const openTemplateLibrary = useCallback(async () => {
    try {
      setSavedTemplates(await listTemplates());
      setTemplatesOpen(true);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "The template library could not be opened.",
      );
    }
  }, [notify]);

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
      await saveTemplate(template);
      setSavedTemplates(await listTemplates());
      notify(`Saved “${template.name}” as a reusable template.`);
    },
    [notify, project, selectedGroup, selectedLayer],
  );

  const insertSavedTemplate = useCallback(
    (template: VfxTemplate) => {
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
      setSelectedAssetId(firstLayer?.assetId ?? selectedAssetId);
      setTime(time);
      setPlaying(true);
      setTemplatesOpen(false);
      notify(
        `Inserted “${template.name}” as ${inserted.insertedLayerIds.length} new layer${inserted.insertedLayerIds.length === 1 ? "" : "s"}.`,
      );
    },
    [history, notify, project, selectedAssetId, time],
  );

  const importTemplateFile = useCallback(async (file: File) => {
    if (file.size > MAX_TEMPLATE_FILE_BYTES)
      throw new Error(
        "This template file is larger than the supported 24 MB limit.",
      );
    const result = deserializeTemplatePack(await file.text());
    if (!result.ok || !result.pack)
      throw new Error(
        result.error ?? "This template or pack could not be imported.",
      );
    const summary = await saveTemplates(result.pack.templates);
    setSavedTemplates(await listTemplates());
    return summary;
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (editorModalOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']"))
        return;
      const modifier = event.ctrlKey || event.metaKey;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key.toLowerCase() === "r" && !modifier) {
        setTime(0);
        setPlaying(true);
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
    if (step === 0 && !startEmptyProject(true)) return;
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
    <div className={`vvfx-app ${learningClass}`}>
      <TopBar
        projectName={project.metadata.name}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        saveStatus={saveStatus}
        onNameChange={(name) =>
          history.set({ ...project, metadata: { ...project.metadata, name } })
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
          startEmptyProject(true);
        }}
        onLearn={() => setLearningOpen(true)}
        onImport={(file) => {
          void file
            .text()
            .then((text) => {
              const result = deserializeProject(text);
              if (!result.ok || !result.project)
                return notify(
                  result.error ?? "This project could not be opened.",
                );
              if (!confirmProjectReplacement("Importing this project")) return;
              activateProject(result.project, false);
              notify("Project imported successfully.");
            })
            .catch(() => notify("This file could not be read."));
        }}
        onExport={() => setExportOpen(true)}
      />

      <div className="editor-workspace">
        <div className="left-rail">
          <AssetPanel
            assets={project.assets}
            selectedId={selectedAssetId}
            onSelect={setSelectedAssetId}
            onUpload={(assets: VfxAsset[]) => {
              history.set({
                ...project,
                assets: [...project.assets, ...assets],
              });
              setSelectedAssetId(assets[0]?.id ?? null);
              notify(
                `${assets.length} image${assets.length === 1 ? "" : "s"} added.`,
              );
            }}
            onRename={(id, name) =>
              history.set({
                ...project,
                assets: project.assets.map((asset) =>
                  asset.id === id ? { ...asset, name } : asset,
                ),
              })
            }
            onChangeAsset={(nextAsset) => {
              history.set({
                ...project,
                assets: project.assets.map((asset) =>
                  asset.id === nextAsset.id ? nextAsset : asset,
                ),
                layers: layersAfterAssetChanged(project.layers, nextAsset),
              });
            }}
            onRemove={(id) => {
              history.set({
                ...project,
                assets: project.assets.filter((asset) => asset.id !== id),
                layers: layersAfterAssetRemoved(project.layers, id),
              });
              if (selectedAssetId === id) setSelectedAssetId(null);
            }}
            onCreateLayer={(assetId) => addLayer("animated", assetId, "asset")}
            onError={notify}
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
            onAdd={(type) => addLayer(type, selectedAssetId, "manual")}
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
          onPlayToggle={() => setPlaying((value) => !value)}
          onRestart={() => {
            setTime(0);
            setPlaying(true);
          }}
          onSpeedChange={setSpeed}
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
            onAssetChange={(nextAsset) =>
              history.set({
                ...project,
                assets: project.assets.map((asset) =>
                  asset.id === nextAsset.id ? nextAsset : asset,
                ),
              })
            }
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
                  spawn: selectedLayer.spawn,
                  parentId: selectedLayer.parentId,
                }),
              );
              notify("Layer settings copied.");
            }}
            onPaste={() => {
              if (!selectedLayer || !settingsClipboard) return;
              const copied = clone(settingsClipboard);
              updateLayer({
                ...selectedLayer,
                ...copied,
                spawn:
                  selectedLayer.spawn && copied.spawn
                    ? copied.spawn
                    : selectedLayer.spawn,
              } as VfxLayer);
              notify("Settings pasted.");
            }}
            canPaste={settingsClipboard !== null}
          />
        )}
      </div>

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
        >
          <Braces size={13} /> Definition
        </button>
      </footer>

      {jsonOpen && (
        <aside className="json-drawer">
          <header>
            <div>
              <span className="eyebrow">Advanced view</span>
              <h2>Live VFX definition</h2>
            </div>
            <button
              type="button"
              onClick={() => setJsonOpen(false)}
              aria-label="Close JSON definition"
            >
              <X size={16} />
            </button>
          </header>
          <p>
            This is the complete editor project. It updates as you change
            settings.
          </p>
          <pre>
            <code>{JSON.stringify(project, null, 2)}</code>
          </pre>
        </aside>
      )}
      {exportOpen && (
        <ExportDialog
          project={project}
          activeDuration={activePlaybackEnd}
          onRecordPreview={recordPreview}
          onClose={() => setExportOpen(false)}
        />
      )}
      {projectsOpen && (
        <ProjectsDialog
          projects={savedProjects}
          onClose={() => setProjectsOpen(false)}
          onLoad={(next) => {
            if (!confirmProjectReplacement("Loading another project")) return;
            activateProject(next, true);
            setProjectsOpen(false);
            notify("Saved project loaded.");
          }}
          onDuplicate={(source) => {
            const copy = copyProject(source);
            void saveProject(copy)
              .then(() => listProjects())
              .then((projects) => {
                setSavedProjects(projects);
                notify(`Duplicated “${source.metadata.name}”.`);
              })
              .catch(() => notify("The project could not be duplicated."));
          }}
          onDelete={(id) => {
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
            void deleteProject(id)
              .then(() => listProjects())
              .then((projects) => {
                setSavedProjects(projects);
                if (id === project.metadata.id) setSavedFingerprint(null);
                notify(`Deleted “${target.metadata.name}”.`);
              })
              .catch(() => notify("The saved project could not be removed."));
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
          saveSummaries={templateSaveSummaries}
          onSaveCurrent={saveCurrentTemplate}
          onInsert={insertSavedTemplate}
          onInsertBuiltIn={(presetId) => {
            addPreset(presetId);
            setTemplatesOpen(false);
          }}
          onRename={async (template, name) => {
            await saveTemplate({
              ...template,
              name,
              updatedAt: new Date().toISOString(),
            });
            setSavedTemplates(await listTemplates());
            notify(`Renamed template to “${name}”.`);
          }}
          onDuplicate={async (template) => {
            const now = new Date().toISOString();
            const copy = await saveTemplate({
              ...clone(template),
              id: makeId("template"),
              name: `${template.name} copy`,
              createdAt: now,
              updatedAt: now,
            });
            setSavedTemplates(await listTemplates());
            notify(`Duplicated “${copy.name}”.`);
          }}
          onExportOne={(template) => {
            downloadText(
              `${template.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vvfx-template"}.vvfx-template`,
              serializeTemplate(template),
              "application/json",
            );
            notify(`Exported “${template.name}”.`);
          }}
          onDelete={async (template) => {
            await deleteTemplate(template.id);
            setSavedTemplates(await listTemplates());
            notify(`Deleted “${template.name}”.`);
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
            );
          }}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
      {saveAsOpen && (
        <SaveAsDialog
          suggestedName={`${project.metadata.name} copy`}
          onClose={() => setSaveAsOpen(false)}
          onSave={(name) => {
            void saveAs(name);
          }}
        />
      )}
      {recoveryDraft && (
        <RecoveryDialog
          draft={recoveryDraft}
          onRestore={() => {
            activateProject(recoveryDraft.project, false, true);
            setRecoveryStatus("protected");
            notify("Unsaved session restored.");
          }}
          onDiscard={() => {
            recoveryGeneration.current += 1;
            setRecoveryDraft(null);
            setRecoveryStatus("idle");
            void clearRecoveryDraft().catch(() =>
              notify("Recovery data could not be cleared."),
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
          onStepChange={setGuideStep}
          onAction={runGuideAction}
          onClose={() => {
            setGuideStep(null);
            setGuideActionStep(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
