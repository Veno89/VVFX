import { isSafeVfxId, MAX_VFX_NAME_LENGTH } from "../vfx/inputLimits";

export const WORKSPACE_STORAGE_KEY = "vvfx-workspace-v1";
const MAX_PROJECT_VIEWS = 50;
const MAX_FOLDERS = 50;

export interface LayerWorkspaceFolder {
  id: string;
  name: string;
  layerIds: string[];
  collapsed: boolean;
}

export interface ProjectWorkspaceView {
  timelineZoom: number;
  workStart: number;
  workEnd: number | null;
  layerSearch: string;
  lockedLayerIds: string[];
  folders: LayerWorkspaceFolder[];
}

export interface WorkspacePreferences {
  version: 1;
  leftWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  assetSplit: number;
  projectOrder: string[];
  projects: Record<string, ProjectWorkspaceView>;
}

interface WorkspaceStorageReader {
  getItem(key: string): string | null;
}

interface WorkspaceStorageWriter {
  setItem(key: string, value: string): boolean | void;
}

export const DEFAULT_PROJECT_WORKSPACE_VIEW: ProjectWorkspaceView = {
  timelineZoom: 1,
  workStart: 0,
  workEnd: null,
  layerSearch: "",
  lockedLayerIds: [],
  folders: [],
};

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  version: 1,
  leftWidth: 254,
  inspectorWidth: 368,
  timelineHeight: 250,
  assetSplit: 42,
  projectOrder: [],
  projects: Object.create(null) as Record<string, ProjectWorkspaceView>,
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;

function normalizeProjectView(
  value: unknown,
  layerIds?: ReadonlySet<string>,
  duration = 30_000,
): ProjectWorkspaceView {
  const input = record(value) ? value : {};
  const validLayerId = (candidate: unknown): candidate is string =>
    typeof candidate === "string" &&
    isSafeVfxId(candidate) &&
    (!layerIds || layerIds.has(candidate));
  const lockedLayerIds = Array.isArray(input.lockedLayerIds)
    ? [...new Set(input.lockedLayerIds.filter(validLayerId))]
    : [];
  const assigned = new Set<string>();
  const folders: LayerWorkspaceFolder[] = [];
  if (Array.isArray(input.folders))
    for (const candidate of input.folders.slice(0, MAX_FOLDERS)) {
      if (!record(candidate) || !isSafeVfxId(candidate.id)) continue;
      const name =
        typeof candidate.name === "string"
          ? candidate.name.trim().slice(0, MAX_VFX_NAME_LENGTH) ||
            "Untitled folder"
          : "Untitled folder";
      if (folders.some((folder) => folder.id === candidate.id)) continue;
      const candidateLayerIds = Array.isArray(candidate.layerIds)
        ? candidate.layerIds.filter(validLayerId)
        : [];
      const uniqueLayerIds = candidateLayerIds.filter((layerId) => {
        if (assigned.has(layerId)) return false;
        assigned.add(layerId);
        return true;
      });
      folders.push({
        id: candidate.id,
        name,
        layerIds: uniqueLayerIds,
        collapsed: candidate.collapsed === true,
      });
    }
  const workStart = bounded(input.workStart, 0, 0, duration);
  const rawWorkEnd =
    input.workEnd === null
      ? null
      : bounded(input.workEnd, duration, 0, duration);
  const workEnd =
    rawWorkEnd !== null && rawWorkEnd >= workStart + 50 ? rawWorkEnd : null;
  return {
    timelineZoom: bounded(input.timelineZoom, 1, 0.5, 4),
    workStart,
    workEnd,
    layerSearch:
      typeof input.layerSearch === "string"
        ? input.layerSearch.slice(0, MAX_VFX_NAME_LENGTH)
        : "",
    lockedLayerIds,
    folders,
  };
}

export function normalizeWorkspacePreferences(
  value: unknown,
): WorkspacePreferences {
  const input = record(value) ? value : {};
  const rawProjects = record(input.projects) ? input.projects : {};
  const rawOrder = Array.isArray(input.projectOrder)
    ? input.projectOrder.filter(isSafeVfxId)
    : [];
  const projectOrder = [
    ...new Set([...rawOrder, ...Object.keys(rawProjects).filter(isSafeVfxId)]),
  ].slice(0, MAX_PROJECT_VIEWS);
  const projects = Object.create(null) as Record<string, ProjectWorkspaceView>;
  for (const projectId of projectOrder)
    projects[projectId] = normalizeProjectView(rawProjects[projectId]);
  return {
    version: 1,
    leftWidth: bounded(input.leftWidth, 254, 210, 420),
    inspectorWidth: bounded(input.inspectorWidth, 368, 300, 540),
    timelineHeight: bounded(input.timelineHeight, 250, 180, 480),
    assetSplit: bounded(input.assetSplit, 42, 25, 70),
    projectOrder,
    projects,
  };
}

export function workspaceProjectView(
  workspace: WorkspacePreferences,
  projectId: string,
  layerIds: readonly string[],
  duration: number,
): ProjectWorkspaceView {
  return normalizeProjectView(
    workspace.projects[projectId],
    new Set(layerIds),
    duration,
  );
}

export function updateWorkspaceProjectView(
  workspace: WorkspacePreferences,
  projectId: string,
  view: ProjectWorkspaceView,
): WorkspacePreferences {
  const projectOrder = [
    projectId,
    ...workspace.projectOrder.filter((candidate) => candidate !== projectId),
  ].slice(0, MAX_PROJECT_VIEWS);
  const projects = Object.create(null) as Record<string, ProjectWorkspaceView>;
  for (const candidate of projectOrder)
    projects[candidate] =
      candidate === projectId
        ? normalizeProjectView(view)
        : (workspace.projects[candidate] ?? DEFAULT_PROJECT_WORKSPACE_VIEW);
  return { ...workspace, projectOrder, projects };
}

export function loadWorkspacePreferences(
  storage: WorkspaceStorageReader,
): WorkspacePreferences {
  try {
    const stored = storage.getItem(WORKSPACE_STORAGE_KEY);
    return stored
      ? normalizeWorkspacePreferences(JSON.parse(stored) as unknown)
      : normalizeWorkspacePreferences(DEFAULT_WORKSPACE_PREFERENCES);
  } catch {
    return normalizeWorkspacePreferences(DEFAULT_WORKSPACE_PREFERENCES);
  }
}

export function saveWorkspacePreferences(
  storage: WorkspaceStorageWriter,
  workspace: WorkspacePreferences,
): boolean {
  try {
    const stored = storage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify(normalizeWorkspacePreferences(workspace)),
    );
    return stored !== false;
  } catch {
    return false;
  }
}
