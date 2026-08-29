import type Phaser from "phaser";
import { seededRandom } from "./random";
import {
  RENDERING_EFFECT_KEYS,
  renderingEffectPassCost,
  type BlurQuality,
  type EvaluatedRenderingEffects,
  type RenderingEffectsSettings,
  type RenderingEffectWeights,
  type SpatialGradientEffectSettings,
  type VisualMaskChannel,
  type VisualMaskEffectSettings,
  type VisualMaskFit,
} from "./renderingEffectsModel";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

export const VVFX_RENDERING_NOISE_TEXTURE = "__vvfx-rendering-noise-v1";
export const UNSUPPORTED_RENDERING_EFFECTS_WARNING =
  "Experimental pixel effects need Phaser WebGL. This Canvas renderer will show the ordinary sprites without visual masks, blur, glow, brightness/exposure, shine, gradients, dissolve/noise erosion, or sprite warp.";

const VVFX_VISUAL_MASK_FILTER = "VvfxVisualMaskFilter";
const VVFX_NOISE_EROSION_FILTER = "VvfxNoiseErosionFilter";
const VVFX_SPATIAL_GRADIENT_FILTER = "VvfxSpatialGradientFilter";
const VVFX_ANIMATED_SHINE_FILTER = "VvfxAnimatedShineFilter";
const RENDERING_FILTER_WARNING =
  "Vvfx could not start its Phaser 4 rendering filters, so Experimental pixel effects are omitted.";
const VISUAL_MASK_SOURCE_WARNING =
  "Vvfx could not resolve the Experimental visual-mask texture, so visual masking is omitted.";

/**
 * Samples a mask in the target sprite's local filter coordinates. Later filter
 * controllers receive the already-masked pixels, preserving authored order.
 */
const VISUAL_MASK_FRAGMENT_SHADER = `#pragma phaserTemplate(shaderName)

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform sampler2D vvfxMaskSampler;
uniform vec4 vvfxMaskUv;
uniform vec4 vvfxMaskLogical;
uniform vec4 vvfxMaskTransform;
uniform vec2 vvfxTargetScale;
uniform vec2 vvfxMaskRotation;
uniform vec4 vvfxMaskOptions;

varying vec2 outTexCoord;

void main ()
{
    vec4 color = texture2D(uMainSampler, outTexCoord);
    vec2 targetUv = outTexCoord;
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
const NOISE_EROSION_FRAGMENT_SHADER = `#pragma phaserTemplate(shaderName)

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

const SPATIAL_GRADIENT_FRAGMENT_SHADER = `#pragma phaserTemplate(shaderName)
#define SRGB_TO_LINEAR(c) pow((c), vec3(2.2))
#define LINEAR_TO_SRGB(c) pow((c), vec3(1.0 / 2.2))
#define SRGB(r, g, b) SRGB_TO_LINEAR(vec3(float(r), float(g), float(b)) / 255.0)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 positionFrom;
uniform vec2 positionTo;
uniform vec3 color1;
uniform vec3 color2;
uniform float alpha;
uniform int size;
varying vec2 outTexCoord;
float gradientNoise(in vec2 uv)
{
    const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(uv, magic.xy)));
}
float stepped (in float value, in int steps)
{
    return steps > 1 ? floor(value * float(steps)) / float(steps - 1) : value;
}
void main ()
{
    vec2 delta = positionTo - positionFrom;
    float denominator = max(dot(delta, delta), 0.000001);
    float distance = dot(outTexCoord - positionFrom, delta) / denominator;
    float amount = size > 1 ? stepped(distance, size) : distance;
    amount = smoothstep(0.0, 1.0, clamp(amount, 0.0, 1.0));
    vec3 color = mix(SRGB(color1.r, color1.g, color1.b), SRGB(color2.r, color2.g, color2.b), amount);
    color = LINEAR_TO_SRGB(color);
    color += (1.0 / 255.0) * gradientNoise(outTexCoord) - (0.5 / 255.0);
    vec4 texture = texture2D(uMainSampler, outTexCoord);
    gl_FragColor = vec4(mix(color.rgb, texture.rgb, alpha), texture.a);
}`;

