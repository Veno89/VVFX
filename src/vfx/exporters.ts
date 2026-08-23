import type { VvfxRuntimeDefinition } from "../../packages/phaser-runtime/src/types";
import { tintNumber } from "./color";
import { resolveProjectGroups } from "./groups";
import { hasEnabledRenderingEffects } from "./renderingEffects";
import { spriteFrameSequence } from "./spriteSheet";
import type { VfxLayer, VfxProject } from "./types";

const EASE_MAP = {
  constant: "Linear",
  "fast-slow": "Quad.easeOut",
  "slow-fast": "Quad.easeIn",
  smooth: "Sine.easeInOut",
  bounce: "Bounce.easeOut",
  overshoot: "Back.easeOut",
  elastic: "Elastic.easeOut",
} as const;

export function createRuntimeDefinition(
  project: VfxProject,
): VvfxRuntimeDefinition {
  const resolvedProject = resolveProjectGroups(project);
  return {
    format: "vvfx-runtime",
    formatVersion: 14,
    name: resolvedProject.metadata.name,
    duration: resolvedProject.preview.duration,
    seed: resolvedProject.preview.randomSeed,
    assets: resolvedProject.assets.map(
      ({
        id,
        name,
        dataUrl,
        builtIn,
        width,
        height,
        spriteSheet,
        atlasFrame,
        alphaMask,
      }) => ({
        id,
        name,
        source: dataUrl,
        builtIn,
        width,
        height,
        spriteSheet,
        atlasFrame,
        alphaMask,
      }),
    ),
    layers: resolvedProject.layers.map((layer, depth) => ({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      asset: layer.assetId,
      depth,
      enabled: layer.enabled,
      startMode: layer.startMode,
      events: layer.events,
      attachTo: layer.parentId,
      transform: layer.transform,
      timing: layer.timing,
      appearance: layer.appearance,
      behavior: layer.behavior,
      spawn: layer.spawn,
      random: layer.random,
      frameAnimation: layer.frameAnimation,
      trail: layer.trail,
      motionPath: layer.motionPath,
      keyframes: layer.keyframes,
    })),
  };
}

