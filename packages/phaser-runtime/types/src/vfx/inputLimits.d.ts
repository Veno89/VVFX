export declare const MAX_PROJECT_FILE_BYTES: number;
export declare const MAX_RUNTIME_DEFINITION_BYTES: number;
export declare const MAX_PROJECT_EMBEDDED_IMAGE_BYTES: number;
export declare const MAX_PROJECT_IMAGE_PIXELS: number;
export declare const MAX_PROJECT_LAYERS = 500;
export declare const MAX_PROJECT_ASSETS = 128;
export declare const MAX_PROJECT_GROUPS = 250;
export declare const MAX_TIMELINE_MARKERS = 100;
export declare const MAX_ATTACHMENT_DEPTH = 32;
export declare const MAX_MOTION_PATH_POINTS = 6;
export declare const MAX_SAVED_PROJECTS = 100;
export declare const MAX_SAVED_TEMPLATES = 100;
export declare const MAX_UPLOAD_FILES = 16;
export declare const MAX_IMAGE_FILE_BYTES: number;
export declare const MAX_IMAGE_DIMENSION = 4096;
export declare const MAX_IMAGE_PIXELS: number;
export declare const IMAGE_DECODE_TIMEOUT_MS = 10000;
export declare const EMBEDDED_IMAGE_VALIDATION_TIMEOUT_MS = 30000;
/**
 * Phaser-only fallback key. The leading underscore deliberately keeps it
 * outside `isSafeVfxId`, so a portable project asset can never collide with
 * or take ownership of the runtime's missing-image texture.
 */
export declare const VVFX_INTERNAL_MISSING_TEXTURE_KEY =
  "__vvfx_internal_missing__";
/** Namespace reserved for textures created and owned by the Phaser runtime. */
export declare const VVFX_INTERNAL_TEXTURE_PREFIX = "__vvfx_runtime_asset__";
export declare const MAX_VFX_ID_LENGTH = 128;
export declare const MAX_VFX_NAME_LENGTH = 120;
/**
 * Shared authoring/runtime numeric envelope. Values beyond this range are not
 * meaningful for a 2D effect and can overflow when multiple transforms or
 * random ranges are combined during evaluation.
 */
export declare const MAX_VFX_NUMBER_MAGNITUDE = 1000000;
export declare const MAX_VFX_POSITION_MAGNITUDE = 5000;
export declare const MAX_VFX_SCALE = 4;
export declare const MAX_VFX_ROTATION_MAGNITUDE = 1080;
export declare const MAX_VFX_TIMING_MS = 30000;
export declare const MAX_VFX_EMITTER_INTERVAL_MS = 4000;
export declare const MAX_VFX_SPAWN_GEOMETRY = 1000;
export declare function isSafeVfxId(value: unknown): value is string;
export declare function utf8ByteLength(value: string): number;
export declare function isSupportedVfxNumber(value: unknown): value is number;
export declare function isSafeImageDimensions(
  width: number,
  height: number,
): boolean;
