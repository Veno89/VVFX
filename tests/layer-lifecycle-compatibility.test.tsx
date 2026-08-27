import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/editor/components/Inspector";
import {
  createEmptyProject,
  createLayer,
  DEFAULT_BEHAVIOR,
  DEFAULT_COLOR_OVER_LIFETIME,
  DEFAULT_KEYFRAMES,
  DEFAULT_MOTION_PATH,
  DEFAULT_RANDOM,
  DEFAULT_TIMING,
  DEFAULT_TRAIL,
} from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import { createRuntimeDefinition } from "../src/vfx/exporters";
import {
  canonicalizeLayerCapabilities,
  canonicalizeProjectLayerCapabilities,
  enabledIncomingLayerEvents,
  mergeCompatibleLayerSettings,
  type CopyableLayerSettings,
} from "../src/vfx/layerLifecycle";
import { deserializeProject, serializeProject } from "../src/vfx/serialization";
import type {
  BeamLayer,
  LayerEvent,
  StaticLayer,
  VfxLayer,
  VfxProject,
} from "../src/vfx/types";

afterEach(cleanup);

function copyableSettings(layer: VfxLayer): CopyableLayerSettings {
  return {
    assetId: layer.assetId,
    transform: layer.transform,
    timing: layer.timing,
    appearance: layer.appearance,
    behavior: layer.behavior,
    random: layer.random,
    frameAnimation: layer.frameAnimation,
    trail: layer.trail,
    motionPath: layer.motionPath,
    keyframes: layer.keyframes,
    beam: layer.beam,
    spawn: layer.spawn,
    parentId: layer.parentId,
  };
}

function layerEvent(
  id: string,
  targetLayerId: string,
  enabled: boolean,
): LayerEvent {
  return {
    id,
    enabled,
    trigger: "finish",
    percentage: 0.5,
    action: "play",
    targetLayerId,
    chance: 1,
    maxTriggers: 32,
  };
}

function contaminatedV17Project(): {
  project: VfxProject;
  still: StaticLayer;
  beam: BeamLayer;
} {
  const project = createEmptyProject("Contaminated capabilities");
  const still = createLayer("static", "Still", "builtin-ring");
  still.transform = {
    ...still.transform,
    x: 12,
    y: -4,
    startScale: 1.4,
    endScale: 9,
    startScaleX: 1.6,
    startScaleY: 0.8,
    endScaleX: 8,
    endScaleY: 7,
    separateScale: true,
    startOpacity: 0.75,
    endOpacity: 0.1,
    rotation: 20,
    rotationDuring: 540,
    movementX: 300,
    movementY: -200,
  };
  still.timing = {
    ...still.timing,
    delay: 25,
    repeat: 4,
    repeatForever: true,
    yoyo: true,
    loop: true,
    easing: "bounce",
    customEasing: { x1: 0.1, y1: 2, x2: 0.9, y2: -1 },
  };
  still.appearance.tint = "#abcdef";
  still.appearance.colorOverLifetime = {
    enabled: true,
    stops: [
      { time: 0, color: "#ff0000" },
      { time: 1, color: "#0000ff" },
    ],
  };
  still.behavior.pulse.enabled = true;
  still.behavior.wobble.enabled = true;
  still.behavior.wobble.x = 120;
  still.behavior.physics.gravity = 900;
  still.random.positionX = 180;
  still.random.positionY = 160;
  still.random.startScale = 2;
  still.random.duration = 400;
  still.random.delay = 250;
  still.trail = { ...still.trail, enabled: true, count: 3, spacing: 40 };
  still.motionPath = {
    ...still.motionPath,
    enabled: true,
    orientToPath: true,
    controlX: 200,
    controlY: -150,
  };
  still.keyframes = {
    enabled: true,
    initialized: true,
    frames: [
      { time: 0, scaleX: 5, scaleY: 4, opacity: 0.2, rotation: 90 },
      { time: 1, scaleX: 8, scaleY: 7, opacity: 0, rotation: 360 },
    ],
  };

  const beam = createLayer("beam", "Bolt", "builtin-spark");
  beam.transform = {
    ...beam.transform,
    x: 30,
    y: 40,
    startScale: 1.5,
    endScale: 0.6,
    startScaleX: 7,
    startScaleY: 6,
    endScaleX: 5,
    endScaleY: 4,
    separateScale: true,
    startOpacity: 0.9,
    endOpacity: 0.2,
    rotation: 180,
    rotationDuring: 720,
    movementX: 250,
    movementY: -125,
  };
  beam.timing = { ...beam.timing, repeat: 2, yoyo: true };
  beam.appearance.colorOverLifetime = {
    enabled: true,
    stops: [
      { time: 0, color: "#00ffff" },
      { time: 1, color: "#ff00ff" },
    ],
  };
  beam.behavior.pulse.enabled = true;
  beam.behavior.pulse.scale = 0.2;
  beam.random.positionX = 12;
  beam.random.opacity = 0.1;
  beam.trail = { ...beam.trail, enabled: true, count: 2, spacing: 50 };
  beam.motionPath = {
    ...beam.motionPath,
    enabled: true,
    mode: "custom",
    points: [
      { x: 50, y: 25 },
      { x: 100, y: -20 },
    ],
    orientToPath: true,
  };
  beam.keyframes = {
    enabled: true,
    initialized: true,
    frames: [
      { time: 0, scaleX: 9, scaleY: 8, opacity: 0.1, rotation: 90 },
      { time: 1, scaleX: 6, scaleY: 5, opacity: 1, rotation: 270 },
    ],
  };
  beam.beam = { endX: 333, endY: -44 };

  project.layers = [still, beam];
  return { project, still, beam };
}

