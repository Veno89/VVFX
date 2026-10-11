/**
 * The preview's game-screenshot backdrop lives in its own small database: it
 * belongs to this browser's editor, never to a project, so it must not touch
 * project storage, saved files, or exports.
 */

export const BACKDROP_DB_NAME = "vvfx-preview-backdrop";
const BACKDROP_STORE = "backdrop";
const IMAGE_KEY = "image";
const SETTINGS_KEY = "settings";

export const BACKDROP_MAX_BYTES = 25 * 1024 * 1024;
export const BACKDROP_MAX_DIMENSION = 8192;
export const BACKDROP_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const BACKDROP_PIXEL_SCALES = [0.5, 1, 2, 3, 4] as const;

export interface PreviewBackdropImage {
  name: string;
  type: string;
  data: ArrayBuffer;
  width: number;
  height: number;
}

export interface PreviewBackdropSettings {
  /** Effect units per screenshot pixel. */
  pixelScale: number;
  /** 0.1–1. */
  opacity: number;
}

export type PreviewBackdrop = PreviewBackdropImage & PreviewBackdropSettings;

export function normalizeBackdropSettings(
  pixelScale: unknown,
  opacity: unknown,
): PreviewBackdropSettings {
  return {
    pixelScale: BACKDROP_PIXEL_SCALES.includes(
      pixelScale as (typeof BACKDROP_PIXEL_SCALES)[number],
    )
      ? (pixelScale as number)
      : 1,
    opacity:
      typeof opacity === "number" && Number.isFinite(opacity)
        ? Math.min(1, Math.max(0.1, opacity))
        : 1,
  };
}

export function isValidBackdropImage(
  value: unknown,
): value is PreviewBackdropImage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.type === "string" &&
    BACKDROP_TYPES.includes(record.type) &&
    // Structured clones can come from another realm, so no instanceof.
    Object.prototype.toString.call(record.data) === "[object ArrayBuffer]" &&
    (record.data as ArrayBuffer).byteLength > 0 &&
    (record.data as ArrayBuffer).byteLength <= BACKDROP_MAX_BYTES &&
    typeof record.width === "number" &&
    typeof record.height === "number" &&
    record.width > 0 &&
    record.height > 0 &&
    record.width <= BACKDROP_MAX_DIMENSION &&
    record.height <= BACKDROP_MAX_DIMENSION
  );
}

function openBackdropDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKDROP_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BACKDROP_STORE))
        request.result.createObjectStore(BACKDROP_STORE);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(new Error("The preview backdrop storage could not be opened."));
    request.onblocked = () =>
      reject(new Error("The preview backdrop storage is busy in another tab."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openBackdropDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(BACKDROP_STORE, mode);
      const request = run(transaction.objectStore(BACKDROP_STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(new Error("The preview backdrop could not be stored."));
      transaction.onabort = () =>
        reject(new Error("The preview backdrop could not be stored."));
    });
  } finally {
    database.close();
  }
}

export async function loadPreviewBackdrop(): Promise<PreviewBackdrop | null> {
  const image = await withStore<unknown>("readonly", (store) =>
    store.get(IMAGE_KEY),
  );
  if (!isValidBackdropImage(image)) return null;
  const settings = await withStore<unknown>("readonly", (store) =>
    store.get(SETTINGS_KEY),
  );
  const stored = (settings ?? {}) as Partial<PreviewBackdropSettings>;
  return {
    ...image,
    ...normalizeBackdropSettings(stored.pixelScale, stored.opacity),
  };
}

export async function savePreviewBackdropImage(image: PreviewBackdropImage) {
  await withStore("readwrite", (store) => store.put(image, IMAGE_KEY));
}

export async function savePreviewBackdropSettings(
  settings: PreviewBackdropSettings,
) {
  await withStore("readwrite", (store) =>
    store.put(
      normalizeBackdropSettings(settings.pixelScale, settings.opacity),
      SETTINGS_KEY,
    ),
  );
}

export async function clearPreviewBackdrop() {
  await withStore("readwrite", (store) => store.clear());
}
