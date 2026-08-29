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
import { VfxEditor } from "../src/editor/VfxEditor";
import { createCurrentProjectSummary } from "../src/persistence/projectSummaries";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import {
  createTemplateFromProject,
  serializeTemplatePack,
} from "../src/vfx/templates";
import type { VfxProject } from "../src/vfx/types";

const projectPersistence = vi.hoisted(() => ({
  InvalidRecoveryDraftError: class InvalidRecoveryDraftError extends Error {
    constructor(reason: string) {
      super(`The recovery autosave is damaged and was preserved. ${reason}`);
      this.name = "InvalidRecoveryDraftError";
    }
  },
  clearRecoveryDraft: vi.fn(),
  deleteInvalidProjectRecord: vi.fn(),
  deleteInvalidRecoveryDraft: vi.fn(),
  deleteProject: vi.fn(),
  inspectStoredProjects: vi.fn(),
  loadProject: vi.fn(),
  loadRecoveryDraft: vi.fn(),
  saveRecoveryDraft: vi.fn(),
  saveProject: vi.fn(),
}));

const templatePersistence = vi.hoisted(() => ({
  deleteInvalidTemplateRecord: vi.fn(),
  deleteTemplate: vi.fn(),
  inspectStoredTemplates: vi.fn(),
  saveTemplate: vi.fn(),
  saveTemplates: vi.fn(),
}));

const embeddedImageValidation = vi.hoisted(() => ({
  verifyEmbeddedAssetImages: vi.fn(),
}));

vi.mock("../src/persistence/projects", () => projectPersistence);
vi.mock("../src/persistence/templates", () => templatePersistence);
vi.mock("../src/editor/embeddedImageValidation", () => embeddedImageValidation);
vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

const projectInspection = (projects: VfxProject[]) => ({
  summaries: projects.map((project) => createCurrentProjectSummary(project)),
  invalidRecords: [],
  totalRecords: projects.length,
  excessRecords: 0,
  aggregateBytes: 0,
  page: 0,
  pageSize: 20,
  totalPages: 1,
  totalValidRecords: projects.length,
});

const templateInspection = (
  templates: unknown[],
  invalidRecords: { key: IDBValidKey; reason: string }[] = [],
  excessRecords = 0,
) => ({
  templates,
  invalidRecords,
  totalRecords: templates.length + invalidRecords.length,
  excessRecords,
});

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

function projectWithLayer(name: string): VfxProject {
  const project = createEmptyProject(name);
  project.layers.push(createLayer("animated", "Lightning", "builtin-flash"));
  return project;
}

async function restoreProject(project: VfxProject) {
  projectPersistence.loadRecoveryDraft.mockResolvedValueOnce({
    id: "current",
    project,
    savedAt: new Date().toISOString(),
  });
  render(<VfxEditor />);
  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: "Restore session" },
      { timeout: 5_000 },
    ),
  );
  // Full-suite UI files share CPU-heavy jsdom workers. Wait for the recovery
  // modal to finish its validated project handoff instead of assuming the
  // default one-second query window is enough under that contention.
  await screen.findByRole("button", { name: "Save" }, { timeout: 5_000 });
}

