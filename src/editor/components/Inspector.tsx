"use client";

import {
  Activity,
  Box,
  Boxes,
  Clock3,
  Copy,
  Dices,
  Diamond,
  Film,
  Link2,
  Move,
  Palette,
  Plus,
  RotateCw,
  Route,
  Sparkles,
  Trash2,
  Wand2,
  Wind,
} from "lucide-react";
import type { ReactNode } from "react";
import { describeLayer, layerTypeLabel } from "../guidance";
import { makeId } from "../../vfx/defaults";
import type {
  BehaviorEnvelopeSettings,
  VfxAsset,
  VfxGroup,
  VfxLayer,
} from "../../vfx/types";
import { isSpawnLayer } from "../../vfx/types";
import {
  insertKeyframe,
  KEYFRAME_PRESETS,
  keyframesFromTransform,
  keyframesFromPreset,
  MAX_KEYFRAMES,
  moveKeyframe,
  syncKeyframeEndpoints,
} from "../../vfx/keyframes";
import {
  normalizeFrameAnimation,
  normalizeSpriteSheet,
  spriteSheetFromGrid,
  spriteSheetGrid,
  suggestedSpriteSheet,
} from "../../vfx/spriteSheet";
import { TRAIL_PRESETS, trailFromPreset } from "../../vfx/trailPresets";
import {
  alphaMaskThresholdByte,
  maximumAlphaMaskValue,
} from "../../vfx/alphaMask";
import { EasingCurveEditor } from "./EasingCurveEditor";
import { ExperimentalRenderingSection } from "./ExperimentalRenderingSection";
import { FlipbookPreview } from "./FlipbookPreview";
import {
  HelpTip,
  RangeField,
  SelectField,
  SettingsSection,
  Toggle,
} from "./Controls";

function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="field-grid">{children}</div>;
}

type EnvelopePreset = "entire" | "fade-in" | "fade-out" | "middle" | "custom";

const ENVELOPE_PRESETS: Record<
  Exclude<EnvelopePreset, "custom">,
  BehaviorEnvelopeSettings
> = {
  entire: {
    enabled: false,
    start: 0,
    attackEnd: 0,
    releaseStart: 1,
    end: 1,
  },
  "fade-in": {
    enabled: true,
    start: 0,
    attackEnd: 0.3,
    releaseStart: 1,
    end: 1,
  },
  "fade-out": {
    enabled: true,
    start: 0,
    attackEnd: 0,
    releaseStart: 0.65,
    end: 1,
  },
  middle: {
    enabled: true,
    start: 0.12,
    attackEnd: 0.28,
    releaseStart: 0.72,
    end: 0.9,
  },
};

function envelopePresetFor(envelope: BehaviorEnvelopeSettings): EnvelopePreset {
  for (const [name, preset] of Object.entries(ENVELOPE_PRESETS)) {
    if (
      envelope.enabled === preset.enabled &&
      envelope.start === preset.start &&
      envelope.attackEnd === preset.attackEnd &&
      envelope.releaseStart === preset.releaseStart &&
      envelope.end === preset.end
    )
      return name as EnvelopePreset;
  }
  return "custom";
}

function BehaviorEnvelopeEditor({
  envelope,
  duration,
  behaviorName,
  onChange,
}: {
  envelope: BehaviorEnvelopeSettings;
  duration: number;
  behaviorName: string;
  onChange: (envelope: BehaviorEnvelopeSettings) => void;
}) {
  const milliseconds = (value: number) => Math.round(value * duration);
  return (
    <div className="behavior-envelope">
      <SelectField
        label={`${behaviorName} timing`}
        value={envelopePresetFor(envelope)}
        help={`Controls ${behaviorName.toLowerCase()} strength inside every copy's existing lifetime. It does not create another Timeline or move the layer's Start/End values.`}
        onChange={(value) => {
          const preset = value as EnvelopePreset;
          onChange(
            preset === "custom"
              ? {
                  enabled: true,
                  start: 0,
                  attackEnd: 0.2,
                  releaseStart: 0.8,
                  end: 1,
                }
              : { ...ENVELOPE_PRESETS[preset] },
          );
        }}
      >
        <option value="entire">Entire copy lifetime</option>
        <option value="fade-in">Fade behavior in</option>
        <option value="fade-out">Fade behavior out</option>
        <option value="middle">Middle beat only</option>
        <option value="custom">Custom stages</option>
      </SelectField>
      {envelope.enabled && (
        <FieldGroup>
          <RangeField
            label="Behavior starts"
            value={envelope.start * 100}
            defaultValue={0}
            min={0}
            max={envelope.attackEnd * 100}
            unit={`% · ${milliseconds(envelope.start)} ms`}
            help="Strength is zero before this point in each copy's lifetime."
            onChange={(value) => onChange({ ...envelope, start: value / 100 })}
          />
          <RangeField
            label="Full strength"
            value={envelope.attackEnd * 100}
            defaultValue={20}
            min={envelope.start * 100}
            max={envelope.releaseStart * 100}
            unit={`% · ${milliseconds(envelope.attackEnd)} ms`}
            help="The behavior fades from zero to full strength by this point."
            onChange={(value) =>
              onChange({ ...envelope, attackEnd: value / 100 })
            }
          />
          <RangeField
            label="Release begins"
            value={envelope.releaseStart * 100}
            defaultValue={80}
            min={envelope.attackEnd * 100}
            max={envelope.end * 100}
            unit={`% · ${milliseconds(envelope.releaseStart)} ms`}
            help="The behavior holds at full strength until this point, then fades out."
            onChange={(value) =>
              onChange({ ...envelope, releaseStart: value / 100 })
            }
          />
          <RangeField
            label="Behavior ends"
            value={envelope.end * 100}
            defaultValue={100}
            min={envelope.releaseStart * 100}
            max={100}
            unit={`% · ${milliseconds(envelope.end)} ms`}
            help="Strength reaches zero here while the copy can keep moving or fading normally."
            onChange={(value) => onChange({ ...envelope, end: value / 100 })}
          />
        </FieldGroup>
      )}
    </div>
  );
}