describe("layer settings lifecycle compatibility", () => {
  it("repairs static hidden state while applying visible copied settings", () => {
    const target = createLayer("static", "Still", "builtin-ring");
    target.transform.endScale = 1.25;
    target.transform.endScaleX = 1.5;
    target.transform.endScaleY = 1.75;
    target.transform.endOpacity = 0.8;
    target.transform.rotationDuring = 12;
    target.transform.movementX = 13;
    target.transform.movementY = 14;
    target.timing.repeat = 2;
    target.timing.repeatForever = false;
    target.timing.yoyo = false;
    target.timing.loop = false;
    target.timing.easing = "constant";
    target.behavior.pulse.enabled = false;
    target.random.positionX = 3;
    target.trail.enabled = false;
    target.motionPath.enabled = false;
    target.keyframes.enabled = false;

    const copied = createLayer("animated", "Moving", "builtin-spark");
    copied.transform.x = 101;
    copied.transform.y = 102;
    copied.transform.startScale = 2;
    copied.transform.separateScale = true;
    copied.transform.startScaleX = 2.5;
    copied.transform.startScaleY = 3;
    copied.transform.startOpacity = 0.4;
    copied.transform.rotation = 30;
    copied.transform.endScale = 9;
    copied.transform.endScaleX = 8;
    copied.transform.endScaleY = 7;
    copied.transform.endOpacity = 0.1;
    copied.transform.rotationDuring = 360;
    copied.transform.movementX = 500;
    copied.transform.movementY = -500;
    copied.timing.delay = 120;
    copied.timing.duration = 2_000;
    copied.timing.repeat = 9;
    copied.timing.repeatForever = true;
    copied.timing.yoyo = true;
    copied.timing.easing = "bounce";
    copied.behavior.pulse.enabled = true;
    copied.random.positionX = 200;
    copied.trail.enabled = true;
    copied.motionPath.enabled = true;
    copied.keyframes.enabled = true;
    copied.appearance.colorOverLifetime.enabled = true;
    copied.appearance.colorOverLifetime.stops = [
      { time: 0, color: "#ff0000" },
      { time: 1, color: "#0000ff" },
    ];

    const result = mergeCompatibleLayerSettings(
      target,
      copyableSettings(copied),
    );

    expect(result).toMatchObject({
      id: target.id,
      type: "static",
      assetId: copied.assetId,
      transform: {
        x: 101,
        y: 102,
        startScale: 2,
        startScaleX: 2.5,
        startScaleY: 3,
        separateScale: true,
        startOpacity: 0.4,
        rotation: 30,
        endScale: 2,
        endScaleX: 2.5,
        endScaleY: 3,
        endOpacity: 0.4,
        rotationDuring: 0,
        movementX: 0,
        movementY: 0,
      },
      timing: {
        delay: 120,
        duration: 2_000,
        repeat: 0,
        repeatForever: false,
        yoyo: false,
        loop: false,
        easing: DEFAULT_TIMING.easing,
      },
    });
    expect(result.timing.customEasing).toEqual(DEFAULT_TIMING.customEasing);
    expect(result.appearance.colorOverLifetime).toEqual(
      DEFAULT_COLOR_OVER_LIFETIME,
    );
    expect(result.behavior).toEqual(DEFAULT_BEHAVIOR);
    expect(result.random).toEqual(DEFAULT_RANDOM);
    expect(result.trail).toEqual(DEFAULT_TRAIL);
    expect(result.motionPath).toEqual(DEFAULT_MOTION_PATH);
    expect(result.keyframes).toEqual(DEFAULT_KEYFRAMES);
  });

  it("repairs beam hidden geometry while applying supported settings", () => {
    const target = createLayer("beam", "Beam", "builtin-spark");
    target.transform.separateScale = false;
    target.transform.startScaleX = 1.1;
    target.transform.startScaleY = 1.2;
    target.transform.endScaleX = 1.3;
    target.transform.endScaleY = 1.4;
    target.transform.rotation = 15;
    target.transform.rotationDuring = 16;
    target.transform.movementX = 17;
    target.transform.movementY = 18;
    target.motionPath.enabled = false;
    target.keyframes.enabled = false;
    target.beam.endX = 321;
    target.beam.endY = -45;

    const copied = createLayer("animated", "Moving", "builtin-ring");
    copied.transform.x = 201;
    copied.transform.y = 202;
    copied.transform.startScale = 2.1;
    copied.transform.endScale = 2.2;
    copied.transform.startOpacity = 0.3;
    copied.transform.endOpacity = 0.4;
    copied.transform.separateScale = true;
    copied.transform.startScaleX = 8;
    copied.transform.startScaleY = 8;
    copied.transform.endScaleX = 9;
    copied.transform.endScaleY = 9;
    copied.transform.rotation = 270;
    copied.transform.rotationDuring = 360;
    copied.transform.movementX = 400;
    copied.transform.movementY = -400;
    copied.motionPath.enabled = true;
    copied.keyframes.enabled = true;
    copied.behavior.pulse.enabled = true;
    copied.random.rotation = 90;
    copied.trail.enabled = true;
    copied.timing.repeat = 4;
    copied.appearance.colorOverLifetime.enabled = true;
    copied.appearance.colorOverLifetime.stops = [
      { time: 0, color: "#00ff00" },
      { time: 1, color: "#ff00ff" },
    ];

    const result = mergeCompatibleLayerSettings(
      target,
      copyableSettings(copied),
    );

    expect(result).toMatchObject({
      id: target.id,
      type: "beam",
      transform: {
        x: 201,
        y: 202,
        startScale: 2.1,
        endScale: 2.2,
        startOpacity: 0.3,
        endOpacity: 0.4,
        separateScale: false,
        startScaleX: 1,
        startScaleY: 1,
        endScaleX: 1,
        endScaleY: 1,
        rotation: 0,
        rotationDuring: 0,
        movementX: 0,
        movementY: 0,
      },
      timing: { repeat: 4 },
      beam: { endX: 321, endY: -45 },
    });
    expect(result.behavior).toEqual(copied.behavior);
    expect(result.random).toEqual(copied.random);
    expect(result.trail).toEqual(copied.trail);
    expect(result.appearance.colorOverLifetime).toEqual(
      copied.appearance.colorOverLifetime,
    );
    expect(result.motionPath).toEqual(DEFAULT_MOTION_PATH);
    expect(result.keyframes).toEqual(DEFAULT_KEYFRAMES);
  });
});

