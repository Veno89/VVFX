import { MAX_EFFECT_INSTANCES } from "./engine";
import { renderingEffectPassCost } from "./renderingEffects";
import type { EvaluatedInstance, VfxLayer, VfxProject } from "./types";

export { MAX_EFFECT_INSTANCES };
export const MAX_STRESS_INSTANCES = 2_000;
export const RENDERING_PASS_WARNING_THRESHOLD = 250;
export const STRESS_COPY_OPTIONS = [1, 10, 25, 50] as const;

export type StressCopyCount = (typeof STRESS_COPY_OPTIONS)[number];
export type PerformanceEvidence = "measured" | "estimated" | "heuristic";

export interface PerformanceWarning {
  id: string;
  evidence: "heuristic";
  message: string;
}

export interface LayerPerformanceEstimate {
  layerId: string;
  layerName: string;
  estimatedPeakSprites: number;
  authoredSpritesPerSecond: number;
  trailSamples: number;
  endTime: number;
  runsIndefinitely: boolean;
  renderingPassesPerSprite: number;
  estimatedRenderingPasses: number;
  estimatedCopyFinishTriggers: number;
  copyFinishTriggersPerSecond: number;
}

export interface ProjectPerformanceEstimate {
  durationMs: number;
  durationIsPreviewWindow: boolean;
  longestLayerId: string | null;
  longestLayerName: string | null;
  longestLayerEnd: number;
  repeatingLayerCount: number;
  estimatedPeakSprites: number;
  authoredSpritesPerSecond: number;
  estimatedRenderingPasses: number;
  estimatedCopyFinishTriggers: number;
  copyFinishTriggersPerSecond: number;
  layers: LayerPerformanceEstimate[];
  warnings: PerformanceWarning[];
}

export interface PreviewPerformanceSample {
  liveSprites: number;
  baseSprites: number;
  newSpritesPerSecond: number;
  requestedCopies: number;
  effectiveCopies: number;
  stressLimited: boolean;
}

export interface StressReplicationResult {
  instances: EvaluatedInstance[];
  requestedCopies: number;
  effectiveCopies: number;
  limited: boolean;
}

const activeLayers = (project: VfxProject): VfxLayer[] => {
  const soloIds = new Set(
    project.layers.filter((layer) => layer.solo).map((layer) => layer.id),
  );
  return project.layers.filter(
    (layer) =>
      layer.enabled &&
      layer.visible &&
      (soloIds.size === 0 || soloIds.has(layer.id)),
  );
};

const trailSampleCount = (layer: VfxLayer): number => {
  if (!layer.trail.enabled) return 0;
  const count = Math.max(1, Math.min(16, Math.floor(layer.trail.count)));
  const spacing = Math.max(10, layer.trail.spacing);
  const lifetime = Math.max(50, layer.trail.lifetime);
  return Math.max(0, Math.min(count, Math.floor(lifetime / spacing)));
};

const groupDelayFor = (project: VfxProject, layer: VfxLayer): number =>
  layer.groupId
    ? (project.groups.find((group) => group.id === layer.groupId)?.delay ?? 0)
    : 0;

