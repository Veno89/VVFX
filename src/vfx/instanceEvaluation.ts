import { evaluateBehavior, movementProgress } from "./behaviors";
import { animationProgress, applyEasing } from "./interpolation";
import { evaluateTransformKeyframes } from "./keyframes";
import { evaluateMotionPath } from "./motionPath";
import { randomBetween, randomSigned } from "./random";
import { sampleAlphaMaskOffset } from "./alphaMask";
import type { LayerActivationContext, VfxLayer, VfxProject } from "./types";
import { isSpawnLayer } from "./types";
import type { LayerActivation, LayerActivationSchedule } from "./events";

export const MAX_EMITTER_SPAWN_EVENTS = 1001;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const STRATIFIED_RADIUS_SALT = 6101;
const STRATIFIED_ANGLE_SALT = 6102;
const STRATIFIED_ROTATION_SALT = 6103;
const CLUSTER_ANCHOR_SALT = 6200;
const CLUSTER_JITTER_ANGLE_SALT = 6301;
const CLUSTER_JITTER_RADIUS_SALT = 6302;
const CLUSTER_JITTER_LINEAR_SALT = 6303;

export interface EmitterSpawnEvent {
  time: number;
  index: number;
}

export interface CopySpawnDescriptor {
  instanceIndex: number;
  copyIndex: number;
  spawnTime: number;
  seed: number;
  duration: number;
  delayedSpawn: number;
  deathTime: number;
}

export interface EvaluatedInstanceSpatialState {
  seed: number;
  duration: number;
  delayedSpawn: number;
  elapsed: number;
  lifetimeProgress: number;
  rawProgress: number;
  progress: number;
  behavior: ReturnType<typeof evaluateBehavior>;
  keyed: ReturnType<typeof evaluateTransformKeyframes>;
  x: number;
  y: number;
  rotation: number;
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
 * Null-context playback preserves the original seed calculation exactly.
 * Spatial chains add their source-copy seed without replacing authored seed.
 */
export function layerInstanceSeed(
  project: Pick<VfxProject, "preview">,
  layer: Pick<VfxLayer, "id">,
  activationOrdinal: number,
  instanceIndex: number,
  contextSeed?: number,
): number {
  let seed =
    (project.preview.randomSeed ^
      stringHash(layer.id) ^
      Math.imul(instanceIndex + 1, 2654435761)) >>>
    0;
  if (activationOrdinal > 0)
    seed = (seed ^ Math.imul(activationOrdinal, 2246822519)) >>> 0;
  if (contextSeed !== undefined)
    seed = (seed ^ Math.imul(contextSeed ^ 0x9e3779b9, 3266489917)) >>> 0;
  return seed;
}

export function emitterSpawnEvents(
  project: Pick<VfxProject, "preview">,
  layer: Extract<VfxLayer, { type: "emitter" }>,
  activation: LayerActivation,
  until: number,
): EmitterSpawnEvent[] {
  if (until < activation.start) return [];
  const times: EmitterSpawnEvent[] = [];
  let cursor = activation.start;
  let index = 0;
  const hardLimit = Math.min(
    MAX_EMITTER_SPAWN_EVENTS,
    Math.max(1, Math.ceil((Math.max(0, until - activation.start) + 30) / 30)),
  );
  while (cursor <= until && index < hardLimit) {
    times.push({ time: cursor, index });
    const seed = layerInstanceSeed(
      project,
      layer,
      activation.ordinal,
      index,
      activation.context?.seed,
    );
    cursor += randomBetween(
      seed,
      51,
      Math.max(30, layer.spawn.intervalMin),
      Math.max(30, layer.spawn.intervalMax),
    );
    index += 1;
  }
  return times;
}

export function instanceTiming(
  project: Pick<VfxProject, "preview">,
  layer: VfxLayer,
  activation: LayerActivation,
  instanceIndex: number,
  spawnTime: number,
) {
  const seed = layerInstanceSeed(
    project,
    layer,
    activation.ordinal,
    instanceIndex,
    activation.context?.seed,
  );
  const duration = Math.max(
    50,
    layer.timing.duration + randomSigned(seed, 4, layer.random.duration),
  );
  const delayedSpawn =
    spawnTime + randomBetween(seed, 5, 0, layer.random.delay);
  return {
    seed,
    duration,
    delayedSpawn,
    deathTime: delayedSpawn + duration,
  };
}

/** Enumerates authored copies, never renderer-only trail samples. */
export function* copySpawnDescriptors(
  project: Pick<VfxProject, "preview">,
  layer: Exclude<VfxLayer, { type: "static" }>,
  activation: LayerActivation,
  until: number,
): Generator<CopySpawnDescriptor> {
  if (until < activation.start) return;
  if (layer.type === "emitter") {
    const copies = Math.max(1, Math.min(25, Math.floor(layer.spawn.count)));
    for (const spawn of emitterSpawnEvents(project, layer, activation, until)) {
      for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
        const instanceIndex = spawn.index * copies + copyIndex;
        yield {
          instanceIndex,
          copyIndex,
          spawnTime: spawn.time,
          ...instanceTiming(
            project,
            layer,
            activation,
            instanceIndex,
            spawn.time,
          ),
        };
      }
    }
    return;
  }