const codeString = (value: string) => JSON.stringify(value);
const codeComment = (value: string) =>
  value.replace(/[\r\n]+/g, " ").replace(/\*\//g, "* /");

function easingCode(layer: VfxLayer): string {
  if (layer.timing.easing === "custom")
    return `(value: number) => generatedCustomEasing(value, ${JSON.stringify(layer.timing.customEasing)})`;
  return codeString(EASE_MAP[layer.timing.easing]);
}

function framePlaybackCode(
  layer: VfxLayer,
  variable: string,
  project: VfxProject,
): string {
  const asset = project.assets.find((item) => item.id === layer.assetId);
  if (!asset?.spriteSheet) return "";
  const frames = spriteFrameSequence(asset, layer.frameAnimation);
  if (frames.length < 2) return "";
  const frameDelay = Math.max(
    1,
    Math.round(1000 / layer.frameAnimation.framesPerSecond),
  );
  return `

  const ${variable}Frames = ${JSON.stringify(frames)};
  let ${variable}FrameIndex = 0;
  let ${variable}FrameTimer: Phaser.Time.TimerEvent | undefined;
  timers.push(scene.time.delayedCall(${layer.timing.delay}, () => {
    if (!${variable}.active) return;
    ${variable}FrameTimer = scene.time.addEvent({
      delay: ${frameDelay},
      repeat: ${layer.frameAnimation.loop ? -1 : Math.max(0, frames.length - 2)},
      callback: () => {
        if (!${variable}.active) {
          ${variable}FrameTimer?.remove(false);
          return;
        }
        ${variable}FrameIndex = (${variable}FrameIndex + 1) % ${variable}Frames.length;
        ${variable}.setFrame(${variable}Frames[${variable}FrameIndex]);
      },
    });
    timers.push(${variable}FrameTimer);
  }));`;
}

function layerCode(
  layer: VfxLayer,
  index: number,
  project: VfxProject,
): string {
  const variable = `layer${index}`;
  const textureId = layer.assetId ?? "choose-an-asset";
  const texture = `textureKeys[${codeString(textureId)}] ?? ${codeString(textureId)}`;
  const tintLine = layer.appearance.tint
    ? `\n  ${variable}.setTint(0x${tintNumber(layer.appearance.tint, layer.appearance.tintStrength).toString(16).padStart(6, "0")});`
    : "";
  const blendLine =
    layer.appearance.blendMode === "add"
      ? `\n  ${variable}.setBlendMode(Phaser.BlendModes.ADD);`
      : "";

  if (layer.type === "static" || layer.type === "animated") {
    const asset = project.assets.find((item) => item.id === layer.assetId);
    const frames = asset?.spriteSheet
      ? spriteFrameSequence(asset, layer.frameAnimation)
      : [];
    const initialFrame = frames.length
      ? `, ${frames[0]}`
      : asset?.atlasFrame
        ? `, ${codeString(asset.atlasFrame)}`
        : "";
    const frameCode = framePlaybackCode(layer, variable, project);
    const hasMotionPath = layer.type === "animated" && layer.motionPath.enabled;
    const hasKeyframes =
      layer.type === "animated" &&
      layer.keyframes.enabled &&
      layer.keyframes.frames.length >= 2;
    const usesStateTween = hasMotionPath || hasKeyframes;
    const stateVariable = `${variable}${hasMotionPath ? "PathState" : "KeyframeState"}`;
    const firstKeyframe = hasKeyframes ? layer.keyframes.frames[0] : null;
    const initialScaleX =
      firstKeyframe?.scaleX ??
      (layer.transform.separateScale
        ? layer.transform.startScaleX
        : layer.transform.startScale);
    const initialScaleY =
      firstKeyframe?.scaleY ??
      (layer.transform.separateScale
        ? layer.transform.startScaleY
        : layer.transform.startScale);
    const initialOpacity =
      firstKeyframe?.opacity ?? layer.transform.startOpacity;
    const initialRotation =
      layer.transform.rotation + (firstKeyframe?.rotation ?? 0);
    const trailCode = layer.trail.enabled
      ? `
  cleanups.push(addMotionTrail(scene, ${variable}, {
    count: ${layer.trail.count},
    spacing: ${layer.trail.spacing},
    lifetime: ${layer.trail.lifetime},
    opacity: ${layer.trail.opacity},
    scaleFalloff: ${layer.trail.scaleFalloff},
    delay: ${layer.timing.delay},
  }));`
      : "";
    const repeatsForever = layer.timing.repeatForever || layer.timing.loop;
    const stateTweenCode = usesStateTween
      ? `

  const ${stateVariable} = { progress: 0 };
  const ${stateVariable}Ease = Phaser.Tweens.Builders.GetEaseFunction(${easingCode(layer)}) as (value: number) => number;
  tweens.push(scene.tweens.add({
    targets: ${stateVariable},
    progress: 1,
    delay: ${layer.timing.delay},
    duration: ${layer.timing.duration},
    ease: "Linear",
    yoyo: ${layer.timing.yoyo},
    repeat: ${repeatsForever ? -1 : layer.timing.repeat},
    onUpdate: () => {
      if (!${variable}.active) return;
      const rawProgress = ${stateVariable}.progress;
      const progress = ${stateVariable}Ease(rawProgress);${
        hasMotionPath
          ? `
      const point = evaluateGeneratedMotionPath(
        ${JSON.stringify(layer.motionPath)},
        { x: ${layer.transform.movementX}, y: ${layer.transform.movementY} },
        progress,
      );
      ${variable}.setPosition(
        originX + ${layer.transform.x} + point.x,
        originY + ${layer.transform.y} + point.y,
      );`
          : `
      ${variable}.setPosition(
        originX + ${layer.transform.x} + ${layer.transform.movementX} * progress,
        originY + ${layer.transform.y} + ${layer.transform.movementY} * progress,
      );`
      }${
        hasKeyframes
          ? `
      const keyframe = evaluateGeneratedKeyframes(${JSON.stringify(layer.keyframes.frames)}, rawProgress, ${stateVariable}Ease);
      ${variable}.setScale(keyframe.scaleX, keyframe.scaleY);
      ${variable}.setAlpha(keyframe.opacity);
      ${variable}.setAngle(${layer.transform.rotation} + keyframe.rotation${hasMotionPath && layer.motionPath.orientToPath ? " + point.angle" : ""});`
          : `
      ${variable}.setScale(
        ${layer.transform.separateScale ? layer.transform.startScaleX : layer.transform.startScale} + (${layer.transform.separateScale ? layer.transform.endScaleX : layer.transform.endScale} - ${layer.transform.separateScale ? layer.transform.startScaleX : layer.transform.startScale}) * progress,
        ${layer.transform.separateScale ? layer.transform.startScaleY : layer.transform.startScale} + (${layer.transform.separateScale ? layer.transform.endScaleY : layer.transform.endScale} - ${layer.transform.separateScale ? layer.transform.startScaleY : layer.transform.startScale}) * progress,
      );
      ${variable}.setAlpha(${layer.transform.startOpacity} + (${layer.transform.endOpacity} - ${layer.transform.startOpacity}) * progress);
      ${variable}.setAngle(${layer.transform.rotation} + ${layer.transform.rotationDuring} * progress${hasMotionPath && layer.motionPath.orientToPath ? " + point.angle" : ""});`
      }
    },
    ${repeatsForever ? "" : `onComplete: () => ${variable}.destroy(),`}
  }));`
      : "";
    const lifecycleCode =
      layer.type === "static"
        ? `\n  timers.push(scene.time.delayedCall(${project.preview.duration}, () => ${variable}.destroy()));`
        : usesStateTween
          ? stateTweenCode
          : `

  tweens.push(scene.tweens.add({
    targets: ${variable},
    x: originX + ${layer.transform.x + layer.transform.movementX},
    y: originY + ${layer.transform.y + layer.transform.movementY},
    scale: ${layer.transform.endScale},
    alpha: ${layer.transform.endOpacity},
    angle: ${layer.transform.rotation + layer.transform.rotationDuring},
    delay: ${layer.timing.delay},
    duration: ${layer.timing.duration},
    ease: ${easingCode(layer)},
    yoyo: ${layer.timing.yoyo},
    repeat: ${repeatsForever ? -1 : layer.timing.repeat},${repeatsForever ? "" : `\n    onComplete: () => ${variable}.destroy(),`}
  }));`;
    return `  // ${codeComment(layer.name)}: ${layer.type === "static" ? "a part that stays in place" : "one image that changes over time"}
  const ${variable} = scene.add.image(
    originX + ${layer.transform.x},
    originY + ${layer.transform.y},
    ${texture}${initialFrame},
  )
    .setScale(${initialScaleX}, ${initialScaleY})
    .setAlpha(${initialOpacity})
    .setAngle(${initialRotation});
  objects.push(${variable});${tintLine}${blendLine}${frameCode}${trailCode}${lifecycleCode}`;
  }

  const asset = project.assets.find((item) => item.id === layer.assetId);
  return `  // ${codeComment(layer.name)}: ${layer.type === "burst" ? "creates several copies at once" : "keeps creating copies over time"}
  // Implement spawnLayer below, or use Runtime JSON for exact playback.
  cleanups.push(spawnLayer(scene, {
    texture: ${texture},
    type: ${codeString(layer.type)},
    x: originX + ${layer.transform.x},
    y: originY + ${layer.transform.y},
    count: ${layer.spawn.count},
    interval: [${layer.spawn.intervalMin}, ${layer.spawn.intervalMax}],
    maxAlive: ${layer.spawn.maxAlive},
    delay: ${layer.timing.delay},
    duration: ${layer.timing.duration},
    repeat: ${layer.timing.repeat},
    repeatForever: ${layer.timing.repeatForever || layer.timing.loop},
    yoyo: ${layer.timing.yoyo},
    movement: { x: ${layer.transform.movementX}, y: ${layer.transform.movementY} },
    scale: { from: ${layer.transform.startScale}, to: ${layer.transform.endScale} },
    alpha: { from: ${layer.transform.startOpacity}, to: ${layer.transform.endOpacity} },
    ease: ${easingCode(layer)},
    appearance: ${JSON.stringify(layer.appearance)},
    behavior: ${JSON.stringify(layer.behavior)},
    random: ${JSON.stringify(layer.random)},
    spawn: ${JSON.stringify(layer.spawn)},
    atlasFrame: ${JSON.stringify(asset?.atlasFrame ?? null)},
    spriteSheet: ${JSON.stringify(asset?.spriteSheet ?? null)},
    frameAnimation: ${JSON.stringify(layer.frameAnimation)},
    trail: ${JSON.stringify(layer.trail)},
    motionPath: ${JSON.stringify(layer.motionPath)},
    keyframes: ${JSON.stringify(layer.keyframes)},
    seed,
  }));`;
}

export function generatePhaserCode(project: VfxProject): string {
  const functionName = `play${project.metadata.name.replace(/[^a-zA-Z0-9]/g, "") || "Vfx"}`;
  const definition = JSON.stringify(createRuntimeDefinition(project), null, 2);
  return `import Phaser from "phaser";
import {
  playVvfx,
  type VvfxEffect,
  type VvfxRuntimeDefinition,
} from "@vvfx/phaser-runtime";

/** Exact Vvfx definition. Editor-only background, grid, zoom, and visibility are omitted. */
export const vvfxDefinition: VvfxRuntimeDefinition = ${definition};

/**
 * Preload your texture keys, then play the effect at a world position.
 * Built-in Vvfx images are created automatically by the runtime.
 */
export function ${functionName}(
  scene: Phaser.Scene,
  originX: number,
  originY: number,
  options: {
    assetKeys?: Record<string, string>;
    assetFrames?: Record<string, string | number>;
    seed?: number;
    baseDepth?: number;
    loop?: boolean;
    autoDestroy?: boolean;
    onWarning?: (message: string) => void;
  } = {},
): Promise<VvfxEffect> {
  const definition =
    options.seed === undefined
      ? vvfxDefinition
      : { ...vvfxDefinition, seed: options.seed };
  return playVvfx(scene, definition, {
    originX,
    originY,
    assetKeys: options.assetKeys,
    assetFrames: options.assetFrames,
    baseDepth: options.baseDepth,
    loop: options.loop,
    autoDestroy: options.autoDestroy,
    onWarning: options.onWarning,
  });
}
`;
}

/**
 * An educational, hand-written Phaser approximation. The runtime-backed
 * generatePhaserCode export is the supported parity path.
 */
export function generateStandalonePhaserCode(project: VfxProject): string {
  if (
    project.layers.some(
      (layer) =>
        (layer.type === "burst" || layer.type === "emitter") &&
        layer.spawn.shape === "mask",
    )
  )
    throw new Error(
      "The educational standalone Phaser approximation does not support image-silhouette spawning. Use the supported runtime-backed Phaser TypeScript export for exact mask playback.",
    );
  if (
    project.layers.some((layer) =>
      hasEnabledRenderingEffects(layer.appearance.effects),
    )
  )
    throw new Error(
      "The educational standalone Phaser approximation does not support experimental WebGL pixel effects. Use the supported runtime-backed Phaser TypeScript export for WebGL playback and safe Canvas fallback.",
    );
  if (
    project.layers.some(
      (layer) => layer.startMode === "triggered" || layer.events.length > 0,
    )
  )
    throw new Error(
      "The educational standalone Phaser approximation does not support layer events. Use the supported runtime-backed Phaser TypeScript export for exact playback.",
    );
  return generateResolvedPhaserCode(resolveProjectGroups(project));
}

function generateResolvedPhaserCode(project: VfxProject): string {
  const functionName = `play${project.metadata.name.replace(/[^a-zA-Z0-9]/g, "") || "Vfx"}`;
  const assetIds = project.assets
    .filter((asset) =>
      project.layers.some((layer) => layer.assetId === asset.id),
    )
    .map((asset) => asset.id);
  const layerCodeBlocks = project.layers
    .filter((layer) => layer.enabled)
    .map((layer, index) => layerCode(layer, index, project))
    .join("\n\n");
  const includesSimpleTrail = project.layers.some(
    (layer) =>
      layer.enabled &&
      layer.trail.enabled &&
      (layer.type === "static" || layer.type === "animated"),
  );
  const includesSimpleMotionPath = project.layers.some(
    (layer) =>
      layer.enabled && layer.type === "animated" && layer.motionPath.enabled,
  );
  const includesSimpleKeyframes = project.layers.some(
    (layer) =>
      layer.enabled &&
      layer.type === "animated" &&
      layer.keyframes.enabled &&
      layer.keyframes.frames.length >= 2,
  );
  const includesCustomEasing = project.layers.some(
    (layer) => layer.enabled && layer.timing.easing === "custom",
  );
  const customEasingHelper = includesCustomEasing
    ? `
function generatedCustomEasing(
  rawValue: number,
  controls: { x1: number; y1: number; x2: number; y2: number },
) {
  const value = Math.max(0, Math.min(1, rawValue));
  if (value === 0 || value === 1) return value;
  const coordinate = (progress: number, first: number, second: number) => {
    const inverse = 1 - progress;
    return 3 * inverse * inverse * progress * first + 3 * inverse * progress * progress * second + progress * progress * progress;
  };
  const derivative = (progress: number, first: number, second: number) => {
    const inverse = 1 - progress;
    return 3 * inverse * inverse * first + 6 * inverse * progress * (second - first) + 3 * progress * progress * (1 - second);
  };
  let parameter = value;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = coordinate(parameter, controls.x1, controls.x2) - value;
    const slope = derivative(parameter, controls.x1, controls.x2);
    if (Math.abs(error) < 0.000001 || Math.abs(slope) < 0.000001) break;
    parameter = Math.max(0, Math.min(1, parameter - error / slope));
  }
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const current = coordinate(parameter, controls.x1, controls.x2);
    if (Math.abs(current - value) < 0.000001) break;
    if (current < value) low = parameter;
    else high = parameter;
    parameter = (low + high) / 2;
  }
  return coordinate(parameter, controls.y1, controls.y2);
}
`
    : "";
  const keyframeHelper = includesSimpleKeyframes
    ? `
type GeneratedKeyframe = {
  time: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  rotation: number;
};

function evaluateGeneratedKeyframes(
  frames: GeneratedKeyframe[],
  rawProgress: number,
  ease: (value: number) => number,
) {
  const progress = Math.max(0, Math.min(1, rawProgress));
  let nextIndex = frames.findIndex((frame) => frame.time >= progress);
  if (nextIndex <= 0) nextIndex = 1;
  const start = frames[nextIndex - 1];
  const end = frames[Math.min(nextIndex, frames.length - 1)];
  const local = ease(Math.max(0, Math.min(1, (progress - start.time) / Math.max(Number.EPSILON, end.time - start.time))));
  const interpolate = (from: number, to: number) => from + (to - from) * local;
  return {
    scaleX: interpolate(start.scaleX, end.scaleX),
    scaleY: interpolate(start.scaleY, end.scaleY),
    opacity: interpolate(start.opacity, end.opacity),
    rotation: interpolate(start.rotation, end.rotation),
  };
}
`
    : "";
  const motionPathHelper = includesSimpleMotionPath
    ? `
type GeneratedMotionPath = {
  enabled: boolean;
  mode: "curve" | "spiral" | "custom";
  controlX: number;
  controlY: number;
  spiralTurns: number;
  spiralRadius: number;
  spiralClockwise: boolean;
  points: Array<{ x: number; y: number }>;
  orientToPath: boolean;
};

function generatedMotionPathPoint(
  path: GeneratedMotionPath,
  movement: { x: number; y: number },
  rawProgress: number,
) {
  const progress = Math.max(0, Math.min(1, rawProgress));
  if (path.mode === "curve") {
    const inverse = 1 - progress;
    return {
      x: 2 * inverse * progress * path.controlX + progress * progress * movement.x,
      y: 2 * inverse * progress * path.controlY + progress * progress * movement.y,
    };
  }
  if (path.mode === "spiral") {
    const direction = path.spiralClockwise ? 1 : -1;
    const angle = direction * Math.PI * 2 * path.spiralTurns * progress;
    const radius = path.spiralRadius * (1 - progress);
    return {
      x: movement.x * progress + (Math.cos(angle) - 1) * radius,
      y: movement.y * progress + Math.sin(angle) * radius,
    };
  }
  const points = [{ x: 0, y: 0 }, ...path.points, movement];
  const segmentCount = points.length - 1;
  const scaled = progress * segmentCount;
  const segment = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = progress === 1 ? 1 : scaled - segment;
  const p0 = points[Math.max(0, segment - 1)];
  const p1 = points[segment];
  const p2 = points[segment + 1];
  const p3 = points[Math.min(points.length - 1, segment + 2)];
  const squared = local * local;
  const cubed = squared * local;
  const component = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * local + (2 * a - 5 * b + 4 * c - d) * squared + (-a + 3 * b - 3 * c + d) * cubed);
  return {
    x: component(p0.x, p1.x, p2.x, p3.x),
    y: component(p0.y, p1.y, p2.y, p3.y),
  };
}

function evaluateGeneratedMotionPath(
  path: GeneratedMotionPath,
  movement: { x: number; y: number },
  progress: number,
) {
  const point = generatedMotionPathPoint(path, movement, progress);
  const before = generatedMotionPathPoint(path, movement, progress - 0.001);
  const after = generatedMotionPathPoint(path, movement, progress + 0.001);
  return {
    ...point,
    angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI,
  };
}
`
    : "";
  const motionTrailHelper = includesSimpleTrail
    ? `
function addMotionTrail(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Image,
  config: {
    count: number;
    spacing: number;
    lifetime: number;
    opacity: number;
    scaleFalloff: number;
    delay: number;
  },
): () => void {
  const echoes: Array<{
    image: Phaser.GameObjects.Image;
    tween?: Phaser.Tweens.Tween;
  }> = [];
  let sampleTimer: Phaser.Time.TimerEvent | undefined;
  const startTimer = scene.time.delayedCall(config.delay, () => {
    sampleTimer = scene.time.addEvent({
      delay: config.spacing,
      loop: true,
      callback: () => {
        if (!target.active) {
          sampleTimer?.remove(false);
          return;
        }
        const echo = scene.add
          .image(target.x, target.y, target.texture.key, target.frame.name)
          .setScale(target.scaleX, target.scaleY)
          .setAlpha(target.alpha * config.opacity)
          .setAngle(target.angle)
          .setBlendMode(target.blendMode)
          .setDepth(target.depth - 0.01);
        if (target.isTinted) echo.setTint(target.tintTopLeft);
        const entry = { image: echo } as {
          image: Phaser.GameObjects.Image;
          tween?: Phaser.Tweens.Tween;
        };
        echoes.push(entry);
        while (echoes.length > config.count) {
          const oldest = echoes.shift();
          oldest?.tween?.remove();
          oldest?.image.destroy();
        }
        entry.tween = scene.tweens.add({
          targets: echo,
          alpha: 0,
          scaleX: echo.scaleX * Math.max(0, 1 - config.scaleFalloff),
          scaleY: echo.scaleY * Math.max(0, 1 - config.scaleFalloff),
          duration: config.lifetime,
          onComplete: () => {
            echo.destroy();
            const index = echoes.indexOf(entry);
            if (index >= 0) echoes.splice(index, 1);
          },
        });
      },
    });
  });
  return () => {
    startTimer.remove(false);
    sampleTimer?.remove(false);
    echoes.splice(0).forEach(({ image, tween }) => {
      tween?.remove();
      image.destroy();
    });
  };
}
`
    : "";
  return `import Phaser from "phaser";

/**
 * Generated by Vvfx from ${codeString(codeComment(project.metadata.name))}.
 * Preload these asset IDs, or map them to your game's Phaser texture keys:
 * ${assetIds.map((id) => codeString(id)).join(", ") || "No textures used"}
 * Runtime JSON + @vvfx/phaser-runtime remains the exact path for particles.
 */
export function ${functionName}(
  scene: Phaser.Scene,
  originX: number,
  originY: number,
  seed = ${project.preview.randomSeed},
  textureKeys: Record<string, string> = {},
) {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];
  const cleanups: Array<() => void> = [];

${layerCodeBlocks}

  return {
    destroy() {
      tweens.forEach((tween) => tween.remove());
      timers.forEach((timer) => timer.remove(false));
      cleanups.forEach((cleanup) => cleanup());
      objects.forEach((object) => object.destroy());
    },
  };
}

${customEasingHelper}
${keyframeHelper}
${motionPathHelper}
${motionTrailHelper}

/**
 * Required only when this export contains burst or emitter layers. Return a
 * cleanup callback. Runtime JSON already supplies the complete implementation.
 */
declare function spawnLayer(
  scene: Phaser.Scene,
  config: Record<string, unknown>,
): () => void;
`;
}
