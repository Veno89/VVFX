import type { VfxProject } from "../../../src/vfx/types";
import type { RuntimeValidationResult, VvfxRuntimeDefinition } from "./types";
/** Runtime validation is a total boundary for JSON and direct JavaScript input. */
export declare function validateRuntimeDefinition(
  input: unknown,
): RuntimeValidationResult;
/**
 * Internal playback boundary. The returned normalized definition is not
 * exposed to callers, so later asset loading and effect construction can reuse
 * its already-validated project without repeating the full structural walk.
 */
export declare function prepareRuntimeDefinition(
  input: unknown,
): RuntimeValidationResult;
export declare function runtimeDefinitionToProject(
  definition: VvfxRuntimeDefinition,
): VfxProject;
