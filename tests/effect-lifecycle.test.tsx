import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useHistoryState } from "../src/editor/useHistoryState";
import { projectAfterAssetChanged } from "../src/vfx/assetReferences";
import {
  createEmptyProject,
  createLayer,
  DEFAULT_FRAME_ANIMATION,
} from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import { compileLayerActivations } from "../src/vfx/events";
import {
  changeSpawnShape,
  disableBehaviorEnvelope,
  removeKeyframes,
  removeMotionPath,
  resetKeyframes,
  resetMotionPath,
} from "../src/vfx/optionalStateLifecycle";
import {
  createRuntimeDefinition,
  generatePhaserCode,
  generateStandalonePhaserCode,
} from "../src/vfx/exporters";
import {
  createDefaultRenderingEffects,
  enabledRenderingEffects,
  renderingEffectPassCost,
  type RenderingEffectsSettings,
} from "../src/vfx/renderingEffects";
import { deserializeProject, serializeProject } from "../src/vfx/serialization";
import type {
  AnimatedLayer,
  LayerEvent,
  VfxAsset,
  VfxProject,
} from "../src/vfx/types";
import { validPngDataUrl } from "./fixtures/portableImages";

afterEach(cleanup);

function lifecycleLayer(): AnimatedLayer {
  const layer = createLayer("animated", "Lifecycle subject", "builtin-ring");
  layer.id = "lifecycle-subject";
  layer.timing.duration = 1_000;
  layer.timing.easing = "constant";
  layer.transform.endOpacity = 1;
  layer.transform.movementX = 100;
  return layer;
}

function projectWith(...layers: AnimatedLayer[]): VfxProject {
  const project = createEmptyProject("Lifecycle audit");
  project.preview.randomSeed = 8_421;
  project.preview.duration = 2_000;
  project.layers = layers;
  return project;
}

function evaluatedWithoutMutation(layer: AnimatedLayer, time: number) {
  const project = projectWith(layer);
  const before = structuredClone(project);
  const evaluated = evaluateProject(project, time, null);
  expect(project).toEqual(before);
  return evaluated;
}

interface ReversibleFeatureCase {
  name: string;
  time: number;
  configure: (layer: AnimatedLayer) => void;
  setEnabled: (layer: AnimatedLayer, enabled: boolean) => void;
  remove: (layer: AnimatedLayer) => void;
  reset: (layer: AnimatedLayer) => void;
  read: (layer: AnimatedLayer) => unknown;
}

const canonicalLayer = () => lifecycleLayer();