  const cycleDuration = Math.max(50, layer.timing.duration);
  const requestedCycles =
    Math.floor(Math.max(0, until - activation.start) / cycleDuration) + 1;
  const cycleLimit =
    layer.timing.repeatForever || layer.timing.loop
      ? requestedCycles
      : Math.min(requestedCycles, Math.max(1, layer.timing.repeat + 1));
  const copies =
    layer.type === "burst"
      ? Math.max(1, Math.min(250, Math.floor(layer.spawn.count)))
      : 1;
  for (let cycle = 0; cycle < cycleLimit; cycle += 1) {
    const spawnTime = activation.start + cycle * cycleDuration;
    for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
      const instanceIndex = cycle * copies + copyIndex;
      yield {
        instanceIndex,
        copyIndex,
        spawnTime,
        ...instanceTiming(project, layer, activation, instanceIndex, spawnTime),
      };
    }
  }
}

type SpawnOffset = { x: number; y: number; angle: number };

function normalizedSpawnCount(layer: VfxLayer): number {
  if (!isSpawnLayer(layer)) return 1;
  return Math.max(
    1,
    Math.min(
      layer.type === "emitter" ? 25 : 250,
      Math.floor(layer.spawn.count),
    ),
  );
}

function stratifiedRectangleOffset(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  copyIndex: number,
): SpawnOffset {
  const count = normalizedSpawnCount(layer);
  const index = ((copyIndex % count) + count) % count;
  const width = Math.max(0, layer.spawn.width);
  const height = Math.max(0, layer.spawn.height);
  const aspect =
    width <= 0 && height <= 0
      ? 1
      : Math.max(0.000001, width / Math.max(0.000001, height));
  const rows = Math.max(
    1,
    Math.min(count, Math.round(Math.sqrt(count / aspect))),
  );
  const baseColumns = Math.floor(count / rows);
  const widerRows = count % rows;
  const widerRowSize = baseColumns + 1;
  const widerCopies = widerRows * widerRowSize;
  const row =
    index < widerCopies
      ? Math.floor(index / widerRowSize)
      : widerRows + Math.floor((index - widerCopies) / baseColumns);
  const columns = row < widerRows ? widerRowSize : baseColumns;
  const column =
    index < widerCopies
      ? index % widerRowSize
      : (index - widerCopies) % baseColumns;
  const jitter = Math.max(0, Math.min(1, layer.spawn.stratifiedJitter));
  const jitterX = randomBetween(seed, STRATIFIED_RADIUS_SALT, -0.5, 0.5);
  const jitterY = randomBetween(seed, STRATIFIED_ANGLE_SALT, -0.5, 0.5);
  const x =
    ((column + 0.5 + jitterX * jitter) / Math.max(1, columns) - 0.5) * width;
  const y = ((row + 0.5 + jitterY * jitter) / rows - 0.5) * height;
  return { x, y, angle: Math.atan2(y, x) };
}

