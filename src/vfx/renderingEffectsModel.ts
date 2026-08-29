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
 * Phaser's built-in Wipe filter; noise uses a deterministic Vvfx render node.
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

export type RenderingEffectKey = keyof RenderingEffectsSettings;

export type RenderingEffectFadeEasing =
  "linear" | "smooth" | "ease-in" | "ease-out";

/**
 * Chooses the time source used by effect-specific animation controllers.
 * Current clips always use chronological copy-lifetime time. The legacy mode
 * exists only so migrated directional dissolves retain their pre-v18 eased and
 * yoyo-aware transform progression.
 */
export type RenderingEffectClipProgressMode =
  "chronological" | "legacy-transform";

/**
 * A normalized timing window inside one copy of the parent layer. Fade values
 * are fractions of this clip's own duration, rather than layer-lifetime values.
 */
export interface RenderingEffectClip {
  id: string;
  effect: RenderingEffectKey;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  fadeEasing: RenderingEffectFadeEasing;
  progressMode: RenderingEffectClipProgressMode;
}

export type RenderingEffectWeights = Record<RenderingEffectKey, number>;

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
  weights: RenderingEffectWeights;
  controllers: RenderingEffectControllerValues;
}

export interface RenderingEffectsEvaluationInput {
  /** Pass the copy's linear, normalized lifetime progress. */
  lifetimeProgress: number;
  /** Optional legacy/eased progress used by migrated dissolve settings. */
  dissolveProgress?: number;
  elapsedMs: number;
  seed: number;
  clips?: readonly RenderingEffectClip[];
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

export const RENDERING_EFFECT_KEYS = [
  "visualMask",
  "blur",
  "outerGlow",
  "brightnessExposure",
  "animatedShine",
  "spatialGradient",
  "directionalDissolve",
  "spriteWarp",
] as const satisfies readonly RenderingEffectKey[];

export const RENDERING_EFFECT_NAMES = [
  "visual-mask",
  "blur",
  "outer-glow",
  "brightness-exposure",
  "animated-shine",
  "spatial-gradient",
  "directional-dissolve",
  "sprite-warp",
] as const satisfies readonly RenderingEffectName[];

export const MAX_RENDERING_EFFECT_CLIPS = RENDERING_EFFECT_KEYS.length;

const EFFECT_NAME_BY_KEY: Readonly<
  Record<RenderingEffectKey, RenderingEffectName>
> = {
  visualMask: "visual-mask",
  blur: "blur",
  outerGlow: "outer-glow",
  brightnessExposure: "brightness-exposure",
  animatedShine: "animated-shine",
  spatialGradient: "spatial-gradient",
  directionalDissolve: "directional-dissolve",
  spriteWarp: "sprite-warp",
};

const EFFECT_KEY_BY_NAME = Object.fromEntries(
  Object.entries(EFFECT_NAME_BY_KEY).map(([key, name]) => [name, key]),
) as Readonly<Record<RenderingEffectName, RenderingEffectKey>>;

export function renderingEffectNameForKey(
  key: RenderingEffectKey,
): RenderingEffectName {
  return EFFECT_NAME_BY_KEY[key];
}

export function renderingEffectKeyForName(
  name: RenderingEffectName,
): RenderingEffectKey {
  return EFFECT_KEY_BY_NAME[name];
}

export const MAX_RENDERING_EFFECT_PADDING = 64;

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

export function createRenderingEffectClip(
  effect: RenderingEffectKey,
  id: string,
): RenderingEffectClip {
  return {
    id,
    effect,
    start: 0,
    end: 1,
    fadeIn: 0,
    fadeOut: 0,
    fadeEasing: "smooth",
    progressMode: "chronological",
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

const isRenderingEffectKey = (value: unknown): value is RenderingEffectKey =>
  typeof value === "string" &&
  (RENDERING_EFFECT_KEYS as readonly string[]).includes(value);

function renderingEffectIsConfigured(
  settings: RenderingEffectsSettings,
  key: RenderingEffectKey,
): boolean {
  const current = settings[key] as unknown as Record<string, unknown>;
  const defaults = DEFAULT_RENDERING_EFFECTS[key] as unknown as Record<
    string,
    unknown
  >;
  return Object.keys(defaults).some(
    (field) => field !== "enabled" && current[field] !== defaults[field],
  );
}

/**
 * Builds explicit full-life clips for pre-v18 settings. Tuned disabled effects
 * get a clip too, so enabling them later restores both their settings and time.
 */
export function migrateLegacyRenderingEffectClips(
  settings: RenderingEffectsSettings,
): RenderingEffectClip[] {
  return RENDERING_EFFECT_KEYS.flatMap((effect) =>
    settings[effect].enabled || renderingEffectIsConfigured(settings, effect)
      ? [
          {
            ...createRenderingEffectClip(effect, `effect-${effect}`),
            progressMode:
              effect === "directionalDissolve"
                ? "legacy-transform"
                : "chronological",
          },
        ]
      : [],
  );
}

/** Adds full-life clips for authored settings without disturbing timed clips. */
export function reconcileRenderingEffectClips(
  settings: RenderingEffectsSettings,
  clips: readonly RenderingEffectClip[],
  createId: (effect: RenderingEffectKey) => string = (effect) =>
    `effect-${effect}`,
  options: { legacyTransformProgress?: boolean } = {},
): RenderingEffectClip[] {
  const reconciled = clips.map((clip) => ({ ...clip }));
  const usedIds = new Set(reconciled.map((clip) => clip.id));
  for (const effect of RENDERING_EFFECT_KEYS) {
    if (
      (!settings[effect].enabled &&
        !renderingEffectIsConfigured(settings, effect)) ||
      reconciled.some((clip) => clip.effect === effect)
    )
      continue;
    const baseId = createId(effect);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    reconciled.push({
      ...createRenderingEffectClip(effect, id),
      progressMode:
        options.legacyTransformProgress && effect === "directionalDissolve"
          ? "legacy-transform"
          : "chronological",
    });
    usedIds.add(id);
  }
  return reconciled;
}

export function normalizeRenderingEffectClips(
  value: unknown,
  settings: RenderingEffectsSettings,
  options: {
    migrateLegacy?: boolean;
    legacyTransformProgress?: boolean;
  } = {},
): RenderingEffectClip[] {
  const clips: RenderingEffectClip[] = [];
  const seenEffects = new Set<RenderingEffectKey>();
  const seenIds = new Set<string>();
  const candidates = Array.isArray(value)
    ? value.slice(0, MAX_RENDERING_EFFECT_CLIPS)
    : [];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRenderingEffectKey(candidate.effect))
      continue;
    const effect = candidate.effect;
    if (seenEffects.has(effect)) continue;
    const fallbackId = `effect-${effect}`;
    let id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id.trim().slice(0, 160)
        : fallbackId;
    if (seenIds.has(id)) id = fallbackId;
    if (seenIds.has(id)) continue;

    let start = clamp01(finiteNumber(candidate.start, 0));
    let end = clamp01(finiteNumber(candidate.end, 1));
    if (end < start) [start, end] = [end, start];
    if (end - start < 0.001) {
      if (end < 1) end = Math.min(1, start + 0.001);
      else start = Math.max(0, end - 0.001);
    }
    let fadeIn = clamp01(finiteNumber(candidate.fadeIn, 0));
    let fadeOut = clamp01(finiteNumber(candidate.fadeOut, 0));
    const fadeTotal = fadeIn + fadeOut;
    if (fadeTotal > 1) {
      fadeIn /= fadeTotal;
      fadeOut /= fadeTotal;
    }
    const fadeEasing: RenderingEffectFadeEasing = [
      "linear",
      "smooth",
      "ease-in",
      "ease-out",
    ].includes(String(candidate.fadeEasing))
      ? (candidate.fadeEasing as RenderingEffectFadeEasing)
      : "smooth";
    const progressMode: RenderingEffectClipProgressMode = [
      "chronological",
      "legacy-transform",
    ].includes(String(candidate.progressMode))
      ? (candidate.progressMode as RenderingEffectClipProgressMode)
      : options.legacyTransformProgress && effect === "directionalDissolve"
        ? "legacy-transform"
        : "chronological";
    clips.push({
      id,
      effect,
      start,
      end,
      fadeIn,
      fadeOut,
      fadeEasing,
      progressMode,
    });
    seenEffects.add(effect);
    seenIds.add(id);
  }
  return options.migrateLegacy === false
    ? clips
    : reconcileRenderingEffectClips(settings, clips, undefined, options);
}

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

const createRenderingEffectWeights = (value = 0): RenderingEffectWeights => ({
  visualMask: value,
  blur: value,
  outerGlow: value,
  brightnessExposure: value,
  animatedShine: value,
  spatialGradient: value,
  directionalDissolve: value,
  spriteWarp: value,
});

function easeRenderingEffectFade(
  progress: number,
  easing: RenderingEffectFadeEasing,
): number {
  const value = clamp01(progress);
  if (easing === "ease-in") return value * value;
  if (easing === "ease-out") return 1 - (1 - value) * (1 - value);
  if (easing === "smooth") return value * value * (3 - 2 * value);
  return value;
}

export function evaluateRenderingEffectClipWeight(
  clip: RenderingEffectClip,
  lifetimeProgress: number,
): number {
  const progress = clamp01(lifetimeProgress);
  if (progress < clip.start || progress > clip.end) return 0;
  const local = clamp01(
    (progress - clip.start) / Math.max(0.0001, clip.end - clip.start),
  );
  const attack =
    clip.fadeIn > 0
      ? easeRenderingEffectFade(local / clip.fadeIn, clip.fadeEasing)
      : 1;
  const release =
    clip.fadeOut > 0
      ? easeRenderingEffectFade((1 - local) / clip.fadeOut, clip.fadeEasing)
      : 1;
  return clamp01(Math.min(attack, release));
}

export function evaluateRenderingEffectWeights(
  settings: RenderingEffectsSettings,
  clips: readonly RenderingEffectClip[],
  lifetimeProgress: number,
): RenderingEffectWeights {
  const weights = createRenderingEffectWeights();
  for (const effect of RENDERING_EFFECT_KEYS) {
    if (!settings[effect].enabled) continue;
    const matching = clips.filter((clip) => clip.effect === effect);
    weights[effect] =
      matching.length === 0
        ? 1
        : matching.reduce(
            (maximum, clip) =>
              Math.max(
                maximum,
                evaluateRenderingEffectClipWeight(clip, lifetimeProgress),
              ),
            0,
          );
  }
  return weights;
}

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
  const weights = evaluateRenderingEffectWeights(
    settings,
    input.clips ?? [],
    progress,
  );
  const dissolve = settings.directionalDissolve;
  const dissolveClip = input.clips?.find(
    (clip) => clip.effect === "directionalDissolve",
  );
  const dissolveLifetimeProgress =
    dissolveClip && dissolveClip.progressMode !== "legacy-transform"
      ? clamp01(
          (progress - dissolveClip.start) /
            Math.max(0.0001, dissolveClip.end - dissolveClip.start),
        )
      : clamp01(input.dissolveProgress ?? progress);
  const dissolveStart = clamp01(Math.min(dissolve.start, dissolve.end));
  const dissolveEnd = clamp01(Math.max(dissolve.start, dissolve.end));
  const directionalDissolveProgress =
    clamp01(
      (dissolveLifetimeProgress - dissolveStart) /
        Math.max(0.0001, dissolveEnd - dissolveStart),
    ) * weights.directionalDissolve;
  const warp = settings.spriteWarp;
  const seededX = 0.8 + seededRandom(input.seed, 701) * 0.4;
  const seededY = 0.8 + seededRandom(input.seed, 702) * 0.4;
  let displacementX = warp.amountX * seededX * weights.spriteWarp;
  let displacementY = warp.amountY * seededY * weights.spriteWarp;

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
    weights,
    controllers: {
      brightnessMultiplier:
        1 +
        (clamp(
          settings.brightnessExposure.brightness *
            2 ** settings.brightnessExposure.exposure,
          0,
          4,
        ) -
          1) *
          weights.brightnessExposure,
      shineSpeed: clamp(settings.animatedShine.speed, -4, 4),
      shineLineWidth: clamp(settings.animatedShine.lineWidth, 0.01, 1),
      shineGradient: clamp(settings.animatedShine.gradient, 0.1, 12),
      directionalDissolveProgress,
      dissolveNoiseOffsetX: seededRandom(input.seed, 705) * 64,
      dissolveNoiseOffsetY: seededRandom(input.seed, 706) * 64,
      barrelAmount: clamp(1 + warp.barrel * weights.spriteWarp, 0.25, 2),
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
