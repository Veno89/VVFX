import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/editor/components/Inspector";
import { AssetPanel } from "../src/editor/components/AssetPanel";
import { TutorialCenter } from "../src/editor/components/LearningCenter";
import {
  DEFAULT_FRAME_ANIMATION,
  createEmptyProject,
  createLayer,
} from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import { KEYFRAME_PRESETS, keyframesFromPreset } from "../src/vfx/keyframes";
import { seededRandom } from "../src/vfx/random";
import {
  normalizeFrameAnimation,
  normalizeSpriteSheet,
  spriteFrameAtTime,
  spriteSheetFromGrid,
  spriteSheetGrid,
  suggestedSpriteSheet,
} from "../src/vfx/spriteSheet";
import { TRAIL_PRESETS, trailFromPreset } from "../src/vfx/trailPresets";
import type { VfxAsset } from "../src/vfx/types";

afterEach(cleanup);

const squareSheet: VfxAsset = {
  id: "square-sheet",
  name: "Explosion grid",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
  width: 256,
  height: 256,
  spriteSheet: { frameWidth: 64, frameHeight: 64, frameCount: 16 },
};

describe("professional flipbook setup", () => {
  it("configures and previews a selected asset before creating a layer", () => {
    const asset = { ...squareSheet, spriteSheet: null };
    const onChangeAsset = vi.fn();
    render(
      <AssetPanel
        assets={[asset]}
        selectedId={asset.id}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onRename={vi.fn()}
        onChangeAsset={onChangeAsset}
        onRemove={vi.fn()}
        onCreateLayer={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: /use as a flipbook sprite sheet/i }),
    );
    expect(onChangeAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        spriteSheet: {
          frameWidth: 64,
          frameHeight: 64,
          frameCount: 16,
        },
      }),
    );
  });

  it("suggests and derives a friendly 4 by 4 grid for a square sheet", () => {
    const suggested = suggestedSpriteSheet({
      ...squareSheet,
      spriteSheet: null,
    });
    expect(suggested).toEqual({
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 16,
    });
    expect(spriteSheetGrid(squareSheet, suggested)).toEqual({
      columns: 4,
      rows: 4,
      capacity: 16,
    });
  });

  it("converts columns and rows safely and clamps imported frame geometry", () => {
    expect(spriteSheetFromGrid(squareSheet, 8, 4)).toEqual({
      frameWidth: 32,
      frameHeight: 64,
      frameCount: 32,
    });
    expect(
      normalizeSpriteSheet(squareSheet, {
        frameWidth: 999,
        frameHeight: 999,
        frameCount: 999,
      }),
    ).toEqual({ frameWidth: 256, frameHeight: 256, frameCount: 1 });
  });

  it("keeps playback ranges inside the selected image and ordered", () => {
    expect(
      normalizeFrameAnimation(
        {
          ...DEFAULT_FRAME_ANIMATION,
          startFrame: 99,
          endFrame: 1,
          randomStartFrame: true,
        },
        16,
      ),
    ).toMatchObject({
      startFrame: 15,
      endFrame: 15,
      randomStartFrame: true,
    });
  });

  it("chooses a seeded random start frame exactly and repeatably", () => {
    const animation = {
      ...DEFAULT_FRAME_ANIMATION,
      framesPerSecond: 10,
      randomStartFrame: true,
    };
    const seed = 4821;
    const expected = Math.floor(seededRandom(seed, 73) * 16);
    expect(spriteFrameAtTime(squareSheet, animation, 0, seed)).toBe(expected);
    expect(spriteFrameAtTime(squareSheet, animation, 0, seed)).toBe(expected);
  });

  it("uses each spawned copy's stable seed without rerolling while scrubbing", () => {
    const project = createEmptyProject("Random flame starts");
    project.assets.push(squareSheet);
    const burst = createLayer("burst", "Flame burst", squareSheet.id);
    burst.spawn.count = 20;
    burst.frameAnimation.randomStartFrame = true;
    burst.timing.duration = 1000;
    project.layers.push(burst);

    const first = evaluateProject(project, 0, null);
    const second = evaluateProject(project, 0, null);
    expect(second).toEqual(first);
    expect(
      new Set(first.map((instance) => instance.frame)).size,
    ).toBeGreaterThan(1);
  });
});

