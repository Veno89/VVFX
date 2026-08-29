import { MAX_PROJECT_FILE_BYTES, utf8ByteLength } from "../vfx/inputLimits";
import { validateProject } from "../vfx/serialization";
import type { VfxProject } from "../vfx/types";

export const PROJECT_SUMMARY_PAGE_SIZE = 20;

export interface StoredProjectSummary {
  key: IDBValidKey;
  id: string | null;
  name: string;
  updatedAt: string;
  layerCount: number;
  uploadedAssetCount: number;
  byteLength: number;
  valid: boolean;
  reason?: string;
}

function encodedStoredBytes(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value, null, 2));
  } catch {
    // Cyclic structured clones are legal IndexedDB values but not portable
    // Vvfx projects. Account them beyond the per-project ceiling until the
    // user deletes the invalid record.
    return MAX_PROJECT_FILE_BYTES + 1;
  }
}

export function createStoredProjectSummary(
  key: IDBValidKey,
  stored: unknown,
): StoredProjectSummary {
  const byteLength = encodedStoredBytes(stored);
  const result = validateProject(stored);
  if (!result.ok || !result.project)
    return {
      key,
      id: null,
      name: "Unreadable project",
      updatedAt: "",
      layerCount: 0,
      uploadedAssetCount: 0,
      byteLength,
      valid: false,
      reason: result.error ?? "This saved project record is damaged.",
    };
  return createCurrentProjectSummary(result.project, byteLength, key);
}

export function createCurrentProjectSummary(
  project: VfxProject,
  byteLength = encodedStoredBytes(project),
  key: IDBValidKey = project.metadata.id,
): StoredProjectSummary {
  return {
    key,
    id: project.metadata.id,
    name: project.metadata.name,
    updatedAt: project.metadata.updatedAt,
    layerCount: project.layers.length,
    uploadedAssetCount: project.assets.filter((asset) => !asset.builtIn).length,
    byteLength,
    valid: true,
  };
}
