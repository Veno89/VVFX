import type { VfxProject } from "../vfx/types";
import {
  requireCurrentProject,
  serializeProject,
  validateProject,
} from "../vfx/serialization";
import {
  MAX_SAVED_PROJECT_LIBRARY_BYTES,
  MAX_SAVED_PROJECTS,
  utf8ByteLength,
} from "../vfx/inputLimits";
import {
  openDatabase,
  PROJECT_STORE,
  PROJECT_SUMMARY_STORE,
  RECOVERY_STORE,
} from "./database";
import {
  createCurrentProjectSummary,
  PROJECT_SUMMARY_PAGE_SIZE,
  type StoredProjectSummary,
} from "./projectSummaries";
const CURRENT_RECOVERY_ID = "current";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface RecoveryDraft {
  id: typeof CURRENT_RECOVERY_ID;
  project: VfxProject;
  savedAt: string;
}

export interface InvalidStoredProjectRecord {
  key: IDBValidKey;
  reason: string;
}

export interface StoredProjectInspection {
  summaries: StoredProjectSummary[];
  invalidRecords: InvalidStoredProjectRecord[];
  totalRecords: number;
  excessRecords: number;
  aggregateBytes: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalValidRecords: number;
}

interface StoredProjectSummaryRead {
  summaries: StoredProjectSummary[];
  invalidRecords: InvalidStoredProjectRecord[];
  totalRecords: number;
}

export class InvalidRecoveryDraftError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`The recovery autosave is damaged and was preserved. ${reason}`);
    this.name = "InvalidRecoveryDraftError";
    this.reason = reason;
  }
}

type StoredRecoveryDraftValidation =
  { ok: true; draft: RecoveryDraft } | { ok: false; reason: string };

function validateStoredRecoveryDraft(
  stored: unknown,
): StoredRecoveryDraftValidation {
  if (
    !isRecord(stored) ||
    stored.id !== CURRENT_RECOVERY_ID ||
    typeof stored.savedAt !== "string"
  )
    return {
      ok: false,
      reason: "Its recovery wrapper is damaged.",
    };
  const result = validateProject(stored.project);
  if (!result.ok || !result.project)
    return {
      ok: false,
      reason: result.error ?? "Its project data is invalid.",
    };
  return {
    ok: true,
    draft: {
      id: CURRENT_RECOVERY_ID,
      project: result.project,
      savedAt: stored.savedAt,
    },
  };
}

const sameKey = (left: IDBValidKey, right: IDBValidKey) => {
  try {
    return indexedDB.cmp(left, right) === 0;
  } catch {
    return false;
  }
};

const isStoredProjectSummary = (
  value: unknown,
): value is StoredProjectSummary => {
  if (!isRecord(value)) return false;
  const key = value.key as IDBValidKey;
  if (!sameKey(key, key)) return false;
  if (
    typeof value.valid !== "boolean" ||
    !Number.isSafeInteger(value.byteLength) ||
    (value.byteLength as number) < 0
  )
    return false;
  return value.valid === false
    ? true
    : typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.updatedAt === "string" &&
        Number.isSafeInteger(value.layerCount) &&
        Number.isSafeInteger(value.uploadedAssetCount);
};

async function readStoredProjectSummaries(
  db: IDBDatabase,
): Promise<StoredProjectSummaryRead> {
  return new Promise<StoredProjectSummaryRead>((resolve, reject) => {
    const transaction = db.transaction(
      [PROJECT_STORE, PROJECT_SUMMARY_STORE],
      "readonly",
    );
    const projects = transaction.objectStore(PROJECT_STORE);
    const summaries = transaction.objectStore(PROJECT_SUMMARY_STORE);
    const keysRequest = projects.getAllKeys(undefined, MAX_SAVED_PROJECTS + 1);
    const countRequest = projects.count();
    const summariesRequest = summaries.getAll(
      undefined,
      MAX_SAVED_PROJECTS + 1,
    );
    transaction.oncomplete = () => {
      const keys = keysRequest.result;
      const storedSummaries = (summariesRequest.result as unknown[]).filter(
        isStoredProjectSummary,
      );
      const matched: StoredProjectSummary[] = [];
      const invalidRecords: InvalidStoredProjectRecord[] = [];
      for (const key of keys) {
        const summary = storedSummaries.find((entry) =>
          sameKey(entry.key, key),
        );
        if (!summary)
          invalidRecords.push({
            key,
            reason:
              "This project has no trusted summary and must be removed or re-imported.",
          });
        else {
          matched.push(summary);
          if (!summary.valid)
            invalidRecords.push({
              key,
              reason: summary.reason ?? "This saved project record is damaged.",
            });
        }
      }
      resolve({
        summaries: matched,
        invalidRecords,
        totalRecords: countRequest.result,
      });
    };
    transaction.onerror = () =>
      reject(new Error("Saved projects could not be read."));
    transaction.onabort = () =>
      reject(new Error("Saved projects could not be read."));
  });
}

