import { interpolateColorStops } from "./color";
import {
  compileLayerActivations,
  createLayerActivationIndex,
  type LayerActivation,
  type LayerActivationSchedule,
} from "./events";
import {
  emitterSpawnEvents,
  evaluateInstanceSpatialState,
} from "./instanceEvaluation";
import { lerp } from "./interpolation";
import { isSupportedVfxNumber, MAX_VFX_SCALE } from "./inputLimits";
import { canonicalizeProjectLayerCapabilities } from "./layerLifecycle";
import { finiteLayerCycleCount } from "./limits";
import { resolveProjectGroups } from "./groups";
import { randomSigned } from "./random";
import { evaluateRenderingEffects } from "./renderingEffectsModel";
import { spriteFrameAtTime } from "./spriteSheet";
import type {
  BeamEndpoints,
  EvaluatedInstance,
  VfxLayer,
  VfxProject,
} from "./types";

export const MAX_EFFECT_INSTANCES = 500;

export interface EvaluationDiagnostics {
  instanceEvaluations: number;
  budgetExhausted: boolean;
  /** Set only when supplied by the caller; 0 means the schedule cache hit. */
  scheduleCompilations?: number;
}

export type BeamFit = "stretch" | "crop";

/** Runtime-only Beam presentation controls; these never mutate project data. */
export interface BeamEvaluationOptions {
  beamFit?: BeamFit;
  beamThicknessScale?: number;
}

interface ResolvedBeamEvaluationOptions {
  beamFit: BeamFit;
  beamThicknessScale: number;
}

export interface ProjectEvaluator {
  readonly project: VfxProject;
  evaluate(
    time: number,
    selectedId: string | null,
    beamEndpoints?: Readonly<Record<string, BeamEndpoints>>,
    diagnostics?: EvaluationDiagnostics,
    beamOptions?: BeamEvaluationOptions,
  ): EvaluatedInstance[];
}

function ownOptionValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function resolveBeamEvaluationOptions(
  options: BeamEvaluationOptions | undefined,
): ResolvedBeamEvaluationOptions {
  const fit = ownOptionValue(options, "beamFit");
  const thickness = ownOptionValue(options, "beamThicknessScale");
  return {
    beamFit: fit === "crop" ? "crop" : "stretch",
    beamThicknessScale:
      isSupportedVfxNumber(thickness) && thickness >= 0
        ? Math.min(MAX_VFX_SCALE, thickness)
        : 1,
  };
}

function containsOnlySupportedNumbers(
  value: unknown,
  visited = new Set<object>(),
): boolean {
  if (typeof value === "number") return isSupportedVfxNumber(value);
  if (value === null || typeof value !== "object") return true;
  if (visited.has(value)) return true;
  visited.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1)
      if (!containsOnlySupportedNumbers(value[index], visited)) return false;
    return true;
  }
  for (const child of Object.values(value))
    if (!containsOnlySupportedNumbers(child, visited)) return false;
  return true;
}

function isSafeEvaluatedInstance(instance: EvaluatedInstance): boolean {
  const crop = instance.sourceCrop;
  return (
    [
      instance.x,
      instance.y,
      instance.scaleX,
      instance.scaleY,
      instance.opacity,
      instance.rotation,
      instance.tintStrength,
    ].every(isSupportedVfxNumber) &&
    (instance.frame === null || isSupportedVfxNumber(instance.frame)) &&
    (instance.trailIndex === null ||
      isSupportedVfxNumber(instance.trailIndex)) &&
    containsOnlySupportedNumbers(instance.effects) &&
    (crop === null ||
      ([crop.x, crop.y, crop.width, crop.height].every(
        (value) => isSupportedVfxNumber(value) && value >= 0 && value <= 1,
      ) &&
        crop.x + crop.width <= 1 &&
        crop.y + crop.height <= 1))
  );
}