function stratifiedCircleOffset(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  batchSeed: number,
  copyIndex: number,
): SpawnOffset {
  const count = normalizedSpawnCount(layer);
  const index = ((copyIndex % count) + count) % count;
  const jitter = Math.max(0, Math.min(1, layer.spawn.stratifiedJitter));
  const radialJitter = randomBetween(seed, STRATIFIED_RADIUS_SALT, -0.5, 0.5);
  const areaRatio = Math.max(
    0,
    Math.min(1, (index + 0.5 + radialJitter * jitter) / count),
  );
  const rotation = randomBetween(
    batchSeed,
    STRATIFIED_ROTATION_SALT,
    0,
    Math.PI * 2,
  );
  const angleJitter =
    randomBetween(seed, STRATIFIED_ANGLE_SALT, -1, 1) *
    jitter *
    (Math.PI / Math.sqrt(count));
  const angle = rotation + index * GOLDEN_ANGLE + angleJitter;
  const radius = Math.sqrt(areaRatio) * Math.max(0, layer.spawn.radius);
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return { x, y, angle: Math.atan2(y, x) };
}

const clusterAnchorRandom = (
  batchSeed: number,
  clusterIndex: number,
  channel: number,
  minimum: number,
  maximum: number,
) =>
  randomBetween(
    batchSeed,
    CLUSTER_ANCHOR_SALT + clusterIndex * 8 + channel,
    minimum,
    maximum,
  );

function clusterIndexFor(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  copyIndex: number,
): number {
  const count = Math.min(
    normalizedSpawnCount(layer),
    Math.max(2, Math.min(8, Math.floor(layer.spawn.clusterCount))),
  );
  return ((copyIndex % count) + count) % count;
}

function clusteredRectangleOffset(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  batchSeed: number,
  copyIndex: number,
): SpawnOffset {
  const clusterIndex = clusterIndexFor(layer, copyIndex);
  const spread = Math.max(0, Math.min(0.5, layer.spawn.clusterSpread));
  const width = Math.max(0, layer.spawn.width);
  const height = Math.max(0, layer.spawn.height);
  const localRadiusX = (width * spread) / 2;
  const localRadiusY = (height * spread) / 2;
  const anchorX = clusterAnchorRandom(
    batchSeed,
    clusterIndex,
    0,
    -width / 2 + localRadiusX,
    width / 2 - localRadiusX,
  );
  const anchorY = clusterAnchorRandom(
    batchSeed,
    clusterIndex,
    1,
    -height / 2 + localRadiusY,
    height / 2 - localRadiusY,
  );
  const jitterAngle = randomBetween(
    seed,
    CLUSTER_JITTER_ANGLE_SALT,
    0,
    Math.PI * 2,
  );
  const jitterRadius = Math.sqrt(
    randomBetween(seed, CLUSTER_JITTER_RADIUS_SALT, 0, 1),
  );
  const x = anchorX + Math.cos(jitterAngle) * jitterRadius * localRadiusX;
  const y = anchorY + Math.sin(jitterAngle) * jitterRadius * localRadiusY;
  return { x, y, angle: Math.atan2(y, x) };
}

function clusteredCircleOffset(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  batchSeed: number,
  copyIndex: number,
): SpawnOffset {
  const clusterIndex = clusterIndexFor(layer, copyIndex);
  const radius = Math.max(0, layer.spawn.radius);
  const spread = Math.max(0, Math.min(0.5, layer.spawn.clusterSpread));
  const localRadius = radius * spread;
  const anchorAngle = clusterAnchorRandom(
    batchSeed,
    clusterIndex,
    0,
    0,
    Math.PI * 2,
  );
  const anchorRadius =
    Math.sqrt(clusterAnchorRandom(batchSeed, clusterIndex, 1, 0, 1)) *
    Math.max(0, radius - localRadius);
  const jitterAngle = randomBetween(
    seed,
    CLUSTER_JITTER_ANGLE_SALT,
    0,
    Math.PI * 2,
  );
  const jitterRadius =
    Math.sqrt(randomBetween(seed, CLUSTER_JITTER_RADIUS_SALT, 0, 1)) *
    localRadius;
  const x =
    Math.cos(anchorAngle) * anchorRadius + Math.cos(jitterAngle) * jitterRadius;
  const y =
    Math.sin(anchorAngle) * anchorRadius + Math.sin(jitterAngle) * jitterRadius;
  return { x, y, angle: Math.atan2(y, x) };
}

