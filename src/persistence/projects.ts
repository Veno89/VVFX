import type { VfxProject } from "../vfx/types";
import {
  requireCurrentProject,
  serializeProject,
  validateProject,
} from "../vfx/serialization";
import { MAX_SAVED_PROJECTS } from "../vfx/inputLimits";
import { openDatabase, PROJECT_STORE, RECOVERY_STORE } from "./database";
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
  projects: VfxProject[];
  invalidRecords: InvalidStoredProjectRecord[];
  totalRecords: number;
  excessRecords: number;
}

interface StoredProjectEntry {
  key: IDBValidKey;
  value: unknown;
}

interface StoredProjectEntryRead {
  entries: StoredProjectEntry[];
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

async function readStoredProjectEntries(
  db: IDBDatabase,
): Promise<StoredProjectEntryRead> {
  return new Promise<StoredProjectEntryRead>((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    const store = transaction.objectStore(PROJECT_STORE);
    const valuesRequest = store.getAll(undefined, MAX_SAVED_PROJECTS + 1);
    const keysRequest = store.getAllKeys(undefined, MAX_SAVED_PROJECTS + 1);
    const countRequest = store.count();
    transaction.oncomplete = () => {
      const values = valuesRequest.result as unknown[];
      const keys = keysRequest.result;
      if (values.length !== keys.length) {
        reject(new Error("Saved projects could not be inspected safely."));
        return;
      }
      resolve({
        entries: values.map((value, index) => ({
          key: keys[index],
          value,
        })),
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
  // Apply the same encoded-size boundary used by portable project export.
  serializeProject(storedProject);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      const countRequest = store.count();
      const existingRequest = store.get(storedProject.metadata.id);
      let count: number | null = null;
      let existingKnown = false;
      let hasExisting = false;
      let hasInvalidExisting = false;
      let writeStarted = false;
      let failureMessage = "This project could not be saved in the browser.";
      const startWrite = () => {
        if (writeStarted || count === null || !existingKnown) return;
        if (count > MAX_SAVED_PROJECTS) {
          failureMessage =
            "The saved project library exceeds its safety limit.";
          transaction.abort();
          return;
        }
        if (hasInvalidExisting) {
          failureMessage =
            "A damaged saved record already uses this project identifier. Remove that invalid record before saving.";
          transaction.abort();
          return;
        }
        if (!hasExisting && count >= MAX_SAVED_PROJECTS) {
          failureMessage = `The saved library can contain at most ${MAX_SAVED_PROJECTS} projects.`;
          transaction.abort();
          return;
        }
        writeStarted = true;
        store.put(storedProject);
      };
      countRequest.onsuccess = () => {
        count = countRequest.result;
        startWrite();
      };
      existingRequest.onsuccess = () => {
        existingKnown = true;
        hasExisting = existingRequest.result !== undefined;
        if (hasExisting)
          hasInvalidExisting = !validateProject(existingRequest.result).ok;
        startWrite();
      };
      countRequest.onerror = () => transaction.abort();
      existingRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
  return storedProject;
}

export async function inspectStoredProjects(): Promise<StoredProjectInspection> {
  const db = await openDatabase();
  let stored: StoredProjectEntryRead;
  try {
    stored = await readStoredProjectEntries(db);
  } finally {
    db.close();
  }
  const projects: VfxProject[] = [];
  const invalidRecords: InvalidStoredProjectRecord[] = [];
  for (const entry of stored.entries) {
    const result = validateProject(entry.value);
    if (result.ok && result.project) projects.push(result.project);
    else
      invalidRecords.push({
        key: entry.key,
        reason: result.error ?? "This saved project record is damaged.",
      });
  }
  projects.sort((a, b) =>
    b.metadata.updatedAt.localeCompare(a.metadata.updatedAt),
  );
  return {
    projects,
    invalidRecords,
    totalRecords: stored.totalRecords,
    excessRecords: Math.max(0, stored.totalRecords - MAX_SAVED_PROJECTS),
  };
}

export async function listProjects(): Promise<VfxProject[]> {
  const inspection = await inspectStoredProjects();
  if (inspection.excessRecords > 0)
    throw new Error(
      `The saved project library contains ${inspection.totalRecords} records and exceeds its safety limit by ${inspection.excessRecords}. Inspect or remove records before continuing.`,
    );
  if (inspection.invalidRecords.length > 0)
    throw new Error(
      `The saved project library contains ${inspection.invalidRecords.length} invalid ${inspection.invalidRecords.length === 1 ? "record" : "records"}. Inspect or remove them before continuing.`,
    );
  return inspection.projects;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).delete(id);
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
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.get(key);
      let failureMessage = "The invalid project record could not be removed.";
      request.onsuccess = () => {
        if (request.result === undefined) return;
        if (validateProject(request.result).ok) {
          failureMessage =
            "This saved record is now a valid project and was not removed.";
          transaction.abort();
          return;
        }
        store.delete(key);
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