function evaluateOne(
  project: VfxProject,
  layer: VfxLayer,
  activation: LayerActivation,
  schedule: LayerActivationSchedule,
  selectedId: string | null,
  instanceIndex: number,
  copyIndex: number,
  spawnTime: number,
  time: number,
  beamEndpoints: Readonly<Record<string, BeamEndpoints>>,
  beamOptions: ResolvedBeamEvaluationOptions,
): EvaluatedInstance | null {
  const spatial = evaluateInstanceSpatialState(
    project,
    layer,
    activation,
    schedule,
    instanceIndex,
    copyIndex,
    spawnTime,
    time,
  );
  if (!spatial) return null;
  const {
    seed,
    duration,
    elapsed,
    lifetimeProgress,
    progress,
    behavior,
    keyed,
  } = spatial;
  const scaleStart = Math.max(
    0,
    layer.transform.startScale +
      randomSigned(seed, 11, layer.random.startScale),
  );
  const scaleEnd = Math.max(
    0,
    layer.transform.endScale + randomSigned(seed, 12, layer.random.endScale),
  );
  const opacityOffset = randomSigned(seed, 13, layer.random.opacity);
  const randomScale = lerp(
    randomSigned(seed, 11, layer.random.startScale),
    randomSigned(seed, 12, layer.random.endScale),
    progress,
  );
  let scaleX = keyed
    ? Math.max(0, keyed.scaleX + randomScale) * behavior.scaleMultiplier
    : layer.transform.separateScale
      ? Math.max(
          0,
          lerp(
            layer.transform.startScaleX,
            layer.transform.endScaleX,
            progress,
          ) + randomScale,
        ) * behavior.scaleMultiplier
      : lerp(scaleStart, scaleEnd, progress) * behavior.scaleMultiplier;
  let scaleY = keyed
    ? Math.max(0, keyed.scaleY + randomScale) * behavior.scaleMultiplier
    : layer.transform.separateScale
      ? Math.max(
          0,
          lerp(
            layer.transform.startScaleY,
            layer.transform.endScaleY,
            progress,
          ) + randomScale,
        ) * behavior.scaleMultiplier
      : lerp(scaleStart, scaleEnd, progress) * behavior.scaleMultiplier;
  let x = spatial.x;
  let y = spatial.y;
  let rotation = spatial.rotation;
  let sourceCrop: EvaluatedInstance["sourceCrop"] = null;
  if (layer.type === "beam") {
    const suppliedEndpoints = Object.prototype.hasOwnProperty.call(
      beamEndpoints,
      layer.id,
    )
      ? beamEndpoints[layer.id]
      : undefined;
    const endpoints = suppliedEndpoints ?? {
      startX: spatial.x,
      startY: spatial.y,
      endX: spatial.x + layer.beam.endX,
      endY: spatial.y + layer.beam.endY,
    };
    const deltaX = endpoints.endX - endpoints.startX;
    const deltaY = endpoints.endY - endpoints.startY;
    const asset = project.assets.find(
      (candidate) => candidate.id === layer.assetId,
    );
    const sourceWidth = Math.max(
      1,
      asset?.spriteSheet?.frameWidth ?? asset?.width ?? 128,
    );
    const targetLength = Math.hypot(deltaX, deltaY);
    const authoredLength = Math.hypot(layer.beam.endX, layer.beam.endY);
    x = (endpoints.startX + endpoints.endX) / 2;
    y = (endpoints.startY + endpoints.endY) / 2;
    rotation = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
    if (
      suppliedEndpoints &&
      beamOptions.beamFit === "crop" &&
      authoredLength > 0 &&
      targetLength < authoredLength
    ) {
      const width = targetLength / authoredLength;
      scaleX = authoredLength / sourceWidth;
      sourceCrop = { x: (1 - width) / 2, y: 0, width, height: 1 };
    } else {
      scaleX = targetLength / sourceWidth;
    }
    scaleY *= beamOptions.beamThicknessScale;
  }
  const frame = spriteFrameAtTime(
    project.assets.find((asset) => asset.id === layer.assetId),
    layer.frameAnimation,
    Math.max(0, elapsed),
    seed,
  );
  return {
    key: `${layer.id}:${instanceIndex}:${Math.round(spawnTime)}${
      activation.ordinal === 0 ? "" : `:activation:${activation.ordinal}`
    }`,
    layerId: layer.id,
    assetId: layer.assetId,
    x,
    y,
    scaleX,
    scaleY,
    opacity: Math.max(
      0,
      Math.min(
        1,
        lerp(
          keyed?.opacity ?? layer.transform.startOpacity,
          keyed?.opacity ?? layer.transform.endOpacity,
          keyed ? 0 : progress,
        ) *
          behavior.opacityMultiplier +
          opacityOffset,
      ),
    ),
    rotation,
    tint: layer.appearance.colorOverLifetime.enabled
      ? interpolateColorStops(
          layer.appearance.colorOverLifetime.stops,
          lifetimeProgress,
        )
      : layer.appearance.tint,
    tintStrength: layer.appearance.tintStrength,
    blendMode: layer.appearance.blendMode,
    effects: evaluateRenderingEffects(layer.appearance.effects, {
      lifetimeProgress: Math.max(
        0,
        Math.min(1, elapsed / Math.max(1, duration)),
      ),
      dissolveProgress: progress,
      elapsedMs: Math.max(0, elapsed),
      seed,
      clips: layer.appearance.effectClips,
    }),
    selected: selectedId === layer.id,
    frame,
    trailIndex: null,
    sourceCrop,
  };
}