function clusteredLinearRatio(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  batchSeed: number,
  copyIndex: number,
  closed: boolean,
): number {
  const clusterIndex = clusterIndexFor(layer, copyIndex);
  const halfSpan = Math.max(0, Math.min(0.25, layer.spawn.clusterSpread / 2));
  const anchor = clusterAnchorRandom(
    batchSeed,
    clusterIndex,
    0,
    closed ? 0 : halfSpan,
    closed ? 1 : 1 - halfSpan,
  );
  const offset = randomBetween(
    seed,
    CLUSTER_JITTER_LINEAR_SALT,
    -halfSpan,
    halfSpan,
  );
  if (closed) return (anchor + offset + 1) % 1;
  return Math.max(0, Math.min(1, anchor + offset));
}

function clusteredLineOffset(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  batchSeed: number,
  copyIndex: number,
): SpawnOffset {
  const ratio = clusteredLinearRatio(layer, seed, batchSeed, copyIndex, false);
  const lineAngle = (layer.spawn.lineAngle * Math.PI) / 180;
  const distance = (ratio - 0.5) * layer.spawn.lineLength;
  const angle =
    Math.abs(distance) < 0.0001
      ? lineAngle + (copyIndex % 2 === 0 ? 0 : Math.PI)
      : distance < 0
        ? lineAngle + Math.PI
        : lineAngle;
  return {
    x: Math.cos(lineAngle) * distance,
    y: Math.sin(lineAngle) * distance,
    angle,
  };
}

function clusteredArcOffset(
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
  seed: number,
  batchSeed: number,
  copyIndex: number,
): SpawnOffset {
  const ratio = clusteredLinearRatio(
    layer,
    seed,
    batchSeed,
    copyIndex,
    Math.abs(layer.spawn.arcSweep) >= 359.999,
  );
  const angle =
    ((layer.spawn.arcStartAngle + layer.spawn.arcSweep * ratio) * Math.PI) /
    180;
  return {
    x: Math.cos(angle) * layer.spawn.radius,
    y: Math.sin(angle) * layer.spawn.radius,
    angle,
  };
}

/**
 * Pure seeded start-position evaluation shared by preview and runtime playback.
 * Pass one stable batchSeed for every copy that should share cluster anchors.
 */
