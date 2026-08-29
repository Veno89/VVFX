import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerPanel } from "../src/editor/components/LayerPanel";
import { useHistoryState } from "../src/editor/useHistoryState";
import {
  createLayer,
  DEFAULT_BEAM,
  DEFAULT_KEYFRAMES,
  DEFAULT_MOTION_PATH,
  DEFAULT_SPAWN,
} from "../src/vfx/defaults";
import {
  convertLayerType,
  convertLayerTypes,
} from "../src/vfx/layerConversion";
import { createRenderingEffectClip } from "../src/vfx/renderingEffects";
import type { LayerType, VfxAsset, VfxLayer } from "../src/vfx/types";

afterEach(cleanup);

const boltAsset: VfxAsset = {
  id: "bolt-art",
  name: "Bolt art",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,AA==",
  width: 256,
  height: 64,
  spriteSheet: { frameWidth: 128, frameHeight: 64, frameCount: 2 },
};

function authoredAnimatedLayer(): VfxLayer {
  const layer = createLayer("animated", "Bolt art", boltAsset.id);
  layer.visible = false;
  layer.enabled = false;
  layer.solo = true;
  layer.startMode = "triggered";
  layer.parentId = "parent-layer";
  layer.groupId = "lightning-group";
  layer.events = [
    {
      id: "finish-event",
      enabled: true,
      trigger: "finish",
      percentage: 0.5,
      action: "play",
      targetLayerId: "glow-layer",
      chance: 0.75,
      maxTriggers: 5,
    },
  ];
  layer.transform = {
    ...layer.transform,
    x: 100,
    y: 50,
    startScale: 2,
    endScale: 1.25,
    startOpacity: 0.8,
    endOpacity: 0.2,
    rotation: 90,
    rotationDuring: 180,
    movementX: 40,
    movementY: -20,
  };
  layer.timing = {
    ...layer.timing,
    delay: 70,
    duration: 420,
    repeat: 2,
  };
  layer.appearance = {
    ...layer.appearance,
    tint: "#7de8ff",
    blendMode: "add",
    effectClips: [createRenderingEffectClip("outerGlow", "bolt-glow")],
  };
  layer.appearance.effects.outerGlow.enabled = true;
  layer.behavior.flicker.enabled = true;
  layer.random.opacity = 0.15;
  layer.frameAnimation = {
    ...layer.frameAnimation,
    framesPerSecond: 24,
    endFrame: 1,
    loop: false,
  };
  layer.trail = { ...layer.trail, enabled: true, count: 3 };
  layer.motionPath = {
    ...layer.motionPath,
    enabled: true,
    controlX: 90,
    controlY: -45,
  };
  layer.keyframes = {
    enabled: true,
    initialized: true,
    frames: [
      { time: 0, scaleX: 2, scaleY: 1, opacity: 0.8, rotation: 90 },
      { time: 1, scaleX: 1, scaleY: 1, opacity: 0.2, rotation: 270 },
    ],
  };
  return layer;
}