const ANIMATED_SHINE_FRAGMENT_SHADER = `#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 resolution;
uniform float speed;
uniform float time;
uniform float lineWidth;
uniform float gradient;
uniform float intensity;
varying vec2 outTexCoord;
void main ()
{
    vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
    vec4 texture = texture2D(uMainSampler, outTexCoord);
    uv.x = uv.x - mod(time * speed, 2.0) + 0.5;
    float edge = uv.x * gradient;
    float shine = smoothstep(edge - lineWidth, edge, uv.y) -
        smoothstep(edge, edge + lineWidth, uv.y);
    gl_FragColor = texture + shine * intensity * vec4(1.15, 0.85, 0.85, 1.0) * texture;
}`;

function colorNumber(value: string): number {
  return /^#[0-9a-f]{6}$/i.test(value)
    ? Number.parseInt(value.slice(1), 16)
    : 0xffffff;
}

function phaserRenderNodeManager(
  scene: Phaser.Scene,
): Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager | null {
  return (
    (
      scene.sys.renderer as Phaser.Renderer.Canvas.CanvasRenderer & {
        renderNodes?: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager;
      }
    ).renderNodes ?? null
  );
}

export function sceneSupportsPhaserFilters(scene: Phaser.Scene): boolean {
  return Boolean(phaserRenderNodeManager(scene));
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

export type PhaserRenderingAssetFrameResolver = (
  assetId: string,
) => Phaser.Textures.Frame | null;

class VvfxFilterController {
  active = true;
  allowBaseDraw = true;
  ignoreDestroy = false;
  camera: Phaser.Cameras.Scene2D.Camera | null;
  paddingOverride: Phaser.Geom.Rectangle | null;
  currentPadding: Phaser.Geom.Rectangle;

  constructor(
    camera: Phaser.Cameras.Scene2D.Camera,
    readonly renderNode: string,
  ) {
    this.camera = camera;
    const Rectangle = camera.worldView.constructor as new (
      x?: number,
      y?: number,
      width?: number,
      height?: number,
    ) => Phaser.Geom.Rectangle;
    this.currentPadding = new Rectangle();
    this.paddingOverride = new Rectangle();
  }

  getPadding() {
    return this.paddingOverride ?? this.currentPadding;
  }

  getPaddingCeil() {
    const padding = this.getPadding();
    this.currentPadding.setTo(
      Math.ceil(padding.x),
      Math.ceil(padding.y),
      Math.ceil(padding.width),
      Math.ceil(padding.height),
    );
    return this.currentPadding;
  }

  setPaddingOverride(left: number | null = 0, top = 0, right = 0, bottom = 0) {
    if (left === null) this.paddingOverride = null;
    else {
      const Rectangle = this.currentPadding.constructor as new (
        x?: number,
        y?: number,
        width?: number,
        height?: number,
      ) => Phaser.Geom.Rectangle;
      const rectangle = this.paddingOverride ?? new Rectangle();
      rectangle.setTo(left, top, right - left, bottom - top);
      this.paddingOverride = rectangle;
    }
    return this;
  }

  setActive(value: boolean) {
    this.active = value;
    return this;
  }

  destroy() {
    this.active = false;
    this.camera = null;
    this.paddingOverride = null;
  }
}

class VvfxVisualMaskController extends VvfxFilterController {
  readonly vvfxVisualMaskController = true as const;
  gameObject: Phaser.GameObjects.Image | null;
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
    camera: Phaser.Cameras.Scene2D.Camera,
    sprite: Phaser.GameObjects.Image,
    maskFrame: Phaser.Textures.Frame,
    settings: VisualMaskEffectSettings,
  ) {
    super(camera, VVFX_VISUAL_MASK_FILTER);
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

  override destroy() {
    this.gameObject = null;
    this.maskFrame = null;
    super.destroy();
  }
}

class VvfxNoiseErosionController extends VvfxFilterController {
  gameObject: Phaser.GameObjects.Image | null;
  progress = 0;
  softness = 0.1;
  noiseScale = 6;
  reverse = false;
  noiseOffsetX = 0;
  noiseOffsetY = 0;

  constructor(
    camera: Phaser.Cameras.Scene2D.Camera,
    sprite: Phaser.GameObjects.Image,
  ) {
    super(camera, VVFX_NOISE_EROSION_FILTER);
    this.gameObject = sprite;
  }

  override destroy() {
    this.gameObject = null;
    super.destroy();
  }
}

class VvfxSpatialGradientController extends VvfxFilterController {
  readonly colorA: readonly number[];
  readonly colorB: readonly number[];
  alpha: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly bands: number;

  constructor(
    camera: Phaser.Cameras.Scene2D.Camera,
    settings: SpatialGradientEffectSettings,
  ) {
    super(camera, VVFX_SPATIAL_GRADIENT_FILTER);
    this.colorA = colorChannels(settings.colorA);
    this.colorB = colorChannels(settings.colorB);
    this.alpha = 1 - clamp01(settings.strength);
    this.fromX = clamp01(settings.fromX);
    this.fromY = clamp01(settings.fromY);
    this.toX = clamp01(settings.toX);
    this.toY = clamp01(settings.toY);
    this.bands = Math.max(0, Math.min(32, Math.floor(settings.bands)));
  }
}

class VvfxAnimatedShineController extends VvfxFilterController {
  speed: number;
  lineWidth: number;
  gradient: number;
  intensity: number;
  timeMs: number | null;

  constructor(
    camera: Phaser.Cameras.Scene2D.Camera,
    speed: number,
    lineWidth: number,
    gradient: number,
    intensity: number,
    timeMs: number | null,
  ) {
    super(camera, VVFX_ANIMATED_SHINE_FILTER);
    this.speed = speed;
    this.lineWidth = lineWidth;
    this.gradient = gradient;
    this.intensity = intensity;
    this.timeMs = timeMs;
  }
}

function colorChannels(value: string): readonly [number, number, number] {
  const color = colorNumber(value);
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

type RenderNodeManager = Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager;
type BaseFilterShader = Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader;
type BaseFilterShaderConstructor = new (
  name: string,
  manager: RenderNodeManager,
  fragmentShaderKey?: string,
  fragmentShaderSource?: string,
) => BaseFilterShader;

const registeredRenderNodeManagers = new WeakSet<object>();
const failedRenderNodeManagers = new WeakSet<object>();

function ensureVvfxFilterRenderNodes(
  scene: Phaser.Scene,
  onWarning?: (message: string) => void,
): boolean {
  const manager = phaserRenderNodeManager(scene);
  if (!manager) return false;
  if (registeredRenderNodeManagers.has(manager)) return true;
  if (failedRenderNodeManagers.has(manager)) return false;

  try {
    const wipeNode = manager.getNode("FilterWipe");
    if (!wipeNode)
      throw new Error("Phaser's base filter shader is unavailable.");
    const BaseFilter = Object.getPrototypeOf(Object.getPrototypeOf(wipeNode))
      .constructor as BaseFilterShaderConstructor;

    class VisualMaskFilterNode extends BaseFilter {
      constructor(owner: RenderNodeManager) {
        super(
          VVFX_VISUAL_MASK_FILTER,
          owner,
          undefined,
          VISUAL_MASK_FRAGMENT_SHADER,
        );
      }

      setupTextures(
        controller: Phaser.Filters.Controller,
        textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[],
      ) {
        const visualMask = controller as unknown as VvfxVisualMaskController;
        textures[1] = visualMask.maskFrame?.source.glTexture ?? textures[0];
      }

      setupUniforms(controller: Phaser.Filters.Controller) {
        const visualMask = controller as unknown as VvfxVisualMaskController;
        const sourceFrame = visualMask.gameObject?.frame;
        const maskFrame = visualMask.maskFrame;
        if (!sourceFrame || !maskFrame) return;
        const sourceWidth = Math.max(1, Math.abs(sourceFrame.realWidth));
        const sourceHeight = Math.max(1, Math.abs(sourceFrame.realHeight));
        const maskWidth = Math.max(1, Math.abs(maskFrame.realWidth));
        const maskHeight = Math.max(1, Math.abs(maskFrame.realHeight));
        const targetAspect = sourceWidth / sourceHeight;
        const maskAspect = maskWidth / maskHeight;
        let maskRectWidth = targetAspect;
        let maskRectHeight = 1;
        if (visualMask.fit === "contain") {
          if (maskAspect > targetAspect)
            maskRectHeight = targetAspect / maskAspect;
          else maskRectWidth = maskAspect;
        } else if (visualMask.fit === "cover") {
          if (maskAspect > targetAspect) maskRectWidth = maskAspect;
          else maskRectHeight = targetAspect / maskAspect;
        }
        maskRectWidth *= clamp(visualMask.scale, 0.1, 4);
        maskRectHeight *= clamp(visualMask.scale, 0.1, 4);
        const maskSourceWidth = Math.max(1, Math.abs(maskFrame.source.width));
        const maskSourceHeight = Math.max(1, Math.abs(maskFrame.source.height));
        const halfTexelU = 0.5 / maskSourceWidth;
        const halfTexelV = 0.5 / maskSourceHeight;
        const maskU0 = Math.min(maskFrame.u0, maskFrame.u1) + halfTexelU;
        const maskV0 = Math.min(maskFrame.v0, maskFrame.v1) + halfTexelV;
        const maskU1 = Math.max(maskFrame.u0, maskFrame.u1) - halfTexelU;
        const maskV1 = Math.max(maskFrame.v0, maskFrame.v1) - halfTexelV;
        const radians = (clamp(visualMask.rotation, -180, 180) * Math.PI) / 180;
        this.programManager.setUniform("vvfxMaskSampler", 1);
        this.programManager.setUniform("vvfxMaskUv", [
          maskU0,
          maskV0,
          Math.max(0, maskU1 - maskU0),
          Math.max(0, maskV1 - maskV0),
        ]);
        this.programManager.setUniform("vvfxMaskLogical", [
          maskFrame.x / maskWidth,
          maskFrame.y / maskHeight,
          maskFrame.cutWidth / maskWidth,
          maskFrame.cutHeight / maskHeight,
        ]);
        this.programManager.setUniform("vvfxMaskTransform", [
          clamp(visualMask.offsetX, -2, 2) * targetAspect,
          clamp(visualMask.offsetY, -2, 2),
          maskRectWidth,
          maskRectHeight,
        ]);
        this.programManager.setUniform("vvfxTargetScale", [targetAspect, 1]);
        this.programManager.setUniform("vvfxMaskRotation", [
          Math.cos(radians),
          Math.sin(radians),
        ]);
        this.programManager.setUniform("vvfxMaskOptions", [
          clamp01(visualMask.strength),
          visualMask.channel === "luminance" ? 1 : 0,
          visualMask.invert ? 1 : 0,
          0,
        ]);
      }
    }

    class NoiseErosionFilterNode extends BaseFilter {
      constructor(owner: RenderNodeManager) {
        super(
          VVFX_NOISE_EROSION_FILTER,
          owner,
          undefined,
          NOISE_EROSION_FRAGMENT_SHADER,
        );
      }

      setupUniforms(
        controller: Phaser.Filters.Controller,
        drawingContext: Phaser.Renderer.WebGL.DrawingContext,
      ) {
        const noiseErosion =
          controller as unknown as VvfxNoiseErosionController;
        const largestDimension = Math.max(
          1,
          Math.abs(drawingContext.width),
          Math.abs(drawingContext.height),
        );
        this.programManager.setUniform("vvfxDissolve", [
          clamp01(noiseErosion.progress),
          clamp(noiseErosion.softness, 0.01, 0.5),
          clamp(noiseErosion.noiseScale, 1, 16),
          noiseErosion.reverse ? 1 : 0,
        ]);
        this.programManager.setUniform("vvfxNoiseOffset", [
          noiseErosion.noiseOffsetX,
          noiseErosion.noiseOffsetY,
        ]);
        this.programManager.setUniform("vvfxTargetToSprite", [
          clamp(Math.abs(drawingContext.width) / largestDimension, 0.25, 256),
          clamp(Math.abs(drawingContext.height) / largestDimension, 0.25, 256),
        ]);
      }
    }

    class SpatialGradientFilterNode extends BaseFilter {
      constructor(owner: RenderNodeManager) {
        super(
          VVFX_SPATIAL_GRADIENT_FILTER,
          owner,
          undefined,
          SPATIAL_GRADIENT_FRAGMENT_SHADER,
        );
      }

      setupUniforms(controller: Phaser.Filters.Controller) {
        const gradient = controller as unknown as VvfxSpatialGradientController;
        this.programManager.setUniform("positionFrom", [
          gradient.fromX,
          gradient.fromY,
        ]);
        this.programManager.setUniform("positionTo", [
          gradient.toX,
          gradient.toY,
        ]);
        this.programManager.setUniform("color1", gradient.colorA);
        this.programManager.setUniform("color2", gradient.colorB);
        this.programManager.setUniform("alpha", gradient.alpha);
        this.programManager.setUniform("size", gradient.bands);
      }
    }

    class AnimatedShineFilterNode extends BaseFilter {
      constructor(owner: RenderNodeManager) {
        super(
          VVFX_ANIMATED_SHINE_FILTER,
          owner,
          undefined,
          ANIMATED_SHINE_FRAGMENT_SHADER,
        );
      }

      setupUniforms(
        controller: Phaser.Filters.Controller,
        drawingContext: Phaser.Renderer.WebGL.DrawingContext,
      ) {
        const shine = controller as unknown as VvfxAnimatedShineController;
        const time =
          shine.timeMs ?? shine.camera?.scene.sys.game.loop.time ?? 0;
        this.programManager.setUniform("resolution", [
          drawingContext.width,
          drawingContext.height,
        ]);
        this.programManager.setUniform("time", time / 1_000);
        this.programManager.setUniform("speed", shine.speed);
        this.programManager.setUniform("lineWidth", shine.lineWidth);
        this.programManager.setUniform("gradient", shine.gradient);
        this.programManager.setUniform("intensity", shine.intensity);
      }
    }

    const constructors: ReadonlyArray<
      readonly [string, new (owner: RenderNodeManager) => BaseFilterShader]
    > = [
      [VVFX_VISUAL_MASK_FILTER, VisualMaskFilterNode],
      [VVFX_NOISE_EROSION_FILTER, NoiseErosionFilterNode],
      [VVFX_SPATIAL_GRADIENT_FILTER, SpatialGradientFilterNode],
      [VVFX_ANIMATED_SHINE_FILTER, AnimatedShineFilterNode],
    ];
    for (const [name] of constructors)
      if (manager.hasNode(name))
        throw new Error(`Phaser RenderNode name collision: ${name}`);
    for (const [name, constructor] of constructors)
      manager.addNodeConstructor(name, constructor);
    for (const [name] of constructors)
      if (!manager.getNode(name))
        throw new Error(`Phaser did not construct ${name}.`);
    registeredRenderNodeManagers.add(manager);
    return true;
  } catch {
    failedRenderNodeManagers.add(manager);
    warnOnce(scene, "rendering-filters", RENDERING_FILTER_WARNING, onWarning);
    return false;
  }
}

interface PhaserRenderingEffectHandles {
  settingsSnapshot: RenderingEffectsSettings;
  activeEffects: number;
  visualMaskResolved: boolean;
  supported: boolean;
  applied: boolean;
  filterList: Phaser.GameObjects.Components.FilterList;
  filters: Phaser.Filters.Controller[];
  visualMask?: VvfxVisualMaskController;
  colorMatrix?: Phaser.Display.ColorMatrix;
  shine?: VvfxAnimatedShineController;
  gradient?: VvfxSpatialGradientController;
  barrel?: Phaser.Filters.Barrel;
  displacement?: Phaser.Filters.Displacement;
  blur?: Phaser.Filters.Blur;
  glow?: Phaser.Filters.Glow;
  directionalDissolve?: Phaser.Filters.Wipe;
  noiseErosion?: VvfxNoiseErosionController;
}

const handlesBySprite = new WeakMap<
  Phaser.GameObjects.Image,
  PhaserRenderingEffectHandles
>();

function snapshotRenderingEffectsSettings(
  settings: RenderingEffectsSettings,
): RenderingEffectsSettings {
  return {
    visualMask: { ...settings.visualMask },
    blur: { ...settings.blur },
    outerGlow: { ...settings.outerGlow },
    brightnessExposure: { ...settings.brightnessExposure },
    animatedShine: { ...settings.animatedShine },
    spatialGradient: { ...settings.spatialGradient },
    directionalDissolve: { ...settings.directionalDissolve },
    spriteWarp: { ...settings.spriteWarp },
  };
}

/**
 * Phaser receives immutable settings during ordinary preview/runtime playback,
 * but this structural comparison also keeps the public adapter correct for a
 * caller that mutates an existing settings object. Unlike JSON.stringify, it
 * does not serialize every effect on every rendered copy and frame.
 */
function renderingEffectsSettingsEqual(
  current: RenderingEffectsSettings,
  snapshot: RenderingEffectsSettings,
): boolean {
  for (const effect of RENDERING_EFFECT_KEYS) {
    const currentSettings = current[effect] as unknown as Record<
      string,
      unknown
    >;
    const snapshotSettings = snapshot[effect] as unknown as Record<
      string,
      unknown
    >;
    for (const field in currentSettings) {
      if (
        Object.prototype.hasOwnProperty.call(currentSettings, field) &&
        currentSettings[field] !== snapshotSettings[field]
      )
        return false;
    }
    for (const field in snapshotSettings) {
      if (
        Object.prototype.hasOwnProperty.call(snapshotSettings, field) &&
        !Object.prototype.hasOwnProperty.call(currentSettings, field)
      )
        return false;
    }
  }
  return true;
}

function activeRenderingEffectMask(
  settings: RenderingEffectsSettings,
  weights: RenderingEffectWeights,
): number {
  let mask = 0;
  for (let index = 0; index < RENDERING_EFFECT_KEYS.length; index += 1) {
    const effect = RENDERING_EFFECT_KEYS[index];
    if (settings[effect].enabled && weights[effect] > 0) mask |= 1 << index;
  }
  return mask;
}

export interface PhaserRenderingEffectsResult {
  supported: boolean;
  applied: boolean;
  passCost: number;
}

export function clearPhaserRenderingEffects(
  sprite: Phaser.GameObjects.Image,
): void {
  const handles = handlesBySprite.get(sprite);
  if (!handles) return;
  for (const filter of handles.filters) {
    try {
      handles.filterList.remove(filter, true);
    } catch {
      filter.destroy();
    }
  }
  handlesBySprite.delete(sprite);
}

/**
 * Synchronizes Phaser 4 Filters without stacking duplicate controllers. Call it
 * after setting the sprite's frame, tint, transform, and alpha.
 */
export function syncPhaserRenderingEffects({
  scene,
  sprite,
  effects,
  timeMs,
  resolveAssetFrame,
  onWarning,
}: {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Image;
  effects: EvaluatedRenderingEffects;
  /** Explicit effect time for deterministic seeking and restarts. */
  timeMs?: number;
  resolveAssetFrame?: PhaserRenderingAssetFrameResolver;
  onWarning?: (message: string) => void;
}): PhaserRenderingEffectsResult {
  const { settings, controllers, weights } = effects;
  const effectTimeMs = Number.isFinite(timeMs) ? (timeMs as number) : null;
  const passCost = renderingEffectPassCost(settings);
  const activeEffects = activeRenderingEffectMask(settings, weights);
  if (activeEffects === 0) {
    clearPhaserRenderingEffects(sprite);
    return { supported: true, applied: false, passCost };
  }

  if (!sceneSupportsPhaserFilters(scene)) {
    clearPhaserRenderingEffects(sprite);
    warnOnce(
      scene,
      "canvas-renderer",
      UNSUPPORTED_RENDERING_EFFECTS_WARNING,
      onWarning,
    );
    return { supported: false, applied: false, passCost };
  }

  sprite.enableFilters();
  const filterList = sprite.filters?.internal ?? null;
  if (!filterList) {
    clearPhaserRenderingEffects(sprite);
    return { supported: false, applied: false, passCost };
  }

  const visualMaskSettings = settings.visualMask;
  const visualMaskActive = visualMaskSettings.enabled && weights.visualMask > 0;
  let visualMaskFrame: Phaser.Textures.Frame | null = null;
  if (visualMaskActive && visualMaskSettings.maskAssetId) {
    try {
      visualMaskFrame =
        resolveAssetFrame?.(visualMaskSettings.maskAssetId) ?? null;
    } catch {
      visualMaskFrame = null;
    }
  }
  if (visualMaskActive && !visualMaskFrame) {
    warnOnce(
      scene,
      `visual-mask-source:${visualMaskSettings.maskAssetId ?? "unset"}`,
      VISUAL_MASK_SOURCE_WARNING,
      onWarning,
    );
  }

  let handles = handlesBySprite.get(sprite);
  if (
    !handles ||
    handles.activeEffects !== activeEffects ||
    handles.visualMaskResolved !== Boolean(visualMaskFrame) ||
    !renderingEffectsSettingsEqual(settings, handles.settingsSnapshot)
  ) {
    if (handles) clearPhaserRenderingEffects(sprite);
    handles = {
      settingsSnapshot: snapshotRenderingEffectsSettings(settings),
      activeEffects,
      visualMaskResolved: Boolean(visualMaskFrame),
      supported: true,
      applied: false,
      filterList,
      filters: [],
    };

    const track = <T extends Phaser.Filters.Controller>(filter: T): T => {
      handles?.filters.push(filter);
      return filter;
    };
    const addCustom = <T extends VvfxFilterController>(filter: T): T => {
      filterList.add(filter as unknown as Phaser.Filters.Controller);
      return track(filter as unknown as Phaser.Filters.Controller) as T;
    };

    const dissolve = settings.directionalDissolve;
    const dissolveActive = dissolve.enabled && weights.directionalDissolve > 0;
    const needsNoiseErosion = dissolveActive && dissolve.pattern === "noise";
    const needsCustomFilters =
      Boolean(visualMaskFrame) ||
      needsNoiseErosion ||
      (settings.spatialGradient.enabled && weights.spatialGradient > 0) ||
      (settings.animatedShine.enabled && weights.animatedShine > 0);
    const customFiltersReady = needsCustomFilters
      ? ensureVvfxFilterRenderNodes(scene, onWarning)
      : true;
    if (!customFiltersReady) handles.supported = false;
    if (visualMaskActive && !visualMaskFrame) handles.supported = false;

    if (visualMaskFrame && customFiltersReady) {
      handles.visualMask = addCustom(
        new VvfxVisualMaskController(
          filterList.camera,
          sprite,
          visualMaskFrame,
          visualMaskSettings,
        ),
      );
      handles.applied = true;
    }

    if (settings.brightnessExposure.enabled && weights.brightnessExposure > 0) {
      const colorMatrixFilter = track(filterList.addColorMatrix());
      handles.colorMatrix = colorMatrixFilter.colorMatrix;
      handles.colorMatrix.brightness(controllers.brightnessMultiplier);
      handles.applied = true;
    }

    const gradient = settings.spatialGradient;
    if (gradient.enabled && weights.spatialGradient > 0 && customFiltersReady) {
      handles.gradient = addCustom(
        new VvfxSpatialGradientController(filterList.camera, gradient),
      );
      handles.applied = true;
    }

    const warp = settings.spriteWarp;
    if (warp.enabled && weights.spriteWarp > 0 && warp.mode === "barrel") {
      handles.barrel = track(filterList.addBarrel(controllers.barrelAmount));
      handles.applied = true;
    } else if (warp.enabled && weights.spriteWarp > 0) {
      const noiseTexture = ensureRenderingNoiseTexture(scene);
      if (noiseTexture) {
        handles.displacement = track(
          filterList.addDisplacement(
            noiseTexture,
            controllers.displacementX,
            controllers.displacementY,
          ),
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

    if (dissolveActive && dissolve.pattern === "directional") {
      handles.directionalDissolve = track(
        filterList.addWipe(
          clamp(dissolve.softness, 0.01, 0.5),
          dissolve.reverse ? 1 : 0,
          dissolve.axis === "vertical" ? 1 : 0,
          0,
        ),
      );
      handles.applied = true;
    } else if (needsNoiseErosion && customFiltersReady) {
      handles.noiseErosion = addCustom(
        new VvfxNoiseErosionController(filterList.camera, sprite),
      );
      handles.applied = true;
    }

    const shine = settings.animatedShine;
    if (shine.enabled && weights.animatedShine > 0 && customFiltersReady) {
      handles.shine = addCustom(
        new VvfxAnimatedShineController(
          filterList.camera,
          controllers.shineSpeed,
          controllers.shineLineWidth,
          controllers.shineGradient,
          weights.animatedShine,
          effectTimeMs,
        ),
      );
      handles.applied = true;
    }

    const blur = settings.blur;
    if (blur.enabled && weights.blur > 0) {
      handles.blur = track(
        filterList.addBlur(
          Math.max(0, Math.min(2, Math.floor(blur.quality))) as BlurQuality,
          clamp(blur.offsetX, -12, 12),
          clamp(blur.offsetY, -12, 12),
          clamp(blur.strength, 0, 4),
          colorNumber(blur.color),
          Math.max(1, Math.min(4, Math.floor(blur.steps))),
        ),
      );
      handles.applied = true;
    }

    const glow = settings.outerGlow;
    if (glow.enabled && weights.outerGlow > 0) {
      handles.glow = track(
        filterList.addGlow(
          colorNumber(glow.color),
          clamp(glow.outerStrength, 0, 8),
          clamp(glow.innerStrength, 0, 8),
          1,
          false,
        ),
      );
      handles.applied = true;
    }
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
    handles.visualMask.strength =
      visualMaskSettings.strength * weights.visualMask;
  }
  if (handles.colorMatrix) {
    handles.colorMatrix.reset();
    handles.colorMatrix.brightness(controllers.brightnessMultiplier);
  }
  if (handles.shine) {
    handles.shine.speed = controllers.shineSpeed;
    handles.shine.lineWidth = controllers.shineLineWidth;
    handles.shine.gradient = controllers.shineGradient;
    handles.shine.intensity = weights.animatedShine;
    handles.shine.timeMs = effectTimeMs;
  }
  if (handles.gradient)
    handles.gradient.alpha =
      1 - settings.spatialGradient.strength * weights.spatialGradient;
  if (handles.displacement) {
    handles.displacement.x = controllers.displacementX;
    handles.displacement.y = controllers.displacementY;
  }
  if (handles.blur)
    handles.blur.strength = settings.blur.strength * weights.blur;
  if (handles.glow) {
    handles.glow.outerStrength =
      settings.outerGlow.outerStrength * weights.outerGlow;
    handles.glow.innerStrength =
      settings.outerGlow.innerStrength * weights.outerGlow;
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
  return {
    supported: handles.supported,
    applied: handles.applied,
    passCost,
  };
}