function layerEstimate(
  project: VfxProject,
  layer: VfxLayer,
): LayerPerformanceEstimate {
  const trailSamples = trailSampleCount(layer);
  const runsIndefinitely =
    layer.type === "emitter" || layer.timing.repeatForever || layer.timing.loop;
  const cycles = runsIndefinitely ? 1 : Math.max(1, layer.timing.repeat + 1);
  const trailTail = layer.trail.enabled
    ? Math.max(layer.trail.lifetime, layer.trail.count * layer.trail.spacing)
    : 0;
  const endTime = runsIndefinitely
    ? project.preview.duration
    : groupDelayFor(project, layer) +
      layer.timing.delay +
      layer.timing.duration * cycles +
      layer.random.duration +
      layer.random.delay +
      trailTail;

  let originals = 1;
  let authoredSpritesPerSecond = 0;
  if (layer.type === "burst") {
    originals = Math.max(1, Math.min(250, Math.floor(layer.spawn.count)));
  } else if (layer.type === "emitter") {
    const copiesPerEvent = Math.max(
      1,
      Math.min(25, Math.floor(layer.spawn.count)),
    );
    const shortestGap = Math.max(30, layer.spawn.intervalMin);
    const longestPossibleLifetime = Math.max(
      50,
      layer.timing.duration + layer.random.duration + layer.random.delay,
    );
    originals = Math.min(
      Math.max(1, layer.spawn.maxAlive),
      Math.ceil(longestPossibleLifetime / shortestGap) * copiesPerEvent,
    );
    const averageGap = Math.max(
      30,
      (layer.spawn.intervalMin + layer.spawn.intervalMax) / 2,
    );
    authoredSpritesPerSecond = (copiesPerEvent * 1_000) / averageGap;
  }

  const estimatedPeakSprites = originals * (1 + trailSamples);
  const renderingPassesPerSprite = renderingEffectPassCost(
    layer.appearance.effects,
  );
  const copyFinishEvents = layer.events.filter(
    (event) => event.enabled && event.trigger === "copy-finish",
  );
  const possibleCopies =
    layer.type === "emitter"
      ? authoredSpritesPerSecond * (project.preview.duration / 1_000)
      : layer.type === "burst"
        ? originals * cycles
        : layer.type === "animated" || layer.type === "beam"
          ? cycles
          : 0;
  const estimatedCopyFinishTriggers = copyFinishEvents.reduce(
    (total, event) =>
      total +
      Math.min(
        Math.max(1, Math.min(250, Math.floor(event.maxTriggers ?? 32))),
        possibleCopies * Math.max(0, Math.min(1, event.chance ?? 1)),
      ),
    0,
  );
  return {
    layerId: layer.id,
    layerName: layer.name.trim() || "Unnamed layer",
    estimatedPeakSprites,
    authoredSpritesPerSecond: authoredSpritesPerSecond * (1 + trailSamples),
    trailSamples,
    endTime,
    runsIndefinitely,
    renderingPassesPerSprite,
    estimatedRenderingPasses: estimatedPeakSprites * renderingPassesPerSprite,
    estimatedCopyFinishTriggers,
    copyFinishTriggersPerSecond:
      (estimatedCopyFinishTriggers * 1_000) /
      Math.max(1, project.preview.duration),
  };
}

export function analyzeProjectPerformance(
  project: VfxProject,
): ProjectPerformanceEstimate {
  const layers = activeLayers(project).map((layer) =>
    layerEstimate(project, layer),
  );
  const longest = layers.reduce<LayerPerformanceEstimate | null>(
    (current, layer) =>
      !current || layer.endTime > current.endTime ? layer : current,
    null,
  );
  const repeatingLayerCount = layers.filter(
    (layer) => layer.runsIndefinitely,
  ).length;
  const estimatedPeakSprites = layers.reduce(
    (total, layer) => total + layer.estimatedPeakSprites,
    0,
  );
  const authoredSpritesPerSecond = layers.reduce(
    (total, layer) => total + layer.authoredSpritesPerSecond,
    0,
  );
  const estimatedRenderingPasses = layers.reduce(
    (total, layer) => total + layer.estimatedRenderingPasses,
    0,
  );
  const estimatedCopyFinishTriggers = layers.reduce(
    (total, layer) => total + layer.estimatedCopyFinishTriggers,
    0,
  );
  const copyFinishTriggersPerSecond = layers.reduce(
    (total, layer) => total + layer.copyFinishTriggersPerSecond,
    0,
  );
  const warnings: PerformanceWarning[] = [];

  if (estimatedPeakSprites >= MAX_EFFECT_INSTANCES) {
    warnings.push({
      id: "effect-limit",
      evidence: "heuristic",
      message: `These settings can ask for about ${Math.round(estimatedPeakSprites)} sprites at once. Vvfx safely shows at most ${MAX_EFFECT_INSTANCES} for one effect.`,
    });
  }
  const trailHeavy = layers.find(
    (layer) => layer.trailSamples >= 10 && layer.estimatedPeakSprites >= 160,
  );
  if (trailHeavy) {
    warnings.push({
      id: `trail-${trailHeavy.layerId}`,
      evidence: "heuristic",
      message: `${trailHeavy.layerName}'s trail can multiply one moving group into many fading images.`,
    });
  }
  if (authoredSpritesPerSecond >= 150) {
    warnings.push({
      id: "spawn-rate",
      evidence: "heuristic",
      message: `Repeating layers are configured to create roughly ${Math.round(authoredSpritesPerSecond)} sprite images per second, including trail copies.`,
    });
  }
  if (repeatingLayerCount >= 3) {
    warnings.push({
      id: "repeating-layers",
      evidence: "heuristic",
      message: `${repeatingLayerCount} active layers keep running for the full preview window. Test several effect copies before using them together in game.`,
    });
  }
  const expensiveRenderingLayer = layers.find(
    (layer) => layer.renderingPassesPerSprite >= 8,
  );
  if (
    estimatedRenderingPasses >= RENDERING_PASS_WARNING_THRESHOLD ||
    expensiveRenderingLayer
  ) {
    warnings.push({
      id: "rendering-effects",
      evidence: "heuristic",
      message: `Experimental pixel effects add about ${Math.round(estimatedRenderingPasses)} WebGL render passes at peak. Blur, trails, and high sprite counts multiply this cost; test the effect on target hardware.`,
    });
  }
  if (estimatedCopyFinishTriggers >= 128 || copyFinishTriggersPerSecond >= 60) {
    warnings.push({
      id: "spatial-events",
      evidence: "heuristic",
      message: `Per-copy finish events can start roughly ${Math.round(estimatedCopyFinishTriggers)} spatial sub-effects in this preview. Chance and maximum-trigger controls keep that fan-out bounded; test it on target hardware.`,
    });
  }

  return {
    durationMs: layers.length
      ? Math.min(
          project.preview.duration,
          Math.max(...layers.map((layer) => layer.endTime)),
        )
      : 0,
    durationIsPreviewWindow: repeatingLayerCount > 0,
    longestLayerId: longest?.layerId ?? null,
    longestLayerName: longest?.layerName ?? null,
    longestLayerEnd: longest?.endTime ?? 0,
    repeatingLayerCount,
    estimatedPeakSprites,
    authoredSpritesPerSecond,
    estimatedRenderingPasses,
    estimatedCopyFinishTriggers,
    copyFinishTriggersPerSecond,
    layers,
    warnings,
  };
}

