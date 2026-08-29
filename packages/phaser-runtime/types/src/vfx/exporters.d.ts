import type { VvfxRuntimeDefinition } from "../../packages/phaser-runtime/src/types";
import { type VfxProject } from "./types";
export declare function createRuntimeDefinition(
  project: VfxProject,
): VvfxRuntimeDefinition;
/** Compact game-facing JSON. The editable .vvfx project remains readable JSON. */
export declare function serializeRuntimeDefinition(project: VfxProject): string;
export interface RuntimeExportCapabilities {
  /** Every runtime definition can be placed at an origin x/y. */
  pointPlacement: true;
  /** Endpoint fitting is meaningful only when the definition has Beam layers. */
  beamEndpoints: boolean;
  beamLayerCount: number;
}
export declare function analyzeRuntimeExportCapabilities(
  project: Pick<VfxProject, "layers">,
): RuntimeExportCapabilities;
export declare function generatePhaserCode(project: VfxProject): string;
/**
 * An educational, hand-written Phaser approximation. The runtime-backed
 * generatePhaserCode export is the supported parity path.
 */
export declare function generateStandalonePhaserCode(
  project: VfxProject,
): string;