describe("beginner property and trail presets", () => {
  it("builds every property preset from canonical transform moments", () => {
    const layer = createLayer("animated", "Critical splatter");
    layer.transform.startScale = 0.25;
    layer.transform.endScale = 1;
    layer.transform.startOpacity = 1;
    layer.transform.endOpacity = 0;

    expect(KEYFRAME_PRESETS.map((preset) => preset.name)).toEqual([
      "Punch / overshoot",
      "Quick pop",
      "Slow fade",
      "Pulse",
      "Fast burst, then settle",
    ]);
    for (const preset of KEYFRAME_PRESETS) {
      const settings = keyframesFromPreset(layer.transform, preset.id);
      expect(settings.enabled).toBe(true);
      expect(settings.initialized).toBe(true);
      expect(settings.frames[0].time).toBe(0);
      expect(settings.frames.at(-1)?.time).toBe(1);
    }
    expect(
      keyframesFromPreset(layer.transform, "punch").frames[1].scaleX,
    ).toBeGreaterThan(layer.transform.endScale);
    expect(
      keyframesFromPreset(layer.transform, "slow-fade").frames[1].opacity,
    ).toBe(1);
  });

  it("keeps event timing on the existing layer clock", () => {
    const source = createLayer("animated", "Bubble");
    const target = createLayer("burst", "Bubble pop");
    target.startMode = "triggered";
    const onChange = vi.fn();
    render(
      <Inspector
        layer={source}
        assets={[]}
        layers={[source, target]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    expect(
      screen.getByRole("switch", {
        name: /^Starts automatically on the Timeline/,
      }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Add layer event" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            trigger: "finish",
            action: "play",
            targetLayerId: target.id,
          }),
        ],
      }),
    );
    expect(
      screen.getByText(/same millisecond timing and property moments/i),
    ).toBeInTheDocument();
  });

  it("offers four safe presets over the existing deterministic trail model", () => {
    expect(TRAIL_PRESETS.map((preset) => preset.name)).toEqual([
      "Energy Bolt",
      "Smoke Trail",
      "Slash Trail",
      "Ghost Trail",
    ]);
    for (const preset of TRAIL_PRESETS) {
      const trail = trailFromPreset(preset.id);
      expect(trail.enabled).toBe(true);
      expect(trail.count).toBeGreaterThanOrEqual(1);
      expect(trail.count).toBeLessThanOrEqual(16);
      expect(trail.spacing).toBeGreaterThanOrEqual(10);
    }
  });

  it("surfaces flipbook, property, and trail presets in the Inspector", () => {
    const layer = createLayer("animated", "Animated explosion", squareSheet.id);
    const onChange = vi.fn();
    render(
      <Inspector
        layer={layer}
        assets={[squareSheet]}
        layers={[layer]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    expect(screen.getByLabelText("Flipbook preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Columns")).toHaveValue(4);
    expect(screen.getByLabelText("Rows")).toHaveValue(4);
    expect(
      screen.getByRole("switch", { name: /^Random starting frame/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Punch \/ overshoot/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        keyframes: expect.objectContaining({ enabled: true }),
      }),
    );

    fireEvent.click(
      screen.getByTitle("A bright, close trail for fast magic projectiles."),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        trail: expect.objectContaining({ enabled: true, count: 9 }),
      }),
    );
  });

  it("offers natural wander without removing the original repeating sway", () => {
    const layer = createLayer("animated", "Magic wisp");
    layer.behavior.wobble.enabled = true;
    const onChange = vi.fn();
    const view = render(
      <Inspector
        layer={layer}
        assets={[]}
        layers={[layer]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    expect(
      view.getByRole("switch", { name: /^Organic movement/ }),
    ).toBeChecked();
    const styleLabel = view.getByText(/^Movement style/, {
      selector: ".field__label",
    });
    const style = styleLabel.closest("label")?.querySelector("select");
    expect(style).not.toBeNull();
    expect(style).toHaveValue("organic");
    expect(
      [...(style?.options ?? [])].map((option) => option.textContent),
    ).toEqual(["Natural wander", "Repeating sway"]);
    expect(view.getByLabelText("Smoothness")).toHaveValue(70);

    fireEvent.change(style!, { target: { value: "sway" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: expect.objectContaining({
          wobble: expect.objectContaining({ style: "sway" }),
        }),
      }),
    );
  });
});