export function evaluateSpawnOffset(
  project: Pick<VfxProject, "assets">,
  layer: VfxLayer,
  seed: number,
  copyIndex: number,
  batchSeed = seed,
): SpawnOffset | null {
  if (!isSpawnLayer(layer) || layer.spawn.shape === "point")
    return { x: 0, y: 0, angle: 0 };
  if (layer.spawn.shape === "mask") {
    const mask = project.assets.find(
      (asset) => asset.id === layer.spawn.maskAssetId,
    )?.alphaMask;
    if (!mask) return null;
    return sampleAlphaMaskOffset(
      mask,
      layer.spawn.maskThreshold,
      layer.spawn.maskSize,
      seed,
    );
  }
  if (layer.spawn.distribution === "stratified") {
    if (layer.spawn.shape === "rectangle")
      return stratifiedRectangleOffset(layer, seed, copyIndex);
    if (layer.spawn.shape === "circle")
      return stratifiedCircleOffset(layer, seed, batchSeed, copyIndex);
  }
  if (layer.spawn.distribution === "clusters") {
    if (layer.spawn.shape === "rectangle")
      return clusteredRectangleOffset(layer, seed, batchSeed, copyIndex);
    if (layer.spawn.shape === "circle")
      return clusteredCircleOffset(layer, seed, batchSeed, copyIndex);
    if (layer.spawn.shape === "line")
      return clusteredLineOffset(layer, seed, batchSeed, copyIndex);
    if (layer.spawn.shape === "arc")
      return clusteredArcOffset(layer, seed, batchSeed, copyIndex);
  }
  const randomRatio = randomBetween(seed, 33, 0, 1);
  const ratio =
    layer.spawn.distribution === "even"
      ? (copyIndex % Math.max(1, layer.spawn.count)) /
        Math.max(1, layer.spawn.count)
      : randomRatio;
  if (layer.spawn.shape === "rectangle") {
    let x: number;
    let y: number;
    if (
      layer.spawn.distribution === "edge" ||
      layer.spawn.distribution === "even"
    ) {
      const width = Math.max(0, layer.spawn.width);
      const height = Math.max(0, layer.spawn.height);
      const perimeter = Math.max(1, 2 * (width + height));
      let distance = ratio * perimeter;
      if (distance <= width) {
        x = -width / 2 + distance;
        y = -height / 2;
      } else if ((distance -= width) <= height) {
        x = width / 2;
        y = -height / 2 + distance;
      } else if ((distance -= height) <= width) {
        x = width / 2 - distance;
        y = height / 2;
      } else {
        distance -= width;
        x = -width / 2;
        y = height / 2 - distance;
      }
    } else if (layer.spawn.distribution === "clustered") {
      x =
        ((randomBetween(seed, 31, 0, 1) + randomBetween(seed, 35, 0, 1)) / 2 -
          0.5) *
        layer.spawn.width;
      y =
        ((randomBetween(seed, 32, 0, 1) + randomBetween(seed, 36, 0, 1)) / 2 -
          0.5) *
        layer.spawn.height;
    } else {
      x = randomBetween(
        seed,
        31,
        -layer.spawn.width / 2,
        layer.spawn.width / 2,
      );
      y = randomBetween(
        seed,
        32,
        -layer.spawn.height / 2,
        layer.spawn.height / 2,
      );
    }
    return { x, y, angle: Math.atan2(y, x) };
  }
  if (layer.spawn.shape === "line") {
    const lineRatio =
      layer.spawn.distribution === "even" || layer.spawn.distribution === "edge"
        ? layer.spawn.count <= 1
          ? 0.5
          : copyIndex / (layer.spawn.count - 1)
        : layer.spawn.distribution === "clustered"
          ? (randomRatio + randomBetween(seed, 37, 0, 1)) / 2
          : randomRatio;
    const lineAngle = (layer.spawn.lineAngle * Math.PI) / 180;
    const distance = (lineRatio - 0.5) * layer.spawn.lineLength;
    const angle =
      Math.abs(distance) < 0.0001
        ? lineAngle + (copyIndex % 2 === 0 ? 0 : Math.PI)
        : distance < 0
          ? lineAngle + Math.PI
          : lineAngle;
    return {
      x: Math.cos(lineAngle) * distance,
      y: Math.sin(lineAngle) * distance,
      angle,
    };
  }
  if (layer.spawn.shape === "arc") {
    const closed = Math.abs(layer.spawn.arcSweep) >= 359.999;
    const arcRatio =
      layer.spawn.distribution === "even" || layer.spawn.distribution === "edge"
        ? layer.spawn.count <= 1
          ? 0.5
          : copyIndex / (closed ? layer.spawn.count : layer.spawn.count - 1)
        : layer.spawn.distribution === "clustered"
          ? (randomRatio + randomBetween(seed, 37, 0, 1)) / 2
          : randomRatio;
    const angle =
      ((layer.spawn.arcStartAngle + layer.spawn.arcSweep * arcRatio) *
        Math.PI) /
      180;
    return {
      x: Math.cos(angle) * layer.spawn.radius,
      y: Math.sin(angle) * layer.spawn.radius,
      angle,
    };
  }
  const angle = ratio * Math.PI * 2 - Math.PI / 2;
  const radius =
    layer.spawn.distribution === "edge" || layer.spawn.distribution === "even"
      ? layer.spawn.radius
      : layer.spawn.distribution === "clustered"
        ? randomBetween(seed, 34, 0, 1) ** 2 * layer.spawn.radius
        : Math.sqrt(randomBetween(seed, 34, 0, 1)) * layer.spawn.radius;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle };
}

