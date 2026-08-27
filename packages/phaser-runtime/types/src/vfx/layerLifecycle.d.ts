import type { LayerEvent, VfxLayer, VfxProject } from "./types";
export type CopyableLayerSettings = Pick<
  VfxLayer,
  | "assetId"
  | "transform"
  | "timing"
  | "appearance"
  | "behavior"
  | "random"
  | "frameAnimation"
  | "trail"
  | "motionPath"
  | "keyframes"
  | "beam"
  | "parentId"
> & {
  spawn: VfxLayer["spawn"];
};
/**
 * Enforces the public capabilities of each layer type. Hidden settings are
 * removed to canonical values so imported or stale state cannot affect output
 * and cannot unexpectedly return after a later type change.
 */
export declare function canonicalizeLayerCapabilities<T extends VfxLayer>(
  layer: T,
): T;
export declare function canonicalizeProjectLayerCapabilities(
  project: VfxProject,
): VfxProject;
/** Applies copied settings, then removes settings unsupported by the target. */
export declare function mergeCompatibleLayerSettings<T extends VfxLayer>(
  target: T,
  copied: CopyableLayerSettings,
): T;
export interface IncomingLayerEvent {
  source: VfxLayer;
  event: LayerEvent;
}
/** Only active source layers and active events can trigger a target at runtime. */
export declare function enabledIncomingLayerEvents(
  layers: VfxLayer[],
  targetLayerId: string,
): IncomingLayerEvent[];
