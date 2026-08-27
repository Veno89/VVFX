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
import { AssetPanel } from "../src/editor/components/AssetPanel";
import { PreviewPanel } from "../src/editor/components/PreviewPanel";
import { VfxEditor } from "../src/editor/VfxEditor";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import { serializeProject, validateProject } from "../src/vfx/serialization";
import type { VfxAsset, VfxProject } from "../src/vfx/types";
import { validPngDataUrl } from "./fixtures/portableImages";

const projectPersistence = vi.hoisted(() => ({
  InvalidRecoveryDraftError: class InvalidRecoveryDraftError extends Error {
    constructor(reason: string) {
      super(`The recovery autosave is damaged and was preserved. ${reason}`);
      this.name = "InvalidRecoveryDraftError";
    }
  },
  clearRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  deleteInvalidProjectRecord: vi.fn().mockResolvedValue(undefined),
  deleteInvalidRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  inspectStoredProjects: vi.fn().mockResolvedValue({
    projects: [],
    invalidRecords: [],
    totalRecords: 0,
    excessRecords: 0,
  }),
  loadRecoveryDraft: vi.fn().mockResolvedValue(null),
  saveRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  saveProject: vi.fn(async (project: unknown) => project),
}));

const embeddedImageValidation = vi.hoisted(() => ({
  verifyEmbeddedAssetImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/persistence/projects", () => projectPersistence);
vi.mock("../src/editor/embeddedImageValidation", () => embeddedImageValidation);

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

beforeEach(() => {
  embeddedImageValidation.verifyEmbeddedAssetImages.mockReset();
  embeddedImageValidation.verifyEmbeddedAssetImages.mockResolvedValue(
    undefined,
  );
  projectPersistence.clearRecoveryDraft.mockClear();
  projectPersistence.deleteInvalidProjectRecord.mockClear();
  projectPersistence.deleteInvalidRecoveryDraft.mockClear();
  projectPersistence.inspectStoredProjects.mockReset();
  projectPersistence.inspectStoredProjects.mockResolvedValue({
    projects: [],
    invalidRecords: [],
    totalRecords: 0,
    excessRecords: 0,
  });
  projectPersistence.loadRecoveryDraft.mockClear();
  projectPersistence.loadRecoveryDraft.mockResolvedValue(null);
  projectPersistence.saveRecoveryDraft.mockClear();
  projectPersistence.saveProject.mockClear();
  window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
});

describe("New project safety", () => {
  it("rechecks unsaved work after an asynchronous project file read", async () => {
    let resolveText!: (text: string) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const imported = createEmptyProject("Imported later");
    const file = new File(["{}"], "delayed.vvfx", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn(() => textPromise),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = render(<VfxEditor />);
    const picker = container.querySelector<HTMLInputElement>(
      'input[accept=".vvfx,application/json"]',
    );
    if (!picker) throw new Error("Missing project import picker.");

    fireEvent.change(picker, { target: { files: [file] } });
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Edited while file was reading" },
    });
    await act(async () => resolveText(serializeProject(imported)));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue(
      "Edited while file was reading",
    );
  });

  it("does not activate an imported project whose embedded image cannot decode", async () => {
    const imported = createEmptyProject("Broken image import");
    imported.assets.push({
      id: "broken-upload",
      name: "Broken upload",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(2, 2),
      width: 2,
      height: 2,
      spriteSheet: null,
      atlasFrame: null,
    });
    embeddedImageValidation.verifyEmbeddedAssetImages.mockRejectedValueOnce(
      new Error(
        "The image “Broken upload” could not be decoded. Bad compressed payload.",
      ),
    );
    const file = new File([serializeProject(imported)], "broken.vvfx", {
      type: "application/json",
    });
    const { container } = render(<VfxEditor />);
    const picker = container.querySelector<HTMLInputElement>(
      'input[accept=".vvfx,application/json"]',
    );
    if (!picker) throw new Error("Missing project import picker.");

    fireEvent.change(picker, { target: { files: [file] } });

    const failure = await screen.findByText(
      /Broken upload.*Bad compressed payload/i,
    );
    expect(failure).toBeVisible();
    expect(failure.closest(".toast")).toHaveAttribute("role", "alert");
    expect(failure.closest(".toast")).toHaveClass("toast--error");
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue(
      "Untitled Effect",
    );
  });

  it("preserves unreadable recovery data until the user explicitly removes it", async () => {
    projectPersistence.loadRecoveryDraft.mockRejectedValue(
      new projectPersistence.InvalidRecoveryDraftError(
        "Recovery autosave is unreadable.",
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<VfxEditor />);

    await screen.findByText(/recovery autosave is damaged and was preserved/i);
    expect(projectPersistence.clearRecoveryDraft).not.toHaveBeenCalled();
    expect(projectPersistence.saveRecoveryDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(
      await screen.findByText("1 unreadable project save found"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove unreadable" }));

    await waitFor(() =>
      expect(
        projectPersistence.deleteInvalidRecoveryDraft,
      ).toHaveBeenCalledTimes(1),
    );
  });

  it("does not label a transient recovery storage error as corrupt data", async () => {
    projectPersistence.loadRecoveryDraft.mockRejectedValue(
      new Error("Recovery autosave could not be checked."),
    );

    render(<VfxEditor />);

    await screen.findByText("Recovery autosave could not be checked.");
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByRole("dialog", { name: "Load a saved project" });
    expect(screen.queryByText(/unreadable project save/i)).toBeNull();
    expect(
      projectPersistence.deleteInvalidRecoveryDraft,
    ).not.toHaveBeenCalled();
  });

  it("surfaces corrupt project records and removes them only after confirmation", async () => {
    const corruptKey = "corrupt-project";
    projectPersistence.inspectStoredProjects.mockResolvedValueOnce({
      projects: [],
      invalidRecords: [{ key: corruptKey, reason: "Unsafe project ID." }],
      totalRecords: 1,
      excessRecords: 0,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<VfxEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(
      await screen.findByText("1 unreadable project save found"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove unreadable" }));

    await waitFor(() =>
      expect(
        projectPersistence.deleteInvalidProjectRecord,
      ).toHaveBeenCalledWith(corruptKey),
    );
  });

  it("keeps a newer visible dialog above a slower dialog request", async () => {
    let resolveProjects!: (inspection: {
      projects: never[];
      invalidRecords: never[];
      totalRecords: number;
      excessRecords: number;
    }) => void;
    projectPersistence.inspectStoredProjects.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProjects = resolve;
      }),
    );
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));
    const saveAs = screen.getByRole("dialog", { name: "Save project as" });

    await act(async () =>
      resolveProjects({
        projects: [],
        invalidRecords: [],
        totalRecords: 0,
        excessRecords: 0,
      }),
    );

    const coveredProjects = document.querySelector<HTMLElement>(
      "[aria-labelledby='projects-title']",
    );
    expect(coveredProjects).toHaveAttribute("aria-hidden", "true");
    expect(coveredProjects).toHaveAttribute("inert");
    expect(saveAs).not.toHaveAttribute("aria-hidden");
    expect(saveAs).not.toHaveAttribute("inert");
    expect(saveAs).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByRole("dialog", { name: "Load a saved project" }),
    ).toContainElement(document.activeElement as HTMLElement);
  });

  it("leaves Space available to a focused control instead of toggling playback", () => {
    render(<VfxEditor />);

    const newProject = screen.getByRole("button", { name: "New" });
    newProject.focus();
    fireEvent.keyDown(newProject, { code: "Space", key: " " });

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("preserves the exact dirty project and its history when replacement is cancelled", () => {
    render(<VfxEditor />);

    const projectName = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(projectName, { target: { value: "First draft" } });
    fireEvent.change(projectName, { target: { value: "Second draft" } });

    const newProject = screen.getByRole("button", { name: "New" });
    newProject.focus();
    fireEvent.click(newProject);

    expect(
      screen.getByRole("alertdialog", { name: "Start a new project?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(newProject).toHaveFocus();

    expect(projectName).toHaveValue("Second draft");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(projectName).toHaveValue("First draft");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(projectName).toHaveValue("Second draft");
  });

  it("coalesces one focused field-editing session into one undo step", () => {
    render(<VfxEditor />);

    const projectName = screen.getByRole("textbox", { name: "Project name" });
    projectName.focus();
    fireEvent.change(projectName, { target: { value: "C" } });
    fireEvent.change(projectName, { target: { value: "Chain" } });
    fireEvent.change(projectName, { target: { value: "Chain lightning" } });
    fireEvent.blur(projectName);

    projectName.focus();
    fireEvent.change(projectName, {
      target: { value: "Chain lightning final" },
    });
    fireEvent.blur(projectName);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(projectName).toHaveValue("Chain lightning");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(projectName).toHaveValue("Untitled Effect");
  });

  it("does not merge a field edit with a focused popover that unmounted", () => {
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Timing plan" }));
    const notes = screen.getByRole("textbox", { name: "Timing plan notes" });
    expect(notes).toHaveFocus();
    fireEvent.change(notes, {
      target: { value: "0–90 ms lightning branches" },
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Turn feedback/i })).toBeNull();

    const projectName = screen.getByRole("textbox", { name: "Project name" });
    projectName.focus();
    fireEvent.change(projectName, { target: { value: "Storm cast" } });
    fireEvent.blur(projectName);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(projectName).toHaveValue("Untitled Effect");
    fireEvent.click(screen.getByRole("button", { name: "Timing plan" }));
    expect(
      screen.getByRole("textbox", { name: "Timing plan notes" }),
    ).toHaveValue("0–90 ms lightning branches");
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Timing plan" }));
    expect(
      screen.getByRole("textbox", { name: "Timing plan notes" }),
    ).toHaveValue("");
  });

  it("does not resurrect timing-plan notes after marker creation is undone", () => {
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Timing plan" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Timing plan notes" }),
      { target: { value: "0–90 ms branch flash" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create markers" }));
    expect(screen.queryByRole("dialog", { name: /Turn feedback/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Timing plan" }));
    expect(
      screen.getByRole("textbox", { name: "Timing plan notes" }),
    ).toHaveValue("");
  });

  it("replaces an accepted dirty project with a clean project and fresh history", () => {
    render(<VfxEditor />);

    const projectName = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(projectName, { target: { value: "Discard me" } });
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard changes and start new",
      }),
    );

    expect(projectName).toHaveValue("Untitled Effect");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
  });

  it("uses the same protected replacement flow from the guided build", () => {
    const nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<VfxEditor />);

    const projectName = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(projectName, { target: { value: "Guided draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Build your first shockwave/i }),
    );
    const guide = screen.getByRole("dialog", {
      name: "Build your first shockwave tutorial",
    });
    const createEmpty = screen.getByRole("button", {
      name: "Create empty project",
    });
    createEmpty.focus();
    fireEvent.click(createEmpty);

    expect(nativeConfirm).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("alertdialog", {
      name: "Start a new project?",
    });
    expect(confirmation.parentElement).toHaveClass("new-project-backdrop");
    expect(guide).toHaveAttribute("aria-hidden", "true");
    expect(guide).toHaveAttribute("inert");
    expect(projectName).toHaveValue("Guided draft");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(createEmpty).toHaveFocus();
    expect(guide).not.toHaveAttribute("aria-hidden");
    expect(guide).not.toHaveAttribute("inert");

    fireEvent.click(createEmpty);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard changes and start new",
      }),
    );
    expect(projectName).toHaveValue("Untitled Effect");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });

  it("moves a clean guided build directly to Continue", () => {
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Build your first shockwave/i }),
    );
    const createEmpty = screen.getByRole("button", {
      name: "Create empty project",
    });
    createEmpty.focus();
    fireEvent.click(createEmpty);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });
});

describe("Editor integrity mutations", () => {
  it("keeps a completed Save As successful when list refresh fails", async () => {
    projectPersistence.inspectStoredProjects.mockRejectedValueOnce(
      new Error("Saved-project index temporarily unavailable."),
    );
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Save As" }));
    const dialog = screen.getByRole("dialog", { name: "Save project as" });
    fireEvent.change(within(dialog).getByLabelText("Project name"), {
      target: { value: "Durable lightning copy" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save copy" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Save project as" }),
      ).toBeNull(),
    );
    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue(
      "Durable lightning copy",
    );
    const warning = await screen.findByText(
      /saved as .*Durable lightning copy.*list could not be refreshed/i,
    );
    expect(warning.closest(".toast")).toHaveClass("toast--warning");
  });

  it("adopts the canonical project returned by a regular save", async () => {
    const project = createEmptyProject("Canonical save");
    project.groups.push(createGroup("  Lightning group  "));
    projectPersistence.loadRecoveryDraft.mockResolvedValueOnce({
      id: "current",
      project,
      savedAt: new Date().toISOString(),
    });
    let finishSave!: () => void;
    projectPersistence.saveProject.mockImplementationOnce(
      (candidate: unknown) =>
        new Promise<VfxProject>((resolve) => {
          const source = candidate as VfxProject;
          finishSave = () =>
            resolve({
              ...source,
              groups: source.groups.map((group) => ({
                ...group,
                name: group.name.trim(),
              })),
            });
        }),
    );

    render(<VfxEditor />);
    await screen.findByRole("alertdialog", {
      name: "Recover your last editing session?",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore session" }));
    await screen.findByRole("button", { name: "Save" }, { timeout: 5_000 });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByTitle("Preview appearance"));
    fireEvent.click(screen.getByTitle("Show or hide the grid"));
    await act(async () => finishSave());
    await screen.findByText("Project saved in this browser.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(2),
    );

    const secondSave = projectPersistence.saveProject.mock.calls[1]?.[0] as
      VfxProject | undefined;
    expect(secondSave?.groups[0].name).toBe("Lightning group");
    expect(secondSave?.preview.showGrid).toBe(true);
  });

  it("pastes settings without creating a circular attachment", async () => {
    const project = createEmptyProject("Attachment paste");
    const parent = createLayer("animated", "Parent", "builtin-ring");
    const child = createLayer("animated", "Child", "builtin-spark");
    child.parentId = parent.id;
    project.layers.push(parent, child);
    projectPersistence.loadRecoveryDraft.mockResolvedValueOnce({
      id: "current",
      project,
      savedAt: new Date().toISOString(),
    });

    render(<VfxEditor />);
    await screen.findByRole("alertdialog", {
      name: "Recover your last editing session?",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore session" }));
    await screen.findByRole("button", { name: "Save" }, { timeout: 5_000 });

    fireEvent.click(screen.getByText("Child", { selector: "strong" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Copy layer settings" }),
    );
    fireEvent.click(screen.getByText("Parent", { selector: "strong" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Paste copied settings" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalled(),
    );
    const saved = projectPersistence.saveProject.mock.calls.at(-1)?.[0] as
      VfxProject | undefined;
    expect(
      saved?.layers.find((layer) => layer.id === parent.id)?.parentId,
    ).toBe(null);
    expect(saved && validateProject(saved).ok).toBe(true);
  });

  it("restores layer-deletion dependencies through Undo and Redo", async () => {
    const project = createEmptyProject("Layer deletion history");
    const parent = createLayer("animated", "Attachment parent", "builtin-ring");
    const child = createLayer("animated", "Attached child", "builtin-spark");
    const source = createLayer("animated", "Event source", "builtin-flash");
    const incomingEvent = {
      id: "incoming-delete-event",
      enabled: true,
      trigger: "finish" as const,
      percentage: 0.5,
      action: "play" as const,
      targetLayerId: parent.id,
      chance: 1,
      maxTriggers: 32,
    };
    parent.startMode = "triggered";
    child.parentId = parent.id;
    source.events = [incomingEvent];
    project.layers.push(parent, child, source);
    projectPersistence.loadRecoveryDraft.mockResolvedValueOnce({
      id: "current",
      project,
      savedAt: new Date().toISOString(),
    });

    render(<VfxEditor />);
    await screen.findByRole("alertdialog", {
      name: "Recover your last editing session?",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore session" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Settings for Attachment parent",
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Attachment parent" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByRole("complementary", {
        name: "Settings for Attached child",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1),
    );
    const deleted = projectPersistence.saveProject.mock.calls[0]?.[0] as
      VfxProject | undefined;
    expect(deleted?.layers.some((layer) => layer.id === parent.id)).toBe(false);
    expect(
      deleted?.layers.find((layer) => layer.id === child.id)?.parentId,
    ).toBe(null);
    expect(
      deleted?.layers.find((layer) => layer.id === source.id)?.events,
    ).toEqual([]);
    expect(deleted && validateProject(deleted).ok).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole("complementary", {
        name: "Settings for Attached child",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(2),
    );
    const restored = projectPersistence.saveProject.mock.calls[1]?.[0] as
      VfxProject | undefined;
    expect(restored?.layers.find((layer) => layer.id === parent.id)).toEqual(
      parent,
    );
    expect(
      restored?.layers.find((layer) => layer.id === child.id)?.parentId,
    ).toBe(parent.id);
    expect(
      restored?.layers.find((layer) => layer.id === source.id)?.events,
    ).toEqual([incomingEvent]);
    expect(restored && validateProject(restored).ok).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(
      screen.getByRole("complementary", {
        name: "Settings for Attached child",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(3),
    );
    const redone = projectPersistence.saveProject.mock.calls[2]?.[0] as
      VfxProject | undefined;
    expect(redone?.layers.some((layer) => layer.id === parent.id)).toBe(false);
    expect(
      redone?.layers.find((layer) => layer.id === child.id)?.parentId,
    ).toBe(null);
    expect(
      redone?.layers.find((layer) => layer.id === source.id)?.events,
    ).toEqual([]);
    expect(redone && validateProject(redone).ok).toBe(true);
  });

  it("routes Inspector asset edits through dependent mask cleanup", async () => {
    const project = createEmptyProject("Shared asset edit");
    const mask: VfxAsset = {
      id: "uploaded-mask",
      name: "Uploaded mask",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(32, 32),
      width: 32,
      height: 32,
      spriteSheet: null,
      alphaMask: { columns: 1, rows: 1, alpha: [255] },
    };
    project.assets.push(mask);
    const first = createLayer("burst", "First masked burst", mask.id);
    const second = createLayer("burst", "Second masked burst", "builtin-spark");
    for (const layer of [first, second]) {
      layer.spawn.shape = "mask";
      layer.spawn.maskAssetId = mask.id;
      layer.appearance.effects.visualMask = {
        ...layer.appearance.effects.visualMask,
        enabled: true,
        maskAssetId: mask.id,
      };
    }
    project.layers.push(first, second);
    projectPersistence.loadRecoveryDraft.mockResolvedValueOnce({
      id: "current",
      project,
      savedAt: new Date().toISOString(),
    });

    render(<VfxEditor />);
    await screen.findByRole("alertdialog", {
      name: "Recover your last editing session?",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore session" }));
    await screen.findByRole("button", { name: "Save" }, { timeout: 5_000 });
    fireEvent.click(screen.getByLabelText("Use as a sprite sheet"));
    await waitFor(
      () =>
        expect(screen.getByLabelText("Use as a sprite sheet")).toBeChecked(),
      { timeout: 5_000 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalled(),
    );
    const saved = projectPersistence.saveProject.mock.calls.at(-1)?.[0] as
      VfxProject | undefined;
    expect(
      saved?.assets.find((asset) => asset.id === mask.id)?.spriteSheet,
    ).not.toBeNull();
    for (const layer of saved?.layers ?? []) {
      expect(layer.appearance.effects.visualMask).toMatchObject({
        enabled: false,
        maskAssetId: null,
      });
      expect(layer.type === "burst" && layer.spawn).toMatchObject({
        shape: "point",
        maskAssetId: null,
      });
    }
    expect(saved && validateProject(saved).ok).toBe(true);
  });

  it("preflights dependent asset removal and restores it with one Undo", async () => {
    const project = createEmptyProject("Dependency-aware removal");
    const asset: VfxAsset = {
      id: "shared-removal-image",
      name: "Shared removal image",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(32, 32),
      width: 32,
      height: 32,
      spriteSheet: null,
      alphaMask: { columns: 1, rows: 1, alpha: [255] },
    };
    const layer = createLayer("burst", "Dependent burst", asset.id);
    layer.spawn.shape = "mask";
    layer.spawn.maskAssetId = asset.id;
    layer.appearance.effects.visualMask = {
      ...layer.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: asset.id,
    };
    project.assets.push(asset);
    project.layers.push(layer);
    projectPersistence.loadRecoveryDraft.mockResolvedValueOnce({
      id: "current",
      project,
      savedAt: new Date().toISOString(),
    });

    render(<VfxEditor />);
    await screen.findByRole("alertdialog", {
      name: "Recover your last editing session?",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore session" }));
    await screen.findByRole("button", { name: "Save" }, { timeout: 5_000 });

    fireEvent.click(
      screen.getByRole("button", { name: "Select Shared removal image" }),
    );
    expect(
      screen.getByRole("button", { name: "Select Shared removal image" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Shared removal image" }),
    );
    const removal = screen.getByRole("alertdialog", {
      name: /Remove .*Shared removal image/i,
    });
    expect(removal).toHaveTextContent("used by 1 layer");
    expect(removal).toHaveTextContent("Clear artwork from 1 layer");
    expect(removal).toHaveTextContent(
      "Reset silhouette spawning to one point on 1 layer",
    );
    expect(removal).toHaveTextContent("Turn off visual masking on 1 layer");
    fireEvent.click(
      within(removal).getByRole("button", { name: "Remove image" }),
    );

    const removalNotice = await screen.findByText(
      /updated 1 dependent layer.*Undo restores both/i,
    );
    expect(removalNotice.closest(".toast")).toHaveAttribute("role", "status");
    expect(removalNotice.closest(".toast")).toHaveClass("toast--warning");
    expect(
      screen.queryByRole("button", { name: "Remove Shared removal image" }),
    ).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-asset-select"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1),
    );
    const removed = projectPersistence.saveProject.mock.calls[0]?.[0] as
      VfxProject | undefined;
    expect(removed?.assets.some((candidate) => candidate.id === asset.id)).toBe(
      false,
    );
    expect(removed?.layers[0]).toMatchObject({ assetId: null });
    expect(removed?.layers[0].appearance.effects.visualMask).toMatchObject({
      enabled: false,
      maskAssetId: null,
    });
    expect(
      removed?.layers[0].type === "burst" && removed.layers[0].spawn,
    ).toMatchObject({
      shape: "point",
      maskAssetId: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(2),
    );
    const restored = projectPersistence.saveProject.mock.calls[1]?.[0] as
      VfxProject | undefined;
    expect(
      restored?.assets.some((candidate) => candidate.id === asset.id),
    ).toBe(true);
    expect(restored?.layers[0]).toMatchObject({ assetId: asset.id });
    expect(restored?.layers[0].appearance.effects.visualMask).toMatchObject({
      enabled: true,
      maskAssetId: asset.id,
    });
    expect(
      restored?.layers[0].type === "burst" && restored.layers[0].spawn,
    ).toMatchObject({
      shape: "mask",
      maskAssetId: asset.id,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Select Shared removal image" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(
      screen.queryByRole("button", { name: "Select Shared removal image" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(
      within(screen.getByRole("menu", { name: "Add layer" })).getByRole(
        "menuitem",
        { name: /^Animated/ },
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(3),
    );
    const redone = projectPersistence.saveProject.mock.calls[2]?.[0] as
      VfxProject | undefined;
    const addedLayer = redone?.layers.at(-1);
    expect(redone?.assets.some((candidate) => candidate.id === asset.id)).toBe(
      false,
    );
    expect(addedLayer?.assetId).not.toBe(asset.id);
    expect(
      redone?.assets.some((candidate) => candidate.id === addedLayer?.assetId),
    ).toBe(true);
    expect(redone && validateProject(redone).ok).toBe(true);
  }, 15_000);
});

function renderPreview() {
  const project = createEmptyProject();
  return render(
    <PreviewPanel
      project={project}
      time={0}
      playing={false}
      speed={0.5}
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
}

describe("Preview controls", () => {
  it("recreates the Phaser preview at an explicit restart boundary", () => {
    const project = createEmptyProject();
    const panel = (restartRevision: number) => (
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
        restartRevision={restartRevision}
        onSpeedChange={vi.fn()}
      />
    );
    const preview = render(panel(0));
    const firstCanvas = screen.getByLabelText("Effect preview");

    preview.rerender(panel(1));

    expect(screen.getByLabelText("Effect preview")).not.toBe(firstCanvas);
  });

  it("dismisses random-seed help on pointer leave, blur, and appearance close", () => {
    renderPreview();
    const appearance = screen.getByTitle("Preview appearance");
    const helpText =
      "A seed lets you replay the exact same random version while adjusting settings.";

    fireEvent.click(appearance);
    const help = screen.getByRole("button", { name: "Help for Random seed" });
    const seed = screen.getByRole("spinbutton");
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();

    fireEvent.pointerEnter(help);
    expect(screen.getByText(helpText)).toBeInTheDocument();
    fireEvent.pointerLeave(help);
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();
    expect(seed).toBeVisible();

    fireEvent.focus(help);
    expect(screen.getByText(helpText)).toBeInTheDocument();
    fireEvent.blur(help);
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();

    fireEvent.pointerEnter(help);
    fireEvent.click(appearance);
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();
    fireEvent.click(appearance);
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();
  });

  it("exposes selected grid and playback-speed choices", () => {
    const project = createEmptyProject();
    project.preview.showGrid = true;
    render(
      <PreviewPanel
        project={project}
        time={0}
        playing={false}
        speed={0.5}
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

    expect(screen.getByTitle("Show or hide the grid")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "0.5×" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "1×" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("exposes the selected asset choice", () => {
    const project = createEmptyProject();
    const selected = project.assets[0];
    render(
      <AssetPanel
        assets={project.assets}
        selectedId={selected.id}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onRename={vi.fn()}
        onChangeAsset={vi.fn()}
        onRemove={vi.fn()}
        onCreateLayer={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: `Select ${selected.name}` }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: `Select ${project.assets[1].name}`,
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
