import type Phaser from "phaser";
import { seededRandom } from "./random";

export type BlurQuality = 0 | 1 | 2;
export type DissolvePattern = "directional" | "noise";
export type DirectionalDissolveAxis = "horizontal" | "vertical";
export type SpriteWarpMode = "barrel" | "noise" | "heat-shimmer";
export type VisualMaskChannel = "alpha" | "luminance";
export type VisualMaskFit = "stretch" | "contain" | "cover";

export interface VisualMaskEffectSettings {
  enabled: boolean;
  maskAssetId: string | null;
  channel: VisualMaskChannel;
  invert: boolean;
  fit: VisualMaskFit;
  /** Horizontal offset measured in target-sprite spans. */
  offsetX: number;
  /** Vertical offset measured in target-sprite spans. */
  offsetY: number;
  scale: number;
  /** Clockwise rotation in degrees. */
  rotation: number;
  strength: number;
}

export interface BlurEffectSettings {
  enabled: boolean;
  quality: BlurQuality;
  offsetX: number;
  offsetY: number;
  strength: number;
  color: string;
  steps: number;
}

export interface OuterGlowEffectSettings {
  enabled: boolean;
  color: string;
  outerStrength: number;
  innerStrength: number;
}

export interface BrightnessExposureEffectSettings {
  enabled: boolean;
  /** Neutral is 1. Phaser applies this as a linear color multiplier. */
  brightness: number;
  /** Exposure in stops; +1 doubles and -1 halves the multiplier. */
  exposure: number;
}

export interface AnimatedShineEffectSettings {
  enabled: boolean;
  speed: number;
  lineWidth: number;
  gradient: number;
}

export interface SpatialGradientEffectSettings {
  enabled: boolean;
  colorA: string;
  colorB: string;
  strength: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bands: number;
}

/**
 * Both patterns share one lifetime envelope. The directional pattern uses
 * Phaser's built-in Wipe FX; noise uses Vvfx's deterministic PreFX shader.
 */
export interface DirectionalDissolveEffectSettings {
  enabled: boolean;
  /** Normalized point in this copy's lifetime where erasing begins. */
  start: number;
  /** Normalized point in this copy's lifetime where erasing finishes. */
  end: number;
  softness: number;
  pattern: DissolvePattern;
  axis: DirectionalDissolveAxis;
  reverse: boolean;
  /** Approximate patches across the largest rendered sprite dimension. */
  noiseScale: number;
}

/**
 * All modes warp the sprite's own pixels. They do not sample or refract the
 * game scene behind the sprite.
 */
export interface SpriteWarpEffectSettings {
  enabled: boolean;
  mode: SpriteWarpMode;
  /** Vvfx offset from Phaser's neutral barrel amount of 1. */
  barrel: number;
  /** Small normalized displacement amounts; values around 0.005 are useful. */
  amountX: number;
  amountY: number;
  /** Cycles per second for the sprite-local heat-shimmer mode. */
  speed: number;
}

export interface RenderingEffectsSettings {
  visualMask: VisualMaskEffectSettings;
  blur: BlurEffectSettings;
  outerGlow: OuterGlowEffectSettings;
  brightnessExposure: BrightnessExposureEffectSettings;
  animatedShine: AnimatedShineEffectSettings;
  spatialGradient: SpatialGradientEffectSettings;
  directionalDissolve: DirectionalDissolveEffectSettings;
  spriteWarp: SpriteWarpEffectSettings;
}

export interface RenderingEffectControllerValues {
  brightnessMultiplier: number;
  shineSpeed: number;
  shineLineWidth: number;
  shineGradient: number;
  directionalDissolveProgress: number;
  dissolveNoiseOffsetX: number;
  dissolveNoiseOffsetY: number;
  barrelAmount: number;
  displacementX: number;
  displacementY: number;
}

export interface EvaluatedRenderingEffects {
  settings: RenderingEffectsSettings;
  controllers: RenderingEffectControllerValues;
}

export interface RenderingEffectsEvaluationInput {
  /** Pass the layer's canonical, already-eased lifetime progress. */
  lifetimeProgress: number;
  elapsedMs: number;
  seed: number;
}

export type RenderingEffectName =
  | "visual-mask"
  | "blur"
  | "outer-glow"
  | "brightness-exposure"
  | "animated-shine"
  | "spatial-gradient"
  | "directional-dissolve"
  | "sprite-warp";

export const VVFX_RENDERING_NOISE_TEXTURE = "__vvfx-rendering-noise-v1";
export const MAX_RENDERING_EFFECT_PADDING = 64;
export const UNSUPPORTED_RENDERING_EFFECTS_WARNING =
  "Experimental pixel effects need Phaser WebGL. This Canvas renderer will show the ordinary sprites without visual masks, blur, glow, brightness/exposure, shine, gradients, dissolve/noise erosion, or sprite warp.";

const VVFX_RENDERING_PIPELINE = "__vvfx-rendering-fx-v2";
const RENDERING_PIPELINE_WARNING =
  "Vvfx could not start its Experimental visual-mask or noise-erosion shader, so those effects are omitted.";
const VISUAL_MASK_SOURCE_WARNING =
  "Vvfx could not resolve the Experimental visual-mask texture, so visual masking is omitted.";

/**
 * Samples a mask in the target sprite's untrimmed local coordinates while the
 * sprite is first drawn into Phaser's PreFX buffer. Later FX controllers then
 * receive the already-masked pixels, preserving Vvfx's authored order.
 */