describe("Tier 2 Inspector controls", () => {
  it("authors silhouette placement and bounded copy-finish events in the existing sections", () => {
    const source = createLayer("burst", "Embers", "builtin-spark");
    const target = createLayer("animated", "Smoke pop", "builtin-cloud");
    target.startMode = "triggered";
    const silhouette: VfxAsset = {
      id: "prepared-silhouette",
      name: "Rune silhouette",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,prepared",
      alphaMask: { columns: 2, rows: 1, alpha: [255, 0] },
      spriteSheet: null,
    };
    const onChange = vi.fn();
    render(
      <Inspector
        layer={source}
        assets={[silhouette]}
        layers={[source, target]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    const shapeLabel = screen.getByText(/^Where copies appear/, {
      selector: ".field__label",
    });
    const shape = shapeLabel.closest("label")?.querySelector("select");
    fireEvent.change(shape!, { target: { value: "mask" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spawn: expect.objectContaining({
          shape: "mask",
          distribution: "random",
          maskAssetId: silhouette.id,
        }),
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add copy-finish event" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            trigger: "copy-finish",
            action: "play",
            targetLayerId: target.id,
            chance: 1,
            maxTriggers: 32,
          }),
        ],
      }),
    );
  });

  it("offers structured line/arc placement, artwork-forward alignment, and lifetime envelopes", () => {
    const layer = createLayer("burst", "Arc sparks", "builtin-spark");
    layer.spawn.shape = "line";
    layer.spawn.distribution = "even";
    layer.spawn.rotateToDirection = true;
    layer.behavior.pulse.enabled = true;
    const onChange = vi.fn();
    render(
      <Inspector
        layer={layer}
        assets={[]}
        layers={[layer]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    const shapeLabel = screen.getByText(/^Where copies appear/, {
      selector: ".field__label",
    });
    const shape = shapeLabel.closest("label")?.querySelector("select");
    expect(shape).not.toBeNull();
    expect(shape).toHaveValue("line");
    expect(
      [...(shape?.querySelectorAll("option") ?? [])].map(
        (option) => option.textContent,
      ),
    ).toEqual([
      "At one point",
      "Inside a box",
      "Inside a circle",
      "Along a line",
      "Along an arc",
      "Inside an image silhouette",
    ]);
    expect(screen.getByLabelText("Line length")).toHaveValue(120);
    expect(screen.getByLabelText("Artwork points toward")).toHaveValue(0);
    expect(screen.getByLabelText("Alignment variation")).toHaveValue(0);

    const pulseTimingLabel = screen.getByText(/^Pulse timing/, {
      selector: ".field__label",
    });
    const pulseTiming = pulseTimingLabel
      .closest("label")
      ?.querySelector("select");
    expect(pulseTiming).not.toBeNull();
    expect(pulseTiming).toHaveValue("entire");
    fireEvent.change(pulseTiming!, { target: { value: "middle" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: expect.objectContaining({
          pulse: expect.objectContaining({
            envelope: expect.objectContaining({
              enabled: true,
              start: 0.12,
              end: 0.9,
            }),
          }),
        }),
      }),
    );
  });
});

describe("Experimental rendering controls", () => {
  it("marks WebGL effects as experimental and exposes resettable controls", () => {
    const layer = createLayer("animated", "Neon bolt", "builtin-spark");
    layer.appearance.effects.outerGlow.enabled = true;
    layer.appearance.effects.blur.enabled = true;
    layer.appearance.effects.brightnessExposure.enabled = true;
    layer.appearance.effects.animatedShine.enabled = true;
    layer.appearance.effects.spatialGradient.enabled = true;
    layer.appearance.effects.directionalDissolve.enabled = true;
    layer.appearance.effects.directionalDissolve.pattern = "noise";
    layer.appearance.effects.directionalDissolve.noiseScale = 9;
    layer.appearance.effects.directionalDissolve.start = 0.4;
    layer.appearance.effects.spriteWarp.enabled = true;
    layer.appearance.effects.visualMask = {
      ...layer.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: "builtin-ring",
      fit: "contain",
      strength: 0.6,
    };
    const assets = [...createEmptyProject().assets, squareSheet];
    const onChange = vi.fn();

    const { rerender } = render(
      <Inspector
        layer={layer}
        assets={assets}
        layers={[layer]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    expect(screen.getAllByText("Experimental").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Canvas · plain-image fallback/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /^Soft outer glow/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: /^Clip with another image/ }),
    ).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Mask image" })).toHaveValue(
      "builtin-ring",
    );
    expect(
      within(screen.getByRole("combobox", { name: "Mask image" })).queryByRole(
        "option",
        { name: "Explosion grid" },
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Read mask from" }),
    ).toHaveValue("alpha");
    expect(screen.getByRole("combobox", { name: "Fit mask" })).toHaveValue(
      "contain",
    );
    expect(screen.getByLabelText("Mask strength")).toHaveValue(60);
    expect(screen.getByText(/ordinary unmasked sprite/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Outer strength")).toHaveValue(3);
    expect(screen.getByLabelText("Brightness")).toHaveValue(100);
    expect(
      screen.getByRole("switch", { name: /^Dissolve \/ erase/ }),
    ).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Erase pattern" })).toHaveValue(
      "noise",
    );
    expect(screen.getByLabelText("Erase starts")).toHaveValue(40);
    expect(screen.getByLabelText("Pattern size")).toHaveValue(9);
    expect(
      screen.queryByRole("combobox", { name: "Wipe direction" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /^Invert erosion pattern/ }),
    ).not.toBeChecked();
    expect(screen.getByText(/ordinary, un-eroded sprite/i)).toBeInTheDocument();
    expect(
      screen.getByText(/one GPU pass per visible copy/i),
    ).toBeInTheDocument();
    const warpStyleLabel = screen.getByText(/^Warp style/, {
      selector: ".field__label",
    });
    expect(
      warpStyleLabel.closest("label")?.querySelector("select"),
    ).toHaveValue("heat-shimmer");
    expect(screen.getByText(/does not bend or refract/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Read mask from" }), {
      target: { value: "luminance" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          effects: expect.objectContaining({
            visualMask: expect.objectContaining({ channel: "luminance" }),
          }),
        }),
      }),
    );

    fireEvent.change(screen.getByLabelText("Outer strength"), {
      target: { value: "6" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          effects: expect.objectContaining({
            outerGlow: expect.objectContaining({
              enabled: true,
              outerStrength: 6,
            }),
          }),
        }),
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reset Pattern size to default" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          effects: expect.objectContaining({
            directionalDissolve: expect.objectContaining({
              pattern: "noise",
              noiseScale: 6,
            }),
          }),
        }),
      }),
    );

    layer.appearance.effects.directionalDissolve.pattern = "directional";
    rerender(
      <Inspector
        layer={layer}
        assets={assets}
        layers={[layer]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Wipe direction" }),
    ).toHaveValue("horizontal");
    expect(screen.queryByLabelText("Pattern size")).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /^Reverse wipe/ }),
    ).not.toBeChecked();
  });

  it("teaches noisy erosion boundaries in the accessible Experimental lab", () => {
    render(
      <TutorialCenter
        onClose={vi.fn()}
        onStartTour={vi.fn()}
        onStartFirstEffect={vi.fn()}
      />,
    );

    const experimentalTab = screen.getByRole("tab", {
      name: /Experimental lab/i,
    });
    fireEvent.click(experimentalTab);

    expect(experimentalTab).toHaveAttribute("aria-selected", "true");
    const toolList = screen.getByRole("list", {
      name: "Experimental rendering tools",
    });
    expect(within(toolList).getByText("Noisy erosion")).toBeInTheDocument();
    expect(within(toolList).getByText("Straight wipe")).toBeInTheDocument();
    expect(
      within(toolList).getByText("Clip with another image"),
    ).toBeInTheDocument();
    expect(
      within(toolList).getByText("Try: Masked energy ring"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ordinary, unmasked and un-eroded sprite visible/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not visually mask a sprite/i),
    ).toBeInTheDocument();
  });
});
