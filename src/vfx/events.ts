import {
  copySpawnDescriptors,
  emitterSpawnEvents,
  evaluateInstanceSpatialState,
  type CopySpawnDescriptor,
} from "./instanceEvaluation";
import { seededRandom } from "./random";
import type { LayerActivationContext, VfxLayer, VfxProject } from "./types";

export { emitterSpawnEvents, layerInstanceSeed } from "./instanceEvaluation";
export type { EmitterSpawnEvent } from "./instanceEvaluation";

export const MAX_EVENTS_PER_LAYER = 16;
export const MAX_EVENT_DEPTH = 12;
export const MAX_EVENT_ACTIVATIONS = 1000;
const MAX_QUEUED_EVENT_TRIGGERS = 4000;

export interface LayerActivation {
  id: string;
  layerId: string;
  /** Stable within one layer and independent of the requested playhead time. */
  ordinal: number;
  /** Timeline origin for ordinary playback, or the event time for a replay. */
  origin: number;
  /** The visible start after applying the layer's existing delay. */
  start: number;
  /** Nominal authored end. Continuous layers use Infinity. */
  end: number;
  /** Restart cancels the old activation at this exact absolute time. */
  cancelledAt: number | null;
  depth: number;
  /** Null for legacy Timeline playback; set for a spatial event chain. */
  context: LayerActivationContext | null;
}

export interface LayerActivationSchedule {
  activations: LayerActivation[];
  byLayer: Map<string, LayerActivation[]>;
  truncated: boolean;
}

interface PendingLayerEvent {
  time: number;
  depth: number;
  sourceLayerIndex: number;
  sourceActivationOrdinal: number;
  eventIndex: number;
  activation: LayerActivation;
  targetLayerId: string;
  action: "play" | "restart";
  context: LayerActivationContext | null;
  copy: CopySpawnDescriptor | null;
}

function stringHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Keeps legacy timeline activation zero byte-for-byte seed compatible while
 * giving later event activations their own deterministic variation stream.
 */
function cycleCount(layer: VfxLayer): number {
  if (layer.type === "static" || layer.type === "emitter") return 1;
  return Math.max(1, layer.timing.repeat + 1);
}

function activationEnd(layer: VfxLayer, start: number): number {
  if (
    layer.type === "emitter" ||
    layer.timing.repeatForever ||
    layer.timing.loop
  )
    return Infinity;
  return start + Math.max(50, layer.timing.duration) * cycleCount(layer);
}

export function activationEffectiveEnd(activation: LayerActivation): number {
  return activation.cancelledAt === null
    ? activation.end
    : Math.min(activation.end, activation.cancelledAt);
}

export function activationIsPendingOrActiveAt(
  activation: LayerActivation,
  time: number,
): boolean {
  return activation.origin <= time && time < activationEffectiveEnd(activation);
}

function pendingEventOrder(left: PendingLayerEvent, right: PendingLayerEvent) {
  return (
    left.time - right.time ||
    left.depth - right.depth ||
    left.sourceLayerIndex - right.sourceLayerIndex ||
    left.sourceActivationOrdinal - right.sourceActivationOrdinal ||
    (left.copy?.instanceIndex ?? -1) - (right.copy?.instanceIndex ?? -1) ||
    left.eventIndex - right.eventIndex
  );
}

/**
 * Compiles event playback from absolute time. It deliberately owns no mutable
 * playback state, so a direct seek and frame-by-frame playback produce the
 * same activations.
 */