const VISUAL_MASK_FRAGMENT_SHADER = `#define SHADER_NAME VVFX_VISUAL_MASK_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform sampler2D vvfxMaskSampler;
uniform vec4 vvfxSourceUv;
uniform vec4 vvfxSourceLogical;
uniform vec4 vvfxMaskUv;
uniform vec4 vvfxMaskLogical;
uniform vec4 vvfxMaskTransform;
uniform vec2 vvfxTargetScale;
uniform vec2 vvfxMaskRotation;
uniform vec4 vvfxMaskOptions;

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;

void main ()
{
    vec4 texture = texture2D(uMainSampler, outTexCoord);
    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = texture * texel;

    if (outTintEffect == 1.0)
    {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    }
    else if (outTintEffect == 2.0)
    {
        color = texel;
    }

    vec2 cutUv = (outTexCoord - vvfxSourceUv.xy) /
        max(vvfxSourceUv.zw, vec2(0.000001));
    vec2 targetUv = vvfxSourceLogical.xy + cutUv * vvfxSourceLogical.zw;
    vec2 point = (targetUv - vec2(0.5)) * vvfxTargetScale -
        vvfxMaskTransform.xy;
    vec2 rotatedPoint = vec2(
        vvfxMaskRotation.x * point.x + vvfxMaskRotation.y * point.y,
        -vvfxMaskRotation.y * point.x + vvfxMaskRotation.x * point.y
    );
    vec2 maskLogicalUv = rotatedPoint /
        max(vvfxMaskTransform.zw, vec2(0.000001)) + vec2(0.5);

    float maskValue = 0.0;
    bool insideLogical = maskLogicalUv.x >= 0.0 && maskLogicalUv.x <= 1.0 &&
        maskLogicalUv.y >= 0.0 && maskLogicalUv.y <= 1.0;
    vec2 maskCutUv = (maskLogicalUv - vvfxMaskLogical.xy) /
        max(vvfxMaskLogical.zw, vec2(0.000001));
    bool insideTrim = maskCutUv.x >= 0.0 && maskCutUv.x <= 1.0 &&
        maskCutUv.y >= 0.0 && maskCutUv.y <= 1.0;

    if (insideLogical && insideTrim)
    {
        vec4 maskColor = texture2D(
            vvfxMaskSampler,
            vvfxMaskUv.xy + maskCutUv * vvfxMaskUv.zw
        );
        maskValue = mix(
            maskColor.a,
            dot(maskColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * maskColor.a,
            vvfxMaskOptions.y
        );
    }

    maskValue = mix(maskValue, 1.0 - maskValue, vvfxMaskOptions.z);
    float maskFactor = mix(1.0, maskValue, vvfxMaskOptions.x);
    gl_FragColor = color * maskFactor;
}`;

/**
 * GLSL 1 / WebGL 1 fragment shader. The fixed three-octave value-noise field
 * has no time input: direct seeks and replays use the same per-copy pattern.
 */
const NOISE_EROSION_FRAGMENT_SHADER = `#define SHADER_NAME VVFX_NOISE_EROSION_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec4 vvfxDissolve;
uniform vec2 vvfxNoiseOffset;
uniform vec2 vvfxTargetToSprite;

varying vec2 outTexCoord;

float vvfxHash(vec2 point)
{
    point = fract(point * vec2(123.34, 345.45));
    point += dot(point, point + 34.345);
    return fract(point.x * point.y);
}

float vvfxValueNoise(vec2 point)
{
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float topLeft = vvfxHash(cell);
    float topRight = vvfxHash(cell + vec2(1.0, 0.0));
    float bottomLeft = vvfxHash(cell + vec2(0.0, 1.0));
    float bottomRight = vvfxHash(cell + vec2(1.0, 1.0));

    return mix(
        mix(topLeft, topRight, local.x),
        mix(bottomLeft, bottomRight, local.x),
        local.y
    );
}

float vvfxNoise(vec2 point)
{
    float value = vvfxValueNoise(point) * 0.5714286;
    point = point * 2.03 + vec2(19.1, 7.7);
    value += vvfxValueNoise(point) * 0.2857143;
    point = point * 2.01 + vec2(3.7, 23.4);
    value += vvfxValueNoise(point) * 0.1428571;
    return value;
}

void main ()
{
    vec4 color = texture2D(uMainSampler, outTexCoord);
    float progress = vvfxDissolve.x;

    if (progress <= 0.0)
    {
        gl_FragColor = color;
        return;
    }

    if (progress >= 1.0)
    {
        gl_FragColor = vec4(0.0);
        return;
    }

    vec2 point = (outTexCoord - vec2(0.5)) * vvfxTargetToSprite;
    float noiseValue = vvfxNoise(point * vvfxDissolve.z + vvfxNoiseOffset);

    if (vvfxDissolve.w > 0.5)
    {
        noiseValue = 1.0 - noiseValue;
    }

    float visible = smoothstep(
        progress - vvfxDissolve.y,
        progress + vvfxDissolve.y,
        noiseValue
    );
    gl_FragColor = color * visible;
}`;

export const DEFAULT_RENDERING_EFFECTS: Readonly<RenderingEffectsSettings> = {
  visualMask: {
    enabled: false,
    maskAssetId: null,
    channel: "alpha",
    invert: false,
    fit: "stretch",
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: 0,
    strength: 1,
  },
  blur: {
    enabled: false,
    quality: 0,
    offsetX: 2,
    offsetY: 2,
    strength: 1,
    color: "#ffffff",
    steps: 2,
  },
  outerGlow: {
    enabled: false,
    color: "#7de9ff",
    outerStrength: 3,
    innerStrength: 0,
  },
  brightnessExposure: {
    enabled: false,
    brightness: 1,
    exposure: 0,
  },
  animatedShine: {
    enabled: false,
    speed: 0.5,
    lineWidth: 0.5,
    gradient: 3,
  },
  spatialGradient: {
    enabled: false,
    colorA: "#ffffff",
    colorB: "#66d9ff",
    strength: 0.7,
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 1,
    bands: 0,
  },
  directionalDissolve: {
    enabled: false,
    start: 0,
    end: 1,
    softness: 0.1,
    pattern: "directional",
    axis: "horizontal",
    reverse: false,
    noiseScale: 6,
  },
  spriteWarp: {
    enabled: false,
    mode: "heat-shimmer",
    barrel: 0.15,
    amountX: 0.006,
    amountY: 0.003,
    speed: 2,
  },
};