function* repeatingSpawnTimes(
  layer: VfxLayer,
  activation: LayerActivation,
  time: number,
  maximumTimes: number,
): Generator<number> {
  if (maximumTimes <= 0) return;
  const cycleDuration = Math.max(50, layer.timing.duration);
  const local = time - activation.start;
  if (local < 0) return;
  const currentCycle = Math.floor(local / cycleDuration);
  const allowedCycles =
    layer.timing.repeatForever || layer.timing.loop
      ? Infinity
      : finiteLayerCycleCount(layer.timing.repeat);
  const firstCycle = Math.max(
    0,
    currentCycle -
      Math.ceil(
        (layer.timing.duration + layer.random.duration + layer.random.delay) /
          cycleDuration,
      ),
  );
  let yielded = 0;
  for (
    let cycle = firstCycle;
    cycle <= currentCycle && cycle < allowedCycles && yielded < maximumTimes;
    cycle += 1
  ) {
    yield activation.start + cycle * cycleDuration;
    yielded += 1;
  }
}

function emitterSpawnTimes(
  project: VfxProject,
  layer: Extract<VfxLayer, { type: "emitter" }>,
  activation: LayerActivation,
  time: number,
): ReturnType<typeof emitterSpawnEvents> {
  const times = emitterSpawnEvents(project, layer, activation, time);
  const maximumEvents = Math.max(
    1,
    Math.ceil(layer.spawn.maxAlive / Math.max(1, layer.spawn.count)),
  );
  const delayBuffer = Math.ceil(
    layer.random.delay / Math.max(30, layer.spawn.intervalMin),
  );
  return times.slice(
    -Math.min(maximumEvents + delayBuffer + 2, MAX_EFFECT_INSTANCES),
  );
}

const MAX_CACHED_ACTIVATION_SCHEDULES = 8;

/**
 * Prepares immutable project lookups once and retains a small LRU of exact
 * playhead schedules. Long-running playback stays bounded while repeated
 * scrubs and multi-consumer renders reuse the expensive event compilation.
 */
export function createProjectEvaluator(project: VfxProject): ProjectEvaluator {
  const resolvedProject = canonicalizeProjectLayerCapabilities(
    resolveProjectGroups(project),
  );
  const activationIndex = createLayerActivationIndex(resolvedProject);
  const scheduleCache = new Map<number, LayerActivationSchedule>();
  const soloIds = new Set(
    resolvedProject.layers
      .filter((layer) => layer.solo)
      .map((layer) => layer.id),
  );
  const visibleLayers = resolvedProject.layers.filter(
    (layer) =>
      layer.enabled &&
      layer.visible &&
      (soloIds.size === 0 || soloIds.has(layer.id)),
  );

  return {
    project: resolvedProject,
    evaluate(
      time,
      selectedId,
      beamEndpoints = {},
      diagnostics,
      beamOptions,
    ): EvaluatedInstance[] {
      let schedule = scheduleCache.get(time);
      const compiled = !schedule;
      if (schedule) {
        scheduleCache.delete(time);
        scheduleCache.set(time, schedule);
      } else {
        schedule = compileLayerActivations(
          resolvedProject,
          time,
          activationIndex,
        );
        scheduleCache.set(time, schedule);
        if (scheduleCache.size > MAX_CACHED_ACTIVATION_SCHEDULES) {
          const oldest = scheduleCache.keys().next().value;
          if (oldest !== undefined) scheduleCache.delete(oldest);
        }
      }
      if (diagnostics && "scheduleCompilations" in diagnostics)
        diagnostics.scheduleCompilations = compiled ? 1 : 0;
      return evaluateResolvedProject(
        resolvedProject,
        visibleLayers,
        schedule,
        time,
        selectedId,
        beamEndpoints,
        resolveBeamEvaluationOptions(beamOptions),
        diagnostics,
      );
    },
  };
}