export async function saveProject(project: VfxProject): Promise<VfxProject> {
  const currentProject = requireCurrentProject(project, "browser-save");
  const storedProject: VfxProject = {
    ...currentProject,
    metadata: {
      ...currentProject.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
  // Apply the same encoded-size boundary used by portable project export and
  // retain its UTF-8 size in the summary index.
  const byteLength = utf8ByteLength(serializeProject(storedProject));
  const summary = createCurrentProjectSummary(storedProject, byteLength);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [PROJECT_STORE, PROJECT_SUMMARY_STORE],
        "readwrite",
      );
      const store = transaction.objectStore(PROJECT_STORE);
      const summaryStore = transaction.objectStore(PROJECT_SUMMARY_STORE);
      const countRequest = store.count();
      const summariesRequest = summaryStore.getAll(
        undefined,
        MAX_SAVED_PROJECTS + 1,
      );
      const keysRequest = store.getAllKeys(undefined, MAX_SAVED_PROJECTS + 1);
      let count: number | null = null;
      let storedSummaries: StoredProjectSummary[] | null = null;
      let storedKeys: IDBValidKey[] | null = null;
      let writeStarted = false;
      let failureMessage = "This project could not be saved in the browser.";
      const startWrite = () => {
        if (
          writeStarted ||
          count === null ||
          storedSummaries === null ||
          storedKeys === null
        )
          return;
        if (count > MAX_SAVED_PROJECTS) {
          failureMessage =
            "The saved project library exceeds its safety limit.";
          transaction.abort();
          return;
        }
        if (
          count !== storedSummaries.length ||
          storedKeys.some(
            (key) => !storedSummaries?.some((entry) => sameKey(entry.key, key)),
          ) ||
          storedSummaries.some(
            (entry) => !storedKeys?.some((key) => sameKey(entry.key, key)),
          )
        ) {
          failureMessage =
            "The saved project index is damaged. Remove unreadable records before saving.";
          transaction.abort();
          return;
        }
        const existing = storedSummaries.find((entry) =>
          sameKey(entry.key, storedProject.metadata.id),
        );
        if (existing && !existing.valid) {
          failureMessage =
            "A damaged saved record already uses this project identifier. Remove that invalid record before saving.";
          transaction.abort();
          return;
        }
        if (!existing && count >= MAX_SAVED_PROJECTS) {
          failureMessage = `The saved library can contain at most ${MAX_SAVED_PROJECTS} projects.`;
          transaction.abort();
          return;
        }
        const aggregateBytes = storedSummaries.reduce(
          (total, entry) => total + entry.byteLength,
          0,
        );
        const nextAggregateBytes =
          aggregateBytes - (existing?.byteLength ?? 0) + byteLength;
        if (nextAggregateBytes > MAX_SAVED_PROJECT_LIBRARY_BYTES) {
          failureMessage = `Saved projects can use at most ${Math.floor(MAX_SAVED_PROJECT_LIBRARY_BYTES / 1024 / 1024)} MB in this browser. Export or delete a project before saving.`;
          transaction.abort();
          return;
        }
        writeStarted = true;
        store.put(storedProject);
        summaryStore.put(summary);
      };
      countRequest.onsuccess = () => {
        count = countRequest.result;
        startWrite();
      };
      summariesRequest.onsuccess = () => {
        storedSummaries = (summariesRequest.result as unknown[]).filter(
          isStoredProjectSummary,
        );
        startWrite();
      };
      keysRequest.onsuccess = () => {
        storedKeys = keysRequest.result;
        startWrite();
      };
      countRequest.onerror = () => transaction.abort();
      summariesRequest.onerror = () => transaction.abort();
      keysRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          new Error(
            transaction.error?.name === "QuotaExceededError"
              ? "Browser storage is full. Export or delete saved projects, then try again."
              : failureMessage,
          ),
        );
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
  return storedProject;
}

export async function inspectStoredProjects(
  options: { page?: number; pageSize?: number } = {},
): Promise<StoredProjectInspection> {
  const db = await openDatabase();
  let stored: StoredProjectSummaryRead;
  try {
    stored = await readStoredProjectSummaries(db);
  } finally {
    db.close();
  }
  const validSummaries = stored.summaries
    .filter((summary) => summary.valid && summary.id !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pageSize = Math.max(
    1,
    Math.min(MAX_SAVED_PROJECTS, options.pageSize ?? PROJECT_SUMMARY_PAGE_SIZE),
  );
  const totalPages = Math.max(1, Math.ceil(validSummaries.length / pageSize));
  const page = Math.max(0, Math.min(options.page ?? 0, totalPages - 1));
  return {
    summaries: validSummaries.slice(page * pageSize, (page + 1) * pageSize),
    invalidRecords: stored.invalidRecords,
    totalRecords: stored.totalRecords,
    excessRecords: Math.max(0, stored.totalRecords - MAX_SAVED_PROJECTS),
    aggregateBytes: stored.summaries.reduce(
      (total, storedSummary) => total + storedSummary.byteLength,
      0,
    ),
    page,
    pageSize,
    totalPages,
    totalValidRecords: validSummaries.length,
  };
}

export async function listProjectSummaries(
  options: { page?: number; pageSize?: number } = {},
): Promise<StoredProjectSummary[]> {
  const inspection = await inspectStoredProjects(options);
  if (inspection.excessRecords > 0)
    throw new Error(
      `The saved project library contains ${inspection.totalRecords} records and exceeds its safety limit by ${inspection.excessRecords}. Inspect or remove records before continuing.`,
    );
  if (inspection.invalidRecords.length > 0)
    throw new Error(
      `The saved project library contains ${inspection.invalidRecords.length} invalid ${inspection.invalidRecords.length === 1 ? "record" : "records"}. Inspect or remove them before continuing.`,
    );
  return inspection.summaries;
}

export async function loadProject(id: string): Promise<VfxProject> {
  const db = await openDatabase();
  try {
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction(PROJECT_STORE, "readonly")
        .objectStore(PROJECT_STORE)
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("The saved project could not be read."));
    });
    if (stored === undefined)
      throw new Error("This saved project no longer exists.");
    const result = validateProject(stored);
    if (!result.ok || !result.project)
      throw new Error(
        `This saved project is damaged and was preserved. ${result.error ?? "Its data is invalid."}`,
      );
    return result.project;
  } finally {
    db.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [PROJECT_STORE, PROJECT_SUMMARY_STORE],
        "readwrite",
      );
      transaction.objectStore(PROJECT_STORE).delete(id);
      transaction.objectStore(PROJECT_SUMMARY_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("The saved project could not be removed."));
    });
  } finally {
    db.close();
  }
}

