import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "../src/editor/components/TopBar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function installMatchMedia(initialMatches: boolean) {
  type Listener = (event: MediaQueryListEvent) => void;
  let matches = initialMatches;
  const listeners = new Set<Listener>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(max-width: 1119px)",
    onchange: null,
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (typeof listener === "function") listeners.add(listener as Listener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (typeof listener === "function")
        listeners.delete(listener as Listener);
    },
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQueryList),
  );
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = {
        matches,
        media: mediaQueryList.media,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

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
        projectName="Responsive effect"
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

describe("responsive TopBar actions", () => {
  it("keeps Save and Export primary while marking secondary desktop actions for overflow", () => {
    renderTopBar();

    expect(screen.getByRole("button", { name: "Save" })).not.toHaveClass(
      "topbar-action--overflow",
    );
    expect(screen.getByRole("button", { name: /Export/ })).not.toHaveClass(
      "topbar-action--overflow",
    );
    for (const name of [
      "New",
      "Learn",
      "Save As",
      "Load",
      "Templates",
      "Import",
    ])
      expect(screen.getByRole("button", { name })).toHaveClass(
        "topbar-action--overflow",
      );
  });

  it("exposes an accessible menu with arrow navigation and Escape restoration", () => {
    renderTopBar();
    const trigger = screen.getByRole("button", { name: "Actions" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "More project actions" });
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
    expect(
      screen.queryByRole("menu", { name: "More project actions" }),
    ).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("lets Tab and Shift+Tab leave once without restoring or stalling", () => {
    const actions = renderTopBar();
    const trigger = screen.getByRole("button", { name: "Actions" });
    const outside = screen.getByRole("button", { name: "Outside control" });

    fireEvent.click(trigger);
    let menu = screen.getByRole("menu", { name: "More project actions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Templates" }));
    expect(actions.onOpenTemplates).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    menu = screen.getByRole("menu", { name: "More project actions" });
    const first = within(menu).getAllByRole("menuitem")[0];
    expect(fireEvent.keyDown(first, { key: "Tab" })).toBe(true);
    expect(menu).toBeInTheDocument();
    act(() => outside.focus());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(outside).toHaveFocus();

    fireEvent.click(trigger);
    menu = screen.getByRole("menu", { name: "More project actions" });
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
    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "More project actions" });
    const firstItem = within(menu).getAllByRole("menuitem")[0];
    expect(firstItem).toHaveFocus();

    fireEvent.pointerDown(trigger);
    fireEvent.blur(firstItem, { relatedTarget: trigger });
    fireEvent.focus(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("moves focus to Export when the desktop breakpoint closes the menu", async () => {
    const compactLayout = installMatchMedia(true);
    renderTopBar();
    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "More project actions" });
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();

    act(() => compactLayout.setMatches(false));

    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Export/ })).toHaveFocus(),
    );
  });
});
