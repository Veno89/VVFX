import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DefinitionDrawer } from "../src/editor/components/DefinitionDrawer";
import { ExportDialog } from "../src/editor/components/ExportDialog";
import { LayerPanel } from "../src/editor/components/LayerPanel";
import { OnboardingOverlay } from "../src/editor/components/LearningCenter";
import { PreviewPanel } from "../src/editor/components/PreviewPanel";
import { SaveAsDialog } from "../src/editor/components/ProjectSafetyDialogs";
import { ProjectsDialog } from "../src/editor/components/ProjectsDialog";
import { Timeline } from "../src/editor/components/Timeline";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

afterEach(cleanup);

function expectRovingTabStop(items: HTMLElement[], activeIndex: number) {
  items.forEach((item, index) =>
    expect(item).toHaveAttribute(
      "tabindex",
      index === activeIndex ? "0" : "-1",
    ),
  );
}

function LayerDeletionHarness() {
  const [layers, setLayers] = useState(() => [
    createLayer("animated", "First flash"),
    createLayer("animated", "Second flash"),
  ]);
  return (
    <LayerPanel
      layers={layers}
      groups={[]}
      selectedId={layers[0]?.id ?? null}
      selectedGroupId={null}
      onSelect={vi.fn()}
      onSelectGroup={vi.fn()}
      onCreateGroup={vi.fn()}
      onAdd={vi.fn()}
      onAddPreset={vi.fn()}
      onUpdate={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={(id) =>
        setLayers((current) =>
          current.filter((candidate) => candidate.id !== id),
        )
      }
      onReorder={vi.fn()}
    />
  );
}

function EscapeHarness({
  openerLabel,
  renderPopup,
}: {
  openerLabel: string;
  renderPopup: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {openerLabel}
      </button>
      {open && renderPopup(() => setOpen(false))}
    </>
  );
}

function StackedDialogHarness() {
  const [projectsOpen, setProjectsOpen] = useState(true);
  return (
    <>
      <SaveAsDialog
        suggestedName="Recovered draft"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
      {projectsOpen && (
        <ProjectsDialog
          projects={[]}
          onLoad={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onClose={() => setProjectsOpen(false)}
        />
      )}
    </>
  );
}

function ModalBackgroundHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <main data-testid="modal-background" aria-hidden="false">
        <button type="button" onClick={() => setOpen(true)}>
          Open modal
        </button>
      </main>
      <div data-testid="modal-live-region" data-modal-live-region role="alert">
        Dialog operation failed
      </div>
      {open && (
        <SaveAsDialog
          suggestedName="Accessible copy"
          onSave={vi.fn()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe("dialog keyboard accessibility", () => {
  it("shows a safe preflight error instead of crashing on invalid export state", () => {
    const project = createEmptyProject("Invalid export");
    const first = createLayer("animated", "First", "builtin-ring");
    const second = createLayer("animated", "Second", "builtin-spark");
    first.parentId = second.id;
    second.parentId = first.id;
    project.layers.push(first, second);

    render(
      <ExportDialog
        project={project}
        activeDuration={800}
        onRecordPreview={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/circular layer attachment/i)).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByRole("button", { name: /Export & download/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Runtime JSON" }));
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download .vvfx-runtime.json" }),
    ).toBeDisabled();
  });

  it("lets the newest dialog own focus when overlays briefly coexist", () => {
    render(<StackedDialogHarness />);

    const projects = screen.getByRole("dialog", {
      name: "Load a saved project",
    });
    const coveredSaveAs = document.querySelector<HTMLElement>(
      "[aria-labelledby='save-as-title']",
    );
    expect(projects).toContainElement(document.activeElement as HTMLElement);
    expect(coveredSaveAs).toHaveAttribute("aria-hidden", "true");
    expect(coveredSaveAs).toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Load a saved project" }),
    ).toBeNull();
    const saveAs = screen.getByRole("dialog", { name: "Save project as" });
    expect(saveAs).not.toHaveAttribute("aria-hidden");
    expect(saveAs).not.toHaveAttribute("inert");
    expect(saveAs).toContainElement(document.activeElement as HTMLElement);
  });

  it("makes modal background siblings inert and restores their original state", () => {
    render(<ModalBackgroundHarness />);
    const background = screen.getByTestId("modal-background");
    const liveRegion = screen.getByTestId("modal-live-region");
    const opener = screen.getByRole("button", { name: "Open modal" });
    opener.focus();
    fireEvent.click(opener);

    expect(
      screen.getByRole("dialog", { name: "Save project as" }),
    ).toBeInTheDocument();
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background).toHaveAttribute("inert");
    expect(liveRegion).not.toHaveAttribute("aria-hidden");
    expect(liveRegion).not.toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(background).toHaveAttribute("aria-hidden", "false");
    expect(background).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("moves focus into Save As, traps Tab, closes on Escape, and restores focus", () => {
    render(
      <EscapeHarness
        openerLabel="Open Save As"
        renderPopup={(close) => (
          <SaveAsDialog
            suggestedName="Impact copy"
            onSave={vi.fn()}
            onClose={close}
          />
        )}
      />,
    );

    const opener = screen.getByRole("button", { name: "Open Save As" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Save project as" });
    const close = within(dialog).getByRole("button", {
      name: "Close Save As",
    });
    const save = within(dialog).getByRole("button", { name: "Save copy" });
    expect(screen.getByLabelText("Project name")).toHaveFocus();

    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(save).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Save project as" }),
    ).toBeNull();
    expect(opener).toHaveFocus();
  });

  it.each([
    {
      name: "app tour",
      openerLabel: "Open tour",
      renderPopup: (close: () => void) => (
        <OnboardingOverlay
          step={0}
          onBack={vi.fn()}
          onNext={vi.fn()}
          onSkip={close}
        />
      ),
    },
    {
      name: "project loader",
      openerLabel: "Open projects",
      renderPopup: (close: () => void) => (
        <ProjectsDialog
          projects={[]}
          onLoad={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onClose={close}
        />
      ),
    },
    {
      name: "export dialog",
      openerLabel: "Open export",
      renderPopup: (close: () => void) => (
        <ExportDialog
          project={createEmptyProject("Accessible export")}
          activeDuration={800}
          onRecordPreview={vi.fn()}
          onClose={close}
        />
      ),
    },
  ])(
    "closes the $name on Escape and restores its opener",
    ({ openerLabel, renderPopup }) => {
      render(
        <EscapeHarness openerLabel={openerLabel} renderPopup={renderPopup} />,
      );
      const opener = screen.getByRole("button", { name: openerLabel });
      opener.focus();
      fireEvent.click(opener);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toContainElement(document.activeElement as HTMLElement);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(opener).toHaveFocus();
    },
  );

  it("exposes related Export tabs and panels with roving keyboard selection", async () => {
    render(
      <ExportDialog
        project={createEmptyProject("Keyboard export")}
        activeDuration={800}
        onRecordPreview={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const tablist = screen.getByRole("tablist", { name: "Export type" });
    const tabs = within(tablist).getAllByRole("tab");
    const previewTab = within(tablist).getByRole("tab", {
      name: "Preview video",
    });
    const runtimeTab = within(tablist).getByRole("tab", {
      name: "Runtime JSON",
    });
    const advancedTab = within(tablist).getByRole("tab", {
      name: "Advanced TypeScript",
    });
    const projectTab = within(tablist).getByRole("tab", {
      name: "Vvfx project",
    });
    let panel = screen.getByRole("tabpanel", { name: "Preview video" });

    expect(tabs).toHaveLength(4);
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("tabindex", "0");
    expect(runtimeTab).toHaveAttribute("aria-selected", "false");
    expect(runtimeTab).toHaveAttribute("tabindex", "-1");
    expect(advancedTab).toHaveAttribute("aria-selected", "false");
    expect(previewTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", previewTab.id);

    previewTab.focus();
    fireEvent.keyDown(previewTab, { key: "ArrowRight" });
    await waitFor(() => expect(runtimeTab).toHaveFocus());
    expect(runtimeTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("aria-selected", "false");
    panel = screen.getByRole("tabpanel", { name: "Runtime JSON" });
    expect(runtimeTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", runtimeTab.id);
    expect(
      screen.getByText(/Recommended for game integration/),
    ).toHaveTextContent(/no Beam layers/);

    fireEvent.keyDown(runtimeTab, { key: "End" });
    await waitFor(() => expect(projectTab).toHaveFocus());
    expect(projectTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(projectTab, { key: "Home" });
    await waitFor(() => expect(previewTab).toHaveFocus());
    expect(previewTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("popup keyboard accessibility", () => {
  it("dismisses a layer popup on outside focus or pointer without stealing destination focus", () => {
    const layer = createLayer("animated", "Outside-safe flash");
    render(
      <>
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
          onUpdate={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onReorder={vi.fn()}
        />
        <button
          type="button"
          onPointerDown={(event) => event.currentTarget.focus()}
        >
          Outside destination
        </button>
      </>,
    );

    const add = screen.getByRole("button", { name: "Add" });
    const outside = screen.getByRole("button", {
      name: "Outside destination",
    });
    add.focus();
    fireEvent.click(add);
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();

    act(() => outside.focus());
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(outside).toHaveFocus();

    add.focus();
    fireEvent.click(add);
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(outside).toHaveFocus();

    add.focus();
    fireEvent.click(add);
    let firstMenuItem = within(
      screen.getByRole("menu", { name: "Add layer" }),
    ).getAllByRole("menuitem")[0];
    expect(fireEvent.keyDown(firstMenuItem, { key: "Tab" })).toBe(true);
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();
    act(() => outside.focus());
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(outside).toHaveFocus();

    add.focus();
    fireEvent.click(add);
    firstMenuItem = within(
      screen.getByRole("menu", { name: "Add layer" }),
    ).getAllByRole("menuitem")[0];
    expect(
      fireEvent.keyDown(firstMenuItem, { key: "Tab", shiftKey: true }),
    ).toBe(true);
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();
    act(() => add.focus());
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(add).toHaveFocus();

    fireEvent.click(add);
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(add).toHaveFocus();
  });

  it("lets Layer and Preview triggers toggle their popup closed after pointerDown", () => {
    const layer = createLayer("animated", "Pointer-toggle flash");
    const project = createEmptyProject();
    render(
      <>
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
          onUpdate={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onReorder={vi.fn()}
        />
        <PreviewPanel
          project={project}
          time={0}
          playing={false}
          speed={1}
          loopEnd={project.preview.duration}
          selectedId={null}
          onProjectChange={vi.fn()}
          onViewChange={vi.fn()}
          onMoveLayer={vi.fn()}
          onMovePathPoint={vi.fn()}
          onPlayToggle={vi.fn()}
          onRestart={vi.fn()}
          onSpeedChange={vi.fn()}
        />
      </>,
    );

    const add = screen.getByRole("button", { name: "Add" });
    add.focus();
    fireEvent.pointerDown(add);
    fireEvent.click(add);
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();

    fireEvent.pointerDown(add);
    act(() => add.focus());
    expect(screen.getByRole("menu", { name: "Add layer" })).toBeInTheDocument();
    fireEvent.click(add);
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(add).toHaveAttribute("aria-expanded", "false");

    const appearance = screen.getByRole("button", {
      name: "Preview appearance",
    });
    appearance.focus();
    fireEvent.pointerDown(appearance);
    fireEvent.click(appearance);
    expect(
      screen.getByRole("dialog", { name: "Preview appearance" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(appearance);
    act(() => appearance.focus());
    expect(
      screen.getByRole("dialog", { name: "Preview appearance" }),
    ).toBeInTheDocument();
    fireEvent.click(appearance);
    expect(
      screen.queryByRole("dialog", { name: "Preview appearance" }),
    ).toBeNull();
    expect(appearance).toHaveAttribute("aria-expanded", "false");
  });

  it("supports roving arrows, Tab exit, and Escape in Layer menus", () => {
    const layer = createLayer("animated", "Flash");
    render(
      <>
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
          onUpdate={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onReorder={vi.fn()}
        />
        <button type="button">After layer menus</button>
      </>,
    );

    const add = screen.getByRole("button", { name: "Add" });
    add.focus();
    fireEvent.click(add);
    const addMenu = screen.getByRole("menu", { name: "Add layer" });
    const addItems = within(addMenu).getAllByRole("menuitem");
    expect(addItems[0]).toHaveFocus();
    expectRovingTabStop(addItems, 0);
    fireEvent.keyDown(addItems[0], { key: "ArrowDown" });
    expect(addItems[1]).toHaveFocus();
    expectRovingTabStop(addItems, 1);
    fireEvent.keyDown(addItems[1], { key: "End" });
    expect(addItems.at(-1)).toHaveFocus();
    expectRovingTabStop(addItems, addItems.length - 1);
    fireEvent.keyDown(addItems.at(-1)!, { key: "Home" });
    expect(addItems[0]).toHaveFocus();
    expectRovingTabStop(addItems, 0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Add layer" })).toBeNull();
    expect(add).toHaveFocus();

    const actions = screen.getByRole("button", {
      name: "Actions for Flash",
    });
    actions.focus();
    fireEvent.click(actions);
    const actionsMenu = screen.getByRole("menu", {
      name: "Actions for Flash",
    });
    const actionItems = within(actionsMenu).getAllByRole("menuitem");
    expect(actionItems[0]).toHaveFocus();
    expectRovingTabStop(actionItems, 0);
    fireEvent.keyDown(actionItems[0], { key: "End" });
    expect(actionItems.at(-1)).toHaveFocus();
    expectRovingTabStop(actionItems, actionItems.length - 1);
    fireEvent.keyDown(actionItems.at(-1)!, { key: "Home" });
    expect(actionItems[0]).toHaveFocus();
    expectRovingTabStop(actionItems, 0);

    const afterMenus = screen.getByRole("button", {
      name: "After layer menus",
    });
    expect(fireEvent.keyDown(actionItems[0], { key: "Tab" })).toBe(true);
    expect(actionsMenu).toBeInTheDocument();
    act(() => afterMenus.focus());
    expect(
      screen.queryByRole("menu", { name: "Actions for Flash" }),
    ).toBeNull();
    expect(afterMenus).toHaveFocus();

    fireEvent.click(actions);
    const backwardMenu = screen.getByRole("menu", {
      name: "Actions for Flash",
    });
    const backwardItem = within(backwardMenu).getAllByRole("menuitem")[0];
    expect(
      fireEvent.keyDown(backwardItem, { key: "Tab", shiftKey: true }),
    ).toBe(true);
    expect(backwardMenu).toBeInTheDocument();
    act(() => actions.focus());
    expect(
      screen.queryByRole("menu", { name: "Actions for Flash" }),
    ).toBeNull();
    expect(actions).toHaveFocus();

    fireEvent.click(actions);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: "Actions for Flash" }),
    ).toBeNull();
    expect(actions).toHaveFocus();
  });

  it("moves focus and Escape ownership when switching layer action menus", () => {
    const first = createLayer("animated", "First flash");
    const second = createLayer("animated", "Second flash");
    render(
      <LayerPanel
        layers={[first, second]}
        groups={[]}
        selectedId={first.id}
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
      />,
    );

    const firstTrigger = screen.getByRole("button", {
      name: "Actions for First flash",
    });
    fireEvent.click(firstTrigger);
    expect(
      within(
        screen.getByRole("menu", { name: "Actions for First flash" }),
      ).getAllByRole("menuitem")[0],
    ).toHaveFocus();

    const secondTrigger = screen.getByRole("button", {
      name: "Actions for Second flash",
    });
    secondTrigger.focus();
    fireEvent.click(secondTrigger);
    const secondMenu = screen.getByRole("menu", {
      name: "Actions for Second flash",
    });
    expect(within(secondMenu).getAllByRole("menuitem")[0]).toHaveFocus();
    expect(
      screen.queryByRole("menu", { name: "Actions for First flash" }),
    ).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: "Actions for Second flash" }),
    ).toBeNull();
    expect(secondTrigger).toHaveFocus();
  });

  it("moves focus to a surviving layer and then Add after menu deletion", async () => {
    render(<LayerDeletionHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for First flash" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Second flash/i }),
      ).toHaveFocus(),
    );
    expect(
      screen.queryByRole("button", { name: "Actions for First flash" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Second flash" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toHaveFocus(),
    );
    expect(
      screen.queryByRole("button", { name: "Actions for Second flash" }),
    ).toBeNull();
  });

  it("closes preview popups on Escape and restores their trigger", () => {
    const project = createEmptyProject();
    render(
      <PreviewPanel
        project={project}
        time={0}
        playing={false}
        speed={1}
        loopEnd={project.preview.duration}
        selectedId={null}
        onProjectChange={vi.fn()}
        onViewChange={vi.fn()}
        onMoveLayer={vi.fn()}
        onMovePathPoint={vi.fn()}
        onPlayToggle={vi.fn()}
        onRestart={vi.fn()}
        onSpeedChange={vi.fn()}
      />,
    );

    const performance = screen.getByRole("button", {
      name: "Effect performance and stress test",
    });
    expect(performance).toHaveAttribute("aria-expanded", "false");
    performance.focus();
    fireEvent.click(performance);
    expect(performance).toHaveAttribute("aria-expanded", "true");
    const performanceDialog = screen.getByRole("dialog", {
      name: "Effect performance",
    });
    expect(performanceDialog).toContainElement(
      document.activeElement as HTMLElement,
    );
    act(() =>
      within(performanceDialog)
        .getByRole("button", { name: "Reset measured peak" })
        .focus(),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Effect performance" }),
    ).toBeNull();
    expect(performance).toHaveFocus();

    const appearance = screen.getByRole("button", {
      name: "Preview appearance",
    });
    expect(appearance).toHaveAttribute("aria-expanded", "false");
    appearance.focus();
    fireEvent.click(appearance);
    expect(appearance).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("dialog", { name: "Preview appearance" }),
    ).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("combobox")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Preview appearance" }),
    ).toBeNull();
    expect(appearance).toHaveFocus();

    fireEvent.click(appearance);
    performance.focus();
    fireEvent.click(performance);
    expect(appearance).toHaveAttribute("aria-expanded", "false");
    expect(performance).toHaveAttribute("aria-expanded", "true");
    act(() =>
      within(screen.getByRole("dialog", { name: "Effect performance" }))
        .getByRole("button", { name: "Reset measured peak" })
        .focus(),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(performance).toHaveFocus();
  });

  it("routes Timing plan focus, semantics, Escape, and note commits", () => {
    const layer = createLayer("animated", "Timed flash");
    const onTimelineChange = vi.fn();
    const onViewChange = vi.fn();
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
        timeline={{ markers: [], notes: "Original timing note" }}
        onTimelineChange={onTimelineChange}
        workStart={20}
        workEnd={800}
        onViewChange={onViewChange}
      />,
    );

    expect(
      screen.getByRole("spinbutton", { name: "Composition duration" }),
    ).toHaveValue(1000);
    expect(screen.queryByText(/^Arrow: 1 ms/)).toBeNull();
    const propertySummary = screen
      .getByText("Property moments", { exact: true })
      .closest("summary");
    const propertyDetails = propertySummary?.closest("details");
    expect(propertyDetails).not.toHaveAttribute("open");
    fireEvent.click(propertySummary!);
    expect(propertyDetails).toHaveAttribute("open");
    expect(
      within(propertyDetails!).getByRole("combobox", {
        name: "Timeline property track",
      }),
    ).toBeInTheDocument();
    fireEvent.click(propertySummary!);

    const optionsTrigger = screen.getByRole("button", {
      name: "More timeline options",
    });
    optionsTrigger.focus();
    expect(optionsTrigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(optionsTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(optionsTrigger);

    const options = screen.getByRole("dialog", { name: "Timeline options" });
    expect(options).toHaveAttribute("aria-modal", "false");
    expect(optionsTrigger).toHaveAttribute("aria-expanded", "true");
    expect(optionsTrigger).toHaveAttribute("aria-controls", options.id);

    const workRange = within(options).getByRole("region", {
      name: "Work range",
    });
    expect(workRange).toHaveTextContent("20–800ms");
    fireEvent.click(within(workRange).getByRole("button", { name: "Set in" }));
    expect(onViewChange).toHaveBeenCalledWith({ workStart: 120 });

    const trigger = within(options).getByRole("button", {
      name: "Timing plan",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Turn feedback into timing markers",
    });
    const notes = screen.getByLabelText("Timing plan notes");
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(notes).toHaveFocus();

    fireEvent.change(notes, {
      target: { value: "40–120 ms ring expands and vanishes" },
    });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", {
        name: "Turn feedback into timing markers",
      }),
    ).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(onTimelineChange).toHaveBeenCalledWith({
      markers: [],
      notes: "40–120 ms ring expands and vanishes",
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Timeline options" }),
    ).toBeNull();
    expect(optionsTrigger).toHaveAttribute("aria-expanded", "false");
    expect(optionsTrigger).toHaveFocus();
  });

  it("lets hover-only and focused HelpTips own Escape without closing their dialog", () => {
    const project = createEmptyProject();
    render(
      <PreviewPanel
        project={project}
        time={0}
        playing={false}
        speed={1}
        loopEnd={project.preview.duration}
        selectedId={null}
        onProjectChange={vi.fn()}
        onViewChange={vi.fn()}
        onMoveLayer={vi.fn()}
        onMovePathPoint={vi.fn()}
        onPlayToggle={vi.fn()}
        onRestart={vi.fn()}
        onSpeedChange={vi.fn()}
      />,
    );

    const appearanceTrigger = screen.getByRole("button", {
      name: "Preview appearance",
    });
    fireEvent.click(appearanceTrigger);
    const appearanceDialog = screen.getByRole("dialog", {
      name: "Preview appearance",
    });
    const help = within(appearanceDialog).getByRole("button", {
      name: "Help for Background",
    });
    const background = within(appearanceDialog).getByRole("combobox");

    act(() => background.focus());
    fireEvent.pointerEnter(help);
    let tooltip = screen.getByRole("tooltip");
    expect(help).toHaveAttribute("aria-describedby", tooltip.id);
    expect(help).toHaveAccessibleName("Help for Background");
    expect(help).toHaveAccessibleDescription(
      "Bright effects can look completely different on light and dark backgrounds. Check both before you finish.",
    );
    fireEvent.keyDown(background, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(appearanceDialog).toBeInTheDocument();
    expect(appearanceTrigger).toHaveAttribute("aria-expanded", "true");
    expect(background).toHaveFocus();

    fireEvent.pointerLeave(help);
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => help.focus());
    tooltip = screen.getByRole("tooltip");
    expect(help).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.pointerEnter(help);
    fireEvent.pointerLeave(help);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerEnter(help);
    act(() => within(appearanceDialog).getByRole("combobox").focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(help);
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => help.focus());
    fireEvent.keyDown(help, { key: "Escape" });

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(appearanceDialog).toBeInTheDocument();
    expect(appearanceTrigger).toHaveAttribute("aria-expanded", "true");
    expect(help).toHaveFocus();
  });

  it("closes the Definition drawer on Escape and restores its trigger", () => {
    render(
      <EscapeHarness
        openerLabel="Open Definition"
        renderPopup={(close) => (
          <DefinitionDrawer project={createEmptyProject()} onClose={close} />
        )}
      />,
    );
    const opener = screen.getByRole("button", { name: "Open Definition" });
    opener.focus();
    fireEvent.click(opener);
    expect(
      screen.getByRole("dialog", { name: "Live VFX definition" }),
    ).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