describe("layer type conversion", () => {
  it("converts authored sprite geometry to Beam endpoints and preserves compatible settings", () => {
    const source = authoredAnimatedLayer();
    const original = structuredClone(source);
    const converted = convertLayerType(source, "beam", boltAsset);

    expect(converted.type).toBe("beam");
    if (converted.type !== "beam") throw new Error("Expected Beam layer");

    expect(converted).toMatchObject({
      id: original.id,
      name: original.name,
      assetId: original.assetId,
      visible: original.visible,
      enabled: original.enabled,
      solo: original.solo,
      startMode: original.startMode,
      parentId: original.parentId,
      groupId: original.groupId,
      spawn: null,
    });
    expect(converted.events).toEqual(original.events);
    expect(converted.timing).toEqual(original.timing);
    expect(converted.appearance).toEqual(original.appearance);
    expect(converted.behavior).toEqual(original.behavior);
    expect(converted.random).toEqual(original.random);
    expect(converted.frameAnimation).toEqual(original.frameAnimation);
    expect(converted.trail).toEqual(original.trail);

    // The 128 px frame at 2x scale becomes a 256 px vertical endpoint vector.
    expect(converted.beam.endX).toBeCloseTo(0, 8);
    expect(converted.beam.endY).toBeCloseTo(256, 8);
    expect(converted.transform.x).toBeCloseTo(100, 8);
    expect(converted.transform.y).toBeCloseTo(-78, 8);
    expect(converted.transform.startOpacity).toBe(0.8);
    expect(converted.transform.endOpacity).toBe(0.2);
    expect(converted.transform.startScale).toBe(2);
    expect(converted.transform.endScale).toBe(1.25);

    // Endpoint fitting owns these controls, so target canonicalization removes
    // the incompatible authored state immediately rather than hiding it.
    expect(converted.transform).toMatchObject({
      separateScale: false,
      rotation: 0,
      rotationDuring: 0,
      movementX: 0,
      movementY: 0,
    });
    expect(converted.motionPath).toEqual(DEFAULT_MOTION_PATH);
    expect(converted.keyframes).toEqual(DEFAULT_KEYFRAMES);
    expect(source).toEqual(original);
  });

  it("uses stable defaults and carries spawn settings only between spawn layer types", () => {
    const animated = createLayer("animated", "Fallback beam");
    const beam = convertLayerType(animated, "beam");
    expect(beam.type).toBe("beam");
    expect(beam.beam).toEqual(DEFAULT_BEAM);
    expect(beam.spawn).toBeNull();

    const burst = createLayer("burst", "Authored burst");
    burst.spawn = {
      ...burst.spawn,
      count: 37,
      shape: "circle",
      radius: 88,
    };
    const emitter = convertLayerType(burst, "emitter");
    expect(emitter.type).toBe("emitter");
    expect(emitter.beam).toBeNull();
    expect(emitter.spawn).toEqual({ ...burst.spawn, count: 25 });
    expect(emitter.spawn).not.toBe(burst.spawn);

    const still = convertLayerType(emitter, "static");
    expect(still.type).toBe("static");
    expect(still.spawn).toBeNull();
    expect(still.beam).toBeNull();

    const freshBurst = convertLayerType(still, "burst");
    expect(freshBurst.type).toBe("burst");
    expect(freshBurst.spawn).toEqual(DEFAULT_SPAWN);
    expect(freshBurst.beam).toBeNull();
    expect(convertLayerType(freshBurst, "burst")).toBe(freshBurst);
  });

  it("converts a mixed batch in place while excluding locked, missing, and no-op layers", () => {
    const animated = authoredAnimatedLayer();
    const beam = createLayer("beam", "Already beam", boltAsset.id);
    const locked = createLayer("burst", "Locked burst", boltAsset.id);
    const layers = [animated, beam, locked];
    const original = structuredClone(layers);

    const result = convertLayerTypes(
      layers,
      [boltAsset],
      [animated.id, beam.id, locked.id, "missing-layer", animated.id],
      "beam",
      [locked.id],
    );

    expect(result).toMatchObject({ converted: 1, skipped: 3 });
    expect(result.layers.map((layer) => layer.id)).toEqual(
      layers.map((layer) => layer.id),
    );
    expect(result.layers[0].type).toBe("beam");
    expect(result.layers[1]).toBe(beam);
    expect(result.layers[2]).toBe(locked);
    expect(layers).toEqual(original);
  });
});

interface ConversionHistoryState {
  assets: VfxAsset[];
  layers: VfxLayer[];
}

function ConversionHistoryHarness() {
  const initial = useMemo<ConversionHistoryState>(
    () => ({ assets: [boltAsset], layers: [authoredAnimatedLayer()] }),
    [],
  );
  const history = useHistoryState(initial);
  const layer = history.value.layers[0];

  const convert = (id: string, type: LayerType) =>
    history.set((current) => ({
      ...current,
      layers: current.layers.map((candidate) =>
        candidate.id === id
          ? convertLayerType(
              candidate,
              type,
              current.assets.find((asset) => asset.id === candidate.assetId),
            )
          : candidate,
      ),
    }));

  return (
    <>
      <LayerPanel
        layers={history.value.layers}
        groups={[]}
        selectedId={layer.id}
        selectedGroupId={null}
        onSelect={() => undefined}
        onSelectGroup={() => undefined}
        onCreateGroup={() => undefined}
        onAdd={() => undefined}
        onAddPreset={() => undefined}
        onUpdate={() => undefined}
        onConvert={convert}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onReorder={() => undefined}
      />
      <output data-testid="layer-state">{JSON.stringify(layer)}</output>
      <button type="button" onClick={history.undo} disabled={!history.canUndo}>
        Undo conversion
      </button>
      <button type="button" onClick={history.redo} disabled={!history.canRedo}>
        Redo conversion
      </button>
    </>
  );
}