export function createDefaultRenderingEffects(): RenderingEffectsSettings {
  return {
    visualMask: { ...DEFAULT_RENDERING_EFFECTS.visualMask },
    blur: { ...DEFAULT_RENDERING_EFFECTS.blur },
    outerGlow: { ...DEFAULT_RENDERING_EFFECTS.outerGlow },
    brightnessExposure: {
      ...DEFAULT_RENDERING_EFFECTS.brightnessExposure,
    },
    animatedShine: { ...DEFAULT_RENDERING_EFFECTS.animatedShine },
    spatialGradient: { ...DEFAULT_RENDERING_EFFECTS.spatialGradient },
    directionalDissolve: {
      ...DEFAULT_RENDERING_EFFECTS.directionalDissolve,
    },
    spriteWarp: { ...DEFAULT_RENDERING_EFFECTS.spriteWarp },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const enabledOrDefault = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const normalizedColor = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;

/**
 * Restores missing legacy fields and bounds imported values before they can
 * reach Phaser's GPU controllers. Missing effects are always disabled.
 */
export function normalizeRenderingEffects(
  value: unknown,
): RenderingEffectsSettings {
  const input = isRecord(value) ? value : {};
  const defaults = createDefaultRenderingEffects();
  const visualMask = isRecord(input.visualMask) ? input.visualMask : {};
  const blur = isRecord(input.blur) ? input.blur : {};
  const glow = isRecord(input.outerGlow) ? input.outerGlow : {};
  const brightness = isRecord(input.brightnessExposure)
    ? input.brightnessExposure
    : {};
  const shine = isRecord(input.animatedShine) ? input.animatedShine : {};
  const gradient = isRecord(input.spatialGradient) ? input.spatialGradient : {};
  const dissolve = isRecord(input.directionalDissolve)
    ? input.directionalDissolve
    : {};
  const warp = isRecord(input.spriteWarp) ? input.spriteWarp : {};
  const quality = Math.floor(finiteNumber(blur.quality, defaults.blur.quality));
  const warpMode: SpriteWarpMode = ["barrel", "noise", "heat-shimmer"].includes(
    String(warp.mode),
  )
    ? (warp.mode as SpriteWarpMode)
    : defaults.spriteWarp.mode;

  return {
    visualMask: {
      enabled: enabledOrDefault(
        visualMask.enabled,
        defaults.visualMask.enabled,
      ),
      maskAssetId:
        typeof visualMask.maskAssetId === "string" &&
        visualMask.maskAssetId.trim().length > 0
          ? visualMask.maskAssetId.trim()
          : defaults.visualMask.maskAssetId,
      channel:
        visualMask.channel === "luminance"
          ? "luminance"
          : defaults.visualMask.channel,
      invert: enabledOrDefault(visualMask.invert, defaults.visualMask.invert),
      fit:
        visualMask.fit === "contain" || visualMask.fit === "cover"
          ? visualMask.fit
          : defaults.visualMask.fit,
      offsetX: clamp(
        finiteNumber(visualMask.offsetX, defaults.visualMask.offsetX),
        -2,
        2,
      ),
      offsetY: clamp(
        finiteNumber(visualMask.offsetY, defaults.visualMask.offsetY),
        -2,
        2,
      ),
      scale: clamp(
        finiteNumber(visualMask.scale, defaults.visualMask.scale),
        0.1,
        4,
      ),
      rotation: clamp(
        finiteNumber(visualMask.rotation, defaults.visualMask.rotation),
        -180,
        180,
      ),
      strength: clamp(
        finiteNumber(visualMask.strength, defaults.visualMask.strength),
        0,
        1,
      ),
    },
    blur: {
      enabled: enabledOrDefault(blur.enabled, defaults.blur.enabled),
      quality: clamp(quality, 0, 2) as BlurQuality,
      offsetX: clamp(
        finiteNumber(blur.offsetX, defaults.blur.offsetX),
        -12,
        12,
      ),
      offsetY: clamp(
        finiteNumber(blur.offsetY, defaults.blur.offsetY),
        -12,
        12,
      ),
      strength: clamp(
        finiteNumber(blur.strength, defaults.blur.strength),
        0,
        4,
      ),
      color: normalizedColor(blur.color, defaults.blur.color),
      steps: Math.floor(
        clamp(finiteNumber(blur.steps, defaults.blur.steps), 1, 4),
      ),
    },
    outerGlow: {
      enabled: enabledOrDefault(glow.enabled, defaults.outerGlow.enabled),
      color: normalizedColor(glow.color, defaults.outerGlow.color),
      outerStrength: clamp(
        finiteNumber(glow.outerStrength, defaults.outerGlow.outerStrength),
        0,
        8,
      ),
      innerStrength: clamp(
        finiteNumber(glow.innerStrength, defaults.outerGlow.innerStrength),
        0,
        8,
      ),
    },
    brightnessExposure: {
      enabled: enabledOrDefault(
        brightness.enabled,
        defaults.brightnessExposure.enabled,
      ),
      brightness: clamp(
        finiteNumber(
          brightness.brightness,
          defaults.brightnessExposure.brightness,
        ),
        0,
        2,
      ),
      exposure: clamp(
        finiteNumber(brightness.exposure, defaults.brightnessExposure.exposure),
        -2,
        2,
      ),
    },
    animatedShine: {
      enabled: enabledOrDefault(shine.enabled, defaults.animatedShine.enabled),
      speed: clamp(
        finiteNumber(shine.speed, defaults.animatedShine.speed),
        -4,
        4,
      ),
      lineWidth: clamp(
        finiteNumber(shine.lineWidth, defaults.animatedShine.lineWidth),
        0.01,
        1,
      ),
      gradient: clamp(
        finiteNumber(shine.gradient, defaults.animatedShine.gradient),
        0.1,
        12,
      ),
    },
    spatialGradient: {
      enabled: enabledOrDefault(
        gradient.enabled,
        defaults.spatialGradient.enabled,
      ),
      colorA: normalizedColor(gradient.colorA, defaults.spatialGradient.colorA),
      colorB: normalizedColor(gradient.colorB, defaults.spatialGradient.colorB),
      strength: clamp(
        finiteNumber(gradient.strength, defaults.spatialGradient.strength),
        0,
        1,
      ),
      fromX: clamp(
        finiteNumber(gradient.fromX, defaults.spatialGradient.fromX),
        0,
        1,
      ),
      fromY: clamp(
        finiteNumber(gradient.fromY, defaults.spatialGradient.fromY),
        0,
        1,
      ),
      toX: clamp(
        finiteNumber(gradient.toX, defaults.spatialGradient.toX),
        0,
        1,
      ),
      toY: clamp(
        finiteNumber(gradient.toY, defaults.spatialGradient.toY),
        0,
        1,
      ),
      bands: Math.floor(
        clamp(
          finiteNumber(gradient.bands, defaults.spatialGradient.bands),
          0,
          32,
        ),
      ),
    },
    directionalDissolve: {
      enabled: enabledOrDefault(
        dissolve.enabled,
        defaults.directionalDissolve.enabled,
      ),
      start: clamp(
        finiteNumber(dissolve.start, defaults.directionalDissolve.start),
        0,
        1,
      ),
      end: clamp(
        finiteNumber(dissolve.end, defaults.directionalDissolve.end),
        0,
        1,
      ),
      softness: clamp(
        finiteNumber(dissolve.softness, defaults.directionalDissolve.softness),
        0.01,
        0.5,
      ),
      pattern:
        dissolve.pattern === "noise"
          ? "noise"
          : defaults.directionalDissolve.pattern,
      axis:
        dissolve.axis === "vertical"
          ? "vertical"
          : defaults.directionalDissolve.axis,
      reverse: enabledOrDefault(
        dissolve.reverse,
        defaults.directionalDissolve.reverse,
      ),
      noiseScale: clamp(
        finiteNumber(
          dissolve.noiseScale,
          defaults.directionalDissolve.noiseScale,
        ),
        1,
        16,
      ),
    },
    spriteWarp: {
      enabled: enabledOrDefault(warp.enabled, defaults.spriteWarp.enabled),
      mode: warpMode,
      barrel: clamp(
        finiteNumber(warp.barrel, defaults.spriteWarp.barrel),
        -0.75,
        1,
      ),
      amountX: clamp(
        finiteNumber(warp.amountX, defaults.spriteWarp.amountX),
        -0.1,
        0.1,
      ),
      amountY: clamp(
        finiteNumber(warp.amountY, defaults.spriteWarp.amountY),
        -0.1,
        0.1,
      ),
      speed: clamp(finiteNumber(warp.speed, defaults.spriteWarp.speed), 0, 8),
    },
  };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));

const clamp01 = (value: number) => clamp(value, 0, 1);

export function enabledRenderingEffects(
  settings: RenderingEffectsSettings,
): RenderingEffectName[] {
  const enabled: RenderingEffectName[] = [];
  if (settings.visualMask.enabled) enabled.push("visual-mask");
  if (settings.blur.enabled) enabled.push("blur");
  if (settings.outerGlow.enabled) enabled.push("outer-glow");
  if (settings.brightnessExposure.enabled) enabled.push("brightness-exposure");
  if (settings.animatedShine.enabled) enabled.push("animated-shine");
  if (settings.spatialGradient.enabled) enabled.push("spatial-gradient");
  if (settings.directionalDissolve.enabled)
    enabled.push("directional-dissolve");
  if (settings.spriteWarp.enabled) enabled.push("sprite-warp");
  return enabled;
}

export function hasEnabledRenderingEffects(
  settings: RenderingEffectsSettings,
): boolean {
  return enabledRenderingEffects(settings).length > 0;
}

/**
 * A deliberately simple GPU-pass estimate for warnings and stress-preview
 * limits. Blur runs horizontal and vertical passes for every authored step.
 */
export function renderingEffectPassCost(
  settings: RenderingEffectsSettings,
): number {
  let passes = 0;
  if (settings.visualMask.enabled) passes += 1;
  if (settings.blur.enabled)
    passes += 2 * Math.max(1, Math.min(4, Math.floor(settings.blur.steps)));
  if (settings.outerGlow.enabled) passes += 1;
  if (settings.brightnessExposure.enabled) passes += 1;
  if (settings.animatedShine.enabled) passes += 1;
  if (settings.spatialGradient.enabled) passes += 1;
  if (settings.directionalDissolve.enabled) passes += 1;
  if (settings.spriteWarp.enabled) passes += 1;
  return passes;
}

export function evaluateRenderingEffects(
  settings: RenderingEffectsSettings,
  input: RenderingEffectsEvaluationInput,
): EvaluatedRenderingEffects {
  const progress = clamp01(input.lifetimeProgress);
  const dissolve = settings.directionalDissolve;
  const dissolveStart = clamp01(Math.min(dissolve.start, dissolve.end));
  const dissolveEnd = clamp01(Math.max(dissolve.start, dissolve.end));
  const directionalDissolveProgress = clamp01(
    (progress - dissolveStart) / Math.max(0.0001, dissolveEnd - dissolveStart),
  );
  const warp = settings.spriteWarp;
  const seededX = 0.8 + seededRandom(input.seed, 701) * 0.4;
  const seededY = 0.8 + seededRandom(input.seed, 702) * 0.4;
  let displacementX = warp.amountX * seededX;
  let displacementY = warp.amountY * seededY;

  if (warp.mode === "heat-shimmer") {
    const seconds = Math.max(0, input.elapsedMs) / 1_000;
    const phaseX = seededRandom(input.seed, 703) * Math.PI * 2;
    const phaseY = seededRandom(input.seed, 704) * Math.PI * 2;
    const angularSpeed = Math.max(0, warp.speed) * Math.PI * 2;
    displacementX *= 0.72 + Math.sin(seconds * angularSpeed + phaseX) * 0.28;
    displacementY *=
      0.72 + Math.sin(seconds * angularSpeed * 0.83 + phaseY) * 0.28;
  }

  return {
    settings,
    controllers: {
      brightnessMultiplier: clamp(
        settings.brightnessExposure.brightness *
          2 ** settings.brightnessExposure.exposure,
        0,
        4,
      ),
      shineSpeed: clamp(settings.animatedShine.speed, -4, 4),
      shineLineWidth: clamp(settings.animatedShine.lineWidth, 0.01, 1),
      shineGradient: clamp(settings.animatedShine.gradient, 0.1, 12),
      directionalDissolveProgress,
      dissolveNoiseOffsetX: seededRandom(input.seed, 705) * 64,
      dissolveNoiseOffsetY: seededRandom(input.seed, 706) * 64,
      barrelAmount: clamp(1 + warp.barrel, 0.25, 2),
      displacementX: clamp(displacementX, -0.1, 0.1),
      displacementY: clamp(displacementY, -0.1, 0.1),
    },
  };
}

export function renderingEffectPadding(
  settings: RenderingEffectsSettings,
): number {
  const blurPadding = settings.blur.enabled
    ? (Math.abs(settings.blur.offsetX) + Math.abs(settings.blur.offsetY)) *
      Math.max(1, Math.min(4, Math.floor(settings.blur.steps))) *
      Math.max(1, settings.blur.strength)
    : 0;
  const glowPadding = settings.outerGlow.enabled
    ? 12 + Math.max(0, settings.outerGlow.outerStrength) * 2
    : 0;
  return Math.ceil(
    clamp(Math.max(blurPadding, glowPadding), 0, MAX_RENDERING_EFFECT_PADDING),
  );
}

function colorNumber(value: string): number {
  return /^#[0-9a-f]{6}$/i.test(value)
    ? Number.parseInt(value.slice(1), 16)
    : 0xffffff;
}

export function sceneSupportsPhaserPreFx(scene: Phaser.Scene): boolean {
  return Boolean(phaserPipelineManager(scene));
}

function phaserPipelineManager(
  scene: Phaser.Scene,
): Phaser.Renderer.WebGL.PipelineManager | null {
  return (
    (
      scene.sys.renderer as Phaser.Renderer.Canvas.CanvasRenderer & {
        pipelines?: Phaser.Renderer.WebGL.PipelineManager;
      }
    ).pipelines ?? null
  );
}

const warningKeysByScene = new WeakMap<object, Set<string>>();

function warnOnce(
  scene: Phaser.Scene,
  key: string,
  message: string,
  onWarning?: (message: string) => void,
) {
  const keys = warningKeysByScene.get(scene) ?? new Set<string>();
  if (keys.has(key)) return;
  keys.add(key);
  warningKeysByScene.set(scene, keys);
  if (onWarning) onWarning(message);
  else console.warn(message);
}

/** Creates one fixed scene-scoped map. Phaser releases it with the game. */
export function ensureRenderingNoiseTexture(
  scene: Phaser.Scene,
): string | null {
  if (scene.textures.exists(VVFX_RENDERING_NOISE_TEXTURE))
    return VVFX_RENDERING_NOISE_TEXTURE;
  const texture = scene.textures.createCanvas(
    VVFX_RENDERING_NOISE_TEXTURE,
    64,
    64,
  );
  if (!texture) return null;

  const image = texture.context.createImageData(64, 64);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const index = (y * 64 + x) * 4;
      const broad =
        Math.sin(x * 0.31 + y * 0.17) * 34 + Math.sin(x * 0.09 - y * 0.27) * 25;
      const grain = (seededRandom(0x76566678, y * 64 + x) - 0.5) * 46;
      const value = Math.round(clamp(128 + broad + grain, 0, 255));
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  texture.context.putImageData(image, 0, 0);
  texture.refresh();
  return VVFX_RENDERING_NOISE_TEXTURE;
}

interface NoiseErosionFxController {
  active: boolean;
  readonly type: number;
  gameObject: Phaser.GameObjects.GameObject | null;
  progress: number;
  softness: number;
  noiseScale: number;
  reverse: boolean;
  noiseOffsetX: number;
  noiseOffsetY: number;
  setActive(value: boolean): this;
  destroy(): void;
}

export type PhaserRenderingAssetFrameResolver = (
  assetId: string,
) => Phaser.Textures.Frame | null;

interface VisualMaskFxController {
  active: boolean;
  readonly type: number;
  readonly vvfxVisualMaskController: true;
  gameObject: Phaser.GameObjects.GameObject | null;
  maskFrame: Phaser.Textures.Frame | null;
  channel: VisualMaskChannel;
  invert: boolean;
  fit: VisualMaskFit;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  strength: number;
  setActive(value: boolean): this;
  destroy(): void;
}

class VvfxVisualMaskController implements VisualMaskFxController {
  active = true;
  readonly vvfxVisualMaskController = true as const;
  gameObject: Phaser.GameObjects.GameObject | null;
  maskFrame: Phaser.Textures.Frame | null;
  channel: VisualMaskChannel;
  invert: boolean;
  fit: VisualMaskFit;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  strength: number;

  constructor(
    readonly type: number,
    sprite: Phaser.GameObjects.Image,
    maskFrame: Phaser.Textures.Frame,
    settings: VisualMaskEffectSettings,
  ) {
    this.gameObject = sprite;
    this.maskFrame = maskFrame;
    this.channel = settings.channel;
    this.invert = settings.invert;
    this.fit = settings.fit;
    this.offsetX = settings.offsetX;
    this.offsetY = settings.offsetY;
    this.scale = settings.scale;
    this.rotation = settings.rotation;
    this.strength = settings.strength;
  }

  setActive(value: boolean) {
    this.active = value;
    return this;
  }

  destroy() {
    this.gameObject = null;
    this.maskFrame = null;
    this.active = false;
  }
}

class VvfxNoiseErosionController implements NoiseErosionFxController {
  active = true;
  gameObject: Phaser.GameObjects.GameObject | null;
  progress = 0;
  softness = 0.1;
  noiseScale = 6;
  reverse = false;
  noiseOffsetX = 0;
  noiseOffsetY = 0;

  constructor(
    readonly type: number,
    sprite: Phaser.GameObjects.Image,
  ) {
    this.gameObject = sprite;
  }

  setActive(value: boolean) {
    this.active = value;
    return this;
  }

  destroy() {
    this.gameObject = null;
    this.active = false;
  }
}

interface VvfxRenderingFxPipeline
  extends Phaser.Renderer.WebGL.Pipelines.FXPipeline {
  readonly vvfxRenderingPipeline: true;
  readonly vvfxVisualMaskType: number;
  readonly vvfxNoiseErosionType: number;
  installVvfxShaders(): this;
}

type FxPipelineConstructor = new (
  config: Phaser.Types.Renderer.WebGL.WebGLPipelineConfig,
) => Phaser.Renderer.WebGL.Pipelines.FXPipeline;

const failedRenderingPipelineManagers = new WeakSet<object>();

function isVvfxRenderingFxPipeline(
  value: unknown,
): value is VvfxRenderingFxPipeline {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as Partial<VvfxRenderingFxPipeline>).vvfxRenderingPipeline ===
      true &&
    Number.isInteger(
      (value as Partial<VvfxRenderingFxPipeline>).vvfxVisualMaskType,
    ) &&
    Number.isInteger(
      (value as Partial<VvfxRenderingFxPipeline>).vvfxNoiseErosionType,
    ),
  );
}

