"use client";

import { Trash2, Wand2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import {
  createDefaultRenderingEffects,
  type DissolvePattern,
  type RenderingEffectsSettings,
  type SpriteWarpMode,
} from "../../vfx/renderingEffectsModel";
import type { VfxAsset } from "../../vfx/types";
import {
  HelpTip,
  RangeField,
  SelectField,
  SettingsSection,
  Toggle,
} from "./Controls";

function ColorField({
  label,
  value,
  help,
  onChange,
}: {
  label: string;
  value: string;
  help: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="field experimental-color-field">
      <span className="field__label">
        <label htmlFor={inputId}>{label}</label>{" "}
        <HelpTip label={label} text={help} />
      </span>
      <span>
        <input
          id={inputId}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <code>{value}</code>
      </span>
    </div>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="field-grid">{children}</div>;
}

export function ExperimentalRenderingSection({
  effects,
  assets,
  onChange,
  focusedEffect,
  title = "Experimental rendering",
  onRemove,
}: {
  effects: RenderingEffectsSettings;
  assets: VfxAsset[];
  onChange: (effects: RenderingEffectsSettings) => void;
  focusedEffect?: keyof RenderingEffectsSettings;
  title?: string;
  onRemove?: () => void;
}) {
  const change = <Key extends keyof RenderingEffectsSettings>(
    key: Key,
    patch: Partial<RenderingEffectsSettings[Key]>,
  ) =>
    onChange({
      ...effects,
      [key]: { ...effects[key], ...patch },
    });
  const stillMaskAssets = assets.filter((asset) => !asset.spriteSheet);
  const defaults = createDefaultRenderingEffects();
  const removeAction = (key: keyof RenderingEffectsSettings, name: string) => {
    if (focusedEffect === key && onRemove) {
      return (
        <div className="feature-lifecycle-actions">
          <button
            type="button"
            className="small-button"
            title={`Remove ${name} from this layer. Undo restores it.`}
            onClick={onRemove}
          >
            <Trash2 size={13} /> Remove effect
          </button>
        </div>
      );
    }
    if (JSON.stringify(effects[key]) === JSON.stringify(defaults[key]))
      return null;
    return (
      <div className="feature-lifecycle-actions">
        <button
          type="button"
          className="small-button"
          title={`Remove ${name}, forget its saved settings, and return it to defaults. Undo restores it.`}
          onClick={() =>
            onChange({
              ...effects,
              [key]: structuredClone(defaults[key]),
            })
          }
        >
          <Trash2 size={13} /> Remove {name}
        </button>
      </div>
    );
  };

  return (
    <SettingsSection
      title={title}
      icon={<Wand2 size={15} />}
      badge={focusedEffect ? "WebGL" : "Experimental"}
      badgeTone="experimental"
      defaultOpen={focusedEffect !== undefined}
    >
      {!focusedEffect && (
        <p className="section-intro">
          These GPU effects are ready to try, save, record, and export. They
          need Phaser WebGL; Canvas-only devices safely show the ordinary image.
        </p>
      )}
      <div
        className="experimental-compatibility"
        aria-label="Experimental rendering compatibility"
        hidden={focusedEffect !== undefined}
      >
        <span>Editor WebGL · supported</span>
        <span>Phaser WebGL · supported</span>
        <span>WebM/GIF · captured from preview</span>
        <span>Canvas · plain-image fallback</span>
      </div>

      {(!focusedEffect || focusedEffect === "visualMask") && (
        <div className="experimental-effects-group">
          {!focusedEffect && <strong>Clipping</strong>}
          <Toggle
            label="Clip with another image"
            checked={effects.visualMask.enabled}
            help="Keeps this layer visible where a second image says it should be. Unlike Inside an image silhouette, this changes visible pixels instead of choosing where copies begin."
            onChange={(enabled) =>
              change("visualMask", {
                enabled,
                maskAssetId:
                  enabled && !effects.visualMask.maskAssetId
                    ? (stillMaskAssets[0]?.id ?? null)
                    : effects.visualMask.maskAssetId,
              })
            }
          />
          {removeAction("visualMask", "visual mask")}
          {effects.visualMask.enabled && (
            <>
              <SelectField
                label="Mask image"
                value={effects.visualMask.maskAssetId ?? ""}
                help="Uses one still image as the clipping shape. Sprite sheets are deliberately excluded from this first bounded version."
                onChange={(maskAssetId) =>
                  change("visualMask", {
                    maskAssetId: maskAssetId || null,
                  })
                }
              >
                <option value="">Choose a still image</option>
                {stillMaskAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </SelectField>
              <FieldGroup>
                <SelectField
                  label="Read mask from"
                  value={effects.visualMask.channel}
                  help="Opacity uses transparent and visible pixels. Brightness uses dark and light pixels in the mask artwork."
                  onChange={(channel) =>
                    change("visualMask", {
                      channel: channel as "alpha" | "luminance",
                    })
                  }
                >
                  <option value="alpha">Opacity</option>
                  <option value="luminance">Brightness</option>
                </SelectField>
                <SelectField
                  label="Fit mask"
                  value={effects.visualMask.fit}
                  help="Stretch matches the target exactly. Fit whole mask preserves its proportions. Fill image may crop the mask edges."
                  onChange={(fit) =>
                    change("visualMask", {
                      fit: fit as "stretch" | "contain" | "cover",
                    })
                  }
                >
                  <option value="stretch">Stretch to image</option>
                  <option value="contain">Fit whole mask</option>
                  <option value="cover">Fill image</option>
                </SelectField>
                <RangeField
                  label="Horizontal position"
                  value={effects.visualMask.offsetX * 100}
                  defaultValue={0}
                  min={-200}
                  max={200}
                  unit="%"
                  help="Moves the mask left or right inside the target image."
                  onChange={(value) =>
                    change("visualMask", { offsetX: value / 100 })
                  }
                />
                <RangeField
                  label="Vertical position"
                  value={effects.visualMask.offsetY * 100}
                  defaultValue={0}
                  min={-200}
                  max={200}
                  unit="%"
                  help="Moves the mask up or down inside the target image."
                  onChange={(value) =>
                    change("visualMask", { offsetY: value / 100 })
                  }
                />
                <RangeField
                  label="Mask size"
                  value={effects.visualMask.scale * 100}
                  defaultValue={100}
                  min={10}
                  max={400}
                  unit="%"
                  help="Scales the clipping shape around its center."
                  onChange={(value) =>
                    change("visualMask", { scale: value / 100 })
                  }
                />
                <RangeField
                  label="Mask rotation"
                  value={effects.visualMask.rotation}
                  defaultValue={0}
                  min={-180}
                  max={180}
                  unit="°"
                  help="Turns the mask inside the target image."
                  onChange={(rotation) => change("visualMask", { rotation })}
                />
                <RangeField
                  label="Mask strength"
                  value={effects.visualMask.strength * 100}
                  defaultValue={100}
                  min={0}
                  max={100}
                  unit="%"
                  help="Blends between the unmasked image at 0% and full clipping at 100%."
                  onChange={(value) =>
                    change("visualMask", { strength: value / 100 })
                  }
                />
              </FieldGroup>
              <Toggle
                label="Swap kept and hidden areas"
                checked={effects.visualMask.invert}
                help="Keeps the opposite part of the mask."
                onChange={(invert) => change("visualMask", { invert })}
              />
              <p className="inspector-hint inspector-hint--warning">
                WebGL only: Canvas shows the ordinary unmasked sprite. The mask
                follows this effect’s timing without changing the parent layer.
                Bake essential clipping into the source image when Canvas must
                match.
              </p>
            </>
          )}
        </div>
      )}

      {(!focusedEffect ||
        [
          "outerGlow",
          "blur",
          "brightnessExposure",
          "animatedShine",
          "spatialGradient",
        ].includes(focusedEffect)) && (
        <div className="experimental-effects-group">
          {!focusedEffect && <strong>Light and color</strong>}
          {(!focusedEffect || focusedEffect === "outerGlow") && (
            <>
              <Toggle
                label="Soft outer glow"
                checked={effects.outerGlow.enabled}
                help="Adds a real soft halo around visible pixels. Good for magic, electricity, and neon artwork."
                onChange={(enabled) => change("outerGlow", { enabled })}
              />
              {removeAction("outerGlow", "outer glow")}
              {effects.outerGlow.enabled && (
                <FieldGroup>
                  <ColorField
                    label="Glow color"
                    value={effects.outerGlow.color}
                    help="The halo color."
                    onChange={(color) => change("outerGlow", { color })}
                  />
                  <RangeField
                    label="Outer strength"
                    value={effects.outerGlow.outerStrength}
                    defaultValue={3}
                    min={0}
                    max={8}
                    step={0.1}
                    help="How strongly the halo extends outside the image. Try 2–4 first."
                    onChange={(outerStrength) =>
                      change("outerGlow", { outerStrength })
                    }
                  />
                  <RangeField
                    label="Inner strength"
                    value={effects.outerGlow.innerStrength}
                    defaultValue={0}
                    min={0}
                    max={8}
                    step={0.1}
                    help="Adds light just inside the visible edge."
                    onChange={(innerStrength) =>
                      change("outerGlow", { innerStrength })
                    }
                  />
                </FieldGroup>
              )}
            </>
          )}

          {(!focusedEffect || focusedEffect === "blur") && (
            <>
              <Toggle
                label="True blur"
                checked={effects.blur.enabled}
                help="Softens the image pixels with a GPU blur. More steps and higher quality cost more to render."
                onChange={(enabled) => change("blur", { enabled })}
              />
              {removeAction("blur", "blur")}
              {effects.blur.enabled && (
                <>
                  <SelectField
                    label="Blur quality"
                    value={String(effects.blur.quality)}
                    help="Start with Low. Increase quality only when the result visibly needs it."
                    onChange={(quality) =>
                      change("blur", { quality: Number(quality) as 0 | 1 | 2 })
                    }
                  >
                    <option value="0">Low · fastest</option>
                    <option value="1">Medium</option>
                    <option value="2">High · heaviest</option>
                  </SelectField>
                  <FieldGroup>
                    <RangeField
                      label="Blur strength"
                      value={effects.blur.strength}
                      defaultValue={1}
                      min={0}
                      max={4}
                      step={0.1}
                      help="How strongly the pixels soften."
                      onChange={(strength) => change("blur", { strength })}
                    />
                    <RangeField
                      label="Blur steps"
                      value={effects.blur.steps}
                      defaultValue={2}
                      min={1}
                      max={4}
                      help="Extra smoothing passes. Each step adds GPU work for every visible copy."
                      onChange={(steps) => change("blur", { steps })}
                    />
                    <RangeField
                      label="Horizontal spread"
                      value={effects.blur.offsetX}
                      defaultValue={2}
                      min={-12}
                      max={12}
                      unit="px"
                      help="Positive and negative values change the horizontal blur direction."
                      onChange={(offsetX) => change("blur", { offsetX })}
                    />
                    <RangeField
                      label="Vertical spread"
                      value={effects.blur.offsetY}
                      defaultValue={2}
                      min={-12}
                      max={12}
                      unit="px"
                      help="Positive and negative values change the vertical blur direction."
                      onChange={(offsetY) => change("blur", { offsetY })}
                    />
                    <ColorField
                      label="Blur color"
                      value={effects.blur.color}
                      help="Colors the softened pixels. White keeps the source color neutral."
                      onChange={(color) => change("blur", { color })}
                    />
                  </FieldGroup>
                </>
              )}
            </>
          )}

          {(!focusedEffect || focusedEffect === "brightnessExposure") && (
            <>
              <Toggle
                label="Brightness and exposure"
                checked={effects.brightnessExposure.enabled}
                help="Makes the entire image darker or brighter. Exposure changes intensity in photographic stops."
                onChange={(enabled) =>
                  change("brightnessExposure", { enabled })
                }
              />
              {removeAction("brightnessExposure", "brightness and exposure")}
              {effects.brightnessExposure.enabled && (
                <FieldGroup>
                  <RangeField
                    label="Brightness"
                    value={effects.brightnessExposure.brightness * 100}
                    defaultValue={100}
                    min={0}
                    max={200}
                    unit="%"
                    help="100% keeps the original brightness; 0% is black and 200% is twice as bright."
                    onChange={(value) =>
                      change("brightnessExposure", { brightness: value / 100 })
                    }
                  />
                  <RangeField
                    label="Exposure"
                    value={effects.brightnessExposure.exposure}
                    defaultValue={0}
                    min={-2}
                    max={2}
                    step={0.1}
                    unit=" stops"
                    help="Each positive stop roughly doubles light; each negative stop halves it."
                    onChange={(exposure) =>
                      change("brightnessExposure", { exposure })
                    }
                  />
                </FieldGroup>
              )}
            </>
          )}

          {(!focusedEffect || focusedEffect === "animatedShine") && (
            <>
              <Toggle
                label="Animated shine"
                checked={effects.animatedShine.enabled}
                help="Sweeps a bright line across the image during playback. Its experimental phase follows Phaser's renderer clock, so exact scrub positions may vary."
                onChange={(enabled) => change("animatedShine", { enabled })}
              />
              {removeAction("animatedShine", "animated shine")}
              {effects.animatedShine.enabled && (
                <FieldGroup>
                  <RangeField
                    label="Shine speed"
                    value={effects.animatedShine.speed}
                    defaultValue={0.5}
                    min={-4}
                    max={4}
                    step={0.1}
                    unit="×"
                    help="How quickly the light line travels. Negative values reverse it."
                    onChange={(speed) => change("animatedShine", { speed })}
                  />
                  <RangeField
                    label="Shine width"
                    value={effects.animatedShine.lineWidth * 100}
                    defaultValue={50}
                    min={1}
                    max={100}
                    unit="%"
                    help="How wide the moving highlight appears."
                    onChange={(value) =>
                      change("animatedShine", { lineWidth: value / 100 })
                    }
                  />
                  <RangeField
                    label="Edge softness"
                    value={effects.animatedShine.gradient}
                    defaultValue={3}
                    min={0.1}
                    max={12}
                    step={0.1}
                    help="Higher values make the shine edge more gradual."
                    onChange={(gradient) =>
                      change("animatedShine", { gradient })
                    }
                  />
                </FieldGroup>
              )}
            </>
          )}

          {(!focusedEffect || focusedEffect === "spatialGradient") && (
            <>
              <Toggle
                label="Gradient across image"
                checked={effects.spatialGradient.enabled}
                help="Places different colors across different parts of one image. This is different from changing the whole image color over time."
                onChange={(enabled) => change("spatialGradient", { enabled })}
              />
              {removeAction("spatialGradient", "spatial gradient")}
              {effects.spatialGradient.enabled && (
                <>
                  <FieldGroup>
                    <ColorField
                      label="Gradient color A"
                      value={effects.spatialGradient.colorA}
                      help="The color at the gradient's starting point."
                      onChange={(colorA) =>
                        change("spatialGradient", { colorA })
                      }
                    />
                    <ColorField
                      label="Gradient color B"
                      value={effects.spatialGradient.colorB}
                      help="The color at the gradient's ending point."
                      onChange={(colorB) =>
                        change("spatialGradient", { colorB })
                      }
                    />
                    <RangeField
                      label="Gradient strength"
                      value={effects.spatialGradient.strength * 100}
                      defaultValue={70}
                      min={0}
                      max={100}
                      unit="%"
                      help="How strongly the two colors cover the source image."
                      onChange={(value) =>
                        change("spatialGradient", { strength: value / 100 })
                      }
                    />
                    <RangeField
                      label="Color bands"
                      value={effects.spatialGradient.bands}
                      defaultValue={0}
                      min={0}
                      max={32}
                      help="0 is a smooth gradient. Higher values divide it into visible color steps."
                      onChange={(bands) => change("spatialGradient", { bands })}
                    />
                  </FieldGroup>
                  <FieldGroup>
                    <RangeField
                      label="Gradient start X"
                      value={effects.spatialGradient.fromX * 100}
                      defaultValue={0}
                      min={0}
                      max={100}
                      unit="%"
                      help="Horizontal starting point inside the image."
                      onChange={(value) =>
                        change("spatialGradient", { fromX: value / 100 })
                      }
                    />
                    <RangeField
                      label="Gradient start Y"
                      value={effects.spatialGradient.fromY * 100}
                      defaultValue={0}
                      min={0}
                      max={100}
                      unit="%"
                      help="Vertical starting point inside the image."
                      onChange={(value) =>
                        change("spatialGradient", { fromY: value / 100 })
                      }
                    />
                    <RangeField
                      label="Gradient end X"
                      value={effects.spatialGradient.toX * 100}
                      defaultValue={0}
                      min={0}
                      max={100}
                      unit="%"
                      help="Horizontal ending point inside the image."
                      onChange={(value) =>
                        change("spatialGradient", { toX: value / 100 })
                      }
                    />
                    <RangeField
                      label="Gradient end Y"
                      value={effects.spatialGradient.toY * 100}
                      defaultValue={100}
                      min={0}
                      max={100}
                      unit="%"
                      help="Vertical ending point inside the image."
                      onChange={(value) =>
                        change("spatialGradient", { toY: value / 100 })
                      }
                    />
                  </FieldGroup>
                </>
              )}
            </>
          )}
        </div>
      )}

      {(!focusedEffect || focusedEffect === "directionalDissolve") && (
        <div className="experimental-effects-group">
          {!focusedEffect && <strong>Reveal</strong>}
          <Toggle
            label="Dissolve / erase"
            checked={effects.directionalDissolve.enabled}
            help="Removes this sprite while the effect clip is active. Straight wipe uses one moving edge; noisy erosion breaks it into irregular disappearing patches."
            onChange={(enabled) => change("directionalDissolve", { enabled })}
          />
          {removeAction("directionalDissolve", "dissolve / erase")}
          {effects.directionalDissolve.enabled && (
            <>
              <SelectField
                label="Erase pattern"
                value={effects.directionalDissolve.pattern}
                help="Straight wipe uses one soft line. Noisy erosion uses seeded procedural noise, not an image mask or spawn stencil."
                onChange={(pattern) =>
                  change("directionalDissolve", {
                    pattern: pattern as DissolvePattern,
                  })
                }
              >
                <option value="directional">Straight wipe</option>
                <option value="noise">Noisy erosion</option>
              </SelectField>
              <FieldGroup>
                <RangeField
                  label={
                    focusedEffect
                      ? "Erase begins inside effect"
                      : "Erase starts"
                  }
                  value={effects.directionalDissolve.start * 100}
                  defaultValue={0}
                  min={0}
                  max={effects.directionalDissolve.end * 100}
                  unit={focusedEffect ? "% of effect" : "% of life"}
                  help={
                    focusedEffect
                      ? "The point inside this effect clip where erasing begins."
                      : "The point in every copy's existing lifetime where erasing begins."
                  }
                  onChange={(value) =>
                    change("directionalDissolve", { start: value / 100 })
                  }
                />
                <RangeField
                  label={
                    focusedEffect
                      ? "Erase finishes inside effect"
                      : "Erase finishes"
                  }
                  value={effects.directionalDissolve.end * 100}
                  defaultValue={100}
                  min={effects.directionalDissolve.start * 100}
                  max={100}
                  unit={focusedEffect ? "% of effect" : "% of life"}
                  help="The point where the image has been fully erased."
                  onChange={(value) =>
                    change("directionalDissolve", { end: value / 100 })
                  }
                />
                <RangeField
                  label="Edge softness"
                  value={effects.directionalDissolve.softness * 100}
                  defaultValue={10}
                  min={1}
                  max={50}
                  unit="%"
                  help="How soft the boundary between visible and erased pixels appears."
                  onChange={(value) =>
                    change("directionalDissolve", { softness: value / 100 })
                  }
                />
                {effects.directionalDissolve.pattern === "noise" ? (
                  <RangeField
                    label="Pattern size"
                    value={effects.directionalDissolve.noiseScale}
                    defaultValue={6}
                    min={1}
                    max={16}
                    help="Lower values create larger chunks. Higher values create smaller, busier patches."
                    onChange={(noiseScale) =>
                      change("directionalDissolve", { noiseScale })
                    }
                  />
                ) : (
                  <SelectField
                    label="Wipe direction"
                    value={effects.directionalDissolve.axis}
                    help="Choose whether the erase edge travels across or down the image."
                    onChange={(axis) =>
                      change("directionalDissolve", {
                        axis: axis as "horizontal" | "vertical",
                      })
                    }
                  >
                    <option value="horizontal">Across image</option>
                    <option value="vertical">Down image</option>
                  </SelectField>
                )}
              </FieldGroup>
              <Toggle
                label={
                  effects.directionalDissolve.pattern === "noise"
                    ? "Invert erosion pattern"
                    : "Reverse wipe"
                }
                checked={effects.directionalDissolve.reverse}
                help={
                  effects.directionalDissolve.pattern === "noise"
                    ? "Changes which patches disappear first. It does not make the layer play backward."
                    : "Makes the erase edge travel from the opposite side."
                }
                onChange={(reverse) =>
                  change("directionalDissolve", { reverse })
                }
              />
              {effects.directionalDissolve.pattern === "noise" && (
                <p className="inspector-hint inspector-hint--warning">
                  WebGL only: Canvas keeps the ordinary, un-eroded sprite. Noise
                  erosion adds one GPU pass per visible copy. Shine, blur, and
                  glow follow its remaining silhouette. Add a normal opacity
                  fade when the Canvas fallback must still disappear.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {(!focusedEffect || focusedEffect === "spriteWarp") && (
        <div className="experimental-effects-group">
          {!focusedEffect && <strong>Warp</strong>}
          <Toggle
            label="Distort image"
            checked={effects.spriteWarp.enabled}
            help="Warps this image's own pixels. It does not bend or refract the game scene behind it."
            onChange={(enabled) => change("spriteWarp", { enabled })}
          />
          {removeAction("spriteWarp", "image distortion")}
          {effects.spriteWarp.enabled && (
            <>
              <SelectField
                label="Warp style"
                value={effects.spriteWarp.mode}
                help="Barrel bends the image as a lens. Noise makes an irregular surface. Heat shimmer animates that sprite-local noise."
                onChange={(mode) =>
                  change("spriteWarp", { mode: mode as SpriteWarpMode })
                }
              >
                <option value="barrel">Lens / barrel</option>
                <option value="noise">Noise warp</option>
                <option value="heat-shimmer">Heat shimmer prototype</option>
              </SelectField>
              {effects.spriteWarp.mode === "barrel" ? (
                <RangeField
                  label="Lens bend"
                  value={effects.spriteWarp.barrel * 100}
                  defaultValue={15}
                  min={-75}
                  max={100}
                  unit="%"
                  help="Negative values pinch inward; positive values bulge outward."
                  onChange={(value) =>
                    change("spriteWarp", { barrel: value / 100 })
                  }
                />
              ) : (
                <FieldGroup>
                  <RangeField
                    label="Horizontal warp"
                    value={effects.spriteWarp.amountX * 10_000}
                    defaultValue={60}
                    min={-1000}
                    max={1000}
                    help="Small values are powerful. Try 30–80 for a readable shimmer."
                    onChange={(value) =>
                      change("spriteWarp", { amountX: value / 10_000 })
                    }
                  />
                  <RangeField
                    label="Vertical warp"
                    value={effects.spriteWarp.amountY * 10_000}
                    defaultValue={30}
                    min={-1000}
                    max={1000}
                    help="Controls how strongly the image bends vertically."
                    onChange={(value) =>
                      change("spriteWarp", { amountY: value / 10_000 })
                    }
                  />
                  {effects.spriteWarp.mode === "heat-shimmer" && (
                    <RangeField
                      label="Shimmer speed"
                      value={effects.spriteWarp.speed}
                      defaultValue={2}
                      min={0}
                      max={8}
                      step={0.1}
                      unit="/s"
                      help="How quickly the sprite-local distortion changes strength."
                      onChange={(speed) => change("spriteWarp", { speed })}
                    />
                  )}
                </FieldGroup>
              )}
              <p className="inspector-hint inspector-hint--warning">
                This is sprite-local distortion. True heat haze or refraction
                that bends the scene needs explicit game-camera capture and is
                deliberately decision-deferred.
              </p>
            </>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
