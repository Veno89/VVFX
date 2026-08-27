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
import { TemplateLibraryDialog } from "../src/editor/components/TemplateLibraryDialog";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { createTemplateFromProject } from "../src/vfx/templates";

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

function savedTemplate() {
  const project = createEmptyProject("Saved burst source");
  project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
  return createTemplateFromProject(project, "Saved burst");
}

function renderTemplateLibrary(
  overrides: Partial<ComponentProps<typeof TemplateLibraryDialog>> = {},
) {
  const template = savedTemplate();
  const props: ComponentProps<typeof TemplateLibraryDialog> = {
    projectName: "Current effect",
    canSaveCurrent: true,
    templates: [template],
    onSaveCurrent: vi.fn().mockResolvedValue(undefined),
    onInsert: vi.fn(),
    onInsertBuiltIn: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDuplicate: vi.fn().mockResolvedValue(undefined),
    onExportOne: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onImport: vi.fn().mockResolvedValue({
      added: 0,
      alreadyHere: 0,
      importedAsCopy: 0,
    }),
    onExport: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<TemplateLibraryDialog {...props} />);
  return { props, template };
}

function expectDialogActionsDisabled() {
  const dialog = screen.getByRole("dialog", { name: "Effect templates" });
  for (const button of within(dialog).getAllByRole("button"))
    expect(button).toBeDisabled();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Template Library async mutation locking", () => {
  it("locks duplicate synchronously, ignores dismissal, and unlocks after resolve", async () => {
    const pending = deferred<void>();
    const onDuplicate = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const { template } = renderTemplateLibrary({ onDuplicate, onClose });
    const duplicate = screen.getByRole("button", {
      name: "Duplicate Saved burst",
    });

    fireEvent.click(duplicate);
    fireEvent.click(duplicate);

    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledWith(template);
    expectDialogActionsDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    const dialog = screen.getByRole("dialog", { name: "Effect templates" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });

    await waitFor(() => expect(duplicate).toBeEnabled());
    expect(
      screen.getByRole("button", { name: "Close template library" }),
    ).toBeEnabled();
  });

  it("locks delete against double activation and reports rejection before unlocking", async () => {
    const pending = deferred<void>();
    const onDelete = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { template } = renderTemplateLibrary({ onDelete, onClose });
    const remove = screen.getByRole("button", {
      name: "Delete Saved burst",
    });

    fireEvent.click(remove);
    fireEvent.click(remove);

    expect(confirm).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(template);
    expectDialogActionsDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    const dialog = screen.getByRole("dialog", { name: "Effect templates" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();

    await act(async () => {
      pending.reject(new Error("Template delete failed safely"));
      await pending.promise.catch(() => undefined);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Template delete failed safely",
    );
    await waitFor(() => expect(remove).toBeEnabled());
    expect(
      screen.getByRole("button", { name: "Close template library" }),
    ).toBeEnabled();
  });
});