function createVvfxRenderingFxPipeline(
  scene: Phaser.Scene,
  manager: Phaser.Renderer.WebGL.PipelineManager,
): VvfxRenderingFxPipeline {
  const basePipeline = manager.FX_PIPELINE;
  if (!basePipeline)
    throw new Error("Phaser's built-in FX pipeline is unavailable.");

  const BaseFxPipeline = basePipeline.constructor as FxPipelineConstructor;

  class ManagedVvfxRenderingFxPipeline
    extends BaseFxPipeline
    implements VvfxRenderingFxPipeline
  {
    declare spriteBounds: Phaser.Geom.Rectangle;
    readonly vvfxRenderingPipeline = true as const;
    readonly vvfxVisualMaskType: number;
    readonly vvfxNoiseErosionType: number;

    constructor(game: Phaser.Game) {
      // Phaser's public declaration says `game`, while its 3.90 FXPipeline
      // implementation receives a WebGL pipeline config object.
      super({ game });
      const shaderConfigs = this.config.shaders;
      if (!shaderConfigs)
        throw new Error("Phaser's FX shader configuration is unavailable.");
      this.vvfxVisualMaskType = shaderConfigs.length;
      shaderConfigs.push({
        name: "VvfxVisualMask",
        fragShader: VISUAL_MASK_FRAGMENT_SHADER,
      });
      this.vvfxNoiseErosionType = shaderConfigs.length;
      shaderConfigs.push({
        name: "VvfxNoiseErosion",
        fragShader: NOISE_EROSION_FRAGMENT_SHADER,
      });
      this.fxHandlers[this.vvfxVisualMaskType] = this.onVvfxVisualMask;
      this.fxHandlers[this.vvfxNoiseErosionType] = this.onVvfxNoiseErosion;
    }

    installVvfxShaders() {
      // The renderer is already booted when an effect first appears, so the
      // base constructor has compiled its original shaders. Rebuild once with
      // the appended shaders and restore PreFX's four cached shader handles.
      this.setShadersFromConfig(this.config);
      if (!this.shaders[this.vvfxVisualMaskType])
        throw new Error("The visual-mask shader did not compile.");
      if (!this.shaders[this.vvfxNoiseErosionType])
        throw new Error("The noise-erosion shader did not compile.");
      this.drawSpriteShader = this.shaders[0];
      this.copyShader = this.shaders[1];
      this.gameShader = this.shaders[2];
      this.colorMatrixShader = this.shaders[3];
      this.currentShader = this.copyShader;
      this.setProjectionMatrix(
        this.renderer.projectionWidth,
        this.renderer.projectionHeight,
      );
      return this;
    }

    onDrawSprite(gameObject: Phaser.GameObjects.Image) {
      const controller = gameObject.preFX?.list.find(
        (candidate) =>
          candidate.type === this.vvfxVisualMaskType &&
          (candidate as Partial<VisualMaskFxController>)
            .vvfxVisualMaskController === true &&
          candidate.active,
      ) as VisualMaskFxController | undefined;
      const sourceFrame = gameObject.frame;
      const maskFrame = controller?.maskFrame;
      const maskTexture = maskFrame?.source.glTexture;
      if (!controller || !sourceFrame || !maskFrame || !maskTexture) return;

      const sourceRealWidth = Math.max(1, Math.abs(sourceFrame.realWidth));
      const sourceRealHeight = Math.max(1, Math.abs(sourceFrame.realHeight));
      const maskRealWidth = Math.max(1, Math.abs(maskFrame.realWidth));
      const maskRealHeight = Math.max(1, Math.abs(maskFrame.realHeight));
      const targetAspect = sourceRealWidth / sourceRealHeight;
      const maskAspect = maskRealWidth / maskRealHeight;

      let maskRectWidth = targetAspect;
      let maskRectHeight = 1;
      if (controller.fit === "contain") {
        if (maskAspect > targetAspect)
          maskRectHeight = targetAspect / maskAspect;
        else maskRectWidth = maskAspect;
      } else if (controller.fit === "cover") {
        if (maskAspect > targetAspect) maskRectWidth = maskAspect;
        else maskRectHeight = targetAspect / maskAspect;
      }
      maskRectWidth *= clamp(controller.scale, 0.1, 4);
      maskRectHeight *= clamp(controller.scale, 0.1, 4);

      const maskSourceWidth = Math.max(1, Math.abs(maskFrame.source.width));
      const maskSourceHeight = Math.max(1, Math.abs(maskFrame.source.height));
      const halfTexelU = 0.5 / maskSourceWidth;
      const halfTexelV = 0.5 / maskSourceHeight;
      const maskU0 = Math.min(maskFrame.u0, maskFrame.u1) + halfTexelU;
      const maskV0 = Math.min(maskFrame.v0, maskFrame.v1) + halfTexelV;
      const maskU1 = Math.max(maskFrame.u0, maskFrame.u1) - halfTexelU;
      const maskV1 = Math.max(maskFrame.v0, maskFrame.v1) - halfTexelV;
      const radians = (clamp(controller.rotation, -180, 180) * Math.PI) / 180;

      this.setShader(this.shaders[this.vvfxVisualMaskType]);
      // PreFX flips its projection immediately before this hook, but it did so
      // while the built-in draw shader was current. Copy that live matrix to
      // our draw shader so masked sprites keep Phaser's FBO orientation.
      this.setMatrix4fv("uProjectionMatrix", false, this.projectionMatrix.val);
      this.set1i("uMainSampler", 0);
      this.set1i("vvfxMaskSampler", 1);
      this.bindTexture(maskTexture, 1);
      this.set4f(
        "vvfxSourceUv",
        sourceFrame.u0,
        sourceFrame.v0,
        sourceFrame.u1 - sourceFrame.u0,
        sourceFrame.v1 - sourceFrame.v0,
      );
      this.set4f(
        "vvfxSourceLogical",
        sourceFrame.x / sourceRealWidth,
        sourceFrame.y / sourceRealHeight,
        sourceFrame.cutWidth / sourceRealWidth,
        sourceFrame.cutHeight / sourceRealHeight,
      );
      this.set4f(
        "vvfxMaskUv",
        maskU0,
        maskV0,
        Math.max(0, maskU1 - maskU0),
        Math.max(0, maskV1 - maskV0),
      );
      this.set4f(
        "vvfxMaskLogical",
        maskFrame.x / maskRealWidth,
        maskFrame.y / maskRealHeight,
        maskFrame.cutWidth / maskRealWidth,
        maskFrame.cutHeight / maskRealHeight,
      );
      this.set4f(
        "vvfxMaskTransform",
        clamp(controller.offsetX, -2, 2) * targetAspect,
        clamp(controller.offsetY, -2, 2),
        maskRectWidth,
        maskRectHeight,
      );
      this.set2f("vvfxTargetScale", targetAspect, 1);
      this.set2f("vvfxMaskRotation", Math.cos(radians), Math.sin(radians));
      this.set4f(
        "vvfxMaskOptions",
        clamp01(controller.strength),
        controller.channel === "luminance" ? 1 : 0,
        controller.invert ? 1 : 0,
        0,
      );
    }

    private onVvfxVisualMask() {
      // Masking is fused into the initial sprite draw, before all FX passes.
    }

    private onVvfxNoiseErosion(
      controller: NoiseErosionFxController,
      width: number,
      height: number,
    ) {
      const shader = this.shaders[this.vvfxNoiseErosionType];
      this.setShader(shader);
      this.set4f(
        "vvfxDissolve",
        clamp01(controller.progress),
        clamp(controller.softness, 0.01, 0.5),
        clamp(controller.noiseScale, 1, 16),
        controller.reverse ? 1 : 0,
      );
      this.set2f(
        "vvfxNoiseOffset",
        controller.noiseOffsetX,
        controller.noiseOffsetY,
      );
      const largestSpriteDimension = Math.max(
        1,
        Math.abs(this.spriteBounds.width),
        Math.abs(this.spriteBounds.height),
      );
      this.set2f(
        "vvfxTargetToSprite",
        clamp(Math.abs(width) / largestSpriteDimension, 0.25, 256),
        clamp(Math.abs(height) / largestSpriteDimension, 0.25, 256),
      );
      this.runDraw();
    }
  }

  const pipeline = new ManagedVvfxRenderingFxPipeline(scene.sys.game);
  try {
    return pipeline.installVvfxShaders();
  } catch (error) {
    safelyDestroyPipeline(pipeline);
    throw error;
  }
}

