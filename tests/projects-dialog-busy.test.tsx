import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsDialog } from "../src/editor/components/ProjectsDialog";
import { createCurrentProjectSummary } from "../src/persistence/projectSummaries";
import { createEmptyProject } from "../src/vfx/defaults";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderProjectsDialog(
  overrides: Partial<ComponentProps<typeof ProjectsDialog>> = {},
) {
  const project = createEmptyProject("Saved lightning");
  const summary = createCurrentProjectSummary(project);
  const props: ComponentProps<typeof ProjectsDialog> = {
    projects: [summary],
    invalidSavedCount: 1,
    onLoad: vi.fn().mockResolvedValue(undefined),
    onDuplicate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onRemoveInvalidSaved: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ProjectsDialog {...props} />);
  return { project, summary, props };
}

function expectDialogActionsDisabled() {
  const dialog = screen.getByRole("dialog", {
    name: "Load a saved project",
  });
  expect(dialog).toHaveAttribute("aria-busy", "true");
  for (const button of within(dialog).getAllByRole("button"))
    expect(button).toBeDisabled();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProjectsDialog async mutation locking", () => {
  it("locks duplicate synchronously, ignores dismissal, and unlocks after success", async () => {
    const pending = deferred<void>();
    const onDuplicate = vi.fn(() => pending.promise);
    const onLoad = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onRemoveInvalidSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { summary } = renderProjectsDialog({
      onDuplicate,
      onLoad,
      onDelete,
      onRemoveInvalidSaved,
      onClose,
    });
    const duplicate = screen.getByRole("button", {
      name: "Duplicate Saved lightning",
    });

    fireEvent.click(duplicate);
    fireEvent.click(duplicate);

    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledWith(summary);
    expectDialogActionsDisabled();

    const dialog = screen.getByRole("dialog", {
      name: "Load a saved project",
    });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Close project list" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Saved lightning" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove unreadable" }));
    fireEvent.click(screen.getByRole("button", { name: /^Saved lightning/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onRemoveInvalidSaved).not.toHaveBeenCalled();

    await act(async () => pending.resolve(undefined));

    await waitFor(() => expect(duplicate).toBeEnabled());
    expect(dialog).toHaveAttribute("aria-busy", "false");
    expect(
      screen.getByRole("button", { name: "Close project list" }),
    ).toBeEnabled();
  });

  it("reports a rejected delete and unlocks dismissal", async () => {
    const pending = deferred<void>();
    const onDelete = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const { project } = renderProjectsDialog({
      invalidSavedCount: 0,
      onDelete,
      onClose,
    });
    const remove = screen.getByRole("button", {
      name: "Delete Saved lightning",
    });

    fireEvent.click(remove);
    fireEvent.click(remove);

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(project.metadata.id);
    expectDialogActionsDisabled();

    await act(async () =>
      pending.reject(new Error("Saved-project deletion failed safely")),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved-project deletion failed safely",
    );
    await waitFor(() => expect(remove).toBeEnabled());
    expect(
      screen.getByRole("dialog", { name: "Load a saved project" }),
    ).toHaveAttribute("aria-busy", "false");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("awaits unreadable-save removal and ignores a second activation", async () => {
    const pending = deferred<void>();
    const onRemoveInvalidSaved = vi.fn(() => pending.promise);
    renderProjectsDialog({ onRemoveInvalidSaved });
    const removeUnreadable = screen.getByRole("button", {
      name: "Remove unreadable",
    });

    fireEvent.click(removeUnreadable);
    fireEvent.click(removeUnreadable);

    expect(onRemoveInvalidSaved).toHaveBeenCalledOnce();
    expectDialogActionsDisabled();

    await act(async () => pending.resolve(undefined));

    await waitFor(() => expect(removeUnreadable).toBeEnabled());
    expect(
      screen.getByRole("dialog", { name: "Load a saved project" }),
    ).toHaveAttribute("aria-busy", "false");
  });
});