beforeEach(() => {
  projectPersistence.clearRecoveryDraft
    .mockReset()
    .mockResolvedValue(undefined);
  projectPersistence.deleteInvalidProjectRecord
    .mockReset()
    .mockResolvedValue(undefined);
  projectPersistence.deleteInvalidRecoveryDraft
    .mockReset()
    .mockResolvedValue(undefined);
  projectPersistence.deleteProject.mockReset().mockResolvedValue(undefined);
  projectPersistence.inspectStoredProjects
    .mockReset()
    .mockResolvedValue(projectInspection([]));
  projectPersistence.loadRecoveryDraft.mockReset().mockResolvedValue(null);
  projectPersistence.loadProject.mockReset();
  projectPersistence.saveRecoveryDraft.mockReset().mockResolvedValue(undefined);
  projectPersistence.saveProject
    .mockReset()
    .mockImplementation(async (project: unknown) => project);

  templatePersistence.deleteInvalidTemplateRecord
    .mockReset()
    .mockResolvedValue(undefined);
  templatePersistence.deleteTemplate.mockReset().mockResolvedValue(undefined);
  templatePersistence.inspectStoredTemplates
    .mockReset()
    .mockResolvedValue(templateInspection([]));
  templatePersistence.saveTemplate
    .mockReset()
    .mockImplementation(async (template: unknown) => template);
  templatePersistence.saveTemplates.mockReset().mockResolvedValue({
    added: 0,
    alreadyHere: 0,
    importedAsCopy: 0,
    committedTemplates: [],
  });
  embeddedImageValidation.verifyEmbeddedAssetImages
    .mockReset()
    .mockResolvedValue(undefined);
  window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("truthful durable mutation feedback", () => {
  it("keeps a regular save successful when recovery cleanup fails without loading the saved library", async () => {
    await restoreProject(projectWithLayer("Durable save"));
    projectPersistence.clearRecoveryDraft.mockRejectedValue(
      new Error("Recovery cleanup unavailable."),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        /project saved, but .*recovery draft could not be cleared/i,
      ),
    ).toBeVisible();
    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1);
    expect(projectPersistence.inspectStoredProjects).not.toHaveBeenCalled();
    expect(screen.getByText("Saved")).toBeVisible();
    expect(screen.queryByText(/project could not be saved/i)).toBeNull();
  });

  it("serializes recovery autosaves and keeps only the latest pending snapshot", async () => {
    const firstAutosave = deferred<void>();
    const latestAutosave = deferred<void>();
    projectPersistence.saveRecoveryDraft
      .mockImplementationOnce(() => firstAutosave.promise)
      .mockImplementationOnce(() => latestAutosave.promise);
    await restoreProject(projectWithLayer("Autosave A"));

    await waitFor(
      () =>
        expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(1),
      { timeout: 5_000 },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Autosave B" },
    });
    await act(
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Autosave C" },
    });
    await act(
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    );
    expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstAutosave.resolve(undefined);
      await firstAutosave.promise;
    });
    await waitFor(() =>
      expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(2),
    );
    const latestSnapshot = projectPersistence.saveRecoveryDraft.mock
      .calls[1]?.[0] as VfxProject | undefined;
    expect(latestSnapshot?.metadata.name).toBe("Autosave C");

    await act(async () => {
      latestAutosave.resolve(undefined);
      await latestAutosave.promise;
    });
  });

  it("preserves a newer queued recovery snapshot when an older project save finishes", async () => {
    const activeRecovery = deferred<void>();
    const latestRecovery = deferred<void>();
    const projectSave = deferred<VfxProject>();
    projectPersistence.saveRecoveryDraft
      .mockImplementationOnce(() => activeRecovery.promise)
      .mockImplementationOnce(() => latestRecovery.promise);
    projectPersistence.saveProject.mockImplementationOnce(
      () => projectSave.promise,
    );
    await restoreProject(projectWithLayer("Saved version B"));

    await waitFor(
      () =>
        expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(1),
      { timeout: 5_000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1),
    );
    const savedSnapshot = projectPersistence.saveProject.mock.calls[0]?.[0] as
      VfxProject | undefined;

    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Recovery version C" },
    });
    await act(
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    );
    expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      projectSave.resolve(savedSnapshot!);
      await projectSave.promise;
      await Promise.resolve();
      expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(1);
      activeRecovery.resolve(undefined);
      await activeRecovery.promise;
    });
    await waitFor(() =>
      expect(projectPersistence.saveRecoveryDraft).toHaveBeenCalledTimes(2),
    );
    const latestSnapshot = projectPersistence.saveRecoveryDraft.mock
      .calls[1]?.[0] as VfxProject | undefined;
    expect(latestSnapshot?.metadata.name).toBe("Recovery version C");

    await act(async () => {
      latestRecovery.resolve(undefined);
      await latestRecovery.promise;
    });
  }, 15_000);

  it("queues the latest project snapshot and serializes repeated Save shortcuts", async () => {
    const firstSave = deferred<VfxProject>();
    const secondSave = deferred<VfxProject>();
    projectPersistence.saveProject
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);
    await restoreProject(projectWithLayer("Version A"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1),
    );
    const firstSnapshot = projectPersistence.saveProject.mock.calls[0][0] as
      VfxProject | undefined;
    expect(firstSnapshot?.metadata.name).toBe("Version A");

    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Version B" },
    });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(
      await screen.findByText(/latest changes will save next/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve(firstSnapshot!);
      await firstSave.promise;
    });
    await waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(2),
    );
    const secondSnapshot = projectPersistence.saveProject.mock.calls[1][0] as
      VfxProject | undefined;
    expect(secondSnapshot?.metadata.name).toBe("Version B");

    await act(async () => {
      secondSave.resolve(secondSnapshot!);
      await secondSave.promise;
    });
    expect(
      await screen.findByText("Project saved in this browser."),
    ).toBeVisible();
    expect(screen.getByText("Saved")).toBeVisible();
    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(2);
  });

  it("continues with a queued latest save after the active save fails", async () => {
    const firstSave = deferred<VfxProject>();
    const secondSave = deferred<VfxProject>();
    projectPersistence.saveProject
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);
    await restoreProject(projectWithLayer("Retry A"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Retry B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await act(async () => {
      firstSave.reject(new Error("First write failed."));
      await firstSave.promise.catch(() => undefined);
    });
    await waitFor(() =>
      expect(projectPersistence.saveProject).toHaveBeenCalledTimes(2),
    );
    const secondSnapshot = projectPersistence.saveProject.mock.calls[1][0] as
      VfxProject | undefined;
    expect(secondSnapshot?.metadata.name).toBe("Retry B");

    await act(async () => {
      secondSave.resolve(secondSnapshot!);
      await secondSave.promise;
    });
    expect(
      await screen.findByText("Project saved in this browser."),
    ).toBeVisible();
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("keeps project duplicates and deletes visible when their refresh fails", async () => {
    const source = projectWithLayer("Stored lightning");
    projectPersistence.loadProject.mockResolvedValue(source);
    projectPersistence.inspectStoredProjects
      .mockResolvedValueOnce(projectInspection([source]))
      .mockRejectedValue(new Error("Project index unavailable."));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Load a saved project",
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Duplicate Stored lightning",
      }),
    );

    expect(
      await within(dialog).findByText("Stored lightning copy"),
    ).toBeVisible();
    expect(
      await screen.findByText(
        /duplicated .*Stored lightning.*saved-project list could not be refreshed/i,
      ),
    ).toBeVisible();
    expect(projectPersistence.saveProject).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Stored lightning" }),
    );
    await waitFor(() =>
      expect(within(dialog).queryByText("Stored lightning")).toBeNull(),
    );
    expect(
      await screen.findByText(
        /deleted .*Stored lightning.*saved-project list could not be refreshed/i,
      ),
    ).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(projectPersistence.deleteProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/project could not be duplicated/i)).toBeNull();
    expect(screen.queryByText(/project could not be removed/i)).toBeNull();
  });

  it("keeps template save, rename, duplicate, and delete mutations optimistic", async () => {
    const project = projectWithLayer("Reusable lightning");
    templatePersistence.inspectStoredTemplates
      .mockResolvedValueOnce(templateInspection([]))
      .mockRejectedValue(new Error("Template index unavailable."));
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Renamed bolt");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await restoreProject(project);

    fireEvent.click(screen.getByRole("button", { name: "Templates" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Effect templates",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save current effect" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );

    const savedList = await within(dialog).findByRole("list", {
      name: "Saved effect templates",
    });
    expect(
      await within(savedList).findByText("Reusable lightning"),
    ).toBeVisible();
    expect(
      await screen.findByText(
        /saved .*Reusable lightning.*template list could not be refreshed/i,
      ),
    ).toBeVisible();
    expect(templatePersistence.saveTemplate).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Rename Reusable lightning",
      }),
    );
    expect(await within(savedList).findByText("Renamed bolt")).toBeVisible();
    expect(
      await screen.findByText(
        /renamed template to .*Renamed bolt.*template list could not be refreshed/i,
      ),
    ).toBeVisible();
    expect(prompt).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Duplicate Renamed bolt" }),
    );
    expect(
      await within(savedList).findByText("Renamed bolt copy"),
    ).toBeVisible();
    expect(
      await screen.findByText(
        /duplicated .*Renamed bolt copy.*template list could not be refreshed/i,
      ),
    ).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Renamed bolt copy" }),
    );
    await waitFor(() =>
      expect(within(savedList).queryByText("Renamed bolt copy")).toBeNull(),
    );
    expect(
      await screen.findByText(
        /deleted .*Renamed bolt copy.*template list could not be refreshed/i,
      ),
    ).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(templatePersistence.saveTemplate).toHaveBeenCalledTimes(3);
    expect(templatePersistence.deleteTemplate).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("keeps committed template imports visible when the follow-up refresh fails", async () => {
    const source = projectWithLayer("Imported source");
    const importedTemplate = createTemplateFromProject(
      source,
      "Imported lightning",
    );
    templatePersistence.inspectStoredTemplates
      .mockResolvedValueOnce(templateInspection([]))
      .mockRejectedValueOnce(new Error("Template index unavailable."));
    templatePersistence.saveTemplates.mockResolvedValueOnce({
      added: 1,
      alreadyHere: 0,
      importedAsCopy: 0,
      committedTemplates: [importedTemplate],
    });
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Templates" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Effect templates",
    });
    const picker = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    if (!picker) throw new Error("Missing template import picker.");
    const file = new File(
      [serializeTemplatePack([importedTemplate])],
      "shared.vvfx-template",
      {
        type: "application/json",
      },
    );
    Object.defineProperty(file, "text", {
      configurable: true,
      value: vi
        .fn()
        .mockResolvedValue(serializeTemplatePack([importedTemplate])),
    });
    fireEvent.change(picker, { target: { files: [file] } });

    const savedList = await within(dialog).findByRole("list", {
      name: "Saved effect templates",
    });
    expect(
      await within(savedList).findByText("Imported lightning"),
    ).toBeVisible();
    expect(
      await within(dialog).findByText(
        /Import complete: 1 added.*0 already here.*0 imported as copies/i,
      ),
    ).toBeVisible();
    expect(
      await screen.findByText(/changes are saved.*no retry is needed/i),
    ).toBeVisible();
    expect(templatePersistence.saveTemplates).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByText(/could not be imported/i)).toBeNull();
  });

  it("keeps each committed unreadable-template deletion visible after a later deletion fails", async () => {
    const invalidRecords = [
      { key: "damaged-a", reason: "Broken A" },
      { key: "damaged-b", reason: "Broken B" },
    ];
    templatePersistence.inspectStoredTemplates.mockResolvedValueOnce(
      templateInspection([], invalidRecords),
    );
    templatePersistence.deleteInvalidTemplateRecord
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Second record stayed locked."));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Templates" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Effect templates",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove unreadable" }),
    );

    expect(
      await within(dialog).findByText(
        /Removed 1 unreadable template before cleanup stopped.*1 template remains unreadable.*Second record stayed locked/i,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText("1 unreadable template found"),
    ).toBeVisible();
    expect(
      templatePersistence.deleteInvalidTemplateRecord,
    ).toHaveBeenCalledTimes(2);
    expect(templatePersistence.inspectStoredTemplates).toHaveBeenCalledTimes(1);
  });

  it("reports unreadable-template cleanup as committed when only its refresh fails", async () => {
    const invalidRecords = [
      { key: "damaged-a", reason: "Broken A" },
      { key: "damaged-b", reason: "Broken B" },
    ];
    templatePersistence.inspectStoredTemplates
      .mockResolvedValueOnce(templateInspection([], invalidRecords))
      .mockRejectedValueOnce(new Error("Template index unavailable."));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Templates" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Effect templates",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove unreadable" }),
    );

    expect(
      await screen.findByText(
        /Removed 2 unreadable templates, but the template list could not be refreshed yet/i,
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        within(dialog).queryByText(/unreadable templates found/i),
      ).toBeNull(),
    );
    expect(
      templatePersistence.deleteInvalidTemplateRecord,
    ).toHaveBeenCalledTimes(2);
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});