const safeRequestedCopies = (requestedCopies: number): number => {
  if (!Number.isFinite(requestedCopies)) return 1;
  return Math.max(1, Math.min(50, Math.floor(requestedCopies)));
};

/**
 * Reuses one deterministic evaluator result and only duplicates its display
 * instances. Stress mode therefore adds renderer pressure without running the
 * VFX evaluator dozens of times.
 */
export function replicateInstancesForStress(
  baseInstances: readonly EvaluatedInstance[],
  requestedCopies: number,
  viewportWidth: number,
  viewportHeight: number,
  forceSingleCopy = false,
): StressReplicationResult {
  const requested = safeRequestedCopies(requestedCopies);
  if (forceSingleCopy || requested === 1) {
    return {
      instances: [...baseInstances],
      requestedCopies: requested,
      effectiveCopies: 1,
      limited: forceSingleCopy && requested > 1,
    };
  }

  const effectiveCopies = baseInstances.length
    ? Math.max(
        1,
        Math.min(
          requested,
          Math.floor(MAX_STRESS_INSTANCES / baseInstances.length),
        ),
      )
    : requested;
  const columns = Math.max(
    1,
    Math.ceil(
      Math.sqrt(
        effectiveCopies *
          (Math.max(1, viewportWidth) / Math.max(1, viewportHeight)),
      ),
    ),
  );
  const rows = Math.max(1, Math.ceil(effectiveCopies / columns));
  const cellWidth = viewportWidth / columns;
  const cellHeight = viewportHeight / rows;
  const instances: EvaluatedInstance[] = [];

  for (let copy = 0; copy < effectiveCopies; copy += 1) {
    const column = copy % columns;
    const row = Math.floor(copy / columns);
    const offsetX = (column + 0.5) * cellWidth - viewportWidth / 2;
    const offsetY = (row + 0.5) * cellHeight - viewportHeight / 2;
    for (const instance of baseInstances) {
      instances.push({
        ...instance,
        key: `stress:${copy}:${instance.key}`,
        x: instance.x + offsetX,
        y: instance.y + offsetY,
        selected: false,
      });
    }
  }

  return {
    instances,
    requestedCopies: requested,
    effectiveCopies,
    limited: effectiveCopies < requested,
  };
}

export function countRecentCreations(
  timestamps: readonly number[],
  now: number,
  windowMs = 1_000,
): number {
  const start = now - Math.max(1, windowMs);
  return timestamps.filter(
    (timestamp) => timestamp >= start && timestamp <= now,
  ).length;
}
