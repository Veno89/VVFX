export const DB_NAME = "vvfx-local";
import { createStoredProjectSummary } from "./projectSummaries";

export const DB_VERSION = 4;
export const PROJECT_STORE = "projects";
export const PROJECT_SUMMARY_STORE = "project-summaries";
export const RECOVERY_STORE = "recovery";
export const TEMPLATE_STORE = "templates";

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
        request.result.createObjectStore(PROJECT_STORE, {
          keyPath: "metadata.id",
        });
      }
      if (!request.result.objectStoreNames.contains(RECOVERY_STORE)) {
        request.result.createObjectStore(RECOVERY_STORE, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(TEMPLATE_STORE)) {
        request.result.createObjectStore(TEMPLATE_STORE, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(PROJECT_SUMMARY_STORE)) {
        const summaries = request.result.createObjectStore(
          PROJECT_SUMMARY_STORE,
          { keyPath: "key" },
        );
        if (request.result.objectStoreNames.contains(PROJECT_STORE)) {
          const projects = request.transaction?.objectStore(PROJECT_STORE);
          const cursorRequest = projects?.openCursor();
          if (cursorRequest)
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              summaries.put(
                createStoredProjectSummary(cursor.primaryKey, cursor.value),
              );
              cursor.continue();
            };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Local Vvfx storage could not be opened."));
  });
}
