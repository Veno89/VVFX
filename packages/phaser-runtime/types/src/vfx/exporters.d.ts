import type { VvfxRuntimeDefinition } from "../../packages/phaser-runtime/src/types";
import type { VfxProject } from "./types";
export declare function createRuntimeDefinition(
  project: VfxProject,
): VvfxRuntimeDefinition;
export declare function generatePhaserCode(project: VfxProject): string;
/**
 * An educational, hand-written Phaser approximation. The runtime-backed
 * generatePhaserCode export is the supported parity path.
 */
export declare function generateStandalonePhaserCode(
  project: VfxProject,
): string;
