import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VfxEditor } from "../src/editor/VfxEditor";

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

const embeddedImageValidation = vi.hoisted(() => ({
  verifyEmbeddedAssetImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/persistence/projects", () => projectPersistence);
vi.mock("../src/editor/embeddedImageValidation", () => embeddedImageValidation);

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: ({ restartRevision = 0 }: { restartRevision?: number }) => (
    <canvas
      aria-label="Effect preview"
      data-restart-revision={restartRevision}
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("first-run start choices", () => {
  it("offers starters over an empty preview and inserts one on click", async () => {
    window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
    render(<VfxEditor />);

    const start = await screen.findByRole("region", {
      name: "Make something move",
    });
    expect(
      within(start).getByRole("button", { name: /Build my first effect/ }),
    ).toBeVisible();
    fireEvent.click(within(start).getByRole("button", { name: /Fire impact/ }));

    expect(
      screen.queryByRole("region", { name: "Make something move" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  it("ends the tour with a guided lesson, starter effects, or an empty project", async () => {
    render(<VfxEditor />);

    await screen.findByRole("dialog", {
      name: /Build effects one understandable part at a time/i,
    });
    for (let step = 0; step < 6; step += 1)
      fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    const tour = screen.getByRole("dialog");
    expect(
      within(tour).getByRole("button", { name: /Healing aura/ }),
    ).toBeVisible();
    fireEvent.click(
      within(tour).getByRole("button", { name: /Build my first effect/ }),
    );

    expect(
      screen.queryByRole("dialog", { name: /Keep your work/i }),
    ).toBeNull();
    expect(screen.getByText(/First effect · step 1 of 6/i)).toBeVisible();
    expect(window.localStorage.getItem("vvfx-onboarding-complete-v1")).toBe(
      "true",
    );
  });
});
