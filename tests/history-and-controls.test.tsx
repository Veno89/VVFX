import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetPanel } from "../src/editor/components/AssetPanel";
import {
  RangeField,
  SelectField,
  TextField,
  Toggle,
} from "../src/editor/components/Controls";
import { ExportDialog } from "../src/editor/components/ExportDialog";
import { GroupInspector } from "../src/editor/components/GroupInspector";
import { LayerPanel } from "../src/editor/components/LayerPanel";
import { Inspector } from "../src/editor/components/Inspector";
import { OnboardingOverlay } from "../src/editor/components/LearningCenter";
import {
  RecoveryDialog,
  SaveAsDialog,
} from "../src/editor/components/ProjectSafetyDialogs";
import { ProjectsDialog } from "../src/editor/components/ProjectsDialog";
import { TemplateLibraryDialog } from "../src/editor/components/TemplateLibraryDialog";
import { TopBar } from "../src/editor/components/TopBar";
import {
  Timeline,
  effectClipTimingAfterTimelineDrag,
  groupDelayAfterTimelineDrag,
  keyframeTimeAfterTimelineDrag,
  timingAfterTimelineDrag,
} from "../src/editor/components/Timeline";
import { useHistoryState } from "../src/editor/useHistoryState";
import { createRenderingEffectClip } from "../src/vfx/renderingEffects";
import { validPngDataUrl } from "./fixtures/portableImages";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import { createTemplateFromProject } from "../src/vfx/templates";
import {
  layerPositionAfterPreviewDrag,
  pathPointAfterPreviewDrag,
} from "../src/preview/dragPosition";

afterEach(cleanup);

describe("undo and redo", () => {
  it("moves safely through editor history", () => {
    const { result } = renderHook(() => useHistoryState({ value: 1 }));
    act(() => result.current.set({ value: 2 }));
    expect(result.current.value.value).toBe(2);
    act(() => result.current.undo());
    expect(result.current.value.value).toBe(1);
    act(() => result.current.redo());
    expect(result.current.value.value).toBe(2);
  });

  it("keeps preview-only changes out of authoring history", () => {
    const { result } = renderHook(() =>
      useHistoryState({ effectX: 0, zoom: 1 }),
    );
    act(() => result.current.set({ effectX: 40, zoom: 1 }));
    act(() =>
      result.current.setTransient((current) => ({ ...current, zoom: 2 })),
    );

    act(() => result.current.undo());
    expect(result.current.value).toEqual({ effectX: 0, zoom: 2 });
    act(() => result.current.redo());
    expect(result.current.value).toEqual({ effectX: 40, zoom: 2 });
  });

  it("coalesces one interaction into a single undoable change", () => {
    const { result } = renderHook(() => useHistoryState(0));

    act(() => {
      result.current.beginInteraction();
      result.current.setCoalesced(1);
      result.current.setCoalesced(2);
      result.current.setCoalesced(3);
      result.current.endInteraction();
    });

    expect(result.current.value).toBe(3);
    act(() => result.current.undo());
    expect(result.current.value).toBe(0);
    act(() => result.current.redo());
    expect(result.current.value).toBe(3);
  });

  it("keeps separate interactions and discrete changes as separate undo steps", () => {
    const { result } = renderHook(() => useHistoryState(0));

    act(() => {
      result.current.beginInteraction();
      result.current.setCoalesced(1);
      result.current.setCoalesced(2);
      result.current.endInteraction();
      result.current.beginInteraction();
      result.current.setCoalesced(3);
      result.current.endInteraction();
      result.current.set(4);
    });

    act(() => result.current.undo());
    expect(result.current.value).toBe(3);
    act(() => result.current.undo());
    expect(result.current.value).toBe(2);
    act(() => result.current.undo());
    expect(result.current.value).toBe(0);
  });

  it("starts a fresh interaction even when an unmounted field never blurred", () => {
    const { result } = renderHook(() => useHistoryState(0));

    act(() => {
      result.current.beginInteraction();
      result.current.setCoalesced(1);
      // Removing a focused input does not reliably dispatch blur. The next
      // real focus event must replace the stale token rather than reuse it.
      result.current.beginInteraction();
      result.current.setCoalesced(2);
    });

    act(() => result.current.undo());
    expect(result.current.value).toBe(1);
    act(() => result.current.undo());
    expect(result.current.value).toBe(0);
  });

  it("ends an active interaction when history navigation or replacement occurs", () => {
    const { result } = renderHook(() => useHistoryState(0));

    act(() => {
      result.current.beginInteraction();
      result.current.setCoalesced(1);
      result.current.setCoalesced(2);
      result.current.undo();
      result.current.set(3);
      result.current.set(4);
    });
    act(() => result.current.undo());
    expect(result.current.value).toBe(3);

    act(() => {
      result.current.beginInteraction();
      result.current.setCoalesced(5);
      result.current.replace(10);
      result.current.set(11);
      result.current.set(12);
    });
    act(() => result.current.undo());
    expect(result.current.value).toBe(11);

    act(() => {
      result.current.set(20);
      result.current.undo();
      result.current.beginInteraction();
      result.current.redo();
      result.current.setCoalesced(21);
      result.current.setCoalesced(22);
    });
    act(() => result.current.undo());
    expect(result.current.value).toBe(21);
  });

  it("restores falsey past and future values", () => {
    const { result } = renderHook(() => useHistoryState<number | false>(0));

    act(() => result.current.set(1));
    act(() => result.current.undo());
    expect(result.current.value).toBe(0);
    act(() => result.current.redo());
    expect(result.current.value).toBe(1);

    act(() => result.current.set(false));
    act(() => result.current.undo());
    expect(result.current.value).toBe(1);
    act(() => result.current.redo());
    expect(result.current.value).toBe(false);
  });

  it("never folds an unrelated discrete mutation into an active interaction", () => {
    const { result } = renderHook(() =>
      useHistoryState({ name: "Initial", assets: 0 }),
    );

    act(() => {
      result.current.beginInteraction();
      result.current.setCoalesced({ name: "Chain", assets: 0 });
      result.current.setCoalesced({ name: "Chain lightning", assets: 0 });
      result.current.set((current) => ({ ...current, assets: 1 }));
      result.current.setCoalesced({ name: "Chain lightning final", assets: 1 });
      result.current.endInteraction();
    });

    act(() => result.current.undo());
    expect(result.current.value).toEqual({
      name: "Chain lightning",
      assets: 1,
    });
    act(() => result.current.undo());
    expect(result.current.value).toEqual({
      name: "Chain lightning",
      assets: 0,
    });
  });
});