export async function deleteInvalidProjectRecord(
  key: IDBValidKey,
): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [PROJECT_STORE, PROJECT_SUMMARY_STORE],
        "readwrite",
      );
      const store = transaction.objectStore(PROJECT_STORE);
      const summaries = transaction.objectStore(PROJECT_SUMMARY_STORE);
      const request = summaries.get(key);
      let failureMessage = "The invalid project record could not be removed.";
      request.onsuccess = () => {
        const summary = request.result as StoredProjectSummary | undefined;
        if (summary?.valid) {
          failureMessage =
            "This saved record is now a valid project and was not removed.";
          transaction.abort();
          return;
        }
        store.delete(key);
        summaries.delete(key);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
}

export async function saveRecoveryDraft(
  project: VfxProject,
): Promise<RecoveryDraft> {
  const draft: RecoveryDraft = {
    id: CURRENT_RECOVERY_ID,
    project: requireCurrentProject(project, "recovery-save"),
    savedAt: new Date().toISOString(),
  };
  serializeProject(draft.project);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(RECOVERY_STORE, "readwrite");
      const store = transaction.objectStore(RECOVERY_STORE);
      const request = store.get(CURRENT_RECOVERY_ID);
      let failureMessage = "Recovery autosave is temporarily unavailable.";
      request.onsuccess = () => {
        if (request.result !== undefined) {
          const existing = validateStoredRecoveryDraft(request.result);
          if (!existing.ok) {
            failureMessage =
              "The existing recovery autosave is damaged and was preserved. Clear it explicitly before creating another recovery draft.";
            transaction.abort();
            return;
          }
        }
        store.put(draft);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
  return draft;
}

export async function loadRecoveryDraft(): Promise<RecoveryDraft | null> {
  const db = await openDatabase();
  try {
    return await new Promise<RecoveryDraft | null>((resolve, reject) => {
      const request = db
        .transaction(RECOVERY_STORE, "readonly")
        .objectStore(RECOVERY_STORE)
        .get(CURRENT_RECOVERY_ID);
      request.onsuccess = () => {
        const stored = request.result as unknown;
        if (stored === undefined) return resolve(null);
        const validation = validateStoredRecoveryDraft(stored);
        if (!validation.ok) {
          reject(new InvalidRecoveryDraftError(validation.reason));
          return;
        }
        resolve(validation.draft);
      };
      request.onerror = () =>
        reject(new Error("Recovery autosave could not be checked."));
    });
  } finally {
    db.close();
  }
}

export async function deleteInvalidRecoveryDraft(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(RECOVERY_STORE, "readwrite");
      const store = transaction.objectStore(RECOVERY_STORE);
      const request = store.get(CURRENT_RECOVERY_ID);
      let failureMessage =
        "The invalid recovery autosave could not be removed.";
      request.onsuccess = () => {
        if (request.result === undefined) return;
        if (validateStoredRecoveryDraft(request.result).ok) {
          failureMessage =
            "The recovery autosave is now valid and was not removed.";
          transaction.abort();
          return;
        }
        store.delete(CURRENT_RECOVERY_ID);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
}

export async function clearRecoveryDraft(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(RECOVERY_STORE, "readwrite");
      const store = transaction.objectStore(RECOVERY_STORE);
      const request = store.get(CURRENT_RECOVERY_ID);
      let failureMessage = "Recovery autosave could not be cleared.";
      request.onsuccess = () => {
        if (request.result === undefined) return;
        if (!validateStoredRecoveryDraft(request.result).ok) {
          failureMessage =
            "The recovery autosave is damaged and was preserved. Remove it through the invalid-recovery repair action.";
          transaction.abort();
          return;
        }
        store.delete(CURRENT_RECOVERY_ID);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
}
