export const DB_NAME = "vvfx-local";
export const DB_VERSION = 3;
export const PROJECT_STORE = "projects";
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Local Vvfx storage could not be opened."));
  });
}