describe("beginner-friendly controls", () => {
  it("keeps help buttons outside explicit field and switch labels", () => {
    const onToggle = vi.fn();
    render(
      <>
        <SelectField
          label="Blend mode"
          value="normal"
          help="Controls how colors combine."
          onChange={vi.fn()}
        >
          <option value="normal">Normal</option>
        </SelectField>
        <TextField
          label="Layer name"
          value="Lightning"
          help="Names this layer."
          onChange={vi.fn()}
        />
        <Toggle
          label="Loop copies"
          checked={false}
          help="Repeats the copies."
          onChange={onToggle}
        />
      </>,
    );

    const select = screen.getByRole("combobox", { name: "Blend mode" });
    const selectLabel = screen.getByText("Blend mode").closest("label");
    expect(selectLabel).not.toBeNull();
    expect((selectLabel as HTMLLabelElement).control).toBe(select);

    const text = screen.getByRole("textbox", { name: "Layer name" });
    const textLabel = screen.getByText("Layer name").closest("label");
    expect((textLabel as HTMLLabelElement).control).toBe(text);

    const toggle = screen.getByRole("switch", { name: "Loop copies" });
    const toggleLabel = screen.getByText("Loop copies").closest("label");
    expect((toggleLabel as HTMLLabelElement).control).toBe(toggle);
    expect(toggle).toHaveAccessibleName("Loop copies");
    fireEvent.click(toggleLabel as HTMLLabelElement);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("moves preview layers by pointer delta without double-counting offsets", () => {
    expect(
      layerPositionAfterPreviewDrag({
        layerX: 30,
        layerY: -20,
        startPreviewX: 460,
        startPreviewY: 210,
        endPreviewX: 540,
        endPreviewY: 250,
        zoom: 2,
      }),
    ).toEqual({ x: 70, y: 0 });
  });

  it("keeps the original position when preview drop coordinates are invalid", () => {
    expect(
      layerPositionAfterPreviewDrag({
        layerX: 30,
        layerY: -20,
        startPreviewX: 460,
        startPreviewY: 210,
        endPreviewX: Number.NaN,
        endPreviewY: Number.NaN,
        zoom: 1,
      }),
    ).toEqual({ x: 30, y: -20 });
  });

  it("converts draggable path handles into local waypoint coordinates", () => {
    expect(
      pathPointAfterPreviewDrag({
        layerX: 30,
        layerY: -20,
        previewCenterX: 400,
        previewCenterY: 250,
        endPreviewX: 560,
        endPreviewY: 330,
        zoom: 2,
      }),
    ).toEqual({ x: 50, y: 60 });
  });

  it("pairs a slider with a precise number field and visible unit", () => {
    const onChange = vi.fn();
    render(
      <RangeField
        label="How long it lasts"
        value={700}
        min={50}
        max={2000}
        unit="ms"
        help="Lower is faster."
        defaultValue={450}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("ms")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Help for How long it lasts" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("How long it lasts"), {
      target: { value: "800" },
    });
    expect(onChange).toHaveBeenCalledWith(800);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset How long it lasts to default",
      }),
    );
    expect(onChange).toHaveBeenCalledWith(450);
  });

  it("turns a dropped local file into an upload action instead of a file navigation", () => {
    const onError = vi.fn();
    render(
      <AssetPanel
        assets={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onRename={vi.fn()}
        onChangeAsset={vi.fn()}
        onRemove={vi.fn()}
        onCreateLayer={vi.fn()}
        onError={onError}
      />,
    );
    const zone = screen.getByRole("button", { name: /bring in your images/i });
    const file = new File(["not an image"], "photo.jpg", {
      type: "image/jpeg",
    });
    fireEvent.drop(zone, {
      dataTransfer: { files: [file], types: ["Files"] },
    });
    expect(onError).toHaveBeenCalledWith(
      "Vvfx can currently import PNG and WebP images.",
    );
  });

  it("renames a layer directly in the layer list", () => {
    const layer = createLayer("animated", "Old name");
    const onUpdate = vi.fn();
    render(
      <LayerPanel
        layers={[layer]}
        groups={[]}
        selectedId={layer.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onCreateGroup={vi.fn()}
        onAdd={vi.fn()}
        onAddPreset={vi.fn()}
        onUpdate={onUpdate}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    expect(
      screen.getByTitle("Select layer · double-click to rename"),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.doubleClick(
      screen.getByTitle("Select layer · double-click to rename"),
    );
    const input = screen.getByLabelText("Rename Old name");
    fireEvent.change(input, { target: { value: "Shockwave ring" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledWith(layer.id, {
      name: "Shockwave ring",
    });
  });

  it("shows frontmost layers first and maps drag/drop back to model indices", () => {
    const back = createLayer("animated", "Back layer");
    const middle = createLayer("animated", "Middle layer");
    const front = createLayer("animated", "Front layer");
    const onReorder = vi.fn();
    const view = render(
      <LayerPanel
        layers={[back, middle, front]}
        groups={[]}
        selectedId={front.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onCreateGroup={vi.fn()}
        onAdd={vi.fn()}
        onAddPreset={vi.fn()}
        onUpdate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );

    expect(
      Array.from(
        view.container.querySelectorAll<HTMLElement>(
          ".layer-name-button strong",
        ),
      ).map((name) => name.textContent),
    ).toEqual(["Front layer", "Middle layer", "Back layer"]);

    const rows = Array.from(
      view.container.querySelectorAll<HTMLElement>(".layer-row"),
    );
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(rows[2]);
    expect(onReorder).toHaveBeenCalledWith(2, 0);
  });

  it("preserves folders, search, and locks in the front-to-back projection", () => {
    const back = createLayer("animated", "Back layer");
    const omitted = createLayer("animated", "Omitted layer");
    const front = createLayer("animated", "Front layer");
    const view = render(
      <LayerPanel
        layers={[back, omitted, front]}
        groups={[]}
        selectedId={front.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onCreateGroup={vi.fn()}
        onAdd={vi.fn()}
        onAddPreset={vi.fn()}
        onUpdate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
        search="stacked"
        lockedLayerIds={[front.id]}
        folders={[
          {
            id: "stacked-folder",
            name: "Stacked effects",
            layerIds: [back.id, front.id],
            collapsed: false,
          },
        ]}
        onUpdateFolder={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );

    expect(
      Array.from(
        view.container.querySelectorAll<HTMLElement>(
          ".layer-name-button strong",
        ),
      ).map((name) => name.textContent),
    ).toEqual(["Front layer", "Back layer"]);
    expect(
      screen.getByRole("button", { name: "Collapse Stacked effects" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: /^Front layer/i })
        .closest(".layer-row"),
    ).toHaveAttribute("draggable", "false");

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Front layer" }),
    );
    const menu = screen.getByRole("menu", { name: "Actions for Front layer" });
    for (const command of [
      "Bring Front layer forward, currently position 1 of 3",
      "Send Front layer backward, currently position 1 of 3",
      "Bring Front layer to front, currently position 1 of 3",
      "Send Front layer to back, currently position 1 of 3",
    ])
      expect(
        within(menu).getByRole("menuitem", { name: command }),
      ).toBeDisabled();
  });

  it("exposes Solo state and conventional announced stacking commands", () => {
    const back = createLayer("animated", "Back layer");
    const middle = createLayer("animated", "Middle layer");
    const front = createLayer("animated", "Front layer");
    const onUpdate = vi.fn();
    const onReorder = vi.fn();
    render(
      <LayerPanel
        layers={[back, middle, front]}
        groups={[]}
        selectedId={front.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onCreateGroup={vi.fn()}
        onAdd={vi.fn()}
        onAddPreset={vi.fn()}
        onUpdate={onUpdate}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );

    const solo = screen.getByRole("button", { name: "Solo Front layer" });
    expect(solo).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(solo);
    expect(onUpdate).toHaveBeenCalledWith(front.id, { solo: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Middle layer" }),
    );
    const menu = screen.getByRole("menu", {
      name: "Actions for Middle layer",
    });
    expect(menu).toHaveClass("layer-more__menu--floating");
    const bringForward = within(menu).getByRole("menuitem", {
      name: "Bring Middle layer forward, currently position 2 of 3",
    });
    expect(bringForward).toBeEnabled();
    fireEvent.click(bringForward);
    expect(onReorder).toHaveBeenLastCalledWith(1, 2);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Middle layer moved forward to position 1 of 3.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Middle layer" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Send Middle layer backward, currently position 2 of 3",
      }),
    );
    expect(onReorder).toHaveBeenLastCalledWith(1, 0);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Middle layer moved backward to position 3 of 3.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Middle layer" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Bring Middle layer to front, currently position 2 of 3",
      }),
    );
    expect(onReorder).toHaveBeenLastCalledWith(1, 2);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Middle layer brought to front and is now frontmost, position 1 of 3.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Middle layer" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Send Middle layer to back, currently position 2 of 3",
      }),
    );
    expect(onReorder).toHaveBeenLastCalledWith(1, 0);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Middle layer sent to back and is now backmost, position 3 of 3.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Front layer" }),
    );
    const frontMenu = screen.getByRole("menu", {
      name: "Actions for Front layer",
    });
    expect(
      within(frontMenu).getByRole("menuitem", {
        name: "Bring Front layer forward, currently position 1 of 3",
      }),
    ).toBeDisabled();
    expect(
      within(frontMenu).getByRole("menuitem", {
        name: "Bring Front layer to front, currently position 1 of 3",
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Front layer" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Back layer" }),
    );
    const backMenu = screen.getByRole("menu", {
      name: "Actions for Back layer",
    });
    expect(
      within(backMenu).getByRole("menuitem", {
        name: "Send Back layer backward, currently position 3 of 3",
      }),
    ).toBeDisabled();
    expect(
      within(backMenu).getByRole("menuitem", {
        name: "Send Back layer to back, currently position 3 of 3",
      }),
    ).toBeDisabled();
  });

  it("edits a group's shared offsets and membership", () => {
    const group = createGroup("Impact core");
    const flash = createLayer("animated", "Flash");
    const ring = createLayer("animated", "Ring");
    flash.groupId = group.id;
    const onChange = vi.fn();
    const onLayerGroupChange = vi.fn();
    const inspector = render(
      <GroupInspector
        group={group}
        layers={[flash, ring]}
        onChange={onChange}
        onLayerGroupChange={onLayerGroupChange}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Group position X"), {
      target: { value: "120" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: group.id, x: 120 }),
    );
    fireEvent.click(
      within(inspector.container).getByRole("checkbox", { name: /Ring/ }),
    );
    expect(onLayerGroupChange).toHaveBeenCalledWith(ring.id, group.id);
  });

  it("turns an uploaded image into a reusable sprite sheet", () => {
    const layer = createLayer("animated", "Flame", "flame-sheet");
    const asset = {
      id: "flame-sheet",
      name: "Flame sheet",
      mimeType: "image/png" as const,
      dataUrl: validPngDataUrl(128, 32),
      width: 128,
      height: 32,
      spriteSheet: null,
    };
    const onAssetChange = vi.fn();
    render(
      <Inspector
        layer={layer}
        assets={[asset]}
        layers={[layer]}
        onChange={vi.fn()}
        onAssetChange={onAssetChange}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    fireEvent.click(screen.getByLabelText("Use as a sprite sheet"));
    expect(onAssetChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 4 },
      }),
    );
  });

  it("assigns a named Phaser texture-atlas frame to an uploaded image", () => {
    const layer = createLayer("animated", "Spark", "atlas-spark");
    const asset = {
      id: "atlas-spark",
      name: "Atlas spark",
      mimeType: "image/png" as const,
      dataUrl: validPngDataUrl(64, 64),
      width: 64,
      height: 64,
      spriteSheet: null,
      atlasFrame: null,
    };
    const onAssetChange = vi.fn();
    const inspector = render(
      <Inspector
        layer={layer}
        assets={[asset]}
        layers={[layer]}
        onChange={vi.fn()}
        onAssetChange={onAssetChange}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    fireEvent.change(
      within(inspector.container).getByRole("textbox", {
        name: "Atlas frame name",
      }),
      {
        target: { value: "vfx/spark-01" },
      },
    );
    expect(onAssetChange).toHaveBeenCalledWith(
      expect.objectContaining({ atlasFrame: "vfx/spark-01" }),
    );
  });

  it("enables motion trails from the selected layer settings", () => {
    const layer = createLayer("animated", "Comet", "builtin-spark");
    const onChange = vi.fn();
    const inspector = render(
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

    fireEvent.click(
      within(inspector.container).getByLabelText("Leave a motion trail"),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        trail: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it("enables motion paths from the selected layer settings", () => {
    const layer = createLayer("animated", "Orb", "builtin-ring");
    const onChange = vi.fn();
    const inspector = render(
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

    fireEvent.click(
      within(inspector.container).getByLabelText("Follow a motion path"),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        motionPath: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it("initializes keyframes from the layer's existing start and end values", () => {
    const layer = createLayer("animated", "Pulse", "builtin-ring");
    layer.transform.startScale = 0.5;
    layer.transform.endScale = 2;
    layer.transform.endOpacity = 0.2;
    layer.transform.rotationDuring = 180;
    const onChange = vi.fn();
    const inspector = render(
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

    fireEvent.click(
      within(inspector.container).getByLabelText("Use multiple keyframes"),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        keyframes: expect.objectContaining({
          enabled: true,
          initialized: true,
          frames: [
            expect.objectContaining({ time: 0, scaleX: 0.5, opacity: 1 }),
            expect.objectContaining({
              time: 1,
              scaleX: 2,
              opacity: 0.2,
              rotation: 180,
            }),
          ],
        }),
      }),
    );
  });

  it("chooses an easing curve from the visual preset comparison", () => {
    const layer = createLayer("animated", "Flash", "builtin-flash");
    const onChange = vi.fn();
    const inspector = render(
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

    fireEvent.click(
      within(inspector.container).getByRole("button", {
        name: "Use Bounce easing",
      }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        timing: expect.objectContaining({ easing: "bounce" }),
      }),
    );
  });

  it("edits custom easing handle values precisely", () => {
    const layer = createLayer("animated", "Flash", "builtin-flash");
    layer.timing.easing = "custom";
    const onChange = vi.fn();
    const inspector = render(
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

    fireEvent.change(
      within(inspector.container).getByLabelText("First handle height"),
      { target: { value: "-35" } },
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        timing: expect.objectContaining({
          customEasing: expect.objectContaining({ y1: -0.35 }),
        }),
      }),
    );
  });

  it("explains clean active-range WebM export before recording", () => {
    const project = createEmptyProject("Preview export");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    render(
      <ExportDialog
        project={project}
        activeDuration={900}
        onRecordPreview={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("WebM video")).toBeInTheDocument();
    expect(screen.getByText(/0.90 seconds at 30 FPS/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Removes the grid, selection outline/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record & download .webm" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export & download .webm" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "gif" },
    });
    expect(screen.getAllByText(/Animated GIF/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Export & download .gif" }),
    ).toBeInTheDocument();
  });

  it("moves a timeline layer while preserving its duration", () => {
    const layer = createLayer("animated", "Moving flash");
    layer.timing = { ...layer.timing, delay: 100, duration: 500 };

    expect(timingAfterTimelineDrag(layer.timing, 2000, 400, "move")).toEqual({
      delay: 500,
      duration: 500,
    });
  });

  it("resizes layer edges against absolute millisecond targets", () => {
    const layer = createLayer("animated", "Impact ring");
    layer.timing = { ...layer.timing, delay: 100, duration: 500 };

    expect(timingAfterTimelineDrag(layer.timing, 2000, 100, "start")).toEqual({
      delay: 200,
      duration: 400,
    });
    expect(
      timingAfterTimelineDrag(layer.timing, 2000, 18, "end", "markers", [
        { id: "ring-end", time: 620, label: "Ring ends" },
      ]),
    ).toEqual({ delay: 100, duration: 520 });
  });

  it("moves and resizes normalized effect clips inside the parent lifetime", () => {
    const clip = { start: 0.2, end: 0.6 };

    expect(
      effectClipTimingAfterTimelineDrag(
        clip,
        100,
        500,
        2000,
        100,
        "move",
        "off",
      ),
    ).toEqual({ start: 0.4, end: 0.8 });
    expect(
      effectClipTimingAfterTimelineDrag(
        clip,
        100,
        500,
        2000,
        100,
        "start",
        "off",
      ),
    ).toEqual({ start: 0.4, end: 0.6 });
    expect(
      effectClipTimingAfterTimelineDrag(
        clip,
        100,
        500,
        2000,
        100,
        "end",
        "off",
      ),
    ).toEqual({ start: 0.2, end: 0.8 });
    const clampedMove = effectClipTimingAfterTimelineDrag(
      clip,
      100,
      500,
      2000,
      1000,
      "move",
      "off",
    );
    expect(clampedMove.start).toBeCloseTo(0.6);
    expect(clampedMove.end).toBe(1);
  });

  it("moves only intermediate keyframe times and keeps them ordered", () => {
    const layer = createLayer("animated", "Pulse");
    layer.timing.duration = 1000;
    layer.keyframes = {
      enabled: true,
      initialized: true,
      frames: [
        { time: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 },
        { time: 0.5, scaleX: 2, scaleY: 2, opacity: 0.5, rotation: 0 },
        { time: 1, scaleX: 1, scaleY: 1, opacity: 0, rotation: 0 },
      ],
    };

    expect(keyframeTimeAfterTimelineDrag(layer, 1, 200)).toBeCloseTo(0.7);
    expect(keyframeTimeAfterTimelineDrag(layer, 1, 1000)).toBeCloseTo(0.99);
    expect(keyframeTimeAfterTimelineDrag(layer, 0, 200)).toBe(0);
  });

  it("commits a timeline drag as one layer change", () => {
    const layer = createLayer("animated", "Moving flash");
    layer.timing = { ...layer.timing, delay: 100, duration: 500 };
    const onLayerChange = vi.fn();
    const { container } = render(
      <Timeline
        layers={[layer]}
        groups={[]}
        duration={2000}
        time={0}
        selectedId={layer.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onSeek={vi.fn()}
        onLayerChange={onLayerChange}
        onGroupChange={vi.fn()}
        onDurationChange={vi.fn()}
      />,
    );
    const track = container.querySelector(".timeline-tracks");
    if (!(track instanceof HTMLElement)) throw new Error("Timeline missing");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 100,
      left: 0,
      width: 1000,
      height: 100,
      toJSON: () => ({}),
    });

    const bar = screen.getByRole("slider", {
      name: "Move Moving flash on timeline",
    });
    fireEvent.pointerDown(bar, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(onLayerChange).not.toHaveBeenCalled();
    expect(bar).toHaveAttribute("aria-valuenow", "500");
    fireEvent.pointerUp(window, { clientX: 300 });

    expect(onLayerChange).toHaveBeenCalledOnce();
    expect(onLayerChange.mock.calls[0][0].timing).toMatchObject({
      delay: 500,
      duration: 500,
    });
  });

  it("adds an exact saved marker at the playhead", () => {
    const layer = createLayer("animated", "Critical flash");
    const onTimelineChange = vi.fn();
    render(
      <Timeline
        layers={[layer]}
        groups={[]}
        duration={1000}
        time={120}
        selectedId={layer.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onSeek={vi.fn()}
        onLayerChange={vi.fn()}
        onGroupChange={vi.fn()}
        onDurationChange={vi.fn()}
        timeline={{ markers: [], notes: "" }}
        onTimelineChange={onTimelineChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add marker at 120 ms" }),
    );
    expect(onTimelineChange).toHaveBeenCalledOnce();
    expect(onTimelineChange.mock.calls[0][0].markers[0]).toMatchObject({
      time: 120,
      label: "Marker 1",
    });
  });

  it("aligns a multi-layer selection at the playhead as one batch", () => {
    const flash = createLayer("animated", "Flash");
    const ring = createLayer("animated", "Ring");
    ring.timing.delay = 300;
    const onLayersChange = vi.fn();
    render(
      <Timeline
        layers={[flash, ring]}
        groups={[]}
        duration={1000}
        time={180}
        selectedId={flash.id}
        selectedGroupId={null}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onSeek={vi.fn()}
        onLayerChange={vi.fn()}
        onLayersChange={onLayersChange}
        onGroupChange={vi.fn()}
        onDurationChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ring" }), {
      ctrlKey: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /Starts.*playhead/i }));

    expect(onLayersChange).toHaveBeenCalledOnce();
    expect(
      onLayersChange.mock.calls[0][0].map(
        (layer: ReturnType<typeof createLayer>) => layer.timing.delay,
      ),
    ).toEqual([180, 180]);
  });

  it("moves a whole group on the timeline as one change", () => {
    const group = createGroup("Impact core");
    group.delay = 100;
    const layer = createLayer("animated", "Flash");
    layer.groupId = group.id;
    const onGroupChange = vi.fn();
    const { container } = render(
      <Timeline
        layers={[layer]}
        groups={[group]}
        duration={2000}
        time={0}
        selectedId={null}
        selectedGroupId={group.id}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onSeek={vi.fn()}
        onLayerChange={vi.fn()}
        onGroupChange={onGroupChange}
        onDurationChange={vi.fn()}
      />,
    );
    const track = container.querySelector(".timeline-tracks");
    if (!(track instanceof HTMLElement)) throw new Error("Timeline missing");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 100,
      left: 0,
      width: 1000,
      height: 100,
      toJSON: () => ({}),
    });

    const bar = screen.getByRole("slider", {
      name: "Move Impact core on timeline",
    });
    fireEvent.pointerDown(bar, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(onGroupChange).not.toHaveBeenCalled();
    expect(bar).toHaveAttribute("aria-valuenow", "500");
    fireEvent.pointerUp(window, { clientX: 300 });

    expect(onGroupChange).toHaveBeenCalledOnce();
    expect(onGroupChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: group.id, delay: 500 }),
    );
    expect(groupDelayAfterTimelineDrag(100, 2000, -500)).toBe(0);
  });

  it("expands per-copy effect lanes, preserves layer identity, and commits one drag", () => {
    const back = createLayer("animated", "Back glow");
    const front = createLayer("animated", "Front lightning");
    const duplicateClipId = "effect-outerGlow";
    back.appearance.effects.outerGlow.enabled = true;
    front.appearance.effects.outerGlow.enabled = true;
    back.appearance.effectClips = [
      {
        ...createRenderingEffectClip("outerGlow", duplicateClipId),
        start: 0.1,
        end: 0.9,
      },
    ];
    front.appearance.effectClips = [
      {
        ...createRenderingEffectClip("outerGlow", duplicateClipId),
        start: 0.2,
        end: 0.6,
        fadeIn: 0.2,
        fadeOut: 0.1,
      },
    ];
    front.timing = { ...front.timing, delay: 100, duration: 500 };
    const onLayerChange = vi.fn();
    const onSelectEffect = vi.fn();
    const onSeek = vi.fn();
    const { container } = render(
      <Timeline
        layers={[back, front]}
        groups={[]}
        duration={1000}
        time={0}
        selectedId={front.id}
        selectedGroupId={null}
        selectedEffectClipId={duplicateClipId}
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
        onSelectEffect={onSelectEffect}
        onSeek={onSeek}
        onLayerChange={onLayerChange}
        onGroupChange={vi.fn()}
        onDurationChange={vi.fn()}
      />,
    );

    expect(
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ".timeline-layer-label__select",
        ),
      ).map((button) => button.textContent),
    ).toEqual(["Front lightning", "Back glow"]);
    expect(
      screen.getByRole("button", {
        name: "Collapse 1 effect for Front lightning",
      }),
    ).toHaveAttribute(
      "title",
      "1 effect timed inside each copy of Front lightning",
    );
    expect(
      screen.getByRole("group", {
        name: "Effects inside each copy of Front lightning",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", {
        name: "Effects inside each copy of Back glow",
      }),
    ).toBeNull();

    const frontLabel = screen.getByRole("button", {
      name: "Select Outer glow effect on Front lightning",
    });
    expect(frontLabel).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(frontLabel);
    expect(onSelectEffect).toHaveBeenCalledWith(front.id, duplicateClipId);
    expect(onSeek).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand 1 effect for Back glow",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Select Outer glow effect on Back glow",
      }),
    ).toHaveAttribute("aria-pressed", "false");

    const track = container.querySelector(".timeline-tracks");
    if (!(track instanceof HTMLElement)) throw new Error("Timeline missing");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 100,
      left: 0,
      width: 1000,
      height: 100,
      toJSON: () => ({}),
    });
    const frontClip = screen.getByRole("slider", {
      name: "Move Outer glow effect inside each copy of Front lightning",
    });
    expect(frontClip.closest(".timeline-effect-clip")).toHaveStyle({
      left: "20%",
      width: "20%",
    });

    onLayerChange.mockClear();
    onSelectEffect.mockClear();
    fireEvent.pointerDown(frontClip, { button: 0, clientX: 200 });
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(frontClip).toHaveAttribute("aria-valuenow", "200");
    expect(onLayerChange).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { clientX: 300 });

    expect(onSelectEffect).toHaveBeenCalledWith(front.id, duplicateClipId);
    expect(onLayerChange).toHaveBeenCalledOnce();
    expect(
      onLayerChange.mock.calls[0][0].appearance.effectClips[0],
    ).toMatchObject({ start: 0.4, end: 0.8 });

    onLayerChange.mockClear();
    fireEvent.keyDown(
      screen.getByRole("slider", {
        name: "Resize end of Outer glow effect inside each copy of Front lightning",
      }),
      { key: "ArrowRight", shiftKey: true },
    );
    expect(onLayerChange).toHaveBeenCalledOnce();
    expect(
      onLayerChange.mock.calls[0][0].appearance.effectClips[0].end,
    ).toBeCloseTo(0.62);
  });

  it("explains the workspace through a step-based onboarding overlay", () => {
    const onNext = vi.fn();
    render(
      <OnboardingOverlay
        step={1}
        onBack={vi.fn()}
        onNext={onNext}
        onSkip={vi.fn()}
      />,
    );
    expect(
      screen.getByText("The Asset Library holds your images"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("creates a named copy through Save As", () => {
    const onSave = vi.fn();
    render(
      <SaveAsDialog
        suggestedName="Impact copy"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Blue impact" } });
    fireEvent.click(screen.getByRole("button", { name: "Save copy" }));
    expect(onSave).toHaveBeenCalledWith("Blue impact");
  });

  it("offers to restore a separately autosaved editing session", () => {
    const onRestore = vi.fn();
    const project = createEmptyProject("Recovered sparks");
    project.layers.push(createLayer("burst", "Sparks"));
    render(
      <RecoveryDialog
        draft={{
          id: "current",
          project,
          savedAt: "2026-08-20T12:00:00.000Z",
        }}
        onRestore={onRestore}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("Recovered sparks")).toBeInTheDocument();
    expect(screen.getByText(/1 layer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore session/i }));
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it("shows the current project protection state beside its name", () => {
    render(
      <TopBar
        projectName="Impact"
        canUndo={false}
        canRedo={false}
        saveStatus="protected"
        onNameChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onSave={vi.fn()}
        onSaveAs={vi.fn()}
        onOpenProjects={vi.fn()}
        onOpenTemplates={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onNewProject={vi.fn()}
        onLearn={vi.fn()}
      />,
    );
    expect(screen.getByText("Unsaved · recovery protected")).toBeVisible();
  });

  it("duplicates a named save from the project list", () => {
    const onDuplicate = vi.fn();
    const project = createEmptyProject("Poison ooze");
    render(
      <ProjectsDialog
        projects={[project]}
        onLoad={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Duplicate Poison ooze" }),
    );
    expect(onDuplicate).toHaveBeenCalledWith(project);
  });

  it("saves and inserts effects through the local template library", async () => {
    const project = createEmptyProject("Blue impact");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    const template = createTemplateFromProject(project, "Enemy hit");
    const onSaveCurrent = vi.fn().mockResolvedValue(undefined);
    const onInsert = vi.fn();
    const onImport = vi.fn().mockResolvedValue({
      added: 1,
      alreadyHere: 1,
      importedAsCopy: 1,
    });
    const { container } = render(
      <TemplateLibraryDialog
        projectName={project.metadata.name}
        canSaveCurrent
        templates={[template]}
        saveSummaries={{
          effect: {
            layerCount: 1,
            groupCount: 0,
            assetCount: 1,
            uploadedAssetCount: 0,
            omittedParentLinks: 0,
            omittedEventLinks: 0,
            timelineAnchor: 0,
            duration: 900,
          },
        }}
        onSaveCurrent={onSaveCurrent}
        onInsert={onInsert}
        onInsertBuiltIn={vi.fn()}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onDuplicate={vi.fn().mockResolvedValue(undefined)}
        onExportOne={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onImport={onImport}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Complete-effect starters" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Insert Magic impact copy" }),
    ).toBeVisible();
    const picker =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(picker?.accept).toContain(".vvfx-template");

    fireEvent.click(
      screen.getByRole("button", { name: "Save current effect" }),
    );
    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "Boss hit" },
    });
    fireEvent.change(screen.getByLabelText(/short reminder/i), {
      target: { value: "Large blue burst" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() =>
      expect(onSaveCurrent).toHaveBeenCalledWith(
        "Boss hit",
        "Large blue burst",
        "effect",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "false"),
    );
    const savedTemplateCard = screen.getByText("Enemy hit").closest("article");
    expect(savedTemplateCard).not.toBeNull();
    fireEvent.click(
      within(savedTemplateCard as HTMLElement).getByRole("button", {
        name: "Insert Enemy hit copy",
      }),
    );
    expect(onInsert).toHaveBeenCalledWith(template);
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "false"),
    );

    if (!picker) throw new Error("Missing template file picker");
    const file = new File(["{}"], "shared.vvfx-template", {
      type: "application/json",
    });
    fireEvent.change(picker, { target: { files: [file] } });
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/Import complete:/)).toHaveTextContent(
      "1 added · 1 already here · 1 imported as a copy",
    );
  }, 10_000);

  it("does not present a partial export as a complete oversized template backup", () => {
    const project = createEmptyProject("Oversized library");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    const template = createTemplateFromProject(project, "Saved flash");

    render(
      <TemplateLibraryDialog
        projectName={project.metadata.name}
        canSaveCurrent
        templates={[template]}
        excessSavedCount={3}
        saveSummaries={{
          effect: {
            layerCount: 1,
            groupCount: 0,
            assetCount: 1,
            uploadedAssetCount: 0,
            omittedParentLinks: 0,
            omittedEventLinks: 0,
            timelineAnchor: 0,
            duration: 900,
          },
        }}
        onSaveCurrent={vi.fn().mockResolvedValue(undefined)}
        onInsert={vi.fn()}
        onInsertBuiltIn={vi.fn()}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onDuplicate={vi.fn().mockResolvedValue(undefined)}
        onExportOne={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onImport={vi.fn().mockResolvedValue({
          added: 0,
          alreadyHere: 0,
          importedAsCopy: 0,
        })}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Export all" })).toBeDisabled();
    expect(screen.getByText(/Export all is disabled/i)).toBeVisible();
  });
});