function BulkConversionHistoryHarness() {
  const initial = useMemo<ConversionHistoryState>(() => {
    const animated = authoredAnimatedLayer();
    animated.name = "Animated source";
    const beam = createLayer("beam", "Already beam", boltAsset.id);
    const locked = createLayer("burst", "Locked burst", boltAsset.id);
    return { assets: [boltAsset], layers: [animated, beam, locked] };
  }, []);
  const history = useHistoryState(initial);
  const lockedId = initial.layers[2].id;
  const selectedId = initial.layers[0].id;

  const bulkConvert = (ids: string[], type: LayerType) => {
    const preview = convertLayerTypes(
      history.value.layers,
      history.value.assets,
      ids,
      type,
      [lockedId],
    );
    if (preview.converted > 0)
      history.set((current) => ({
        ...current,
        layers: convertLayerTypes(current.layers, current.assets, ids, type, [
          lockedId,
        ]).layers,
      }));
    return { converted: preview.converted, skipped: preview.skipped };
  };

  return (
    <>
      <LayerPanel
        layers={history.value.layers}
        groups={[]}
        selectedId={selectedId}
        selectedGroupId={null}
        onSelect={() => undefined}
        onSelectGroup={() => undefined}
        onCreateGroup={() => undefined}
        onAdd={() => undefined}
        onAddPreset={() => undefined}
        onUpdate={() => undefined}
        onConvert={() => undefined}
        onBulkConvert={bulkConvert}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onReorder={() => undefined}
        lockedLayerIds={[lockedId]}
      />
      <output data-testid="bulk-layer-state">
        {JSON.stringify(history.value.layers)}
      </output>
      <button type="button" onClick={history.undo} disabled={!history.canUndo}>
        Undo batch
      </button>
      <button type="button" onClick={history.redo} disabled={!history.canRedo}>
        Redo batch
      </button>
    </>
  );
}