const reversibleFeatures: ReversibleFeatureCase[] = [
  {
    name: "color over lifetime",
    time: 500,
    configure: (layer) => {
      layer.appearance.colorOverLifetime = {
        enabled: true,
        stops: [
          { time: 0, color: "#ff0000" },
          { time: 1, color: "#0000ff" },
        ],
      };
    },
    setEnabled: (layer, enabled) => {
      layer.appearance.colorOverLifetime.enabled = enabled;
    },
    remove: (layer) => {
      layer.appearance.colorOverLifetime = structuredClone(
        canonicalLayer().appearance.colorOverLifetime,
      );
    },
    reset: (layer) => {
      layer.appearance.colorOverLifetime = {
        ...structuredClone(canonicalLayer().appearance.colorOverLifetime),
        enabled: true,
      };
    },
    read: (layer) => layer.appearance.colorOverLifetime,
  },
  {
    name: "pulse",
    time: 125,
    configure: (layer) => {
      layer.behavior.pulse = {
        ...layer.behavior.pulse,
        enabled: true,
        scale: 0.35,
        opacity: 0.4,
        speed: 2,
      };
    },
    setEnabled: (layer, enabled) => {
      layer.behavior.pulse.enabled = enabled;
    },
    remove: (layer) => {
      layer.behavior.pulse = structuredClone(canonicalLayer().behavior.pulse);
    },
    reset: (layer) => {
      layer.behavior.pulse = {
        ...structuredClone(canonicalLayer().behavior.pulse),
        enabled: true,
      };
    },
    read: (layer) => layer.behavior.pulse,
  },
  {
    name: "flicker",
    time: 125,
    configure: (layer) => {
      layer.behavior.flicker = {
        ...layer.behavior.flicker,
        enabled: true,
        amount: 0.6,
        speed: 4,
        randomness: 0,
      };
    },
    setEnabled: (layer, enabled) => {
      layer.behavior.flicker.enabled = enabled;
    },
    remove: (layer) => {
      layer.behavior.flicker = structuredClone(
        canonicalLayer().behavior.flicker,
      );
    },
    reset: (layer) => {
      layer.behavior.flicker = {
        ...structuredClone(canonicalLayer().behavior.flicker),
        enabled: true,
      };
    },
    read: (layer) => layer.behavior.flicker,
  },
  {
    name: "organic movement",
    time: 430,
    configure: (layer) => {
      layer.behavior.wobble = {
        ...layer.behavior.wobble,
        enabled: true,
        style: "organic",
        x: 28,
        y: 17,
        rotation: 12,
        speed: 1.7,
      };
    },
    setEnabled: (layer, enabled) => {
      layer.behavior.wobble.enabled = enabled;
    },
    remove: (layer) => {
      layer.behavior.wobble = structuredClone(canonicalLayer().behavior.wobble);
    },
    reset: (layer) => {
      layer.behavior.wobble = {
        ...structuredClone(canonicalLayer().behavior.wobble),
        enabled: true,
      };
    },
    read: (layer) => layer.behavior.wobble,
  },
  {
    name: "motion path",
    time: 500,
    configure: (layer) => {
      layer.motionPath = {
        ...layer.motionPath,
        enabled: true,
        mode: "curve",
        controlX: 30,
        controlY: -120,
        orientToPath: true,
      };
    },
    setEnabled: (layer, enabled) => {
      layer.motionPath.enabled = enabled;
    },
    remove: (layer) => {
      layer.motionPath = removeMotionPath();
    },
    reset: (layer) => {
      layer.motionPath = resetMotionPath();
    },
    read: (layer) => layer.motionPath,
  },
  {
    name: "motion trail",
    time: 500,
    configure: (layer) => {
      layer.trail = {
        enabled: true,
        count: 5,
        spacing: 40,
        lifetime: 300,
        opacity: 0.7,
        scaleFalloff: 0.08,
      };
    },
    setEnabled: (layer, enabled) => {
      layer.trail.enabled = enabled;
    },
    remove: (layer) => {
      layer.trail = structuredClone(canonicalLayer().trail);
    },
    reset: (layer) => {
      layer.trail = {
        ...structuredClone(canonicalLayer().trail),
        enabled: true,
      };
    },
    read: (layer) => layer.trail,
  },
  {
    name: "property moments",
    time: 500,
    configure: (layer) => {
      layer.keyframes = {
        enabled: true,
        initialized: true,
        frames: [
          { time: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
          { time: 0.5, scaleX: 2, scaleY: 0.5, opacity: 0.7, rotation: 35 },
          { time: 1, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
        ],
      };
    },
    setEnabled: (layer, enabled) => {
      layer.keyframes.enabled = enabled;
    },
    remove: (layer) => {
      layer.keyframes = removeKeyframes();
    },
    reset: (layer) => {
      layer.keyframes = resetKeyframes(layer.transform);
    },
    read: (layer) => layer.keyframes,
  },
];

function expectFeatureReversible(feature: ReversibleFeatureCase) {
  const baseline = lifecycleLayer();
  const baselineEvaluation = evaluatedWithoutMutation(baseline, feature.time);

  const configured = structuredClone(baseline);
  feature.configure(configured);
  const configuredValue = structuredClone(feature.read(configured));
  const configuredEvaluation = evaluatedWithoutMutation(
    configured,
    feature.time,
  );
  expect(configuredEvaluation).not.toEqual(baselineEvaluation);

  const disabled = structuredClone(configured);
  feature.setEnabled(disabled, false);
  const expectedDisabledValue = structuredClone(configuredValue) as {
    enabled: boolean;
  };
  expectedDisabledValue.enabled = false;
  expect(feature.read(disabled)).toEqual(expectedDisabledValue);
  expect(evaluatedWithoutMutation(disabled, feature.time)).toEqual(
    baselineEvaluation,
  );

  const reenabled = structuredClone(disabled);
  feature.setEnabled(reenabled, true);
  expect(feature.read(reenabled)).toEqual(configuredValue);
  expect(evaluatedWithoutMutation(reenabled, feature.time)).toEqual(
    configuredEvaluation,
  );

  const removed = structuredClone(configured);
  feature.remove(removed);
  expect(feature.read(removed)).toEqual(feature.read(baseline));
  expect(evaluatedWithoutMutation(removed, feature.time)).toEqual(
    baselineEvaluation,
  );

  const reset = structuredClone(configured);
  feature.reset(reset);
  const defaultEnabled = lifecycleLayer();
  if (feature.name === "property moments")
    defaultEnabled.keyframes = resetKeyframes(defaultEnabled.transform);
  else feature.setEnabled(defaultEnabled, true);
  expect(feature.read(reset)).toEqual(feature.read(defaultEnabled));

  const repeatedlyToggled = structuredClone(configured);
  for (let cycle = 0; cycle < 6; cycle += 1) {
    feature.setEnabled(repeatedlyToggled, false);
    expect(evaluatedWithoutMutation(repeatedlyToggled, feature.time)).toEqual(
      baselineEvaluation,
    );
    feature.setEnabled(repeatedlyToggled, true);
    expect(evaluatedWithoutMutation(repeatedlyToggled, feature.time)).toEqual(
      configuredEvaluation,
    );
  }
}

describe("optional effect reversibility", () => {
  it.each(reversibleFeatures)(
    "$name preserves settings while disabled and removes cleanly",
    (feature) => expectFeatureReversible(feature),
  );

  it("removes only one contribution from interacting modifiers", () => {
    const baseline = lifecycleLayer();

    const pulseAndFlicker = structuredClone(baseline);
    reversibleFeatures
      .find(({ name }) => name === "pulse")
      ?.configure(pulseAndFlicker);
    reversibleFeatures
      .find(({ name }) => name === "flicker")
      ?.configure(pulseAndFlicker);
    const flickerOnly = structuredClone(pulseAndFlicker);
    flickerOnly.behavior.pulse.enabled = false;
    const expectedFlicker = structuredClone(baseline);
    reversibleFeatures
      .find(({ name }) => name === "flicker")
      ?.configure(expectedFlicker);
    expect(evaluatedWithoutMutation(flickerOnly, 125)).toEqual(
      evaluatedWithoutMutation(expectedFlicker, 125),
    );

    const tintAndColor = structuredClone(baseline);
    tintAndColor.appearance.tint = "#33cc88";
    reversibleFeatures
      .find(({ name }) => name === "color over lifetime")
      ?.configure(tintAndColor);
    tintAndColor.appearance.colorOverLifetime.enabled = false;
    const tintOnly = structuredClone(baseline);
    tintOnly.appearance.tint = "#33cc88";
    expect(evaluatedWithoutMutation(tintAndColor, 500)).toEqual(
      evaluatedWithoutMutation(tintOnly, 500),
    );

    const combinedMotion = structuredClone(baseline);
    combinedMotion.behavior.physics.gravity = 320;
    combinedMotion.behavior.physics.drag = 0.8;
    reversibleFeatures
      .find(({ name }) => name === "organic movement")
      ?.configure(combinedMotion);
    const withoutGravity = structuredClone(combinedMotion);
    withoutGravity.behavior.physics.gravity = 0;
    const expectedWanderAndSlowdown = structuredClone(baseline);
    expectedWanderAndSlowdown.behavior.physics.drag = 0.8;
    reversibleFeatures
      .find(({ name }) => name === "organic movement")
      ?.configure(expectedWanderAndSlowdown);
    expect(evaluatedWithoutMutation(withoutGravity, 430)).toEqual(
      evaluatedWithoutMutation(expectedWanderAndSlowdown, 430),
    );

    const trailAndWander = structuredClone(expectedWanderAndSlowdown);
    reversibleFeatures
      .find(({ name }) => name === "motion trail")
      ?.configure(trailAndWander);
    trailAndWander.trail.enabled = false;
    expect(evaluatedWithoutMutation(trailAndWander, 500)).toEqual(
      evaluatedWithoutMutation(expectedWanderAndSlowdown, 500),
    );
  });

  it("restores zero and null based features to their authored baseline", () => {
    const baseline = lifecycleLayer();
    const baselineEvaluation = evaluatedWithoutMutation(baseline, 500);
    const configured = structuredClone(baseline);
    configured.appearance.tint = "#ff8844";
    configured.appearance.blendMode = "add";
    configured.behavior.physics.gravity = 300;
    configured.behavior.physics.drag = 0.75;
    configured.random.positionX = 40;
    configured.random.rotation = 25;
    const configuredEvaluation = evaluatedWithoutMutation(configured, 500);
    expect(configuredEvaluation).not.toEqual(baselineEvaluation);

    const removed = structuredClone(configured);
    removed.appearance.tint = null;
    removed.appearance.blendMode = "normal";
    removed.behavior.physics.gravity = 0;
    removed.behavior.physics.drag = 0;
    removed.random = structuredClone(baseline.random);
    expect(evaluatedWithoutMutation(removed, 500)).toEqual(baselineEvaluation);

    const addedAgain = structuredClone(removed);
    addedAgain.appearance = structuredClone(configured.appearance);
    addedAgain.behavior.physics = structuredClone(configured.behavior.physics);
    addedAgain.random = structuredClone(configured.random);
    expect(evaluatedWithoutMutation(addedAgain, 500)).toEqual(
      configuredEvaluation,
    );
  });

  it("disables an envelope without replacing its authored stages", () => {
    const configured = {
      enabled: true,
      start: 0.13,
      attackEnd: 0.31,
      releaseStart: 0.68,
      end: 0.92,
    };

    expect(disableBehaviorEnvelope(configured)).toEqual({
      ...configured,
      enabled: false,
    });
    expect(configured.enabled).toBe(true);
  });

  it("forgets a silhouette reference when another spawn shape is selected", () => {
    const layer = createLayer("burst", "Silhouette copies", "builtin-ring");
    layer.spawn.shape = "mask";
    layer.spawn.maskAssetId = "prepared-silhouette";

    const changed = changeSpawnShape(layer.spawn, "circle", null);

    expect(changed).toMatchObject({ shape: "circle", maskAssetId: null });
    expect(layer.spawn.maskAssetId).toBe("prepared-silhouette");
    expect(changeSpawnShape(changed, "mask", "replacement-mask")).toMatchObject(
      { shape: "mask", maskAssetId: "replacement-mask" },
    );
  });
});

type RenderingEffectKey = keyof RenderingEffectsSettings;

const renderingCases: Array<{
  name: string;
  key: RenderingEffectKey;
  configure: (effect: Record<string, unknown>) => void;
}> = [
  {
    name: "visual mask",
    key: "visualMask",
    configure: (effect) =>
      Object.assign(effect, { maskAssetId: "builtin-ring", strength: 0.35 }),
  },
  {
    name: "blur",
    key: "blur",
    configure: (effect) => Object.assign(effect, { strength: 3, steps: 2 }),
  },
  {
    name: "outer glow",
    key: "outerGlow",
    configure: (effect) => Object.assign(effect, { outerStrength: 6 }),
  },
  {
    name: "brightness and exposure",
    key: "brightnessExposure",
    configure: (effect) => Object.assign(effect, { exposure: 1.25 }),
  },
  {
    name: "animated shine",
    key: "animatedShine",
    configure: (effect) => Object.assign(effect, { speed: 2.5 }),
  },
  {
    name: "spatial gradient",
    key: "spatialGradient",
    configure: (effect) => Object.assign(effect, { colorA: "#ff0000" }),
  },
  {
    name: "dissolve and erosion",
    key: "directionalDissolve",
    configure: (effect) =>
      Object.assign(effect, { pattern: "noise", noiseScale: 12 }),
  },
  {
    name: "sprite warp and heat shimmer",
    key: "spriteWarp",
    configure: (effect) =>
      Object.assign(effect, { mode: "heat-shimmer", amountX: 0.02 }),
  },
];

function renderingEffectRecord(
  settings: RenderingEffectsSettings,
  key: RenderingEffectKey,
) {
  return settings[key] as unknown as Record<string, unknown> & {
    enabled: boolean;
  };
}

function replaceRenderingEffect(
  settings: RenderingEffectsSettings,
  key: RenderingEffectKey,
  value: Record<string, unknown>,
) {
  (settings as unknown as Record<RenderingEffectKey, Record<string, unknown>>)[
    key
  ] = value;
}

describe("experimental rendering lifecycle", () => {
  it.each(renderingCases)(
    "$name preserves its configuration while contributing zero passes when disabled",
    ({ key, configure }) => {
      const baseline = createDefaultRenderingEffects();
      const configured = structuredClone(baseline);
      const configuredEffect = renderingEffectRecord(configured, key);
      configuredEffect.enabled = true;
      configure(configuredEffect);
      const configuredSnapshot = structuredClone(configuredEffect);

      expect(enabledRenderingEffects(configured)).toHaveLength(1);
      expect(renderingEffectPassCost(configured)).toBeGreaterThan(0);

      configuredEffect.enabled = false;
      expect(configuredEffect).toEqual({
        ...configuredSnapshot,
        enabled: false,
      });
      expect(enabledRenderingEffects(configured)).toEqual([]);
      expect(renderingEffectPassCost(configured)).toBe(0);

      for (let cycle = 0; cycle < 6; cycle += 1) {
        configuredEffect.enabled = true;
        expect(enabledRenderingEffects(configured)).toHaveLength(1);
        configuredEffect.enabled = false;
        expect(enabledRenderingEffects(configured)).toEqual([]);
        expect(renderingEffectPassCost(configured)).toBe(0);
      }

      const removed = structuredClone(configured);
      replaceRenderingEffect(
        removed,
        key,
        structuredClone(renderingEffectRecord(baseline, key)),
      );
      expect(renderingEffectRecord(removed, key)).toEqual(
        renderingEffectRecord(baseline, key),
      );

      const reset = structuredClone(configured);
      replaceRenderingEffect(reset, key, {
        ...structuredClone(renderingEffectRecord(baseline, key)),
        enabled: true,
      });
      expect(renderingEffectRecord(reset, key)).toEqual({
        ...renderingEffectRecord(baseline, key),
        enabled: true,
      });
    },
  );
});

function finishEvent(targetLayerId: string): LayerEvent {
  return {
    id: "finish-event",
    enabled: true,
    trigger: "finish",
    percentage: 0.5,
    action: "play",
    targetLayerId,
    chance: 1,
    maxTriggers: 32,
  };
}

describe("events, persistence, exports, and history", () => {
  it("disables, removes, and adds an event again without stale activations", () => {
    const source = lifecycleLayer();
    source.id = "event-source";
    source.timing.duration = 100;
    const target = lifecycleLayer();
    target.id = "event-target";
    target.startMode = "triggered";
    target.timing.duration = 100;
    const project = projectWith(source, target);
    source.events = [finishEvent(target.id)];

    const activationCount = () =>
      compileLayerActivations(project, 100).byLayer.get(target.id)?.length ?? 0;
    expect(activationCount()).toBe(1);

    for (let cycle = 0; cycle < 6; cycle += 1) {
      source.events[0].enabled = false;
      expect(activationCount()).toBe(0);
      source.events[0].enabled = true;
      expect(activationCount()).toBe(1);
    }

    const atFinish = evaluateProject(project, 100, null);
    evaluateProject(project, 20, null);
    expect(evaluateProject(project, 100, null)).toEqual(atFinish);

    source.events[0].enabled = false;
    const disabledRoundTrip = deserializeProject(serializeProject(project));
    expect(disabledRoundTrip.ok).toBe(true);
    expect(disabledRoundTrip.project?.layers[0].events[0]).toMatchObject({
      id: "finish-event",
      enabled: false,
    });
    expect(createRuntimeDefinition(project).layers[0].events[0]).toMatchObject({
      id: "finish-event",
      enabled: false,
    });

    source.events = [];
    expect(activationCount()).toBe(0);
    expect(createRuntimeDefinition(project).layers[0].events).toEqual([]);
    expect(generatePhaserCode(project)).not.toContain("finish-event");
    const importedRemoved = deserializeProject(serializeProject(project));
    expect(importedRemoved.project?.layers[0].events).toEqual([]);

    source.events = [finishEvent(target.id)];
    expect(activationCount()).toBe(1);
  });

  it("ignores unsupported data owned only by disabled standalone layers and events", () => {
    const source = lifecycleLayer();
    source.id = "standalone-source";
    const dormantTarget = lifecycleLayer();
    dormantTarget.id = "dormant-target";
    dormantTarget.startMode = "triggered";
    dormantTarget.enabled = false;
    source.events = [
      {
        ...finishEvent(dormantTarget.id),
        id: "disabled-event",
        enabled: false,
      },
    ];
    const disabledBeam = createLayer("beam", "Dormant beam", "builtin-spark");
    disabledBeam.enabled = false;
    const project = createEmptyProject("Standalone disabled features");
    project.layers.push(source, dormantTarget, disabledBeam);

    const code = generateStandalonePhaserCode(project);
    expect(code).not.toContain("disabled-event");
    expect(code).not.toContain("Dormant beam");
    expect(code).not.toContain("dormant-target");
  });

  it("round-trips active, disabled, and removed state without runtime residue", () => {
    const layer = lifecycleLayer();
    layer.behavior.pulse.enabled = true;
    layer.behavior.pulse.scale = 0.4;
    layer.trail = {
      enabled: false,
      count: 12,
      spacing: 25,
      lifetime: 700,
      opacity: 0.8,
      scaleFalloff: 0.12,
    };
    layer.appearance.effects.outerGlow = structuredClone(
      createDefaultRenderingEffects().outerGlow,
    );
    layer.events = [];
    const project = projectWith(layer);
    const before = structuredClone(project);

    const imported = deserializeProject(serializeProject(project));
    expect(imported.ok).toBe(true);
    expect(imported.project?.layers[0].behavior.pulse).toMatchObject({
      enabled: true,
      scale: 0.4,
    });
    expect(imported.project?.layers[0].trail).toEqual(layer.trail);
    expect(imported.project?.layers[0].appearance.effects.outerGlow).toEqual(
      createDefaultRenderingEffects().outerGlow,
    );
    expect(imported.project?.layers[0].events).toEqual([]);

    const runtime = createRuntimeDefinition(project);
    expect(runtime.layers[0].trail).toEqual(layer.trail);
    expect(runtime.layers[0].events).toEqual([]);
    expect(runtime.layers[0].appearance.effects.outerGlow).toEqual(
      createDefaultRenderingEffects().outerGlow,
    );
    expect(generatePhaserCode(project)).not.toContain("removed-event");
    expect(project).toEqual(before);
  });

  it("undo and redo restore configured, disabled, and removed effect states", () => {
    const baseline = projectWith(lifecycleLayer());
    const active = structuredClone(baseline);
    active.layers[0].behavior.pulse = {
      ...active.layers[0].behavior.pulse,
      enabled: true,
      scale: 0.45,
      speed: 2,
    };
    const disabled = structuredClone(active);
    disabled.layers[0].behavior.pulse.enabled = false;
    const removed = structuredClone(disabled);
    removed.layers[0].behavior.pulse = structuredClone(
      baseline.layers[0].behavior.pulse,
    );
    const { result } = renderHook(() => useHistoryState(baseline));

    act(() => result.current.set(active));
    act(() => result.current.set(disabled));
    act(() => result.current.undo());
    expect(result.current.value.layers[0].behavior.pulse).toEqual(
      active.layers[0].behavior.pulse,
    );
    expect(evaluateProject(result.current.value, 125, null)).toEqual(
      evaluateProject(active, 125, null),
    );

    act(() => result.current.redo());
    expect(result.current.value.layers[0].behavior.pulse).toEqual(
      disabled.layers[0].behavior.pulse,
    );
    expect(evaluateProject(result.current.value, 125, null)).toEqual(
      evaluateProject(baseline, 125, null),
    );

    act(() => result.current.set(removed));
    act(() => result.current.undo());
    expect(result.current.value.layers[0].behavior.pulse).toEqual(
      disabled.layers[0].behavior.pulse,
    );
    act(() => result.current.redo());
    expect(result.current.value.layers[0].behavior.pulse).toEqual(
      baseline.layers[0].behavior.pulse,
    );
  });
});

describe("structural optional features", () => {
  it("detaches a moving child without baking the former parent offset", () => {
    const parent = lifecycleLayer();
    parent.id = "attachment-parent";
    parent.transform.x = 70;
    parent.transform.movementX = 0;
    const attached = lifecycleLayer();
    attached.id = "attachment-child";
    attached.parentId = parent.id;
    attached.transform.x = 15;
    const attachedProject = projectWith(parent, attached);
    const attachedState = evaluateProject(attachedProject, 500, null).find(
      ({ layerId }) => layerId === attached.id,
    );

    const detached = structuredClone(attached);
    detached.parentId = null;
    const detachedProject = projectWith(parent, detached);
    const independent = lifecycleLayer();
    independent.id = detached.id;
    independent.transform.x = detached.transform.x;
    const expectedProject = projectWith(parent, independent);
    const detachedState = evaluateProject(detachedProject, 500, null).find(
      ({ layerId }) => layerId === detached.id,
    );
    const expectedState = evaluateProject(expectedProject, 500, null).find(
      ({ layerId }) => layerId === independent.id,
    );

    expect(attachedState?.x).not.toBe(detachedState?.x);
    expect(detachedState).toEqual(expectedState);
    expect(
      createRuntimeDefinition(detachedProject).layers[1].attachTo,
    ).toBeNull();
  });

  it("removes flipbook playback and adds it again from canonical defaults", () => {
    const project = createEmptyProject("Flipbook lifecycle");
    const asset: VfxAsset = {
      id: "flipbook-asset",
      name: "Flipbook asset",
      mimeType: "image/png" as const,
      dataUrl: validPngDataUrl(64, 16),
      width: 64,
      height: 16,
      spriteSheet: { frameWidth: 16, frameHeight: 16, frameCount: 4 },
      atlasFrame: null,
      alphaMask: null,
    };
    const layer = lifecycleLayer();
    layer.assetId = asset.id;
    layer.frameAnimation.framesPerSecond = 4;
    layer.frameAnimation.startFrame = 0;
    layer.frameAnimation.endFrame = 3;
    project.assets.push(asset);
    project.layers.push(layer);
    const active = evaluateProject(project, 250, null)[0];
    expect(active.frame).toBe(1);

    const removedProject = projectAfterAssetChanged(project, {
      ...asset,
      spriteSheet: null,
    });
    const removed = evaluateProject(removedProject, 250, null)[0];
    expect(removed.frame).toBeNull();
    expect(removedProject.layers[0].frameAnimation).toEqual(
      DEFAULT_FRAME_ANIMATION,
    );
    expect(
      createRuntimeDefinition(removedProject).layers[0].frameAnimation,
    ).toEqual(DEFAULT_FRAME_ANIMATION);
    expect(
      createRuntimeDefinition(removedProject).assets.at(-1)?.spriteSheet,
    ).toBeNull();
    const imported = deserializeProject(serializeProject(removedProject));
    expect(imported.project?.assets.at(-1)?.spriteSheet).toBeNull();
    expect(imported.project?.layers[0].frameAnimation).toEqual(
      DEFAULT_FRAME_ANIMATION,
    );

    const staleRemovedProject = structuredClone(removedProject);
    staleRemovedProject.layers[0].frameAnimation = structuredClone(
      layer.frameAnimation,
    );
    expect(
      createRuntimeDefinition(staleRemovedProject).layers[0].frameAnimation,
    ).toEqual(DEFAULT_FRAME_ANIMATION);
    expect(
      deserializeProject(serializeProject(staleRemovedProject)).project
        ?.layers[0].frameAnimation,
    ).toEqual(DEFAULT_FRAME_ANIMATION);

    const addedAgain = projectAfterAssetChanged(removedProject, asset);
    expect(addedAgain.layers[0].frameAnimation).toEqual(
      DEFAULT_FRAME_ANIMATION,
    );
    expect(evaluateProject(addedAgain, 250, null)[0].frame).not.toBe(
      active.frame,
    );
  });

  it("keeps disabled layers in portable data but out of evaluated playback", () => {
    const layer = lifecycleLayer();
    layer.behavior.pulse.enabled = true;
    const activeProject = projectWith(layer);
    const active = evaluateProject(activeProject, 125, null);
    expect(active).not.toEqual([]);

    layer.enabled = false;
    expect(evaluateProject(activeProject, 125, null)).toEqual([]);
    const runtime = createRuntimeDefinition(activeProject);
    expect(runtime.layers[0].enabled).toBe(false);
    expect(runtime.layers[0].behavior.pulse.enabled).toBe(true);

    layer.enabled = true;
    expect(evaluateProject(activeProject, 125, null)).toEqual(active);
  });
});