function movementFor(
  layer: VfxLayer,
  seed: number,
  spawnAngle: number,
): { x: number; y: number; angle: number } {
  const rawX =
    layer.transform.movementX + randomSigned(seed, 41, layer.random.movementX);
  const rawY =
    layer.transform.movementY + randomSigned(seed, 42, layer.random.movementY);
  if (!isSpawnLayer(layer) || layer.spawn.direction === "random") {
    if (isSpawnLayer(layer) && layer.spawn.direction === "random") {
      const angle = randomBetween(seed, 43, 0, Math.PI * 2);
      const distance = Math.max(1, Math.hypot(rawX, rawY));
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        angle,
      };
    }
    return { x: rawX, y: rawY, angle: Math.atan2(rawY, rawX) };
  }

  let angle = spawnAngle;
  if (layer.spawn.direction === "outward" && Math.abs(angle) < 0.0001) {
    angle = randomBetween(seed, 44, 0, Math.PI * 2);
  } else if (layer.spawn.direction === "inward") {
    angle += Math.PI;
  } else if (layer.spawn.direction === "fixed") {
    angle =
      ((layer.spawn.directionAngle +
        randomSigned(seed, 45, layer.spawn.directionSpread)) *
        Math.PI) /
      180;
  } else if (layer.spawn.direction === "tangent") {
    angle += Math.PI / 2;
  }
  const distance = Math.max(1, Math.hypot(rawX, rawY));
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    angle,
  };
}

function contextsMatch(
  left: LayerActivationContext | null,
  right: LayerActivationContext | null,
) {
  return left?.id === right?.id && Boolean(left) === Boolean(right);
}

function parentPosition(
  project: VfxProject,
  layer: VfxLayer,
  time: number,
  schedule: LayerActivationSchedule,
  context: LayerActivationContext | null,
  visited = new Set<string>(),
): { x: number; y: number } {
  if (!layer.parentId || visited.has(layer.id)) return { x: 0, y: 0 };
  const parent = project.layers.find(
    (candidate) => candidate.id === layer.parentId,
  );
  if (!parent) return { x: 0, y: 0 };
  visited.add(layer.id);
  const inherited = parentPosition(
    project,
    parent,
    time,
    schedule,
    context,
    visited,
  );
  const candidates = [...(schedule.byLayer.get(parent.id) ?? [])].reverse();
  const activeAtTime = (candidate: LayerActivation) =>
    candidate.start <= time &&
    (candidate.cancelledAt === null || time < candidate.cancelledAt);
  const activation =
    candidates.find(
      (candidate) =>
        activeAtTime(candidate) && contextsMatch(candidate.context, context),
    ) ?? candidates.find(activeAtTime);
  const elapsed = Math.max(0, time - (activation?.start ?? time));
  const rawProgress =
    parent.type === "static"
      ? 0
      : animationProgress(elapsed, parent.timing.duration, parent.timing.yoyo);
  const progress = applyEasing(
    parent.timing.easing,
    rawProgress,
    parent.timing.customEasing,
  );
  const motion = evaluateMotionPath(
    parent.motionPath,
    {
      x: parent.transform.movementX,
      y: parent.transform.movementY,
    },
    movementProgress(progress, parent.behavior.physics.drag),
  );
  const parentSeed = layerInstanceSeed(
    project,
    parent,
    activation?.ordinal ?? 0,
    0,
    activation?.context?.seed,
  );
  const behavior = evaluateBehavior(
    parent.behavior,
    elapsed,
    parent.timing.duration,
    parentSeed,
  );
  return {
    x: inherited.x + parent.transform.x + motion.x + behavior.x,
    y: inherited.y + parent.transform.y + motion.y + behavior.y,
  };
}