export function evaluateProject(
  project: VfxProject,
  time: number,
  selectedId: string | null,
  beamEndpoints: Readonly<Record<string, BeamEndpoints>> = {},
  diagnostics?: EvaluationDiagnostics,
  beamOptions?: BeamEvaluationOptions,
): EvaluatedInstance[] {
  return createProjectEvaluator(project).evaluate(
    time,
    selectedId,
    beamEndpoints,
    diagnostics,
    beamOptions,
  );
}

function evaluateResolvedProject(
  resolvedProject: VfxProject,
  visibleLayers: readonly VfxLayer[],
  schedule: LayerActivationSchedule,
  time: number,
  selectedId: string | null,
  beamEndpoints: Readonly<Record<string, BeamEndpoints>>,
  beamOptions: ResolvedBeamEvaluationOptions,
  diagnostics?: EvaluationDiagnostics,
): EvaluatedInstance[] {
  const originals: EvaluatedInstance[] = [];
  const trails: EvaluatedInstance[] = [];
  const evaluationBudget = { remaining: MAX_EFFECT_INSTANCES };
  if (diagnostics) {
    diagnostics.instanceEvaluations = 0;
    diagnostics.budgetExhausted = false;
  }
  // Authored instances always get first claim on the shared work budget.
  for (const layer of visibleLayers) {
    const capacity = MAX_EFFECT_INSTANCES - originals.length;
    if (capacity <= 0 || evaluationBudget.remaining <= 0) break;
    const current = evaluateLayer(
      resolvedProject,
      layer,
      time,
      selectedId,
      schedule,
      time,
      beamEndpoints,
      beamOptions,
      evaluationBudget,
      capacity,
    );
    for (const instance of current) originals.push(instance);
  }

  // Renderer-only trail samples use only budget left after every original.
  if (evaluationBudget.remaining > 0 && originals.length < MAX_EFFECT_INSTANCES)
    for (const layer of visibleLayers) {
      if (!layer.trail.enabled) continue;
      if (
        evaluationBudget.remaining <= 0 ||
        originals.length + trails.length >= MAX_EFFECT_INSTANCES
      )
        break;
      if (layer.trail.enabled) {
        const count = Math.max(1, Math.min(16, Math.floor(layer.trail.count)));
        const spacing = Math.max(10, layer.trail.spacing);
        const lifetime = Math.max(50, layer.trail.lifetime);
        for (
          let trailIndex = 1;
          trailIndex <= count &&
          evaluationBudget.remaining > 0 &&
          originals.length + trails.length < MAX_EFFECT_INSTANCES;
          trailIndex += 1
        ) {
          const age = trailIndex * spacing;
          if (age > lifetime || time - age < 0) continue;
          const opacityMultiplier =
            layer.trail.opacity * Math.max(0, 1 - age / lifetime);
          const scaleMultiplier = Math.max(
            0,
            1 - trailIndex * layer.trail.scaleFalloff,
          );
          const capacity =
            MAX_EFFECT_INSTANCES - originals.length - trails.length;
          for (const instance of evaluateLayer(
            resolvedProject,
            layer,
            time - age,
            null,
            schedule,
            time,
            beamEndpoints,
            beamOptions,
            evaluationBudget,
            capacity,
          ))
            trails.push({
              ...instance,
              key: `${instance.key}:trail:${trailIndex}`,
              scaleX: instance.scaleX * scaleMultiplier,
              scaleY: instance.scaleY * scaleMultiplier,
              opacity: instance.opacity * opacityMultiplier,
              selected: false,
              trailIndex,
            });
        }
      }
    }
  const visibleTrails = trails.sort(
    (left, right) => (right.trailIndex ?? 0) - (left.trailIndex ?? 0),
  );
  if (diagnostics) {
    diagnostics.instanceEvaluations =
      MAX_EFFECT_INSTANCES - evaluationBudget.remaining;
    diagnostics.budgetExhausted = evaluationBudget.remaining === 0;
  }
  // Never hand a renderer a derived NaN/Infinity or an authored value outside
  // the shared numeric envelope, even when evaluation was called directly on
  // an unvalidated in-memory project.
  return [...visibleTrails, ...originals].filter(isSafeEvaluatedInstance);
}