function safelyDestroyPipeline(pipeline: { destroy(): unknown } | null) {
  if (!pipeline) return;
  try {
    pipeline.destroy();
  } catch {
    // A shader-compilation failure can leave Phaser's partially built pipeline
    // unable to complete normal destruction. It was never attached to a sprite.
  }
}

function ensureVvfxRenderingFxPipeline(
  scene: Phaser.Scene,
  onWarning?: (message: string) => void,
): VvfxRenderingFxPipeline | null {
  const manager = phaserPipelineManager(scene);
  if (!manager) return null;

  const existing = manager.get(VVFX_RENDERING_PIPELINE);
  if (isVvfxRenderingFxPipeline(existing)) return existing;

  if (existing || failedRenderingPipelineManagers.has(manager)) {
    failedRenderingPipelineManagers.add(manager);
    warnOnce(
      scene,
      "rendering-pipeline",
      RENDERING_PIPELINE_WARNING,
      onWarning,
    );
    return null;
  }

  let candidate: VvfxRenderingFxPipeline | null = null;
  try {
    candidate = createVvfxRenderingFxPipeline(scene, manager);
    manager.add(
      VVFX_RENDERING_PIPELINE,
      candidate as unknown as Phaser.Renderer.WebGL.WebGLPipeline,
    );
    const registered = manager.get(VVFX_RENDERING_PIPELINE);
    if (!isVvfxRenderingFxPipeline(registered))
      throw new Error("Phaser did not register the Vvfx rendering pipeline.");
    return registered;
  } catch {
    failedRenderingPipelineManagers.add(manager);
    if (
      candidate &&
      (manager.get(VVFX_RENDERING_PIPELINE) as unknown) === candidate
    )
      manager.remove(VVFX_RENDERING_PIPELINE);
    safelyDestroyPipeline(candidate);
    warnOnce(
      scene,
      "rendering-pipeline",
      RENDERING_PIPELINE_WARNING,
      onWarning,
    );
    return null;
  }
}