export function compileLayerActivations(
  project: VfxProject,
  evaluationTime: number,
): LayerActivationSchedule {
  const until = Math.max(0, evaluationTime);
  const byLayer = new Map<string, LayerActivation[]>();
  const activations: LayerActivation[] = [];
  const activationCounts = new Map<string, number>();
  const layerIndex = new Map(
    project.layers.map((layer, index) => [layer.id, index]),
  );
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));
  const queue: PendingLayerEvent[] = [];
  let queuedTriggerCount = 0;
  let truncated = false;

  const enqueue = (event: PendingLayerEvent): boolean => {
    if (event.time > until) return true;
    if (queuedTriggerCount >= MAX_QUEUED_EVENT_TRIGGERS) {
      truncated = true;
      return false;
    }
    queuedTriggerCount += 1;
    queue.push(event);
    return true;
  };

  const enqueueActivationEvents = (
    layer: VfxLayer,
    activation: LayerActivation,
  ) => {
    const sourceLayerIndex = layerIndex.get(layer.id) ?? 0;
    layer.events.forEach((event, eventIndex) => {
      if (!event.enabled) return;
      const pushAt = (time: number) =>
        enqueue({
          time,
          depth: activation.depth,
          sourceLayerIndex,
          sourceActivationOrdinal: activation.ordinal,
          eventIndex,
          activation,
          targetLayerId: event.targetLayerId,
          action: event.action,
          context: activation.context,
          copy: null,
        });

      if (event.trigger === "copy-finish") {
        if (layer.type === "static") return;
        let accepted = 0;
        const chance = Math.max(0, Math.min(1, event.chance ?? 1));
        const maxTriggers = Math.max(
          1,
          Math.min(250, Math.floor(event.maxTriggers ?? 32)),
        );
        if (chance <= 0) return;
        const chanceSalt = stringHash(event.id);
        for (const copy of copySpawnDescriptors(
          project,
          layer,
          activation,
          until,
        )) {
          if (copy.deathTime > until) continue;
          if (seededRandom(copy.seed, chanceSalt) >= chance) continue;
          if (accepted >= maxTriggers) break;
          accepted += 1;
          if (
            !enqueue({
              time: copy.deathTime,
              depth: activation.depth,
              sourceLayerIndex,
              sourceActivationOrdinal: activation.ordinal,
              eventIndex,
              activation,
              targetLayerId: event.targetLayerId,
              action: event.action,
              context: null,
              copy,
            })
          )
            break;
        }
        return;
      }

      if (event.trigger === "start") {
        pushAt(activation.start);
        return;
      }

      if (layer.type === "emitter") {
        if (event.trigger !== "repeat") return;
        for (const spawn of emitterSpawnEvents(
          project,
          layer,
          activation,
          until,
        ).slice(1))
          pushAt(spawn.time);
        return;
      }

      const duration = Math.max(50, layer.timing.duration);
      const repeatsForever = layer.timing.repeatForever || layer.timing.loop;
      const cycles = repeatsForever
        ? Math.max(0, Math.floor((until - activation.start) / duration) + 1)
        : cycleCount(layer);

      if (event.trigger === "percentage") {
        for (let cycle = 0; cycle < cycles; cycle += 1)
          pushAt(
            activation.start +
              cycle * duration +
              duration * Math.max(0.01, Math.min(0.99, event.percentage)),
          );
        return;
      }

      if (event.trigger === "repeat") {
        for (let cycle = 1; cycle < cycles; cycle += 1)
          pushAt(activation.start + cycle * duration);
        return;
      }

      if (event.trigger === "finish" && Number.isFinite(activation.end))
        pushAt(activation.end);
    });
  };

  const addActivation = (
    layer: VfxLayer,
    origin: number,
    depth: number,
    context: LayerActivationContext | null = null,
  ): LayerActivation | null => {
    if (!layer.enabled) return null;
    if (
      depth > MAX_EVENT_DEPTH ||
      activations.length >= MAX_EVENT_ACTIVATIONS
    ) {
      truncated = true;
      return null;
    }
    const ordinal = activationCounts.get(layer.id) ?? 0;
    activationCounts.set(layer.id, ordinal + 1);
    const start = origin + Math.max(0, layer.timing.delay);
    const activation: LayerActivation = {
      id: `${layer.id}:activation:${ordinal}`,
      layerId: layer.id,
      ordinal,
      origin,
      start,
      end: activationEnd(layer, start),
      cancelledAt: null,
      depth,
      context,
    };
    activations.push(activation);
    const layerActivations = byLayer.get(layer.id) ?? [];
    layerActivations.push(activation);
    byLayer.set(layer.id, layerActivations);
    enqueueActivationEvents(layer, activation);
    return activation;
  };

  for (const layer of project.layers)
    if (layer.startMode === "timeline") addActivation(layer, 0, 0);

  while (queue.length > 0) {
    queue.sort(pendingEventOrder);
    const time = queue[0].time;
    const batch: PendingLayerEvent[] = [];
    while (queue.length > 0 && queue[0].time === time)
      batch.push(queue.shift() as PendingLayerEvent);

    const targetActions = new Map<
      string,
      {
        target: VfxLayer;
        action: "play" | "restart";
        depth: number;
        context: LayerActivationContext | null;
        order: number;
      }
    >();
    let actionOrder = 0;
    for (const pending of batch) {
      // Events exactly on a restart boundary still belong to that timestamp's
      // deterministic batch. Events strictly after cancellation do not fire.
      if (
        pending.activation.cancelledAt !== null &&
        pending.activation.cancelledAt < pending.time
      )
        continue;
      const target = layersById.get(pending.targetLayerId);
      if (!target?.enabled) continue;
      let context = pending.context;
      if (pending.copy) {
        const source = layersById.get(pending.activation.layerId);
        if (!source) continue;
        const state = evaluateInstanceSpatialState(
          project,
          source,
          pending.activation,
          { activations, byLayer, truncated },
          pending.copy.instanceIndex,
          pending.copy.copyIndex,
          pending.copy.spawnTime,
          pending.copy.deathTime,
        );
        if (!state) continue;
        context = {
          id: `${pending.activation.id}:copy:${pending.copy.instanceIndex}`,
          x: state.x,
          y: state.y,
          seed: pending.copy.seed,
        };
      }
      const depth = pending.depth + 1;
      const key = `${target.id}\u0000${context?.id ?? "timeline"}`;
      const existing = targetActions.get(key);
      if (!existing) {
        targetActions.set(key, {
          target,
          action: pending.action,
          depth,
          context,
          order: actionOrder,
        });
        actionOrder += 1;
      } else {
        existing.depth = Math.min(existing.depth, depth);
        if (pending.action === "restart") existing.action = "restart";
      }
    }

    const orderedActions = [...targetActions.values()].sort(
      (left, right) =>
        (layerIndex.get(left.target.id) ?? 0) -
          (layerIndex.get(right.target.id) ?? 0) || left.order - right.order,
    );
    for (const requested of orderedActions) {
      const target = requested.target;
      const existing = byLayer.get(target.id) ?? [];
      const sameContext = (activation: LayerActivation) =>
        activation.context?.id === requested.context?.id &&
        Boolean(activation.context) === Boolean(requested.context);
      if (requested.action === "restart") {
        for (const activation of existing) {
          if (
            sameContext(activation) &&
            activationIsPendingOrActiveAt(activation, time)
          )
            activation.cancelledAt = time;
        }
      } else if (
        existing.some(
          (activation) =>
            sameContext(activation) &&
            activationIsPendingOrActiveAt(activation, time),
        )
      ) {
        continue;
      }
      addActivation(target, time, requested.depth, requested.context);
    }
  }

  return { activations, byLayer, truncated };
}