function evaluateLayer(
  project: VfxProject,
  layer: VfxLayer,
  time: number,
  selectedId: string | null,
  schedule: LayerActivationSchedule,
  renderTime: number,
  beamEndpoints: Readonly<Record<string, BeamEndpoints>>,
  beamOptions: ResolvedBeamEvaluationOptions,
  evaluationBudget: { remaining: number },
  maximumInstances: number,
): EvaluatedInstance[] {
  const instances: EvaluatedInstance[] = [];
  const activations = schedule.byLayer.get(layer.id) ?? [];
  const instanceLimit = Math.max(
    0,
    Math.min(MAX_EFFECT_INSTANCES, Math.floor(maximumInstances)),
  );
  const hasCapacity = () =>
    instances.length < instanceLimit && evaluationBudget.remaining > 0;
  const evaluate = (
    activation: LayerActivation,
    instanceIndex: number,
    copyIndex: number,
    spawnTime: number,
  ) => {
    if (!hasCapacity()) return null;
    evaluationBudget.remaining -= 1;
    return evaluateOne(
      project,
      layer,
      activation,
      schedule,
      selectedId,
      instanceIndex,
      copyIndex,
      spawnTime,
      time,
      beamEndpoints,
      beamOptions,
    );
  };
  if (instanceLimit === 0 || evaluationBudget.remaining <= 0) return instances;

  if (layer.type === "static") {
    for (const activation of activations) {
      if (!hasCapacity()) break;
      if (
        activation.cancelledAt !== null &&
        activation.cancelledAt <= renderTime
      )
        continue;
      const value = evaluate(activation, 0, 0, activation.start);
      if (value) instances.push(value);
    }
    return instances;
  }

  if (layer.type === "animated" || layer.type === "beam") {
    activationLoop: for (const activation of activations) {
      if (!hasCapacity()) break;
      if (
        activation.cancelledAt !== null &&
        activation.cancelledAt <= renderTime
      )
        continue;
      for (const spawnTime of repeatingSpawnTimes(
        layer,
        activation,
        time,
        evaluationBudget.remaining,
      )) {
        if (!hasCapacity()) break activationLoop;
        const cycle = Math.max(
          0,
          Math.round(
            (spawnTime - activation.start) /
              Math.max(50, layer.timing.duration),
          ),
        );
        const value = evaluate(activation, cycle, 0, spawnTime);
        if (value) instances.push(value);
      }
    }
    return instances;
  }

  if (layer.type === "burst") {
    activationLoop: for (const activation of activations) {
      if (!hasCapacity()) break;
      if (
        activation.cancelledAt !== null &&
        activation.cancelledAt <= renderTime
      )
        continue;
      for (const spawnTime of repeatingSpawnTimes(
        layer,
        activation,
        time,
        evaluationBudget.remaining,
      )) {
        if (!hasCapacity()) break activationLoop;
        const cycle = Math.max(
          0,
          Math.round(
            (spawnTime - activation.start) /
              Math.max(50, layer.timing.duration),
          ),
        );
        for (
          let index = 0;
          index < Math.min(layer.spawn.count, 250) && hasCapacity();
          index += 1
        ) {
          const value = evaluate(
            activation,
            cycle * Math.max(1, layer.spawn.count) + index,
            index,
            spawnTime,
          );
          if (value) instances.push(value);
        }
      }
    }
    return instances;
  }

  const maximumAlive = Math.max(
    1,
    Math.min(MAX_EFFECT_INSTANCES, Math.floor(layer.spawn.maxAlive)),
  );
  const emitterLimit = Math.min(instanceLimit, maximumAlive);
  for (
    let activationIndex = activations.length - 1;
    activationIndex >= 0 &&
    instances.length < emitterLimit &&
    evaluationBudget.remaining > 0;
    activationIndex -= 1
  ) {
    const activation = activations[activationIndex];
    if (activation.cancelledAt !== null && activation.cancelledAt <= renderTime)
      continue;
    const times = emitterSpawnTimes(project, layer, activation, time);
    for (
      let eventIndex = times.length - 1;
      eventIndex >= 0 &&
      instances.length < emitterLimit &&
      evaluationBudget.remaining > 0;
      eventIndex -= 1
    ) {
      const event = times[eventIndex];
      for (
        let copy = Math.min(layer.spawn.count, 25) - 1;
        copy >= 0 &&
        instances.length < emitterLimit &&
        evaluationBudget.remaining > 0;
        copy -= 1
      ) {
        const value = evaluate(
          activation,
          event.index * Math.max(1, layer.spawn.count) + copy,
          copy,
          event.time,
        );
        if (value) instances.push(value);
      }
    }
  }
  return instances.reverse();
}