interface PhaserRenderingEffectHandles {
  signature: string;
  supported: boolean;
  applied: boolean;
  visualMask?: VvfxVisualMaskController;
  colorMatrix?: Phaser.FX.ColorMatrix;
  shine?: Phaser.FX.Shine;
  barrel?: Phaser.FX.Barrel;
  displacement?: Phaser.FX.Displacement;
  directionalDissolve?: Phaser.FX.Wipe;
  noiseErosion?: VvfxNoiseErosionController;
  renderingPipeline?: VvfxRenderingFxPipeline;
}

const handlesBySprite = new WeakMap<
  Phaser.GameObjects.Image,
  PhaserRenderingEffectHandles
>();

function renderingEffectSignature(
  settings: RenderingEffectsSettings,
  visualMaskFrame: Phaser.Textures.Frame | null,
) {
  return `${JSON.stringify(settings)}:${visualMaskFrame ? "resolved" : "missing"}`;
}

export interface PhaserRenderingEffectsResult {
  supported: boolean;
  applied: boolean;
  passCost: number;
}

export function clearPhaserRenderingEffects(
  sprite: Phaser.GameObjects.Image,
): void {
  if (!handlesBySprite.has(sprite)) return;
  sprite.preFX?.disable(true);
  handlesBySprite.delete(sprite);
}

