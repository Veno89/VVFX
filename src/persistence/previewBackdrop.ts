/**
 * The preview's game-screenshot backdrop and stand-in character live in their
 * own small database: they belong to this browser's editor, never to a
 * project, so they must not touch project storage, saved files, or exports.
 */

export const BACKDROP_DB_NAME = "vvfx-preview-backdrop";
const BACKDROP_STORE = "backdrop";

/** The screenshot behind everything, or a character sprite placed on it. */
export type BackdropSlot = "backdrop" | "character";

const SLOT_KEYS: Record<BackdropSlot, { image: string; settings: string }> = {
  backdrop: { image: "image", settings: "settings" },
  character: { image: "character-image", settings: "character-settings" },
};

/** Largest offset from the effect origin, in effect units. */
export const BACKDROP_MAX_OFFSET = 2000;

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
  /** Image center relative to the effect origin, in effect units. */
  x: number;
  y: number;
}

export type PreviewBackdrop = PreviewBackdropImage & PreviewBackdropSettings;

const offset = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(
        Math.min(BACKDROP_MAX_OFFSET, Math.max(-BACKDROP_MAX_OFFSET, value)),
      )
    : 0;

export function normalizeBackdropSettings(
  pixelScale: unknown,
  opacity: unknown,
  x?: unknown,
  y?: unknown,
): PreviewBackdropSettings {
  return {
    x: offset(x),
    y: offset(y),
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

export async function loadPreviewBackdrop(
  slot: BackdropSlot = "backdrop",
): Promise<PreviewBackdrop | null> {
  const keys = SLOT_KEYS[slot];
  const image = await withStore<unknown>("readonly", (store) =>
    store.get(keys.image),
  );
  if (!isValidBackdropImage(image)) return null;
  const settings = await withStore<unknown>("readonly", (store) =>
    store.get(keys.settings),
  );
  const stored = (settings ?? {}) as Partial<PreviewBackdropSettings>;
  return {
    ...image,
    ...normalizeBackdropSettings(
      stored.pixelScale,
      stored.opacity,
      stored.x,
      stored.y,
    ),
  };
}

export async function savePreviewBackdropImage(
  image: PreviewBackdropImage,
  slot: BackdropSlot = "backdrop",
) {
  await withStore("readwrite", (store) =>
    store.put(image, SLOT_KEYS[slot].image),
  );
}

export async function savePreviewBackdropSettings(
  settings: PreviewBackdropSettings,
  slot: BackdropSlot = "backdrop",
) {
  await withStore("readwrite", (store) =>
    store.put(
      normalizeBackdropSettings(
        settings.pixelScale,
        settings.opacity,
        settings.x,
        settings.y,
      ),
      SLOT_KEYS[slot].settings,
    ),
  );
}

export async function clearPreviewBackdrop(slot: BackdropSlot = "backdrop") {
  const keys = SLOT_KEYS[slot];
  await withStore("readwrite", (store) => {
    store.delete(keys.settings);
    return store.delete(keys.image);
  });
}