describe("layer capability boundaries", () => {
  it("preserves identity for already-canonical layers and projects", () => {
    const project = createEmptyProject("Canonical capabilities");
    project.layers = [
      createLayer("static", "Still", "builtin-ring"),
      createLayer("beam", "Bolt", "builtin-spark"),
      createLayer("animated", "Moving", "builtin-flash"),
    ];

    for (const layer of project.layers)
      expect(canonicalizeLayerCapabilities(layer)).toBe(layer);
    expect(canonicalizeProjectLayerCapabilities(project)).toBe(project);
  });

  it("normalizes contaminated format-v17 layers on project ingress", () => {
    const { project, beam: authoredBeam } = contaminatedV17Project();
    expect(project.formatVersion).toBe(17);

    const result = deserializeProject(JSON.stringify(project));
    expect(result.ok).toBe(true);
    const imported = result.project!;
    const still = imported.layers.find(
      (layer): layer is StaticLayer => layer.type === "static",
    )!;
    const beam = imported.layers.find(
      (layer): layer is BeamLayer => layer.type === "beam",
    )!;

    expect(still.transform).toMatchObject({
      endScale: still.transform.startScale,
      endScaleX: still.transform.startScaleX,
      endScaleY: still.transform.startScaleY,
      endOpacity: still.transform.startOpacity,
      rotationDuring: 0,
      movementX: 0,
      movementY: 0,
    });
    expect(still.timing).toMatchObject({
      repeat: 0,
      repeatForever: false,
      yoyo: false,
      loop: false,
      easing: DEFAULT_TIMING.easing,
    });
    expect(still.appearance.colorOverLifetime).toEqual(
      DEFAULT_COLOR_OVER_LIFETIME,
    );
    expect(still.behavior).toEqual(DEFAULT_BEHAVIOR);
    expect(still.random).toEqual(DEFAULT_RANDOM);
    expect(still.trail).toEqual(DEFAULT_TRAIL);
    expect(still.motionPath).toEqual(DEFAULT_MOTION_PATH);
    expect(still.keyframes).toEqual(DEFAULT_KEYFRAMES);

    expect(beam.transform).toMatchObject({
      startScaleX: 1,
      startScaleY: 1,
      endScaleX: 1,
      endScaleY: 1,
      separateScale: false,
      rotation: 0,
      rotationDuring: 0,
      movementX: 0,
      movementY: 0,
    });
    expect(beam.motionPath).toEqual(DEFAULT_MOTION_PATH);
    expect(beam.keyframes).toEqual(DEFAULT_KEYFRAMES);
    expect(beam.behavior).toEqual(authoredBeam.behavior);
    expect(beam.random).toEqual(authoredBeam.random);
    expect(beam.trail).toEqual(authoredBeam.trail);
    expect(beam.appearance.colorOverLifetime).toEqual(
      authoredBeam.appearance.colorOverLifetime,
    );
    expect(beam.timing).toEqual(authoredBeam.timing);
    expect(beam.beam).toEqual(authoredBeam.beam);
  });

  it("repairs hidden state before evaluation and trail generation", () => {
    const { project, still } = contaminatedV17Project();
    const repaired = canonicalizeProjectLayerCapabilities(project);

    expect(evaluateProject(project, 500, null)).toEqual(
      evaluateProject(repaired, 500, null),
    );
    const stillInstances = evaluateProject(project, 500, null).filter(
      (instance) => instance.layerId === still.id,
    );
    expect(stillInstances).toHaveLength(1);
    expect(stillInstances[0]).toMatchObject({
      x: 12,
      y: -4,
      scaleX: 1.6,
      scaleY: 0.8,
      opacity: 0.75,
      rotation: 20,
      tint: "#abcdef",
      trailIndex: null,
    });
  });

  it("repairs contaminated layers at project and runtime export boundaries", () => {
    const { project, beam: authoredBeam } = contaminatedV17Project();
    const serialized = JSON.parse(serializeProject(project)) as VfxProject;
    const runtime = createRuntimeDefinition(project);
    const serializedStill = serialized.layers.find(
      (layer) => layer.type === "static",
    )!;
    const runtimeStill = runtime.layers.find(
      (layer) => layer.type === "static",
    )!;
    const serializedBeam = serialized.layers.find(
      (layer) => layer.type === "beam",
    )!;
    const runtimeBeam = runtime.layers.find((layer) => layer.type === "beam")!;

    for (const still of [serializedStill, runtimeStill]) {
      expect(still.behavior).toEqual(DEFAULT_BEHAVIOR);
      expect(still.random).toEqual(DEFAULT_RANDOM);
      expect(still.trail).toEqual(DEFAULT_TRAIL);
      expect(still.motionPath).toEqual(DEFAULT_MOTION_PATH);
      expect(still.keyframes).toEqual(DEFAULT_KEYFRAMES);
      expect(still.transform).toMatchObject({
        rotationDuring: 0,
        movementX: 0,
        movementY: 0,
      });
    }
    for (const beam of [serializedBeam, runtimeBeam]) {
      expect(beam.transform).toMatchObject({
        startScaleX: 1,
        startScaleY: 1,
        endScaleX: 1,
        endScaleY: 1,
        separateScale: false,
        rotation: 0,
        rotationDuring: 0,
        movementX: 0,
        movementY: 0,
      });
      expect(beam.motionPath).toEqual(DEFAULT_MOTION_PATH);
      expect(beam.keyframes).toEqual(DEFAULT_KEYFRAMES);
      expect(beam.behavior).toEqual(authoredBeam.behavior);
      expect(beam.random).toEqual(authoredBeam.random);
      expect(beam.trail).toEqual(authoredBeam.trail);
      expect(beam.appearance.colorOverLifetime).toEqual(
        authoredBeam.appearance.colorOverLifetime,
      );
      expect(beam.timing).toEqual(authoredBeam.timing);
      expect(beam.beam).toEqual(authoredBeam.beam);
    }
  });
});

