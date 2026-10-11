import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "../src/editor/components/TopBar";

afterEach(cleanup);

function renderTopBar() {
  const actions = {
    onNameChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onOpenProjects: vi.fn(),
    onOpenTemplates: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    onNewProject: vi.fn(),
    onLearn: vi.fn(),
  };
  render(
    <>
      <TopBar
        projectName="File menu effect"
        canUndo
        canRedo
        saveStatus="unsaved"
        {...actions}
      />
      <button
        type="button"
        onPointerDown={(event) => event.currentTarget.focus()}
      >
        Outside control
      </button>
    </>,
  );
  return actions;
}

function expectRovingTabStop(items: HTMLElement[], activeIndex: number) {
  items.forEach((item, index) =>
    expect(item).toHaveAttribute(
      "tabindex",
      index === activeIndex ? "0" : "-1",
    ),
  );
}

describe("TopBar File menu", () => {
  it("keeps only Learn, Save, and Export beside the File menu", () => {
    renderTopBar();
    const nav = screen.getByRole("navigation", { name: "Project actions" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent?.trim()),
    ).toEqual(["File", "Learn", "Save", "Export"]);
    for (const name of ["New", "Save As", "Load", "Templates", "Import"])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("runs each file action from the menu and opens the import picker", () => {
    const actions = renderTopBar();
    const trigger = screen.getByRole("button", { name: "File" });
    const expected: [string, () => void][] = [
      ["New", actions.onNewProject],
      ["Save As", actions.onSaveAs],
      ["Load", actions.onOpenProjects],
      ["Templates", actions.onOpenTemplates],
    ];
    for (const [name, callback] of expected) {
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole("menuitem", { name }));
      expect(callback).toHaveBeenCalledOnce();
      expect(screen.queryByRole("menu")).toBeNull();
    }

    const picker =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(picker, "click");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    expect(click).toHaveBeenCalledOnce();
    const file = new File(["{}"], "effect.vvfx", { type: "application/json" });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(actions.onImport).toHaveBeenCalledWith(file);
  });

  it("exposes an accessible menu with arrow navigation and Escape restoration", () => {
    renderTopBar();
    const trigger = screen.getByRole("button", { name: "File" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "File" });
    const items = within(menu).getAllByRole("menuitem");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(items[0]).toHaveFocus();
    expectRovingTabStop(items, 0);

    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    expectRovingTabStop(items, 1);
    fireEvent.keyDown(items[1], { key: "End" });
    expect(items.at(-1)).toHaveFocus();
    expectRovingTabStop(items, items.length - 1);
    fireEvent.keyDown(items.at(-1)!, { key: "Home" });
    expect(items[0]).toHaveFocus();
    expectRovingTabStop(items, 0);
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(items.at(-1)).toHaveFocus();
    expectRovingTabStop(items, items.length - 1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "File" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("lets Tab and Shift+Tab leave once without restoring or stalling", () => {
    const actions = renderTopBar();
    const trigger = screen.getByRole("button", { name: "File" });
    const outside = screen.getByRole("button", { name: "Outside control" });

    fireEvent.click(trigger);
    let menu = screen.getByRole("menu", { name: "File" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Templates" }));
    expect(actions.onOpenTemplates).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    menu = screen.getByRole("menu", { name: "File" });
    const first = within(menu).getAllByRole("menuitem")[0];
    expect(fireEvent.keyDown(first, { key: "Tab" })).toBe(true);
    expect(menu).toBeInTheDocument();
    act(() => outside.focus());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(outside).toHaveFocus();

    fireEvent.click(trigger);
    menu = screen.getByRole("menu", { name: "File" });
    const backwardItem = within(menu).getAllByRole("menuitem")[0];
    expect(
      fireEvent.keyDown(backwardItem, { key: "Tab", shiftKey: true }),
    ).toBe(true);
    expect(menu).toBeInTheDocument();
    act(() => trigger.focus());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(outside).toHaveFocus();
  });

  it("toggle-closes when the focused menu hands focus back to its trigger", () => {
    renderTopBar();
    const trigger = screen.getByRole("button", { name: "File" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "File" });
    const firstItem = within(menu).getAllByRole("menuitem")[0];
    expect(firstItem).toHaveFocus();

    fireEvent.pointerDown(trigger);
    fireEvent.blur(firstItem, { relatedTarget: trigger });
    fireEvent.focus(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