export function evaluateInstanceSpatialState(
  project: VfxProject,
  layer: VfxLayer,
  activation: LayerActivation,
  schedule: LayerActivationSchedule,
  instanceIndex: number,
  copyIndex: number,
  spawnTime: number,
  time: number,
): EvaluatedInstanceSpatialState | null {
  const timing = instanceTiming(
    project,
    layer,
    activation,
    instanceIndex,
    spawnTime,
  );
  const elapsed = time - timing.delayedSpawn;
  if (elapsed < 0 || elapsed > timing.duration) return null;
  const lifetimeProgress = animationProgress(
    elapsed,
    timing.duration,
    layer.type === "static" ? false : layer.timing.yoyo,
  );
  const rawProgress = layer.type === "static" ? 0 : lifetimeProgress;
  const progress = applyEasing(
    layer.timing.easing,
    rawProgress,
    layer.timing.customEasing,
  );
  const batchSeed = isSpawnLayer(layer)
    ? layerInstanceSeed(
        project,
        layer,
        activation.ordinal,
        Math.max(0, instanceIndex - copyIndex),
        activation.context?.seed,
      )
    : timing.seed;
  const offset = evaluateSpawnOffset(
    project,
    layer,
    timing.seed,
    copyIndex,
    batchSeed,
  );
  if (!offset) return null;
  const movement = movementFor(layer, timing.seed, offset.angle);
  const pathMotion = evaluateMotionPath(
    layer.motionPath,
    movement,
    movementProgress(progress, layer.behavior.physics.drag),
  );
  const behavior = evaluateBehavior(
    layer.behavior,
    elapsed,
    timing.duration,
    timing.seed,
  );
  const parent = parentPosition(
    project,
    layer,
    time,
    schedule,
    activation.context,
  );
  const keyed = evaluateTransformKeyframes(
    layer.keyframes,
    rawProgress,
    (value) =>
      applyEasing(layer.timing.easing, value, layer.timing.customEasing),
  );
  let rotation =
    layer.transform.rotation +
    randomSigned(timing.seed, 14, layer.random.rotation) +
    (keyed?.rotation ?? layer.transform.rotationDuring * progress);
  if (isSpawnLayer(layer) && layer.spawn.rotateToDirection) {
    rotation =
      (movement.angle * 180) / Math.PI +
      layer.transform.rotation -
      layer.spawn.artworkForwardAngle +
      randomSigned(timing.seed, 14, layer.random.rotation) +
      randomSigned(timing.seed, 46, layer.spawn.alignmentVariation) +
      (keyed?.rotation ?? layer.transform.rotationDuring * progress);
  }
  if (layer.motionPath.enabled && layer.motionPath.orientToPath) {
    const artworkForwardAngle = isSpawnLayer(layer)
      ? layer.spawn.artworkForwardAngle
      : 0;
    const alignmentVariation = isSpawnLayer(layer)
      ? randomSigned(timing.seed, 46, layer.spawn.alignmentVariation)
      : 0;
    rotation =
      layer.transform.rotation +
      randomSigned(timing.seed, 14, layer.random.rotation) +
      (keyed?.rotation ?? layer.transform.rotationDuring * progress) +
      pathMotion.angle -
      artworkForwardAngle +
      alignmentVariation;
  }

  return {
    ...timing,
    elapsed,
    lifetimeProgress,
    rawProgress,
    progress,
    behavior,
    keyed,
    x:
      (activation.context?.x ?? 0) +
      parent.x +
      layer.transform.x +
      offset.x +
      randomSigned(timing.seed, 21, layer.random.positionX) +
      pathMotion.x +
      behavior.x,
    y:
      (activation.context?.y ?? 0) +
      parent.y +
      layer.transform.y +
      offset.y +
      randomSigned(timing.seed, 22, layer.random.positionY) +
      pathMotion.y +
      behavior.y,
    rotation: rotation + behavior.rotation,
  };
}