describe("layer conversion UI and history", () => {
  it("offers one compact type picker and restores the exact layer with Undo and Redo", () => {
    render(<ConversionHistoryHarness />);
    const initialState = screen.getByTestId("layer-state").textContent;

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Bolt art" }),
    );
    const picker = screen.getByRole("combobox", {
      name: "Change type for Bolt art",
    }) as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.text)).toEqual([
      "Animated image (current)",
      "Convert to Beam",
      "Convert to Still image",
      "Convert to Burst",
      "Convert to Repeating copies",
    ]);
    expect(screen.getByText(/Keeps compatible settings/)).toHaveTextContent(
      /Beam endpoints replace path, angle, movement, and X\/Y scale.*Undo restores/i,
    );
    picker.focus();
    expect(fireEvent.keyDown(picker, { key: "ArrowDown" })).toBe(true);
    expect(picker).toHaveFocus();

    fireEvent.change(picker, { target: { value: "beam" } });
    const beamState = screen.getByTestId("layer-state").textContent;
    expect(beamState).not.toBe(initialState);
    expect(JSON.parse(beamState ?? "{}")).toMatchObject({ type: "beam" });
    expect(screen.queryByRole("menu", { name: "Actions for Bolt art" })).toBe(
      null,
    );
    expect(
      screen.getByText(/^Bolt art converted to Beam/, {
        selector: ".visually-hidden",
      }),
    ).toHaveTextContent(/converted to Beam.*Undo restores the previous type/i);

    fireEvent.click(screen.getByRole("button", { name: "Undo conversion" }));
    expect(screen.getByTestId("layer-state")).toHaveTextContent(
      initialState ?? "",
    );
    fireEvent.click(screen.getByRole("button", { name: "Redo conversion" }));
    expect(screen.getByTestId("layer-state")).toHaveTextContent(
      beamState ?? "",
    );
  });

  it("keeps bulk controls hidden until requested and excludes locked layers", () => {
    const first = createLayer("animated", "First bolt", boltAsset.id);
    const second = createLayer("burst", "Second bolt", boltAsset.id);
    const locked = createLayer("animated", "Locked bolt", boltAsset.id);
    const onSelect = vi.fn();
    const onBulkConvert = vi.fn((ids: string[], type: LayerType) => ({
      converted: ids.filter(
        (id) => [first, second].find((layer) => layer.id === id)?.type !== type,
      ).length,
      skipped: ids.filter(
        (id) => [first, second].find((layer) => layer.id === id)?.type === type,
      ).length,
    }));

    render(
      <LayerPanel
        layers={[first, second, locked]}
        groups={[]}
        selectedId={first.id}
        selectedGroupId={null}
        onSelect={onSelect}
        onSelectGroup={() => undefined}
        onCreateGroup={() => undefined}
        onAdd={() => undefined}
        onAddPreset={() => undefined}
        onUpdate={() => undefined}
        onConvert={() => undefined}
        onBulkConvert={onBulkConvert}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onReorder={() => undefined}
        lockedLayerIds={[locked.id]}
      />,
    );

    expect(screen.queryByRole("group", { name: "Bulk layers" })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const selectMode = screen.getByRole("button", { name: "Select layers" });
    expect(selectMode).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(selectMode);

    expect(screen.getByRole("group", { name: "Bulk layers" })).toBeVisible();
    const firstCheck = screen.getByRole("checkbox", {
      name: "Select First bolt for bulk changes",
    });
    const secondCheck = screen.getByRole("checkbox", {
      name: "Select Second bolt for bulk changes",
    });
    const lockedCheck = screen.getByRole("checkbox", {
      name: "Select Locked bolt for bulk changes",
    });
    expect(lockedCheck).toBeDisabled();
    expect(firstCheck.closest(".layer-row")).toHaveAttribute(
      "draggable",
      "false",
    );

    fireEvent.click(firstCheck);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Change type for selected layers",
      }),
      { target: { value: "beam" } },
    );
    expect(onBulkConvert).toHaveBeenLastCalledWith([first.id], "beam");

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(firstCheck).toBeChecked();
    expect(secondCheck).toBeChecked();
    expect(lockedCheck).not.toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(firstCheck).not.toBeChecked();
    expect(secondCheck).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: "Exit layer selection" }),
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Bulk layers" })).toBeNull();
  });

  it("converts a mixed Select all batch in one exact Undo and Redo entry", () => {
    render(<BulkConversionHistoryHarness />);
    const initialState = screen.getByTestId("bulk-layer-state").textContent;
    const initialLayers = JSON.parse(initialState ?? "[]") as VfxLayer[];

    fireEvent.click(screen.getByRole("button", { name: "Select layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Change type for selected layers",
      }),
      { target: { value: "beam" } },
    );

    const convertedState = screen.getByTestId("bulk-layer-state").textContent;
    const convertedLayers = JSON.parse(convertedState ?? "[]") as VfxLayer[];
    expect(convertedLayers.map((layer) => layer.id)).toEqual(
      initialLayers.map((layer) => layer.id),
    );
    expect(convertedLayers.map((layer) => layer.type)).toEqual([
      "beam",
      "beam",
      "burst",
    ]);
    expect(
      screen.getByText(/^1 layer converted to Beam/, {
        selector: ".visually-hidden",
      }),
    ).toHaveTextContent(/1 skipped.*Undo restores the batch/i);

    const undo = screen.getByRole("button", { name: "Undo batch" });
    fireEvent.click(undo);
    expect(screen.getByTestId("bulk-layer-state")).toHaveTextContent(
      initialState ?? "",
    );
    expect(undo).toBeDisabled();
    const redo = screen.getByRole("button", { name: "Redo batch" });
    fireEvent.click(redo);
    expect(screen.getByTestId("bulk-layer-state")).toHaveTextContent(
      convertedState ?? "",
    );
  });
});