export function findLayerEventCycle(layers: VfxLayer[]): string[] | null {
  const layerIds = new Set(layers.map((layer) => layer.id));
  const edges = new Map(
    layers.map((layer) => [
      layer.id,
      [...new Set(layer.events.map((event) => event.targetLayerId))].filter(
        (target) => layerIds.has(target),
      ),
    ]),
  );
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  const visit = (layerId: string): string[] | null => {
    if (visiting.has(layerId)) {
      const cycleStart = path.indexOf(layerId);
      return [...path.slice(Math.max(0, cycleStart)), layerId];
    }
    if (visited.has(layerId)) return null;
    visiting.add(layerId);
    path.push(layerId);
    for (const target of edges.get(layerId) ?? []) {
      const cycle = visit(target);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(layerId);
    visited.add(layerId);
    return null;
  };

  for (const layer of layers) {
    const cycle = visit(layer.id);
    if (cycle) return cycle;
  }
  return null;
}

export function maximumLayerEventDepth(layers: VfxLayer[]): number {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const memo = new Map<string, number>();
  const depthFrom = (layerId: string): number => {
    const cached = memo.get(layerId);
    if (cached !== undefined) return cached;
    const layer = byId.get(layerId);
    if (!layer) return 0;
    const depth = Math.max(
      0,
      ...layer.events.map((event) => 1 + depthFrom(event.targetLayerId)),
    );
    memo.set(layerId, depth);
    return depth;
  };
  return Math.max(0, ...layers.map((layer) => depthFrom(layer.id)));
}
