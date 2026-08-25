import { interpolateColorStops } from "./color";
import {
  compileLayerActivations,
  type LayerActivation,
  type LayerActivationSchedule,
} from "./events";
import {
  emitterSpawnEvents,
  evaluateInstanceSpatialState,
} from "./instanceEvaluation";
import { lerp } from "./interpolation";
import { resolveProjectGroups } from "./groups";
import { randomSigned } from "./random";
import { evaluateRenderingEffects } from "./renderingEffects";
import { spriteFrameAtTime } from "./spriteSheet";
import type {
  BeamEndpoints,
  EvaluatedInstance,
  VfxLayer,
  VfxProject,
} from "./types";

export const MAX_EFFECT_INSTANCES = 500;

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
  const { seed, elapsed, lifetimeProgress, progress, behavior, keyed } =
    spatial;
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
  const scaleY = keyed
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
  if (layer.type === "beam") {
    const endpoints = beamEndpoints[layer.id] ?? {
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
    x = (endpoints.startX + endpoints.endX) / 2;
    y = (endpoints.startY + endpoints.endY) / 2;
    rotation = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
    scaleX = Math.hypot(deltaX, deltaY) / sourceWidth;
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
      lifetimeProgress: progress,
      elapsedMs: Math.max(0, elapsed),
      seed,
    }),
    selected: selectedId === layer.id,
    frame,
    trailIndex: null,
  };
}

function repeatingSpawnTimes(
  layer: VfxLayer,
  activation: LayerActivation,
  time: number,
): number[] {
  const cycleDuration = Math.max(50, layer.timing.duration);
  const local = time - activation.start;
  if (local < 0) return [];
  const currentCycle = Math.floor(local / cycleDuration);
  const allowedCycles =
    layer.timing.repeatForever || layer.timing.loop
      ? Infinity
      : layer.timing.repeat + 1;
  const firstCycle = Math.max(
    0,
    currentCycle -
      Math.ceil(
        (layer.timing.duration + layer.random.duration + layer.random.delay) /
          cycleDuration,
      ),
  );
  const times: number[] = [];
  for (
    let cycle = firstCycle;
    cycle <= currentCycle && cycle < allowedCycles;
    cycle += 1
  )
    times.push(activation.start + cycle * cycleDuration);
  return times;
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

export function evaluateProject(
  project: VfxProject,
  time: number,
  selectedId: string | null,
  beamEndpoints: Readonly<Record<string, BeamEndpoints>> = {},
): EvaluatedInstance[] {
  const resolvedProject = resolveProjectGroups(project);
  const schedule = compileLayerActivations(resolvedProject, time);
  const originals: EvaluatedInstance[] = [];
  const trails: EvaluatedInstance[] = [];
  const soloIds = new Set(
    resolvedProject.layers
      .filter((layer) => layer.solo)
      .map((layer) => layer.id),
  );

  for (const layer of resolvedProject.layers) {
    if (
      !layer.enabled ||
      !layer.visible ||
      (soloIds.size > 0 && !soloIds.has(layer.id))
    )
      continue;
    const current = evaluateLayer(
      resolvedProject,
      layer,
      time,
      selectedId,
      schedule,
      time,
      beamEndpoints,
    );
    originals.push(...current);

    if (layer.trail.enabled) {
      const count = Math.max(1, Math.min(16, Math.floor(layer.trail.count)));
      const spacing = Math.max(10, layer.trail.spacing);
      const lifetime = Math.max(50, layer.trail.lifetime);
      // Newest samples are the most useful. Stop producing candidates once the
      // shared effect budget is full instead of allocating discarded trails.
      for (
        let trailIndex = 1;
        trailIndex <= count && trails.length < MAX_EFFECT_INSTANCES;
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
        for (const instance of evaluateLayer(
          resolvedProject,
          layer,
          time - age,
          null,
          schedule,
          time,
          beamEndpoints,
        )) {
          if (trails.length >= MAX_EFFECT_INSTANCES) break;
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

    if (originals.length >= MAX_EFFECT_INSTANCES) break;
  }

  const visibleOriginals = originals.slice(0, MAX_EFFECT_INSTANCES);
  const trailCapacity = MAX_EFFECT_INSTANCES - visibleOriginals.length;
  const visibleTrails = trails
    .slice(0, trailCapacity)
    .sort((left, right) => (right.trailIndex ?? 0) - (left.trailIndex ?? 0));
  return [...visibleTrails, ...visibleOriginals];
}

function evaluateLayer(
  project: VfxProject,
  layer: VfxLayer,
  time: number,
  selectedId: string | null,
  schedule: LayerActivationSchedule,
  renderTime: number,
  beamEndpoints: Readonly<Record<string, BeamEndpoints>>,
): EvaluatedInstance[] {
  const instances: EvaluatedInstance[] = [];
  const activations = schedule.byLayer.get(layer.id) ?? [];

  if (layer.type === "static") {
    for (const activation of activations) {
      if (
        activation.cancelledAt !== null &&
        activation.cancelledAt <= renderTime
      )
        continue;
      const value = evaluateOne(
        project,
        layer,
        activation,
        schedule,
        selectedId,
        0,
        0,
        activation.start,
        time,
        beamEndpoints,
      );
      if (value) instances.push(value);
    }
    return instances;
  }

  if (layer.type === "animated" || layer.type === "beam") {
    for (const activation of activations) {
      if (
        activation.cancelledAt !== null &&
        activation.cancelledAt <= renderTime
      )
        continue;
      for (const spawnTime of repeatingSpawnTimes(layer, activation, time)) {
        const cycle = Math.max(
          0,
          Math.round(
            (spawnTime - activation.start) /
              Math.max(50, layer.timing.duration),
          ),
        );
        const value = evaluateOne(
          project,
          layer,
          activation,
          schedule,
          selectedId,
          cycle,
          0,
          spawnTime,
          time,
          beamEndpoints,
        );
        if (value) instances.push(value);
      }
    }
    return instances;
  }

  if (layer.type === "burst") {
    for (const activation of activations) {
      if (
        activation.cancelledAt !== null &&
        activation.cancelledAt <= renderTime
      )
        continue;
      for (const spawnTime of repeatingSpawnTimes(layer, activation, time)) {
        const cycle = Math.max(
          0,
          Math.round(
            (spawnTime - activation.start) /
              Math.max(50, layer.timing.duration),
          ),
        );
        for (
          let index = 0;
          index < Math.min(layer.spawn.count, 250);
          index += 1
        ) {
          const value = evaluateOne(
            project,
            layer,
            activation,
            schedule,
            selectedId,
            cycle * Math.max(1, layer.spawn.count) + index,
            index,
            spawnTime,
            time,
            beamEndpoints,
          );
          if (value) instances.push(value);
        }
      }
    }
    return instances;
  }

  for (const activation of activations) {
    if (activation.cancelledAt !== null && activation.cancelledAt <= renderTime)
      continue;
    const times = emitterSpawnTimes(project, layer, activation, time);
    times.forEach((event) => {
      for (let copy = 0; copy < Math.min(layer.spawn.count, 25); copy += 1) {
        const value = evaluateOne(
          project,
          layer,
          activation,
          schedule,
          selectedId,
          event.index * Math.max(1, layer.spawn.count) + copy,
          copy,
          event.time,
          time,
          beamEndpoints,
        );
        if (value) instances.push(value);
      }
    });
  }
  return instances.slice(-Math.max(1, layer.spawn.maxAlive));
}
