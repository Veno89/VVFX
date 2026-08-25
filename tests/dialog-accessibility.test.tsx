import {
  cleanup,
  fireEvent,
  render,
  screen,
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
import { createEmptyProject, createLayer } from "../src/vfx/defaults";

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

afterEach(cleanup);

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

describe("dialog keyboard accessibility", () => {
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
});

describe("popup keyboard accessibility", () => {
  it("supports arrow keys and Escape in the Add and per-layer Actions menus", () => {
    const layer = createLayer("animated", "Flash");
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
        onUpdate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    const add = screen.getByRole("button", { name: "Add" });
    add.focus();
    fireEvent.click(add);
    const addMenu = screen.getByRole("menu", { name: "Add layer" });
    const addItems = within(addMenu).getAllByRole("menuitem");
    expect(addItems[0]).toHaveFocus();
    fireEvent.keyDown(addItems[0], { key: "ArrowDown" });
    expect(addItems[1]).toHaveFocus();
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
    fireEvent.keyDown(actionItems[0], { key: "End" });
    expect(actionItems.at(-1)).toHaveFocus();
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
    fireEvent.keyDown(document, { key: "Escape" });
    expect(performance).toHaveFocus();
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