/**
 * Synchronizes Phaser Pre FX without stacking duplicate controllers. Call it
 * after setting the sprite's frame, tint, transform, and alpha.
 */
export function syncPhaserRenderingEffects({
  scene,
  sprite,
  effects,
  resolveAssetFrame,
  onWarning,
}: {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Image;
  effects: EvaluatedRenderingEffects;
  resolveAssetFrame?: PhaserRenderingAssetFrameResolver;
  onWarning?: (message: string) => void;
}): PhaserRenderingEffectsResult {
  const { settings, controllers } = effects;
  const passCost = renderingEffectPassCost(settings);
  if (!hasEnabledRenderingEffects(settings)) {
    clearPhaserRenderingEffects(sprite);
    return { supported: true, applied: false, passCost };
  }

  if (!sceneSupportsPhaserPreFx(scene) || !sprite.preFX) {
    clearPhaserRenderingEffects(sprite);
    warnOnce(
      scene,
      "canvas-renderer",
      UNSUPPORTED_RENDERING_EFFECTS_WARNING,
      onWarning,
    );
    return { supported: false, applied: false, passCost };
  }

  const visualMaskSettings = settings.visualMask;
  let visualMaskFrame: Phaser.Textures.Frame | null = null;
  if (visualMaskSettings.enabled && visualMaskSettings.maskAssetId) {
    try {
      visualMaskFrame =
        resolveAssetFrame?.(visualMaskSettings.maskAssetId) ?? null;
    } catch {
      visualMaskFrame = null;
    }
  }
  if (visualMaskSettings.enabled && !visualMaskFrame) {
    warnOnce(
      scene,
      `visual-mask-source:${visualMaskSettings.maskAssetId ?? "unset"}`,
      VISUAL_MASK_SOURCE_WARNING,
      onWarning,
    );
  }

  const signature = renderingEffectSignature(settings, visualMaskFrame);
  let handles = handlesBySprite.get(sprite);
  if (!handles || handles.signature !== signature) {
    if (handles) sprite.preFX.disable(true);
    sprite.preFX.setPadding(renderingEffectPadding(settings));
    handles = { signature, supported: true, applied: false };

    const dissolve = settings.directionalDissolve;
    const needsNoiseErosion = dissolve.enabled && dissolve.pattern === "noise";
    const needsRenderingPipeline =
      Boolean(visualMaskFrame) || needsNoiseErosion;
    const renderingPipeline = needsRenderingPipeline
      ? ensureVvfxRenderingFxPipeline(scene, onWarning)
      : null;
    if (needsRenderingPipeline && !renderingPipeline) handles.supported = false;
    if (visualMaskSettings.enabled && !visualMaskFrame)
      handles.supported = false;

    if (visualMaskFrame && renderingPipeline) {
      const visualMask = new VvfxVisualMaskController(
        renderingPipeline.vvfxVisualMaskType,
        sprite,
        visualMaskFrame,
        visualMaskSettings,
      );
      sprite.preFX.add(visualMask as unknown as Phaser.FX.Controller);
      handles.visualMask = visualMask;
      handles.renderingPipeline = renderingPipeline;
      handles.applied = true;
    }

    if (settings.brightnessExposure.enabled) {
      handles.colorMatrix = sprite.preFX.addColorMatrix();
      handles.colorMatrix.brightness(controllers.brightnessMultiplier);
      handles.applied = true;
    }

    const gradient = settings.spatialGradient;
    if (gradient.enabled) {
      sprite.preFX.addGradient(
        colorNumber(gradient.colorA),
        colorNumber(gradient.colorB),
        1 - clamp01(gradient.strength),
        clamp01(gradient.fromX),
        clamp01(gradient.fromY),
        clamp01(gradient.toX),
        clamp01(gradient.toY),
        Math.max(0, Math.min(32, Math.floor(gradient.bands))),
      );
      handles.applied = true;
    }

    const warp = settings.spriteWarp;
    if (warp.enabled && warp.mode === "barrel") {
      handles.barrel = sprite.preFX.addBarrel(controllers.barrelAmount);
      handles.applied = true;
    } else if (warp.enabled) {
      const noiseTexture = ensureRenderingNoiseTexture(scene);
      if (noiseTexture) {
        handles.displacement = sprite.preFX.addDisplacement(
          noiseTexture,
          controllers.displacementX,
          controllers.displacementY,
        );
        handles.applied = true;
      } else {
        warnOnce(
          scene,
          "noise-texture",
          "Vvfx could not create its deterministic sprite-warp texture, so sprite warp is omitted.",
          onWarning,
        );
      }
    }

    if (dissolve.enabled && dissolve.pattern === "directional") {
      handles.directionalDissolve = sprite.preFX.addWipe(
        clamp(dissolve.softness, 0.01, 0.5),
        dissolve.reverse ? 1 : 0,
        dissolve.axis === "vertical" ? 1 : 0,
      );
      handles.applied = true;
    } else if (needsNoiseErosion) {
      if (renderingPipeline) {
        const noiseErosion = new VvfxNoiseErosionController(
          renderingPipeline.vvfxNoiseErosionType,
          sprite,
        );
        sprite.preFX.add(noiseErosion as unknown as Phaser.FX.Controller);
        handles.noiseErosion = noiseErosion;
        handles.renderingPipeline = renderingPipeline;
        handles.applied = true;
      }
    }

    const shine = settings.animatedShine;
    if (shine.enabled) {
      handles.shine = sprite.preFX.addShine(
        controllers.shineSpeed,
        controllers.shineLineWidth,
        controllers.shineGradient,
        false,
      );
      handles.applied = true;
    }

    const blur = settings.blur;
    if (blur.enabled) {
      sprite.preFX.addBlur(
        Math.max(0, Math.min(2, Math.floor(blur.quality))) as BlurQuality,
        clamp(blur.offsetX, -12, 12),
        clamp(blur.offsetY, -12, 12),
        clamp(blur.strength, 0, 4),
        colorNumber(blur.color),
        Math.max(1, Math.min(4, Math.floor(blur.steps))),
      );
      handles.applied = true;
    }

    const glow = settings.outerGlow;
    if (glow.enabled) {
      sprite.preFX.addGlow(
        colorNumber(glow.color),
        clamp(glow.outerStrength, 0, 8),
        clamp(glow.innerStrength, 0, 8),
        false,
      );
      handles.applied = true;
    }
    if (handles.renderingPipeline)
      sprite.setPipeline(
        handles.renderingPipeline as unknown as Phaser.Renderer.WebGL.WebGLPipeline,
      );
    handlesBySprite.set(sprite, handles);
  }

  if (handles.barrel) handles.barrel.amount = controllers.barrelAmount;
  if (handles.visualMask && visualMaskFrame) {
    handles.visualMask.maskFrame = visualMaskFrame;
    handles.visualMask.channel = visualMaskSettings.channel;
    handles.visualMask.invert = visualMaskSettings.invert;
    handles.visualMask.fit = visualMaskSettings.fit;
    handles.visualMask.offsetX = visualMaskSettings.offsetX;
    handles.visualMask.offsetY = visualMaskSettings.offsetY;
    handles.visualMask.scale = visualMaskSettings.scale;
    handles.visualMask.rotation = visualMaskSettings.rotation;
    handles.visualMask.strength = visualMaskSettings.strength;
  }
  if (handles.colorMatrix) {
    handles.colorMatrix.reset();
    handles.colorMatrix.brightness(controllers.brightnessMultiplier);
  }
  if (handles.shine) {
    handles.shine.speed = controllers.shineSpeed;
    handles.shine.lineWidth = controllers.shineLineWidth;
    handles.shine.gradient = controllers.shineGradient;
  }
  if (handles.displacement) {
    handles.displacement.x = controllers.displacementX;
    handles.displacement.y = controllers.displacementY;
  }
  if (handles.directionalDissolve)
    handles.directionalDissolve.progress =
      controllers.directionalDissolveProgress;
  if (handles.noiseErosion) {
    handles.noiseErosion.progress = controllers.directionalDissolveProgress;
    handles.noiseErosion.softness = settings.directionalDissolve.softness;
    handles.noiseErosion.noiseScale = settings.directionalDissolve.noiseScale;
    handles.noiseErosion.reverse = settings.directionalDissolve.reverse;
    handles.noiseErosion.noiseOffsetX = controllers.dissolveNoiseOffsetX;
    handles.noiseErosion.noiseOffsetY = controllers.dissolveNoiseOffsetY;
  }
  if (
    handles.renderingPipeline &&
    (sprite.pipeline as unknown) !== handles.renderingPipeline
  )
    sprite.setPipeline(
      handles.renderingPipeline as unknown as Phaser.Renderer.WebGL.WebGLPipeline,
    );

  return {
    supported: handles.supported,
    applied: handles.applied,
    passCost,
  };
}