function eventTargetWouldCycle(
  layers: VfxLayer[],
  sourceId: string,
  targetId: string,
  ignoredEventId?: string,
): boolean {
  if (sourceId === targetId) return true;
  const links = new Map<string, string[]>();
  for (const candidate of layers) {
    links.set(
      candidate.id,
      candidate.events
        .filter(
          (event) =>
            !(candidate.id === sourceId && event.id === ignoredEventId),
        )
        .map((event) => event.targetLayerId),
    );
  }
  links.set(sourceId, [...(links.get(sourceId) ?? []), targetId]);
  const visited = new Set<string>();
  const reachesSource = (id: string): boolean => {
    if (id === sourceId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return (links.get(id) ?? []).some(reachesSource);
  };
  return reachesSource(targetId);
}

export function Inspector({
  layer,
  assets,
  groups = [],
  layers,
  onChange,
  onAssetChange,
  onCopy,
  onPaste,
  canPaste,
}: {
  layer: VfxLayer | null;
  assets: VfxAsset[];
  groups?: VfxGroup[];
  layers: VfxLayer[];
  onChange: (layer: VfxLayer) => void;
  onAssetChange: (asset: VfxAsset) => void;
  onCopy: () => void;
  onPaste: () => void;
  canPaste: boolean;
}) {
  if (!layer) {
    return (
      <aside className="panel inspector empty-inspector">
        <div className="empty-state">
          <Sparkles size={28} />
          <strong>Select a layer to shape it</strong>
          <p>
            Every part of an effect gets its own approachable set of controls
            here.
          </p>
        </div>
      </aside>
    );
  }
  const setTransform = (patch: Partial<VfxLayer["transform"]>) => {
    const transform = { ...layer.transform, ...patch };
    onChange({
      ...layer,
      transform,
      keyframes: syncKeyframeEndpoints(layer.keyframes, transform, patch),
    });
  };
  const setTiming = (patch: Partial<VfxLayer["timing"]>) =>
    onChange({ ...layer, timing: { ...layer.timing, ...patch } });
  const setAppearance = (patch: Partial<VfxLayer["appearance"]>) =>
    onChange({ ...layer, appearance: { ...layer.appearance, ...patch } });
  const setColorOverLifetime = (
    patch: Partial<VfxLayer["appearance"]["colorOverLifetime"]>,
  ) =>
    setAppearance({
      colorOverLifetime: {
        ...layer.appearance.colorOverLifetime,
        ...patch,
      },
    });
  const setBehavior = <Key extends keyof VfxLayer["behavior"]>(
    key: Key,
    patch: Partial<VfxLayer["behavior"][Key]>,
  ) =>
    onChange({
      ...layer,
      behavior: {
        ...layer.behavior,
        [key]: { ...layer.behavior[key], ...patch },
      },
    });
  const setRandom = (patch: Partial<VfxLayer["random"]>) =>
    onChange({ ...layer, random: { ...layer.random, ...patch } });
  const setFrameAnimation = (patch: Partial<VfxLayer["frameAnimation"]>) => {
    const asset = assets.find((candidate) => candidate.id === layer.assetId);
    onChange({
      ...layer,
      frameAnimation: normalizeFrameAnimation(
        { ...layer.frameAnimation, ...patch },
        asset?.spriteSheet?.frameCount,
      ),
    });
  };
  const setTrail = (patch: Partial<VfxLayer["trail"]>) =>
    onChange({ ...layer, trail: { ...layer.trail, ...patch } });
  const setBeam = (patch: { endX?: number; endY?: number }) => {
    if (layer.type === "beam")
      onChange({ ...layer, beam: { ...layer.beam, ...patch } });
  };
  const setMotionPath = (patch: Partial<VfxLayer["motionPath"]>) =>
    onChange({
      ...layer,
      motionPath: { ...layer.motionPath, ...patch },
    });
  const setKeyframes = (keyframes: VfxLayer["keyframes"]) =>
    onChange({ ...layer, keyframes });
  const setEvent = (id: string, patch: Partial<VfxLayer["events"][number]>) =>
    onChange({
      ...layer,
      events: layer.events.map((event) =>
        event.id === id ? { ...event, ...patch } : event,
      ),
    });
  const setKeyframe = (
    index: number,
    patch: Partial<VfxLayer["keyframes"]["frames"][number]>,
  ) => {
    const frames = layer.keyframes.frames.map((frame, frameIndex) =>
      frameIndex === index ? { ...frame, ...patch } : frame,
    );
    const transform = { ...layer.transform };
    if (index === 0) {
      if (patch.scaleX !== undefined) {
        transform.startScaleX = patch.scaleX;
        if (!transform.separateScale) transform.startScale = patch.scaleX;
      }
      if (patch.scaleY !== undefined) transform.startScaleY = patch.scaleY;
      if (patch.opacity !== undefined) transform.startOpacity = patch.opacity;
    }
    if (index === frames.length - 1) {
      if (patch.scaleX !== undefined) {
        transform.endScaleX = patch.scaleX;
        if (!transform.separateScale) transform.endScale = patch.scaleX;
      }
      if (patch.scaleY !== undefined) transform.endScaleY = patch.scaleY;
      if (patch.opacity !== undefined) transform.endOpacity = patch.opacity;
      if (patch.rotation !== undefined)
        transform.rotationDuring = patch.rotation;
    }
    onChange({
      ...layer,
      transform,
      keyframes: { ...layer.keyframes, frames },
    });
  };
  const setMotionPathPoint = (
    index: number,
    patch: Partial<VfxLayer["motionPath"]["points"][number]>,
  ) =>
    setMotionPath({
      points: layer.motionPath.points.map((point, pointIndex) =>
        pointIndex === index ? { ...point, ...patch } : point,
      ),
    });
  const setSpawn = (patch: Record<string, unknown>) => {
    if (isSpawnLayer(layer))
      onChange({ ...layer, spawn: { ...layer.spawn, ...patch } });
  };
  const looksLikeSmoke = /smoke|cloud|wisp|steam/i.test(layer.name);
  const needsSmokeFade = looksLikeSmoke && layer.transform.endOpacity > 0.2;
  const identicalBurst =
    isSpawnLayer(layer) &&
    layer.type === "burst" &&
    Object.values(layer.random).every((value) => value === 0);
  const selectedAsset = assets.find((asset) => asset.id === layer.assetId);
  const incomingEvents = layers.flatMap((source) =>
    source.events
      .filter((event) => event.targetLayerId === layer.id)
      .map((event) => ({ source, event })),
  );
  const firstSafeEventTarget = layers.find(
    (candidate) =>
      candidate.id !== layer.id &&
      !eventTargetWouldCycle(layers, layer.id, candidate.id),
  );
  const copyFinishTargetIsSafe = (candidate: VfxLayer) =>
    candidate.id !== layer.id &&
    candidate.startMode === "triggered" &&
    (candidate.type === "animated" || candidate.type === "burst") &&
    !candidate.timing.repeatForever &&
    !candidate.timing.loop &&
    !candidate.parentId &&
    !eventTargetWouldCycle(layers, layer.id, candidate.id);
  const firstSafeCopyFinishTarget = layers.find(copyFinishTargetIsSafe);
  const preparedMaskAssets = assets.filter(
    (asset) =>
      !asset.builtIn &&
      !asset.spriteSheet &&
      asset.alphaMask &&
      maximumAlphaMaskValue(asset.alphaMask) > 0,
  );
  const selectedMaskAsset = preparedMaskAssets.find(
    (asset) => isSpawnLayer(layer) && asset.id === layer.spawn.maskAssetId,
  );
  const spriteSheet = selectedAsset?.spriteSheet ?? null;
  const spriteGrid =
    selectedAsset && spriteSheet
      ? spriteSheetGrid(selectedAsset, spriteSheet)
      : null;
  const frameAnimation = spriteSheet
    ? normalizeFrameAnimation(layer.frameAnimation, spriteSheet.frameCount)
    : layer.frameAnimation;
  const tintPickerValue =
    layer.appearance.tint && /^#[0-9a-f]{6}$/i.test(layer.appearance.tint)
      ? layer.appearance.tint
      : "#ffffff";
  const updateSpriteSheet = (
    patch: Partial<NonNullable<VfxAsset["spriteSheet"]>>,
  ) => {
    if (!selectedAsset || !spriteSheet) return;
    onAssetChange({
      ...selectedAsset,
      spriteSheet: normalizeSpriteSheet(selectedAsset, {
        ...spriteSheet,
        ...patch,
      }),
    });
  };

  return (
    <aside
      className="panel inspector"
      aria-label={`Settings for ${layer.name}`}
    >
      <div className="inspector-header">
        <div>
          <span className="eyebrow">Selected {layerTypeLabel(layer.type)}</span>
          <input
            className="layer-name-input"
            value={layer.name}
            aria-label="Layer name"
            onChange={(event) =>
              onChange({ ...layer, name: event.target.value })
            }
          />
        </div>
        <div className="compact-actions">
          <button
            type="button"
            onClick={onCopy}
            title="Copy layer settings"
            aria-label="Copy layer settings"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            onClick={onPaste}
            disabled={!canPaste}
            title="Paste copied settings"
            aria-label="Paste copied settings"
          >
            <Wand2 size={14} />
          </button>
        </div>
      </div>
      <div className="inspector-scroll">
        {!layer.assetId && (
          <div className="friendly-error">
            This layer has no image yet. Choose one below to make it visible.
          </div>
        )}
        <label className="field">
          <span className="field__label">
            Image{" "}
            <HelpTip text="The artwork used by this part of the effect. One image can be reused in as many layers as you like." />
          </span>
          <select
            value={layer.assetId ?? ""}
            onChange={(event) =>
              onChange({ ...layer, assetId: event.target.value || null })
            }
          >
            <option value="">Choose an image…</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">
            Effect group <Boxes size={13} />{" "}
            <HelpTip text="A group adds one shared position and timing offset while every member keeps its own settings." />
          </span>
          <select
            aria-label="Effect group"
            value={layer.groupId ?? ""}
            onChange={(event) =>
              onChange({ ...layer, groupId: event.target.value || null })
            }
          >
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        {selectedAsset && !selectedAsset.builtIn && (
          <SettingsSection title="Sprite frames" icon={<Film size={15} />}>
            <Toggle
              label="Use as a sprite sheet"
              checked={Boolean(spriteSheet)}
              help="Slices one image into equally sized animation frames. This setup is shared anywhere the image is used."
              onChange={(enabled) =>
                onAssetChange({
                  ...selectedAsset,
                  spriteSheet: enabled
                    ? suggestedSpriteSheet(selectedAsset)
                    : null,
                })
              }
            />
            {spriteSheet && (
              <>
                <p className="section-note">
                  Source: {selectedAsset.width ?? "?"} ×{" "}
                  {selectedAsset.height ?? "?"} px. Frames are read left to
                  right, then top to bottom.
                </p>
                <FlipbookPreview
                  key={`${spriteSheet.frameWidth}-${spriteSheet.frameHeight}-${spriteSheet.frameCount}-${frameAnimation.framesPerSecond}-${frameAnimation.startFrame}-${frameAnimation.endFrame}-${frameAnimation.playback}-${frameAnimation.loop}-${frameAnimation.randomStartFrame}`}
                  asset={selectedAsset}
                  animation={frameAnimation}
                />
                <FieldGroup>
                  <RangeField
                    label="Columns"
                    value={spriteGrid?.columns ?? 1}
                    min={1}
                    max={Math.min(64, selectedAsset.width ?? 64)}
                    help="How many equally sized frame cells run across the image. Try 4 for a common 4 by 4 sheet."
                    onChange={(columns) =>
                      onAssetChange({
                        ...selectedAsset,
                        spriteSheet: spriteSheetFromGrid(
                          selectedAsset,
                          columns,
                          spriteGrid?.rows ?? 1,
                        ),
                      })
                    }
                  />
                  <RangeField
                    label="Rows"
                    value={spriteGrid?.rows ?? 1}
                    min={1}
                    max={Math.min(64, selectedAsset.height ?? 64)}
                    help="How many equally sized frame cells run down the image. Try 4 for a common 4 by 4 sheet."
                    onChange={(rows) =>
                      onAssetChange({
                        ...selectedAsset,
                        spriteSheet: spriteSheetFromGrid(
                          selectedAsset,
                          spriteGrid?.columns ?? 1,
                          rows,
                        ),
                      })
                    }
                  />
                  <RangeField
                    label="Frame count"
                    value={spriteSheet.frameCount}
                    min={1}
                    max={spriteGrid?.capacity ?? 1}
                    help="How many cells contain artwork. Lower this when the final row has empty cells."
                    onChange={(frameCount) => updateSpriteSheet({ frameCount })}
                  />
                  <RangeField
                    label="Frames per second"
                    value={frameAnimation.framesPerSecond}
                    defaultValue={12}
                    min={1}
                    max={60}
                    unit="fps"
                    help="How quickly this layer moves through the sheet."
                    onChange={(framesPerSecond) =>
                      setFrameAnimation({ framesPerSecond })
                    }
                  />
                  <RangeField
                    label="First frame"
                    value={Math.min(
                      spriteSheet.frameCount - 1,
                      frameAnimation.startFrame,
                    )}
                    defaultValue={0}
                    min={0}
                    max={spriteSheet.frameCount - 1}
                    help="The first frame this layer is allowed to use."
                    onChange={(startFrame) => setFrameAnimation({ startFrame })}
                  />
                  <RangeField
                    label="Last frame"
                    value={Math.min(
                      spriteSheet.frameCount - 1,
                      frameAnimation.endFrame ?? spriteSheet.frameCount - 1,
                    )}
                    defaultValue={spriteSheet.frameCount - 1}
                    min={frameAnimation.startFrame}
                    max={spriteSheet.frameCount - 1}
                    help="The final frame included in this layer's playback range."
                    onChange={(endFrame) => setFrameAnimation({ endFrame })}
                  />
                </FieldGroup>
                <SelectField
                  label="Frame direction"
                  value={frameAnimation.playback}
                  help="Forward, reverse, or forward and then backward."
                  onChange={(playback) =>
                    setFrameAnimation({
                      playback:
                        playback as VfxLayer["frameAnimation"]["playback"],
                    })
                  }
                >
                  <option value="forward">Forward</option>
                  <option value="reverse">Reverse</option>
                  <option value="ping-pong">Forward, then backward</option>
                </SelectField>
                <Toggle
                  label="Loop sprite frames"
                  checked={frameAnimation.loop}
                  help="Repeats the frame sequence for as long as this layer instance is alive."
                  onChange={(loop) => setFrameAnimation({ loop })}
                />
                <Toggle
                  label="Random starting frame"
                  checked={frameAnimation.randomStartFrame}
                  help="Each spawned copy begins on a repeatable random frame. Useful for fire, smoke, and crowds of identical particles."
                  onChange={(randomStartFrame) =>
                    setFrameAnimation({ randomStartFrame })
                  }
                />
                <p className="section-note">
                  Each frame is {spriteSheet.frameWidth} Ã—{" "}
                  {spriteSheet.frameHeight} px. The main Timeline remains the
                  source of truth for when this layer starts and stops.
                </p>
              </>
            )}
          </SettingsSection>
        )}

        {selectedAsset && !selectedAsset.builtIn && (
          <SettingsSection
            title="Game texture atlas"
            icon={<Boxes size={15} />}
          >
            <p className="section-note">
              Optional: enter the named Phaser frame used when this image is
              mapped to a preloaded texture atlas in your game. The editor keeps
              using the uploaded preview image.
            </p>
            <label className="field">
              <span className="field__label">
                Atlas frame name{" "}
                <HelpTip text="For example: vfx/spark-01. Map this asset to the atlas texture key when calling the Vvfx runtime." />
              </span>
              <input
                type="text"
                aria-label="Atlas frame name"
                maxLength={160}
                value={selectedAsset.atlasFrame ?? ""}
                placeholder="vfx/spark-01"
                disabled={Boolean(spriteSheet)}
                onChange={(event) =>
                  onAssetChange({
                    ...selectedAsset,
                    atlasFrame: event.target.value || null,
                  })
                }
              />
            </label>
            {spriteSheet && (
              <p className="context-tip">
                Turn off sprite-sheet slicing to use one named atlas frame for
                this asset.
              </p>
            )}
          </SettingsSection>
        )}

        <SettingsSection title="Basic" icon={<Box size={15} />} defaultOpen>
          <FieldGroup>
            <RangeField
              label="Position X"
              value={layer.transform.x}
              defaultValue={0}
              min={-400}
              max={400}
              unit="px"
              help="Moves this layer left or right. You can also drag it in the preview."
              onChange={(x) => setTransform({ x })}
            />
            <RangeField
              label="Position Y"
              value={layer.transform.y}
              defaultValue={0}
              min={-260}
              max={260}
              unit="px"
              help="Moves this layer up or down. Negative values move upward."
              onChange={(y) => setTransform({ y })}
            />
            {!layer.transform.separateScale && (
              <RangeField
                label={
                  layer.type === "beam" ? "Starting thickness" : "Starting size"
                }
                value={layer.transform.startScale * 100}
                defaultValue={100}
                min={0}
                max={400}
                unit="%"
                help={
                  layer.type === "beam"
                    ? "Scales the bolt's thickness while its length remains pinned to the endpoints."
                    : "How large each copy is when it first appears."
                }
                onChange={(value) => setTransform({ startScale: value / 100 })}
              />
            )}
            {layer.type !== "static" && !layer.transform.separateScale && (
              <RangeField
                label={
                  layer.type === "beam" ? "Ending thickness" : "Ending size"
                }
                value={layer.transform.endScale * 100}
                defaultValue={100}
                min={0}
                max={400}
                unit="%"
                help={
                  layer.type === "beam"
                    ? "Changes only the bolt's thickness while it plays."
                    : "Make it grow, shrink, or stay the same while playing."
                }
                onChange={(value) => setTransform({ endScale: value / 100 })}
              />
            )}
            <RangeField
              label="Starting opacity"
              value={layer.transform.startOpacity * 100}
              defaultValue={100}
              min={0}
              max={100}
              unit="%"
              help="How visible it is when it begins. 100% is fully visible."
              onChange={(value) => setTransform({ startOpacity: value / 100 })}
            />
            {layer.type !== "static" && (
              <RangeField
                label="Ending opacity"
                value={layer.transform.endOpacity * 100}
                defaultValue={0}
                min={0}
                max={100}
                unit="%"
                help="Lower this to make the image fade away."
                onChange={(value) => setTransform({ endOpacity: value / 100 })}
              />
            )}
            {layer.type === "static" && (
              <RangeField
                label="Rotation"
                value={layer.transform.rotation}
                defaultValue={0}
                min={-360}
                max={360}
                unit="°"
                help="Turns this still image in place."
                onChange={(rotation) => setTransform({ rotation })}
              />
            )}
          </FieldGroup>
        </SettingsSection>

        {layer.type === "beam" && (
          <SettingsSection
            title="Beam endpoints"
            icon={<Route size={15} />}
            defaultOpen
          >
            <p className="section-note">
              The layer position is endpoint A. Endpoint B is this local offset
              from A. Drag the B handle in the preview, or set it precisely
              here. Use tightly cropped artwork drawn left to right.
            </p>
            <FieldGroup>
              <RangeField
                label="Endpoint B horizontal"
                value={layer.beam.endX}
                defaultValue={240}
                min={-1000}
                max={1000}
                unit="px"
                help="Horizontal distance from endpoint A. Negative values point left."
                onChange={(endX) => setBeam({ endX })}
              />
              <RangeField
                label="Endpoint B vertical"
                value={layer.beam.endY}
                defaultValue={0}
                min={-1000}
                max={1000}
                unit="px"
                help="Vertical distance from endpoint A. Negative values point upward."
                onChange={(endY) => setBeam({ endY })}
              />
            </FieldGroup>
            <p className="context-tip">
              Current connection:{" "}
              {Math.round(Math.hypot(layer.beam.endX, layer.beam.endY))} px.
              Phaser can replace both endpoints at runtime with{" "}
              <code>setEndpoints(...)</code>.
            </p>
          </SettingsSection>
        )}

        {layer.type !== "static" && layer.type !== "beam" && (
          <SettingsSection
            title="Movement"
            icon={<Move size={15} />}
            defaultOpen
          >
            <FieldGroup>
              <RangeField
                label="Horizontal movement"
                value={layer.transform.movementX}
                defaultValue={0}
                min={-500}
                max={500}
                unit="px"
                help="Negative moves left; positive moves right."
                onChange={(movementX) => setTransform({ movementX })}
              />
              <RangeField
                label="Vertical movement"
                value={layer.transform.movementY}
                defaultValue={0}
                min={-500}
                max={500}
                unit="px"
                help="Negative values move upward. Positive values move downward."
                onChange={(movementY) => setTransform({ movementY })}
              />
              <RangeField
                label="Starting rotation"
                value={layer.transform.rotation}
                defaultValue={0}
                min={-360}
                max={360}
                unit="°"
                help="Turns the image before its animation begins."
                onChange={(rotation) => setTransform({ rotation })}
              />
              <RangeField
                label="Rotate while playing"
                value={layer.transform.rotationDuring}
                defaultValue={0}
                min={-1080}
                max={1080}
                unit="°"
                help="How far the image turns during its animation."
                onChange={(rotationDuring) => setTransform({ rotationDuring })}
              />
            </FieldGroup>
          </SettingsSection>
        )}

        {layer.type !== "static" && layer.type !== "beam" && (
          <SettingsSection title="Keyframes" icon={<Diamond size={15} />}>
            <Toggle
              label="Use multiple keyframes"
              checked={layer.keyframes.enabled}
              help="Adds intermediate moments for size, opacity, and rotation instead of only animating from start to end."
              onChange={(enabled) =>
                setKeyframes(
                  enabled && !layer.keyframes.initialized
                    ? {
                        enabled: true,
                        initialized: true,
                        frames: keyframesFromTransform(layer.transform),
                      }
                    : { ...layer.keyframes, enabled },
                )
              }
            />
            <div className="property-preset-picker">
              <div>
                <strong>Property curve presets</strong>
                <HelpTip text="A preset adds size, opacity, and rotation moments to this layer. The same moments appear as diamonds in the main Timeline." />
              </div>
              <p>
                Start with a useful shape, then adjust its moments below or on
                the Timeline.
              </p>
              <div className="property-preset-grid">
                {KEYFRAME_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    title={preset.description}
                    onClick={() =>
                      setKeyframes(
                        keyframesFromPreset(layer.transform, preset.id),
                      )
                    }
                  >
                    <strong>{preset.name}</strong>
                    <small>{preset.description}</small>
                  </button>
                ))}
              </div>
            </div>
            {layer.keyframes.enabled && (
              <div className="keyframe-list">
                <p className="section-note">
                  Keyframes shape size, opacity, and rotation. Position still
                  follows the Movement and Motion path controls, so the two
                  systems compose cleanly.
                </p>
                {layer.keyframes.frames.map((frame, index) => {
                  const isFirst = index === 0;
                  const isLast = index === layer.keyframes.frames.length - 1;
                  const time = Math.round(frame.time * layer.timing.duration);
                  return (
                    <div
                      className="keyframe-editor"
                      key={`${index}-${frame.time}`}
                    >
                      <div className="waypoint-heading">
                        <strong>
                          {isFirst
                            ? "Start"
                            : isLast
                              ? "End"
                              : `Keyframe ${index + 1}`}
                        </strong>
                        <span>{time} ms</span>
                        {!isFirst && !isLast && (
                          <button
                            type="button"
                            className="danger-icon"
                            aria-label={`Remove keyframe ${index + 1}`}
                            title="Remove keyframe"
                            onClick={() =>
                              setKeyframes({
                                ...layer.keyframes,
                                frames: layer.keyframes.frames.filter(
                                  (_, frameIndex) => frameIndex !== index,
                                ),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      {!isFirst && !isLast && (
                        <RangeField
                          label="Time"
                          value={time}
                          min={Math.ceil(
                            (layer.keyframes.frames[index - 1].time + 0.01) *
                              layer.timing.duration,
                          )}
                          max={Math.floor(
                            (layer.keyframes.frames[index + 1].time - 0.01) *
                              layer.timing.duration,
                          )}
                          step={10}
                          unit="ms"
                          help="Drag the matching diamond in the timeline for a faster adjustment."
                          onChange={(value) =>
                            setKeyframes({
                              ...layer.keyframes,
                              frames: moveKeyframe(
                                layer.keyframes.frames,
                                index,
                                value / layer.timing.duration,
                              ),
                            })
                          }
                        />
                      )}
                      <FieldGroup>
                        {layer.transform.separateScale ? (
                          <>
                            <RangeField
                              label="Width"
                              value={frame.scaleX * 100}
                              defaultValue={100}
                              min={0}
                              max={400}
                              unit="%"
                              help="Horizontal size at this exact keyframe. Good for squashing a ring or stretching a streak."
                              onChange={(value) =>
                                setKeyframe(index, { scaleX: value / 100 })
                              }
                            />
                            <RangeField
                              label="Height"
                              value={frame.scaleY * 100}
                              defaultValue={100}
                              min={0}
                              max={400}
                              unit="%"
                              help="Vertical size at this exact keyframe."
                              onChange={(value) =>
                                setKeyframe(index, { scaleY: value / 100 })
                              }
                            />
                          </>
                        ) : (
                          <RangeField
                            label="Size"
                            value={frame.scaleX * 100}
                            defaultValue={100}
                            min={0}
                            max={400}
                            unit="%"
                            help="The image size at this moment. Add a middle keyframe above 100% for an overshoot."
                            onChange={(value) =>
                              setKeyframe(index, {
                                scaleX: value / 100,
                                scaleY: value / 100,
                              })
                            }
                          />
                        )}
                        <RangeField
                          label="Opacity"
                          value={frame.opacity * 100}
                          defaultValue={isLast ? 0 : 100}
                          min={0}
                          max={100}
                          unit="%"
                          help="Visibility at this moment. Use a low middle value for a blink or a low end value for a fade."
                          onChange={(value) =>
                            setKeyframe(index, { opacity: value / 100 })
                          }
                        />
                        <RangeField
                          label="Rotation offset"
                          value={frame.rotation}
                          defaultValue={0}
                          min={-1080}
                          max={1080}
                          unit="deg"
                          help="Extra rotation reached at this moment, measured from the layer's starting angle."
                          onChange={(rotation) =>
                            setKeyframe(index, { rotation })
                          }
                        />
                      </FieldGroup>
                    </div>
                  );
                })}
                <div className="keyframe-actions">
                  <button
                    type="button"
                    className="waypoint-add"
                    disabled={layer.keyframes.frames.length >= MAX_KEYFRAMES}
                    onClick={() =>
                      setKeyframes(insertKeyframe(layer.keyframes))
                    }
                  >
                    <Plus size={13} /> Add keyframe
                  </button>
                  <button
                    type="button"
                    className="waypoint-add"
                    onClick={() =>
                      setKeyframes({
                        enabled: true,
                        initialized: true,
                        frames: keyframesFromTransform(layer.transform),
                      })
                    }
                  >
                    Reset keyframes
                  </button>
                </div>
                <p className="section-note">
                  Up to {MAX_KEYFRAMES} moments are supported. The layer&apos;s
                  easing curve controls the overall rhythm between them.
                </p>
              </div>
            )}
          </SettingsSection>
        )}

        {layer.type !== "static" && layer.type !== "beam" && (
          <SettingsSection title="Motion path" icon={<Route size={15} />}>
            <Toggle
              label="Follow a motion path"
              checked={layer.motionPath.enabled}
              help="Replaces straight movement with a curve, spiral, or route through your own points."
              onChange={(enabled) => setMotionPath({ enabled })}
            />
            {layer.motionPath.enabled && (
              <>
                <p className="section-note">
                  The Movement controls above set the path&apos;s ending
                  position, marked E in the preview. Drag E to move it directly.
                </p>
                <SelectField
                  label="Path shape"
                  value={layer.motionPath.mode}
                  help="Choose a simple bend, a winding spiral, or a smooth route through custom waypoints."
                  onChange={(mode) =>
                    setMotionPath({
                      mode: mode as VfxLayer["motionPath"]["mode"],
                    })
                  }
                >
                  <option value="curve">Curve</option>
                  <option value="spiral">Spiral</option>
                  <option value="custom">Custom waypoints</option>
                </SelectField>

                {layer.motionPath.mode === "curve" && (
                  <FieldGroup>
                    <RangeField
                      label="Bend point X"
                      value={layer.motionPath.controlX}
                      defaultValue={60}
                      min={-500}
                      max={500}
                      unit="px"
                      help="Pull this point left or right to reshape the curve. You can also drag it in the preview."
                      onChange={(controlX) => setMotionPath({ controlX })}
                    />
                    <RangeField
                      label="Bend point Y"
                      value={layer.motionPath.controlY}
                      defaultValue={-80}
                      min={-500}
                      max={500}
                      unit="px"
                      help="Pull this point up or down to reshape the curve."
                      onChange={(controlY) => setMotionPath({ controlY })}
                    />
                  </FieldGroup>
                )}

                {layer.motionPath.mode === "spiral" && (
                  <>
                    <FieldGroup>
                      <RangeField
                        label="Spiral turns"
                        value={layer.motionPath.spiralTurns}
                        defaultValue={1.5}
                        min={0.25}
                        max={8}
                        step={0.25}
                        unit="turns"
                        help="How many times the route winds before reaching its end."
                        onChange={(spiralTurns) =>
                          setMotionPath({ spiralTurns })
                        }
                      />
                      <RangeField
                        label="Spiral radius"
                        value={layer.motionPath.spiralRadius}
                        defaultValue={70}
                        min={0}
                        max={500}
                        unit="px"
                        help="How wide the spiral begins. It tightens toward the destination."
                        onChange={(spiralRadius) =>
                          setMotionPath({ spiralRadius })
                        }
                      />
                    </FieldGroup>
                    <Toggle
                      label="Wind clockwise"
                      checked={layer.motionPath.spiralClockwise}
                      help="Turn this off to wind in the opposite direction."
                      onChange={(spiralClockwise) =>
                        setMotionPath({ spiralClockwise })
                      }
                    />
                  </>
                )}

                {layer.motionPath.mode === "custom" && (
                  <div className="waypoint-list">
                    {layer.motionPath.points.map((point, index) => (
                      <div className="waypoint-editor" key={index}>
                        <div className="waypoint-heading">
                          <strong>Waypoint {index + 1}</strong>
                          <button
                            type="button"
                            className="danger-icon"
                            aria-label={`Remove waypoint ${index + 1}`}
                            title="Remove waypoint"
                            onClick={() =>
                              setMotionPath({
                                points: layer.motionPath.points.filter(
                                  (_, pointIndex) => pointIndex !== index,
                                ),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <FieldGroup>
                          <RangeField
                            label="Waypoint X"
                            value={point.x}
                            defaultValue={60}
                            min={-500}
                            max={500}
                            unit="px"
                            help="Horizontal position of this waypoint relative to the layer start. You can also drag point handles in the preview."
                            onChange={(x) => setMotionPathPoint(index, { x })}
                          />
                          <RangeField
                            label="Waypoint Y"
                            value={point.y}
                            defaultValue={-80}
                            min={-500}
                            max={500}
                            unit="px"
                            help="Vertical position of this waypoint. Negative values move upward."
                            onChange={(y) => setMotionPathPoint(index, { y })}
                          />
                        </FieldGroup>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="waypoint-add"
                      disabled={layer.motionPath.points.length >= 6}
                      onClick={() => {
                        const previous = layer.motionPath.points.at(-1) ?? {
                          x: 0,
                          y: 0,
                        };
                        setMotionPath({
                          points: [
                            ...layer.motionPath.points,
                            { x: previous.x + 50, y: previous.y },
                          ],
                        });
                      }}
                    >
                      <Plus size={13} /> Add waypoint
                    </button>
                    <p className="section-note">
                      Drag the numbered points in the preview, or enter exact
                      positions here. Up to six waypoints are supported.
                    </p>
                  </div>
                )}

                <Toggle
                  label="Point toward the path"
                  checked={layer.motionPath.orientToPath}
                  help="Rotates the image so it faces the direction the route is travelling."
                  onChange={(orientToPath) => setMotionPath({ orientToPath })}
                />
              </>
            )}
          </SettingsSection>
        )}

        {layer.type !== "static" && (
          <SettingsSection title="Motion trail" icon={<Wind size={15} />}>
            <Toggle
              label="Leave a motion trail"
              checked={layer.trail.enabled}
              help="Shows fading copies of this layer along the path it has already travelled. It also works on particles."
              onChange={(enabled) => setTrail({ enabled })}
            />
            <div className="trail-preset-picker">
              <div>
                <strong>Trail presets</strong>
                <HelpTip text="Presets tune the same deterministic afterimage controls below. Try Energy Bolt for magic, Slash Trail for a quick swing, or Ghost Trail for a dash." />
              </div>
              <div className="trail-preset-grid">
                {TRAIL_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    title={preset.description}
                    onClick={() => setTrail(trailFromPreset(preset.id))}
                  >
                    <strong>{preset.name}</strong>
                    <small>{preset.description}</small>
                  </button>
                ))}
              </div>
            </div>
            {layer.trail.enabled && (
              <>
                <p className="section-note">
                  Path means where an image moves. Trail means the fading copies
                  it leaves behind. The trail follows this layer&apos;s actual
                  route.
                </p>
                <FieldGroup>
                  <RangeField
                    label="Afterimages"
                    value={layer.trail.count}
                    defaultValue={6}
                    min={1}
                    max={16}
                    help="The maximum number of fading copies visible behind each moving image."
                    onChange={(count) => setTrail({ count })}
                  />
                  <RangeField
                    label="Trail spacing"
                    value={layer.trail.spacing}
                    defaultValue={50}
                    min={10}
                    max={500}
                    step={10}
                    unit="ms"
                    help="How much time separates one afterimage from the next."
                    onChange={(spacing) => setTrail({ spacing })}
                  />
                  <RangeField
                    label="Trail lifetime"
                    value={layer.trail.lifetime}
                    defaultValue={400}
                    min={50}
                    max={5000}
                    step={10}
                    unit="ms"
                    help="How long an afterimage takes to disappear."
                    onChange={(lifetime) => setTrail({ lifetime })}
                  />
                  <RangeField
                    label="Trail opacity"
                    value={layer.trail.opacity * 100}
                    defaultValue={45}
                    min={0}
                    max={100}
                    unit="%"
                    help="How visible the newest afterimage starts."
                    onChange={(value) => setTrail({ opacity: value / 100 })}
                  />
                  <RangeField
                    label="Size falloff"
                    value={layer.trail.scaleFalloff * 100}
                    defaultValue={5}
                    min={0}
                    max={100}
                    unit="%"
                    help="Makes older afterimages progressively smaller."
                    onChange={(value) =>
                      setTrail({ scaleFalloff: value / 100 })
                    }
                  />
                </FieldGroup>
              </>
            )}
          </SettingsSection>
        )}

        <SettingsSection title="Timing" icon={<Clock3 size={15} />} defaultOpen>
          <Toggle
            label="Starts automatically on the Timeline"
            checked={layer.startMode === "timeline"}
            help="Turn this off when another layer event should start this layer. Its same timing values then run relative to that event."
            onChange={(startsAutomatically) =>
              onChange({
                ...layer,
                startMode: startsAutomatically ? "timeline" : "triggered",
              })
            }
          />
          {layer.startMode === "triggered" && incomingEvents.length === 0 && (
            <p className="inspector-hint inspector-hint--warning">
              Nothing triggers this layer yet. Add an event to another layer and
              choose “{layer.name}” as its target.
            </p>
          )}
          <FieldGroup>
            <RangeField
              label={
                layer.startMode === "triggered"
                  ? "Delay after trigger"
                  : "Start delay"
              }
              value={layer.timing.delay}
              defaultValue={0}
              min={0}
              max={5000}
              step={10}
              unit="ms"
              help={
                layer.startMode === "triggered"
                  ? "Waits after the event before this layer begins. The existing duration, property moments, and trail stay on the same layer clock."
                  : "Waits before this part begins. Useful when the flash should happen before the smoke."
              }
              onChange={(delay) => setTiming({ delay })}
            />
            <RangeField
              label="How long it lasts"
              value={layer.timing.duration}
              defaultValue={layer.type === "static" ? 3000 : 900}
              min={50}
              max={8000}
              step={10}
              unit="ms"
              help="Lower numbers make it happen faster. Higher numbers make it slower."
              onChange={(duration) => setTiming({ duration })}
            />
          </FieldGroup>
          {layer.type !== "static" && (
            <>
              <EasingCurveEditor
                easing={layer.timing.easing}
                custom={layer.timing.customEasing}
                onEasingChange={(easing) => setTiming({ easing })}
                onCustomChange={(customEasing) => setTiming({ customEasing })}
              />
              <FieldGroup>
                <RangeField
                  label="Repeat count"
                  value={layer.timing.repeat}
                  defaultValue={0}
                  min={0}
                  max={20}
                  unit="×"
                  help="How many extra times this layer plays after the first time."
                  onChange={(repeat) => setTiming({ repeat })}
                />
              </FieldGroup>
              <Toggle
                label="Repeat continuously"
                checked={layer.timing.repeatForever || layer.timing.loop}
                help="Starts this layer again for as long as the effect is playing."
                onChange={(repeatForever) =>
                  setTiming({ repeatForever, loop: false })
                }
              />
              <Toggle
                label="Play forward, then back"
                checked={layer.timing.yoyo}
                help="Plays forward, then reverses back to its starting look."
                onChange={(yoyo) => setTiming({ yoyo })}
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title="Layer events" icon={<Link2 size={15} />}>
          <p className="inspector-section-copy">
            Events let this layer start another layer at a lifecycle moment.
            They use the same millisecond timing and property moments already
            shown on the main Timeline.
          </p>
          {layer.events.length === 0 ? (
            <p className="inspector-hint">
              Example: when “Bubble” finishes, restart “Bubble pop”.
            </p>
          ) : (
            <div className="layer-event-list">
              {layer.events.map((layerEvent, index) => {
                const target = layers.find(
                  (candidate) => candidate.id === layerEvent.targetLayerId,
                );
                const groupDelay =
                  groups.find((group) => group.id === layer.groupId)?.delay ??
                  0;
                const derivedTime =
                  groupDelay +
                  layer.timing.delay +
                  (layerEvent.trigger === "percentage"
                    ? layer.timing.duration * layerEvent.percentage
                    : layerEvent.trigger === "finish"
                      ? layer.timing.duration *
                        Math.max(1, layer.timing.repeat + 1)
                      : layerEvent.trigger === "repeat"
                        ? layer.timing.duration
                        : 0);
                const isCopyFinish = layerEvent.trigger === "copy-finish";
                return (
                  <article className="layer-event-card" key={layerEvent.id}>
                    <header>
                      <strong>Event {index + 1}</strong>
                      <button
                        type="button"
                        className="danger-icon"
                        aria-label={`Delete event ${index + 1}`}
                        title="Delete event"
                        onClick={() =>
                          onChange({
                            ...layer,
                            events: layer.events.filter(
                              (event) => event.id !== layerEvent.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </header>
                    <Toggle
                      label="Event enabled"
                      checked={layerEvent.enabled}
                      help="Disabled events stay saved but do not start their target."
                      onChange={(enabled) =>
                        setEvent(layerEvent.id, { enabled })
                      }
                    />
                    <label className="field">
                      <span className="field__label">
                        When this happens
                        <HelpTip text="Choose a layer-level moment, or let every authored Burst/Repeating copy trigger from the exact spot where it disappears. Trail afterimages never trigger events." />
                      </span>
                      <select
                        value={layerEvent.trigger}
                        onChange={(event) => {
                          const trigger = event.target
                            .value as VfxLayer["events"][number]["trigger"];
                          setEvent(layerEvent.id, {
                            trigger,
                            ...(trigger === "copy-finish"
                              ? {
                                  action: "play" as const,
                                  targetLayerId:
                                    firstSafeCopyFinishTarget?.id ??
                                    layerEvent.targetLayerId,
                                }
                              : {}),
                          });
                        }}
                      >
                        <option value="start">Layer starts</option>
                        <option
                          value="percentage"
                          disabled={layer.type === "emitter"}
                        >
                          Layer reaches a chosen point
                        </option>
                        <option
                          value="finish"
                          disabled={layer.type === "emitter"}
                        >
                          Layer finishes
                        </option>
                        <option value="repeat">
                          {layer.type === "emitter"
                            ? "A new emission batch starts"
                            : "Layer repeats"}
                        </option>
                        <option
                          value="copy-finish"
                          disabled={!isSpawnLayer(layer)}
                        >
                          Each copy finishes at its spot
                        </option>
                      </select>
                    </label>
                    {layerEvent.trigger === "percentage" && (
                      <RangeField
                        label="Chosen point"
                        value={Math.round(layerEvent.percentage * 100)}
                        defaultValue={60}
                        min={1}
                        max={99}
                        unit="%"
                        help="Starts the target partway through each playback. For example, 60% of a 500 ms layer is 300 ms after that layer begins."
                        onChange={(percentage) =>
                          setEvent(layerEvent.id, {
                            percentage: percentage / 100,
                          })
                        }
                      />
                    )}
                    {isCopyFinish && (
                      <FieldGroup>
                        <RangeField
                          label="Chance for each copy"
                          value={Math.round(layerEvent.chance * 100)}
                          defaultValue={100}
                          min={0}
                          max={100}
                          unit="%"
                          help="A deterministic chance checked separately for each original copy. The same project seed always chooses the same copies."
                          onChange={(chance) =>
                            setEvent(layerEvent.id, { chance: chance / 100 })
                          }
                        />
                        <RangeField
                          label="Maximum plays"
                          value={layerEvent.maxTriggers}
                          defaultValue={32}
                          min={1}
                          max={250}
                          unit=""
                          help="Caps this event for each source playback before it can create too many follow-up sprites."
                          onChange={(maxTriggers) =>
                            setEvent(layerEvent.id, { maxTriggers })
                          }
                        />
                      </FieldGroup>
                    )}
                    {isCopyFinish ? (
                      <small className="event-derived-time">
                        Times vary per copy. The target&apos;s Start delay and
                        property moments begin from each copy&apos;s exact
                        finish.
                      </small>
                    ) : layer.startMode === "timeline" ? (
                      <small className="event-derived-time">
                        First Timeline occurrence: about{" "}
                        {Math.round(derivedTime)}
                        ms
                      </small>
                    ) : null}
                    {isCopyFinish ? (
                      <p className="inspector-hint">
                        <strong>Action:</strong> play the target at this
                        copy&apos;s finish position. Its own transform remains a
                        local offset from that spot.
                      </p>
                    ) : (
                      <label className="field">
                        <span className="field__label">
                          Do this
                          <HelpTip text="Play waits if the target is already pending or active. Restart immediately begins a fresh activation and clears the old one." />
                        </span>
                        <select
                          value={layerEvent.action}
                          onChange={(event) =>
                            setEvent(layerEvent.id, {
                              action: event.target
                                .value as VfxLayer["events"][number]["action"],
                            })
                          }
                        >
                          <option value="play">Play target if free</option>
                          <option value="restart">Restart target</option>
                        </select>
                      </label>
                    )}
                    <label className="field">
                      <span className="field__label">
                        Target layer
                        <HelpTip text="The layer that should play. Event loops are blocked so one effect cannot recursively trigger forever." />
                      </span>
                      <select
                        value={layerEvent.targetLayerId}
                        onChange={(event) =>
                          setEvent(layerEvent.id, {
                            targetLayerId: event.target.value,
                          })
                        }
                      >
                        {layers
                          .filter((candidate) => candidate.id !== layer.id)
                          .map((candidate) => (
                            <option
                              key={candidate.id}
                              value={candidate.id}
                              disabled={
                                eventTargetWouldCycle(
                                  layers,
                                  layer.id,
                                  candidate.id,
                                  layerEvent.id,
                                ) ||
                                (isCopyFinish &&
                                  !copyFinishTargetIsSafe(candidate))
                              }
                            >
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {target?.startMode === "timeline" && (
                      <p className="inspector-hint inspector-hint--warning">
                        “{target.name}” also starts automatically on its normal
                        Timeline. Turn that off in its Timing section if it
                        should only play from this event.
                      </p>
                    )}
                    {isCopyFinish &&
                      target &&
                      !copyFinishTargetIsSafe(target) && (
                        <p className="inspector-hint inspector-hint--warning">
                          Copy-finish targets should be finite Triggered
                          animated images or bursts without an attachment. This
                          keeps each spatial cascade bounded and predictable.
                        </p>
                      )}
                  </article>
                );
              })}
            </div>
          )}
          <button
            type="button"
            disabled={!firstSafeEventTarget || layer.events.length >= 16}
            onClick={() => {
              if (!firstSafeEventTarget) return;
              onChange({
                ...layer,
                events: [
                  ...layer.events,
                  {
                    id: makeId("event"),
                    enabled: true,
                    trigger: layer.type === "emitter" ? "repeat" : "finish",
                    percentage: 0.6,
                    action: "play",
                    targetLayerId: firstSafeEventTarget.id,
                    chance: 1,
                    maxTriggers: 32,
                  },
                ],
              });
            }}
          >
            <Plus size={14} /> Add layer event
          </button>
          {isSpawnLayer(layer) && (
            <button
              type="button"
              disabled={!firstSafeCopyFinishTarget || layer.events.length >= 16}
              onClick={() => {
                if (!firstSafeCopyFinishTarget) return;
                onChange({
                  ...layer,
                  events: [
                    ...layer.events,
                    {
                      id: makeId("event"),
                      enabled: true,
                      trigger: "copy-finish",
                      percentage: 0.5,
                      action: "play",
                      targetLayerId: firstSafeCopyFinishTarget.id,
                      chance: 1,
                      maxTriggers: 32,
                    },
                  ],
                });
              }}
            >
              <Plus size={14} /> Add copy-finish event
            </button>
          )}
          {isSpawnLayer(layer) && !firstSafeCopyFinishTarget && (
            <p className="inspector-hint">
              To add a spatial follow-up, first create a finite Animated image
              or Burst and set its Timing start to Triggered by an event.
            </p>
          )}
          {layer.events.length >= 16 && (
            <p className="inspector-hint">Maximum 16 events per layer.</p>
          )}
        </SettingsSection>

        <SettingsSection title="Appearance" icon={<Palette size={15} />}>
          <label className="field color-field">
            <span className="field__label">
              Tint color{" "}
              <HelpTip text="Tint lets the same white image become red, blue, green, purple, or any other color." />
            </span>
            <span>
              <input
                type="color"
                value={tintPickerValue}
                onChange={(event) =>
                  setAppearance({ tint: event.target.value })
                }
              />
              <input
                type="text"
                value={layer.appearance.tint ?? ""}
                placeholder="No tint"
                onChange={(event) =>
                  setAppearance({ tint: event.target.value || null })
                }
              />
              <button
                type="button"
                onClick={() => setAppearance({ tint: null })}
              >
                Clear
              </button>
            </span>
          </label>
          <RangeField
            label="Tint strength"
            value={layer.appearance.tintStrength * 100}
            defaultValue={100}
            min={0}
            max={100}
            unit="%"
            help="Controls how strongly the chosen color affects the image."
            onChange={(value) => setAppearance({ tintStrength: value / 100 })}
          />
          {layer.type !== "static" && (
            <>
              <Toggle
                label="Change color over time"
                checked={layer.appearance.colorOverLifetime.enabled}
                help="Changes the whole image as it plays. It does not paint a gradient across the image. Try warm-to-cool sparks or green-to-purple magic."
                onChange={(enabled) => setColorOverLifetime({ enabled })}
              />
              {layer.appearance.colorOverLifetime.enabled && (
                <div className="color-stop-list">
                  <p className="section-note">
                    These colors tint the whole sprite at different moments.
                    Tint strength controls how strongly they appear.
                  </p>
                  {layer.appearance.colorOverLifetime.stops.map(
                    (stop, index, stops) => (
                      <div
                        className="color-stop-row"
                        key={`${index}-${stop.time}`}
                      >
                        <label>
                          <span>
                            {index === 0
                              ? "Start color"
                              : index === stops.length - 1
                                ? "End color"
                                : `Color stop ${index + 1}`}
                          </span>
                          <input
                            type="color"
                            value={stop.color}
                            aria-label={`Color stop ${index + 1}`}
                            onChange={(event) =>
                              setColorOverLifetime({
                                stops: stops.map((candidate, stopIndex) =>
                                  stopIndex === index
                                    ? {
                                        ...candidate,
                                        color: event.target.value,
                                      }
                                    : candidate,
                                ),
                              })
                            }
                          />
                        </label>
                        {index > 0 && index < stops.length - 1 && (
                          <>
                            <RangeField
                              label="Time"
                              value={stop.time * 100}
                              min={1}
                              max={99}
                              unit="%"
                              help="The point in this copy's lifetime when it reaches this color."
                              onChange={(value) =>
                                setColorOverLifetime({
                                  stops: stops
                                    .map((candidate, stopIndex) =>
                                      stopIndex === index
                                        ? { ...candidate, time: value / 100 }
                                        : candidate,
                                    )
                                    .sort(
                                      (left, right) => left.time - right.time,
                                    ),
                                })
                              }
                            />
                            <button
                              type="button"
                              className="small-button"
                              onClick={() =>
                                setColorOverLifetime({
                                  stops: stops.filter(
                                    (_candidate, stopIndex) =>
                                      stopIndex !== index,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={13} /> Remove stop
                            </button>
                          </>
                        )}
                      </div>
                    ),
                  )}
                  {layer.appearance.colorOverLifetime.stops.length < 5 && (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => {
                        const stops = layer.appearance.colorOverLifetime.stops;
                        const beforeEnd = stops.at(-2) ?? stops[0];
                        setColorOverLifetime({
                          stops: [
                            ...stops.slice(0, -1),
                            {
                              time: (beforeEnd.time + 1) / 2,
                              color: beforeEnd.color,
                            },
                            stops.at(-1)!,
                          ],
                        });
                      }}
                    >
                      <Plus size={13} /> More color stops
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <SelectField
            label="Light mixing (blend mode)"
            value={layer.appearance.blendMode}
            help="Additive blending brightens overlaps. It is useful for magic, fire, sparks, and energy, but it does not create a soft halo or blur."
            onChange={(blendMode) =>
              setAppearance({ blendMode: blendMode as "normal" | "add" })
            }
          >
            <option value="normal">Normal</option>
            <option value="add">Additive — brighten overlaps</option>
          </SelectField>
        </SettingsSection>

        <ExperimentalRenderingSection
          effects={layer.appearance.effects}
          assets={assets}
          onChange={(effects) => setAppearance({ effects })}
        />

        {layer.type !== "static" && (
          <SettingsSection title="Behaviors" icon={<Activity size={15} />}>
            <p className="section-intro">
              Add small procedural changes without drawing extra frames.
            </p>
            <Toggle
              label="Pulse"
              checked={layer.behavior.pulse.enabled}
              help="Rhythmically changes size or opacity. Good for runes, auras, warning markers, and magical energy."
              onChange={(enabled) => setBehavior("pulse", { enabled })}
            />
            {layer.behavior.pulse.enabled && (
              <>
                <FieldGroup>
                  <RangeField
                    label="Size amount"
                    value={layer.behavior.pulse.scale * 100}
                    defaultValue={10}
                    min={0}
                    max={75}
                    unit="%"
                    help="How much larger and smaller the image becomes during each pulse."
                    onChange={(value) =>
                      setBehavior("pulse", { scale: value / 100 })
                    }
                  />
                  <RangeField
                    label="Opacity amount"
                    value={layer.behavior.pulse.opacity * 100}
                    defaultValue={0}
                    min={0}
                    max={100}
                    unit="%"
                    help="How much the image brightens and dims during each pulse."
                    onChange={(value) =>
                      setBehavior("pulse", { opacity: value / 100 })
                    }
                  />
                  <RangeField
                    label="Pulse speed"
                    value={layer.behavior.pulse.speed}
                    defaultValue={2}
                    min={0.1}
                    max={12}
                    step={0.1}
                    unit="/s"
                    help="Pulses per second. Try 1–2 for an aura and 4–8 for urgent energy."
                    onChange={(speed) => setBehavior("pulse", { speed })}
                  />
                </FieldGroup>
                <BehaviorEnvelopeEditor
                  behaviorName="Pulse"
                  envelope={layer.behavior.pulse.envelope}
                  duration={layer.timing.duration}
                  onChange={(envelope) => setBehavior("pulse", { envelope })}
                />
              </>
            )}
            <Toggle
              label="Flicker"
              checked={layer.behavior.flicker.enabled}
              help="Quickly varies opacity. Good for fire, electricity, unstable magic, and damaged lights."
              onChange={(enabled) => setBehavior("flicker", { enabled })}
            />
            {layer.behavior.flicker.enabled && (
              <>
                <FieldGroup>
                  <RangeField
                    label="Flicker amount"
                    value={layer.behavior.flicker.amount * 100}
                    defaultValue={25}
                    min={0}
                    max={100}
                    unit="%"
                    help="How far opacity can dip during a flicker."
                    onChange={(value) =>
                      setBehavior("flicker", { amount: value / 100 })
                    }
                  />
                  <RangeField
                    label="Flicker speed"
                    value={layer.behavior.flicker.speed}
                    defaultValue={8}
                    min={0.5}
                    max={30}
                    step={0.5}
                    unit="/s"
                    help="How quickly the brightness changes. Try 8–14 for flame or electricity."
                    onChange={(speed) => setBehavior("flicker", { speed })}
                  />
                  <RangeField
                    label="Irregularity"
                    value={layer.behavior.flicker.randomness * 100}
                    defaultValue={65}
                    min={0}
                    max={100}
                    unit="%"
                    help="0% is a steady rhythm; 100% is seeded, repeatable variation."
                    onChange={(value) =>
                      setBehavior("flicker", { randomness: value / 100 })
                    }
                  />
                </FieldGroup>
                <BehaviorEnvelopeEditor
                  behaviorName="Flicker"
                  envelope={layer.behavior.flicker.envelope}
                  duration={layer.timing.duration}
                  onChange={(envelope) => setBehavior("flicker", { envelope })}
                />
              </>
            )}
            <Toggle
              label="Organic movement"
              checked={layer.behavior.wobble.enabled}
              help="Makes smoke, wisps, bubbles, and hovering magic wander naturally or repeat a steady sway."
              onChange={(enabled) => setBehavior("wobble", { enabled })}
            />
            {layer.behavior.wobble.enabled && (
              <>
                <FieldGroup>
                  <SelectField
                    label="Movement style"
                    value={layer.behavior.wobble.style}
                    help="Natural wander feels less mechanical. Repeating sway keeps the original smooth back-and-forth motion."
                    onChange={(style) =>
                      setBehavior("wobble", {
                        style: style as "organic" | "sway",
                      })
                    }
                  >
                    <option value="organic">Natural wander</option>
                    <option value="sway">Repeating sway</option>
                  </SelectField>
                  <RangeField
                    label="Horizontal amount"
                    value={layer.behavior.wobble.x}
                    defaultValue={12}
                    min={0}
                    max={250}
                    unit="px"
                    help="How far it moves from side to side. Try 8–20 px for smoke."
                    onChange={(x) => setBehavior("wobble", { x })}
                  />
                  <RangeField
                    label="Vertical amount"
                    value={layer.behavior.wobble.y}
                    defaultValue={0}
                    min={0}
                    max={250}
                    unit="px"
                    help="How far it moves up and down. Good for bubbles and hovering objects."
                    onChange={(y) => setBehavior("wobble", { y })}
                  />
                  <RangeField
                    label="Turning amount"
                    value={layer.behavior.wobble.rotation}
                    defaultValue={4}
                    min={0}
                    max={180}
                    unit="°"
                    help="How much it gently turns while moving. Try 2–8° for a soft feel."
                    onChange={(rotation) => setBehavior("wobble", { rotation })}
                  />
                  <RangeField
                    label="Speed"
                    value={layer.behavior.wobble.speed}
                    defaultValue={1.5}
                    min={0.1}
                    max={12}
                    step={0.1}
                    unit="/s"
                    help="How quickly the movement changes. Smoke usually feels natural below 2."
                    onChange={(speed) => setBehavior("wobble", { speed })}
                  />
                  {layer.behavior.wobble.style === "organic" && (
                    <RangeField
                      label="Smoothness"
                      value={layer.behavior.wobble.smoothness * 100}
                      defaultValue={70}
                      min={0}
                      max={100}
                      unit="%"
                      help="Higher values flow more gently; lower values change direction more sharply."
                      onChange={(value) =>
                        setBehavior("wobble", { smoothness: value / 100 })
                      }
                    />
                  )}
                </FieldGroup>
                <BehaviorEnvelopeEditor
                  behaviorName="Organic movement"
                  envelope={layer.behavior.wobble.envelope}
                  duration={layer.timing.duration}
                  onChange={(envelope) => setBehavior("wobble", { envelope })}
                />
              </>
            )}
            <FieldGroup>
              <RangeField
                label="Fall over time (gravity)"
                value={layer.behavior.physics.gravity}
                defaultValue={0}
                min={-1000}
                max={1000}
                step={10}
                unit="px/s²"
                help="Positive values pull sparks and debris downward; negative values lift magical fragments upward."
                onChange={(gravity) => setBehavior("physics", { gravity })}
              />
              <RangeField
                label="Slow down over time"
                value={layer.behavior.physics.drag * 100}
                defaultValue={0}
                min={0}
                max={100}
                unit="%"
                help="Moves quickly at first, then settles while still reaching the authored destination. Good for impact sparks."
                onChange={(value) =>
                  setBehavior("physics", { drag: value / 100 })
                }
              />
            </FieldGroup>
            {layer.behavior.physics.gravity !== 0 && (
              <BehaviorEnvelopeEditor
                behaviorName="Gravity"
                envelope={layer.behavior.physics.gravityEnvelope}
                duration={layer.timing.duration}
                onChange={(gravityEnvelope) =>
                  setBehavior("physics", { gravityEnvelope })
                }
              />
            )}
          </SettingsSection>
        )}

        {isSpawnLayer(layer) && (
          <SettingsSection
            title="Spawn"
            icon={<Sparkles size={15} />}
            defaultOpen
          >
            <FieldGroup>
              <RangeField
                label="Number of copies"
                value={layer.spawn.count}
                defaultValue={8}
                min={1}
                max={layer.type === "burst" ? 250 : 25}
                unit=""
                help={
                  layer.type === "burst"
                    ? "How many copies appear together in the burst."
                    : "How many copies appear each time the emitter creates particles."
                }
                onChange={(count) => setSpawn({ count })}
              />
              {layer.type === "emitter" && (
                <RangeField
                  label="Maximum alive"
                  value={layer.spawn.maxAlive}
                  defaultValue={80}
                  min={1}
                  max={500}
                  unit=""
                  help="A safety limit that stops too many sprites building up at once."
                  onChange={(maxAlive) => setSpawn({ maxAlive })}
                />
              )}
            </FieldGroup>
            {layer.type === "emitter" && (
              <FieldGroup>
                <RangeField
                  label="Shortest gap"
                  value={layer.spawn.intervalMin}
                  defaultValue={260}
                  min={30}
                  max={4000}
                  step={10}
                  unit="ms"
                  help="The quickest this emitter can create another group."
                  onChange={(intervalMin) =>
                    setSpawn({
                      intervalMin: Math.min(
                        intervalMin,
                        layer.spawn.intervalMax,
                      ),
                    })
                  }
                />
                <RangeField
                  label="Longest gap"
                  value={layer.spawn.intervalMax}
                  defaultValue={500}
                  min={30}
                  max={4000}
                  step={10}
                  unit="ms"
                  help="The longest it may wait. Different shortest and longest gaps feel less mechanical."
                  onChange={(intervalMax) =>
                    setSpawn({
                      intervalMax: Math.max(
                        intervalMax,
                        layer.spawn.intervalMin,
                      ),
                    })
                  }
                />
              </FieldGroup>
            )}
            <SelectField
              label="Where copies appear"
              value={layer.spawn.shape}
              help="Choose one point, a geometric region, or the visible silhouette of a prepared image. This controls start positions; it does not crop the particle artwork."
              onChange={(shape) =>
                setSpawn({
                  shape,
                  ...(shape === "mask"
                    ? {
                        maskAssetId:
                          layer.spawn.maskAssetId ??
                          preparedMaskAssets[0]?.id ??
                          null,
                      }
                    : {}),
                  distribution:
                    shape === "point" || shape === "mask"
                      ? "random"
                      : (shape === "line" || shape === "arc") &&
                          layer.spawn.distribution === "edge"
                        ? "even"
                        : (shape === "line" || shape === "arc") &&
                            layer.spawn.distribution === "stratified"
                          ? "random"
                          : layer.spawn.distribution,
                })
              }
            >
              <option value="point">At one point</option>
              <option value="rectangle">Inside a box</option>
              <option value="circle">Inside a circle</option>
              <option value="line">Along a line</option>
              <option value="arc">Along an arc</option>
              <option value="mask" disabled={preparedMaskAssets.length === 0}>
                Inside an image silhouette
              </option>
            </SelectField>
            {preparedMaskAssets.length === 0 && (
              <p className="inspector-hint">
                Select an uploaded still image in the Asset Library and prepare
                it as a spawn silhouette to unlock this placement.
              </p>
            )}
            {layer.spawn.shape !== "point" && layer.spawn.shape !== "mask" && (
              <SelectField
                label="Placement pattern"
                value={layer.spawn.distribution}
                help={
                  layer.spawn.shape === "line" || layer.spawn.shape === "arc"
                    ? "Choose random positions, exact spacing, one center clump, or several repeatable clumps along the shape."
                    : "Choose random fill, reliable interior coverage, boundary placement, one center clump, or several repeatable clumps."
                }
                onChange={(distribution) => setSpawn({ distribution })}
              >
                <option value="random">
                  {layer.spawn.shape === "line" || layer.spawn.shape === "arc"
                    ? "Random along shape"
                    : "Random inside"}
                </option>
                {layer.spawn.shape !== "line" &&
                  layer.spawn.shape !== "arc" && (
                    <option value="stratified">Even coverage inside</option>
                  )}
                {layer.spawn.shape !== "line" &&
                  layer.spawn.shape !== "arc" && (
                    <option value="edge">
                      {layer.spawn.shape === "circle"
                        ? "Random ring"
                        : "Random around edge"}
                    </option>
                  )}
                <option value="even">
                  {layer.spawn.shape === "circle"
                    ? "Even ring"
                    : layer.spawn.shape === "rectangle"
                      ? "Evenly around edge"
                      : "Evenly spaced along shape"}
                </option>
                <option value="clustered">
                  {layer.spawn.shape === "line" || layer.spawn.shape === "arc"
                    ? "One clump near middle"
                    : "One clump near center"}
                </option>
                <option value="clusters">Several clumps</option>
              </SelectField>
            )}
            {layer.spawn.distribution === "stratified" && (
              <RangeField
                label="Natural variation"
                value={Math.round(layer.spawn.stratifiedJitter * 100)}
                defaultValue={65}
                min={0}
                max={100}
                unit="%"
                help="0% makes a tidy interior pattern. Higher values move each copy inside its own small region, keeping broad coverage without mechanical spacing. Separate Position variation can still move it farther."
                onChange={(stratifiedJitter) =>
                  setSpawn({ stratifiedJitter: stratifiedJitter / 100 })
                }
              />
            )}
            {layer.spawn.distribution === "clusters" && (
              <>
                <FieldGroup>
                  <RangeField
                    label="Number of clumps"
                    value={layer.spawn.clusterCount}
                    defaultValue={3}
                    min={2}
                    max={8}
                    unit=""
                    help="Copies are shared as evenly as possible between these repeatable clumps. A batch needs at least one copy per visible clump."
                    onChange={(clusterCount) => setSpawn({ clusterCount })}
                  />
                  <RangeField
                    label="Clump size"
                    value={Math.round(layer.spawn.clusterSpread * 100)}
                    defaultValue={18}
                    min={0}
                    max={50}
                    unit="%"
                    help="0% stacks each clump at one point. Higher values loosen each clump inside the chosen spawn shape before separate Position variation is added."
                    onChange={(clusterSpread) =>
                      setSpawn({ clusterSpread: clusterSpread / 100 })
                    }
                  />
                </FieldGroup>
                {layer.spawn.count < layer.spawn.clusterCount && (
                  <p className="inspector-hint">
                    This batch has {layer.spawn.count} copies, so only{" "}
                    {layer.spawn.count === 1
                      ? "one clump can appear"
                      : `${layer.spawn.count} clumps can appear`}
                    . Add more copies to use every clump.
                  </p>
                )}
              </>
            )}
            {layer.spawn.shape === "rectangle" && (
              <FieldGroup>
                <RangeField
                  label="Area width"
                  value={layer.spawn.width}
                  defaultValue={80}
                  min={0}
                  max={500}
                  unit="px"
                  help="The width of the box-shaped spawn region. Randomness can add extra jitter beyond it."
                  onChange={(width) => setSpawn({ width })}
                />
                <RangeField
                  label="Area height"
                  value={layer.spawn.height}
                  defaultValue={50}
                  min={0}
                  max={400}
                  unit="px"
                  help="The height of the box-shaped spawn region. Randomness can add extra jitter beyond it."
                  onChange={(height) => setSpawn({ height })}
                />
              </FieldGroup>
            )}
            {layer.spawn.shape === "circle" && (
              <RangeField
                label="Area radius"
                value={layer.spawn.radius}
                defaultValue={45}
                min={0}
                max={300}
                unit="px"
                help="The circle's size. Choose Around the edge or Evenly spaced to make a ring."
                onChange={(radius) => setSpawn({ radius })}
              />
            )}
            {layer.spawn.shape === "line" && (
              <FieldGroup>
                <RangeField
                  label="Line length"
                  value={layer.spawn.lineLength}
                  defaultValue={120}
                  min={0}
                  max={1000}
                  unit="px"
                  help="Copies are placed from one end of this centered line to the other."
                  onChange={(lineLength) => setSpawn({ lineLength })}
                />
                <RangeField
                  label="Line direction"
                  value={layer.spawn.lineAngle}
                  defaultValue={0}
                  min={-180}
                  max={180}
                  unit="°"
                  help="0° is horizontal, 90° slopes down, and -90° is vertical upward."
                  onChange={(lineAngle) => setSpawn({ lineAngle })}
                />
              </FieldGroup>
            )}
            {layer.spawn.shape === "arc" && (
              <FieldGroup>
                <RangeField
                  label="Arc radius"
                  value={layer.spawn.radius}
                  defaultValue={45}
                  min={0}
                  max={500}
                  unit="px"
                  help="How far the curved spawn line sits from the layer's center."
                  onChange={(radius) => setSpawn({ radius })}
                />
                <RangeField
                  label="Arc starts at"
                  value={layer.spawn.arcStartAngle}
                  defaultValue={-180}
                  min={-360}
                  max={360}
                  unit="°"
                  help="0° begins to the right, 90° below, and -90° above the center."
                  onChange={(arcStartAngle) => setSpawn({ arcStartAngle })}
                />
                <RangeField
                  label="Arc sweep"
                  value={layer.spawn.arcSweep}
                  defaultValue={180}
                  min={-360}
                  max={360}
                  unit="°"
                  help="Positive values sweep clockwise on screen; negative values sweep the other way. Use 360° for a complete ring."
                  onChange={(arcSweep) => setSpawn({ arcSweep })}
                />
              </FieldGroup>
            )}
            {layer.spawn.shape === "mask" && (
              <>
                <SelectField
                  label="Silhouette image"
                  value={layer.spawn.maskAssetId ?? ""}
                  help="Uses the visible parts of this separate still image like a stencil. The particle image and silhouette image can be different."
                  onChange={(maskAssetId) => setSpawn({ maskAssetId })}
                >
                  {preparedMaskAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </SelectField>
                <FieldGroup>
                  <RangeField
                    label="Silhouette size"
                    value={layer.spawn.maskSize}
                    defaultValue={160}
                    min={0}
                    max={1000}
                    unit="px"
                    help="Sets the silhouette's longest side while preserving the source image's proportions."
                    onChange={(maskSize) => setSpawn({ maskSize })}
                  />
                  <RangeField
                    label="Minimum opacity"
                    value={Math.round(layer.spawn.maskThreshold * 100)}
                    defaultValue={20}
                    min={1}
                    max={Math.max(
                      1,
                      Math.floor(
                        ((selectedMaskAsset?.alphaMask
                          ? maximumAlphaMaskValue(selectedMaskAsset.alphaMask)
                          : 255) /
                          255) *
                          100,
                      ),
                    )}
                    unit="%"
                    help="Only source pixels at least this visible can create copies. Lower it for very soft smoke or glow silhouettes."
                    onChange={(maskThreshold) =>
                      setSpawn({ maskThreshold: maskThreshold / 100 })
                    }
                  />
                </FieldGroup>
                {selectedMaskAsset?.alphaMask &&
                  maximumAlphaMaskValue(selectedMaskAsset.alphaMask) <
                    alphaMaskThresholdByte(layer.spawn.maskThreshold) && (
                    <p className="inspector-hint inspector-hint--warning">
                      No visible pixels remain at this opacity. Lower Minimum
                      opacity or choose another image.
                    </p>
                  )}
                <p className="inspector-hint">
                  This is deterministic spawn data, not an Experimental WebGL
                  mask. Random position adds extra jitter after the silhouette
                  chooses each starting point.
                </p>
              </>
            )}
            <SelectField
              label="Travel direction"
              value={layer.spawn.direction}
              help="Outward sends copies away from the center. Tangent sends them around the edge of a circle."
              onChange={(direction) => setSpawn({ direction })}
            >
              <option value="random">Random</option>
              <option value="outward">Outward from center</option>
              <option value="inward">Inward toward center</option>
              <option value="fixed">Fixed direction</option>
              <option value="tangent">Around a circle</option>
            </SelectField>
            {layer.spawn.direction === "fixed" && (
              <FieldGroup>
                <RangeField
                  label="Direction"
                  value={layer.spawn.directionAngle}
                  defaultValue={-90}
                  min={-180}
                  max={180}
                  unit="°"
                  help="The center travel angle: 0° is right, 90° is down, and -90° is up."
                  onChange={(directionAngle) => setSpawn({ directionAngle })}
                />
                <RangeField
                  label="Direction variation"
                  value={layer.spawn.directionSpread}
                  defaultValue={30}
                  min={0}
                  max={180}
                  unit="°"
                  help="Randomly tapers the fixed angle to either side. Try 15–35° for a focused spray."
                  onChange={(directionSpread) => setSpawn({ directionSpread })}
                />
              </FieldGroup>
            )}
            <SelectField
              label="Image alignment"
              value={layer.spawn.rotateToDirection ? "face" : "keep"}
              help="Face movement turns directional artwork along its route. Tell Vvfx which way the original image points below."
              onChange={(alignment) =>
                setSpawn({
                  rotateToDirection: alignment !== "keep",
                })
              }
            >
              <option value="keep">Keep current rotation</option>
              <option value="face">Face movement</option>
            </SelectField>
            {layer.spawn.rotateToDirection && (
              <FieldGroup>
                <RangeField
                  label="Artwork points toward"
                  value={layer.spawn.artworkForwardAngle}
                  defaultValue={0}
                  min={-180}
                  max={180}
                  unit="°"
                  help="Use 0° if the source image points right, -90° if it points up, 90° if it points down, or 180° if it points left."
                  onChange={(artworkForwardAngle) =>
                    setSpawn({ artworkForwardAngle })
                  }
                />
                <RangeField
                  label="Alignment variation"
                  value={layer.spawn.alignmentVariation}
                  defaultValue={0}
                  min={0}
                  max={180}
                  unit="± °"
                  help="Adds repeatable angular variation after each copy faces its movement."
                  onChange={(alignmentVariation) =>
                    setSpawn({ alignmentVariation })
                  }
                />
              </FieldGroup>
            )}
          </SettingsSection>
        )}

        {layer.type !== "static" && (
          <SettingsSection title="Randomness" icon={<Dices size={15} />}>
            <p className="section-intro">
              A little variation keeps repeated copies from looking mechanical.
            </p>
            <FieldGroup>
              <RangeField
                label="Position X variation"
                value={layer.random.positionX}
                defaultValue={0}
                min={0}
                max={250}
                unit="± px"
                help="Each copy may start this far left or right from the center."
                onChange={(positionX) => setRandom({ positionX })}
              />
              <RangeField
                label="Position Y variation"
                value={layer.random.positionY}
                defaultValue={0}
                min={0}
                max={250}
                unit="± px"
                help="Each copy may start this far above or below the center."
                onChange={(positionY) => setRandom({ positionY })}
              />
              <RangeField
                label="Starting size variation"
                value={layer.random.startScale * 100}
                defaultValue={0}
                min={0}
                max={150}
                unit="± %"
                help="Each copy can begin a little larger or smaller. Good for natural smoke, sparks, and debris."
                onChange={(value) => setRandom({ startScale: value / 100 })}
              />
              <RangeField
                label="Ending size variation"
                value={layer.random.endScale * 100}
                defaultValue={0}
                min={0}
                max={150}
                unit="± %"
                help="Each copy can finish at a different size. Good for uneven dissipating particles."
                onChange={(value) => setRandom({ endScale: value / 100 })}
              />
              <RangeField
                label="Rotation variation"
                value={layer.random.rotation}
                defaultValue={0}
                min={0}
                max={360}
                unit="± °"
                help="Adds a seeded turn in either direction so repeated artwork looks less identical."
                onChange={(rotation) => setRandom({ rotation })}
              />
              <RangeField
                label="Duration variation"
                value={layer.random.duration}
                defaultValue={0}
                min={0}
                max={3000}
                step={10}
                unit="± ms"
                help="Makes some copies live longer or shorter. The active range includes the possible longer tail."
                onChange={(duration) => setRandom({ duration })}
              />
              <RangeField
                label="Horizontal movement variation"
                value={layer.random.movementX}
                defaultValue={0}
                min={0}
                max={400}
                unit="± px"
                help="Adds a seeded horizontal travel difference to every copy."
                onChange={(movementX) => setRandom({ movementX })}
              />
              <RangeField
                label="Vertical movement variation"
                value={layer.random.movementY}
                defaultValue={0}
                min={0}
                max={400}
                unit="± px"
                help="Adds a seeded vertical travel difference to every copy."
                onChange={(movementY) => setRandom({ movementY })}
              />
              <RangeField
                label="Delay variation"
                value={layer.random.delay}
                defaultValue={0}
                min={0}
                max={3000}
                step={10}
                unit="ms"
                help="Adds extra wait time only; a copy never begins earlier than the authored start delay."
                onChange={(delay) => setRandom({ delay })}
              />
              <RangeField
                label="Opacity variation"
                value={layer.random.opacity * 100}
                defaultValue={0}
                min={0}
                max={100}
                unit="± %"
                help="Makes copies begin slightly brighter or dimmer while remaining repeatable for the same seed."
                onChange={(value) => setRandom({ opacity: value / 100 })}
              />
            </FieldGroup>
          </SettingsSection>
        )}

        <SettingsSection title="Advanced" icon={<RotateCw size={15} />}>
          <SelectField
            label="Attach to layer"
            value={layer.parentId ?? ""}
            help="Keeps this effect positioned relative to another layer. If the other layer moves, this one follows."
            onChange={(parentId) =>
              onChange({ ...layer, parentId: parentId || null })
            }
          >
            <option value="">Nothing — place freely</option>
            {layers
              .filter((candidate) => candidate.id !== layer.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
          </SelectField>
          {layer.type !== "beam" && (
            <Toggle
              label="Separate width and height"
              checked={layer.transform.separateScale}
              help="Lets you stretch the image wider or taller instead of resizing it evenly."
              onChange={(separateScale) => setTransform({ separateScale })}
            />
          )}
          {layer.type !== "beam" && layer.transform.separateScale && (
            <FieldGroup>
              <RangeField
                label="Starting width"
                value={layer.transform.startScaleX * 100}
                defaultValue={100}
                min={0}
                max={400}
                unit="%"
                help="The horizontal size when this layer appears. Use separate size for stretched rings or streaks."
                onChange={(value) => setTransform({ startScaleX: value / 100 })}
              />
              <RangeField
                label="Starting height"
                value={layer.transform.startScaleY * 100}
                defaultValue={100}
                min={0}
                max={400}
                unit="%"
                help="The vertical size when this layer appears."
                onChange={(value) => setTransform({ startScaleY: value / 100 })}
              />
              {layer.type !== "static" && (
                <>
                  <RangeField
                    label="Ending width"
                    value={layer.transform.endScaleX * 100}
                    defaultValue={100}
                    min={0}
                    max={400}
                    unit="%"
                    help="The horizontal size at the end of this layer's lifetime."
                    onChange={(value) =>
                      setTransform({ endScaleX: value / 100 })
                    }
                  />
                  <RangeField
                    label="Ending height"
                    value={layer.transform.endScaleY * 100}
                    defaultValue={100}
                    min={0}
                    max={400}
                    unit="%"
                    help="The vertical size at the end of this layer's lifetime."
                    onChange={(value) =>
                      setTransform({ endScaleY: value / 100 })
                    }
                  />
                </>
              )}
            </FieldGroup>
          )}
        </SettingsSection>

        <div className="what-happens">
          <Link2 size={15} />
          <div>
            <strong>What is happening?</strong>
            <p>{describeLayer(layer)}</p>
          </div>
        </div>
        {(needsSmokeFade || identicalBurst) && (
          <div className="context-tip">
            <Sparkles size={14} />
            <p>
              {needsSmokeFade
                ? "Tip: Smoke usually feels more natural when its ending opacity is close to 0%."
                : "Tip: A little random size and movement can make this burst feel less mechanical."}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
