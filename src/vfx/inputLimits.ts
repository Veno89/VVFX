export const MAX_PROJECT_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_RUNTIME_DEFINITION_BYTES = 40 * 1024 * 1024;
export const MAX_PROJECT_EMBEDDED_IMAGE_BYTES = 24 * 1024 * 1024;
// Keep worst-case decoded RGBA texture memory to roughly 128 MiB per project.
export const MAX_PROJECT_IMAGE_PIXELS = 32 * 1024 * 1024;
export const MAX_PROJECT_LAYERS = 500;
export const MAX_PROJECT_ASSETS = 128;
export const MAX_PROJECT_GROUPS = 250;
export const MAX_TIMELINE_MARKERS = 100;
export const MAX_ATTACHMENT_DEPTH = 32;
export const MAX_MOTION_PATH_POINTS = 6;
export const MAX_SAVED_PROJECTS = 100;
export const MAX_SAVED_TEMPLATES = 100;
export const MAX_UPLOAD_FILES = 16;
export const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_IMAGE_PIXELS = 4096 * 4096;
export const IMAGE_DECODE_TIMEOUT_MS = 10_000;
export const EMBEDDED_IMAGE_VALIDATION_TIMEOUT_MS = 30_000;
/**
 * Phaser-only fallback key. The leading underscore deliberately keeps it
 * outside `isSafeVfxId`, so a portable project asset can never collide with
 * or take ownership of the runtime's missing-image texture.
 */
export const VVFX_INTERNAL_MISSING_TEXTURE_KEY = "__vvfx_internal_missing__";
export const MAX_VFX_ID_LENGTH = 128;
export const MAX_VFX_NAME_LENGTH = 120;
/**
 * Shared authoring/runtime numeric envelope. Values beyond this range are not
 * meaningful for a 2D effect and can overflow when multiple transforms or
 * random ranges are combined during evaluation.
 */
export const MAX_VFX_NUMBER_MAGNITUDE = 1_000_000;
export const MAX_VFX_POSITION_MAGNITUDE = 5_000;
export const MAX_VFX_SCALE = 4;
export const MAX_VFX_ROTATION_MAGNITUDE = 1_080;
export const MAX_VFX_TIMING_MS = 30_000;
export const MAX_VFX_EMITTER_INTERVAL_MS = 4_000;
export const MAX_VFX_SPAWN_GEOMETRY = 1_000;

const SAFE_VFX_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED_VFX_IDS = new Set(["__proto__", "constructor", "prototype"]);

export function isSafeVfxId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VFX_ID_LENGTH &&
    SAFE_VFX_ID.test(value) &&
    !RESERVED_VFX_IDS.has(value.toLowerCase())
  );
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function isSupportedVfxNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_VFX_NUMBER_MAGNITUDE
  );
}

export function isSafeImageDimensions(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DIMENSION &&
    height <= MAX_IMAGE_DIMENSION &&
    width * height <= MAX_IMAGE_PIXELS
  );
}
