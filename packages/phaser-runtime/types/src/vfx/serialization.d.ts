import type { VfxProject } from "./types";
export interface ValidationResult {
  ok: boolean;
  project?: VfxProject;
  error?: string;
}
/** Validation is a total boundary: malformed caller data never escapes as a raw exception. */
export declare function validateProject(input: unknown): ValidationResult;
export type ProjectBoundary =
  | "browser-save"
  | "recovery-save"
  | "project-export"
  | "runtime-export"
  | "standalone-export"
  | "preview-export";
export type ProjectIntegrityResult =
  | {
      ok: true;
      project: VfxProject;
    }
  | {
      ok: false;
      error: string;
      path?: string;
    };
/** Strict validation for current editor state at every outbound boundary. */
export declare function validateCurrentProject(
  project: VfxProject,
): ProjectIntegrityResult;
export declare function requireCurrentProject(
  project: VfxProject,
  boundary: ProjectBoundary,
): VfxProject;
export declare function serializeProject(project: VfxProject): string;
export declare function deserializeProject(text: string): ValidationResult;
