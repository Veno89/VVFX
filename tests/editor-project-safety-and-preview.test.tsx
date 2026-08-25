import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetPanel } from "../src/editor/components/AssetPanel";
import { PreviewPanel } from "../src/editor/components/PreviewPanel";
import { VfxEditor } from "../src/editor/VfxEditor";
import { createEmptyProject } from "../src/vfx/defaults";

const projectPersistence = vi.hoisted(() => ({
  clearRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  listProjects: vi.fn().mockResolvedValue([]),
  loadRecoveryDraft: vi.fn().mockResolvedValue(null),
  saveRecoveryDraft: vi.fn().mockResolvedValue(undefined),
  saveProject: vi.fn(async (project: unknown) => project),
}));

vi.mock("../src/persistence/projects", () => projectPersistence);

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

beforeEach(() => {
  projectPersistence.clearRecoveryDraft.mockClear();
  projectPersistence.listProjects.mockReset();
  projectPersistence.listProjects.mockResolvedValue([]);
  projectPersistence.loadRecoveryDraft.mockClear();
  projectPersistence.loadRecoveryDraft.mockResolvedValue(null);
  window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
});

describe("New project safety", () => {
  it("keeps a newer visible dialog above a slower dialog request", async () => {
    let resolveProjects!: (projects: never[]) => void;
    projectPersistence.listProjects.mockReturnValueOnce(
      new Promise<never[]>((resolve) => {
        resolveProjects = resolve;
      }),
    );
    render(<VfxEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));
    const saveAs = screen.getByRole("dialog", { name: "Save project as" });

    await act(async () => resolveProjects([]));

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
  it("dismisses random-seed help on pointer leave, blur, and appearance close", () => {
    renderPreview();
    const appearance = screen.getByTitle("Preview appearance");
    const helpText =
      "A seed lets you replay the exact same random version while adjusting settings.";

    fireEvent.click(appearance);
    const help = screen.getByRole("button", { name: `Help: ${helpText}` });
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
