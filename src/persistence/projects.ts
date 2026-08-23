import type { VfxProject } from "../vfx/types";
import { validateProject } from "../vfx/serialization";
import { openDatabase, PROJECT_STORE, RECOVERY_STORE } from "./database";
const CURRENT_RECOVERY_ID = "current";

export interface RecoveryDraft {
  id: typeof CURRENT_RECOVERY_ID;
  project: VfxProject;
  savedAt: string;
}

export async function saveProject(project: VfxProject): Promise<VfxProject> {
  const db = await openDatabase();
  const storedProject: VfxProject = {
    ...project,
    metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(storedProject);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("This project could not be saved in the browser."));
  });
  db.close();
  return storedProject;
}

export async function listProjects(): Promise<VfxProject[]> {
  const db = await openDatabase();
  const storedProjects = await new Promise<unknown[]>((resolve, reject) => {
    const request = db
      .transaction(PROJECT_STORE, "readonly")
      .objectStore(PROJECT_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () =>
      reject(new Error("Saved projects could not be read."));
  });
  db.close();
  const projects = storedProjects.flatMap((stored) => {
    const result = validateProject(stored);
    return result.ok && result.project ? [result.project] : [];
  });
  return projects.sort((a, b) =>
    b.metadata.updatedAt.localeCompare(a.metadata.updatedAt),
  );
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("The saved project could not be removed."));
  });
  db.close();
}

export async function saveRecoveryDraft(
  project: VfxProject,
): Promise<RecoveryDraft> {
  const db = await openDatabase();
  const draft: RecoveryDraft = {
    id: CURRENT_RECOVERY_ID,
    project,
    savedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).put(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("Recovery autosave is temporarily unavailable."));
  });
  db.close();
  return draft;
}

export async function loadRecoveryDraft(): Promise<RecoveryDraft | null> {
  const db = await openDatabase();
  const draft = await new Promise<RecoveryDraft | null>((resolve, reject) => {
    const request = db
      .transaction(RECOVERY_STORE, "readonly")
      .objectStore(RECOVERY_STORE)
      .get(CURRENT_RECOVERY_ID);
    request.onsuccess = () => {
      const stored = request.result as RecoveryDraft | undefined;
      if (!stored) return resolve(null);
      const result = validateProject(stored.project);
      resolve(
        result.ok && result.project
          ? { ...stored, project: result.project }
          : null,
      );
    };
    request.onerror = () =>
      reject(new Error("Recovery autosave could not be checked."));
  });
  db.close();
  return draft;
}

export async function clearRecoveryDraft(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).delete(CURRENT_RECOVERY_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("Recovery autosave could not be cleared."));
  });
  db.close();
}