describe("incoming event lifecycle", () => {
  it("counts only enabled events from enabled source layers", () => {
    const target = createLayer("animated", "Target", "builtin-ring");
    const activeSource = createLayer("animated", "Active", "builtin-spark");
    const disabledSource = createLayer(
      "animated",
      "Disabled source",
      "builtin-flash",
    );
    disabledSource.enabled = false;
    activeSource.events = [
      layerEvent("active", target.id, true),
      layerEvent("disabled-event", target.id, false),
    ];
    disabledSource.events = [layerEvent("disabled-source", target.id, true)];

    expect(
      enabledIncomingLayerEvents(
        [target, activeSource, disabledSource],
        target.id,
      ).map(({ source, event }) => [source.id, event.id]),
    ).toEqual([[activeSource.id, "active"]]);
  });

  it("keeps the triggered-layer warning visible for dormant incoming events", () => {
    const target = createLayer("animated", "Triggered target", "builtin-ring");
    target.startMode = "triggered";
    const source = createLayer("animated", "Source", "builtin-spark");
    source.events = [layerEvent("stored-event", target.id, false)];

    const inspector = render(
      <Inspector
        layer={target}
        assets={[]}
        layers={[source, target]}
        onChange={vi.fn()}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    expect(
      screen.getByText(/Nothing triggers this layer yet/),
    ).toBeInTheDocument();

    source.events[0] = { ...source.events[0], enabled: true };
    inspector.rerender(
      <Inspector
        layer={target}
        assets={[]}
        layers={[source, target]}
        onChange={vi.fn()}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );
    expect(
      screen.queryByText(/Nothing triggers this layer yet/),
    ).not.toBeInTheDocument();
  });
});
