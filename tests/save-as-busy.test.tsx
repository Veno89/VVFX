import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveAsDialog } from "../src/editor/components/ProjectSafetyDialogs";
import { VfxEditor } from "../src/editor/VfxEditor";
import type { VfxProject } from "../src/vfx/types";

const projectPersistence = vi.hoisted(() => ({
  InvalidRecoveryDraftError: class InvalidRecoveryDraftError extends Error {},
  clearRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  deleteInvalidProjectRecord: vi.fn().mockResolvedValue(undefined),
  deleteInvalidRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  inspectStoredProjects: vi.fn().mockResolvedValue({
    summaries: [],
    invalidRecords: [],
    totalRecords: 0,
    excessRecords: 0,
    aggregateBytes: 0,
    page: 0,
    pageSize: 20,
    totalPages: 1,
    totalValidRecords: 0,
  }),
  loadProject: vi.fn(),
  loadRecoveryDraft: vi.fn().mockResolvedValue(null),
  saveRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  saveProject: vi.fn(async (project: unknown) => project),
}));

vi.mock("../src/persistence/projects", () => projectPersistence);
vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

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

beforeEach(() => {
  projectPersistence.inspectStoredProjects.mockReset();
  projectPersistence.inspectStoredProjects.mockResolvedValue({
    summaries: [],
    invalidRecords: [],
    totalRecords: 0,
    excessRecords: 0,
    aggregateBytes: 0,
    page: 0,
    pageSize: 20,
    totalPages: 1,
    totalValidRecords: 0,
  });
  projectPersistence.loadRecoveryDraft.mockReset();
  projectPersistence.loadRecoveryDraft.mockResolvedValue(null);
  projectPersistence.saveProject.mockReset();
  projectPersistence.saveProject.mockImplementation(async (project) => project);
  window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SaveAsDialog pending mutation lock", () => {
  it("locks synchronously against duplicate submission and dismissal", async () => {
    const pending = deferred<void>();
    const onSave = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    render(
      <SaveAsDialog
        suggestedName="Chain lightning copy"
        onSave={onSave}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Save project as" });
    const input = screen.getByRole("textbox", { name: "Project name" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const close = screen.getByRole("button", { name: "Close Save As" });
    const submit = screen.getByRole("button", { name: "Save copy" });
    const form = submit.closest("form");
    const backdrop = dialog.parentElement;
    expect(form).not.toBeNull();
    expect(backdrop).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("Chain lightning copy");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(input).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(close).toBeDisabled();
    expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(backdrop!);
    fireEvent.click(cancel);
    fireEvent.click(close);

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve());

    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"));
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save copy" })).toBeEnabled();
  });

  it("keeps the dialog open and unlocks with an alert after rejection", async () => {
    const pending = deferred<void>();
    const onSave = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    render(
      <SaveAsDialog
        suggestedName="Rejected copy"
        onSave={onSave}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Save project as" });
    fireEvent.click(screen.getByRole("button", { name: "Save copy" }));
    await act(async () =>
      pending.reject(new Error("Browser storage is unavailable")),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Browser storage is unavailable");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("textbox", { name: "Project name" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save copy" })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor inert while saving and activates the stored copy once", async () => {
    const pending = deferred<VfxProject>();
    projectPersistence.saveProject.mockImplementationOnce(
      () => pending.promise,
    );
    render(<VfxEditor />);

    const originalName = screen.getByRole("textbox", {
      name: "Project name",
    });
    expect(originalName).toHaveValue("Untitled Effect");
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    const dialog = screen.getByRole("dialog", { name: "Save project as" });
    const copyName = within(dialog).getByRole("textbox", {
      name: "Project name",
    });
    fireEvent.change(copyName, { target: { value: "Storm fork" } });
    const form = copyName.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1);
    const submittedCopy = projectPersistence.saveProject.mock.calls[0]?.[0] as
      VfxProject | undefined;
    expect(submittedCopy?.metadata.name).toBe("Storm fork");
    expect(dialog).toHaveAttribute("aria-busy", "true");

    const inertEditorBranch = originalName.closest("[inert]");
    expect(inertEditorBranch).not.toBeNull();
    originalName.focus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: "x" });
    expect(originalName).toHaveValue("Untitled Effect");

    const storedCopy = {
      ...submittedCopy!,
      metadata: {
        ...submittedCopy!.metadata,
        name: "Canonical storm fork",
      },
    };
    await act(async () => pending.resolve(storedCopy));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Save project as" }),
      ).toBeNull(),
    );
    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1);
    expect(originalName).toHaveValue("Canonical storm fork");
    expect(
      screen.getByText(/Saved as .*Canonical storm fork/i),
    ).toBeInTheDocument();
  });
});
