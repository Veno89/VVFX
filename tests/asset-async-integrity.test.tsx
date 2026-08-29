import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedImageAlphaMask } from "../src/editor/alphaMaskImport";
import { VfxEditor } from "../src/editor/VfxEditor";
import { createEmptyProject } from "../src/vfx/defaults";
import { MAX_UPLOAD_FILES } from "../src/vfx/inputLimits";
import type { VfxAsset, VfxProject } from "../src/vfx/types";
import { portableImageFile, validPngDataUrl } from "./fixtures/portableImages";

const alphaMaskImport = vi.hoisted(() => ({
  prepareAlphaMaskFromDataUrl: vi.fn(),
}));

const embeddedImageValidation = vi.hoisted(() => ({
  verifyEmbeddedAssetImages: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock("../src/editor/alphaMaskImport", () => alphaMaskImport);
vi.mock("../src/editor/embeddedImageValidation", () => embeddedImageValidation);
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

const preparedMask: PreparedImageAlphaMask = {
  width: 128,
  height: 64,
  transparency: "yes",
  alphaMask: { columns: 2, rows: 1, alpha: [255, 160] },
};

const legacyAsset: VfxAsset = {
  id: "legacy-upload",
  name: "Legacy spark",
  mimeType: "image/png",
  dataUrl: validPngDataUrl(128, 64),
  width: 128,
  height: 64,
  spriteSheet: null,
  atlasFrame: null,
};

function dropFiles(files: File[]) {
  fireEvent.drop(
    screen.getByRole("button", { name: /bring in your images/i }),
    {
      dataTransfer: {
        files,
        types: ["Files"],
      },
    },
  );
}

function dropPng(name = "Slow upload.png") {
  dropFiles([portableImageFile("image/png", name, 128, 64)]);
}

async function restoreProject(project: VfxProject) {
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
}

async function saveVisibleProject(): Promise<VfxProject> {
  projectPersistence.saveProject.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(projectPersistence.saveProject).toHaveBeenCalled(),
  );
  return projectPersistence.saveProject.mock.calls.at(-1)?.[0] as VfxProject;
}

beforeEach(() => {
  alphaMaskImport.prepareAlphaMaskFromDataUrl.mockReset();
  embeddedImageValidation.verifyEmbeddedAssetImages.mockReset();
  embeddedImageValidation.verifyEmbeddedAssetImages.mockResolvedValue(
    undefined,
  );
  projectPersistence.clearRecoveryDraft.mockClear();
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
  projectPersistence.saveRecoveryDraft.mockClear();
  projectPersistence.saveProject.mockClear();
  window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("asynchronous asset mutation integrity", () => {
  it("rejects a malformed PNG header before starting image decoding", async () => {
    render(<VfxEditor />);

    dropFiles([new File(["not a PNG"], "damaged.png", { type: "image/png" })]);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /not a valid PNG image/i,
      ),
    );
    expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).not.toHaveBeenCalled();
  });

  it("rejects an over-limit upload batch before starting image decoding", async () => {
    render(<VfxEditor />);
    dropFiles(
      Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, index) =>
        portableImageFile("image/png", `spark-${index}.png`),
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        new RegExp(`at most ${MAX_UPLOAD_FILES} images`, "i"),
      ),
    );
    expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).not.toHaveBeenCalled();
  });

  it("preserves same-project edits made while an upload is decoding", async () => {
    const pending = deferred<PreparedImageAlphaMask>();
    alphaMaskImport.prepareAlphaMaskFromDataUrl.mockReturnValueOnce(
      pending.promise,
    );
    render(<VfxEditor />);

    dropPng();
    await waitFor(() =>
      expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).toHaveBeenCalledTimes(
        1,
      ),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Edited while decoding" },
    });

    await act(async () => pending.resolve(preparedMask));
    await screen.findByLabelText("Rename Slow upload");

    const saved = await saveVisibleProject();
    expect(saved.metadata.name).toBe("Edited while decoding");
    expect(saved.assets.filter((asset) => !asset.builtIn)).toHaveLength(1);
    expect(saved.assets.find((asset) => !asset.builtIn)).toMatchObject({
      name: "Slow upload",
      alphaMask: preparedMask.alphaMask,
    });
  });

  it("aborts an in-flight upload and never starts its next file after project replacement", async () => {
    let uploadSignal: AbortSignal | undefined;
    alphaMaskImport.prepareAlphaMaskFromDataUrl.mockImplementationOnce(
      (_dataUrl: string, signal?: AbortSignal) =>
        new Promise<PreparedImageAlphaMask>((_resolve, reject) => {
          uploadSignal = signal;
          const abort = () =>
            reject(new DOMException("Upload cancelled.", "AbortError"));
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        }),
    );
    render(<VfxEditor />);

    dropFiles([
      portableImageFile("image/png", "Slow upload.png", 128, 64),
      portableImageFile("image/png", "Never decoded.png", 128, 64),
    ]);
    await waitFor(() =>
      expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).toHaveBeenCalledTimes(
        1,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
      target: { value: "Replacement project" },
    });

    await waitFor(() => expect(uploadSignal?.aborted).toBe(true));
    expect(
      screen.queryByText(/preparation stopped because the project changed/i),
    ).not.toBeInTheDocument();
    expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).toHaveBeenCalledTimes(
      1,
    );

    expect(
      screen.queryByLabelText("Rename Slow upload"),
    ).not.toBeInTheDocument();
    const saved = await saveVisibleProject();
    expect(saved.metadata.name).toBe("Replacement project");
    expect(saved.assets.every((asset) => Boolean(asset.builtIn))).toBe(true);
  });

  it("merges prepared mask data without overwriting newer asset edits", async () => {
    const pending = deferred<PreparedImageAlphaMask>();
    alphaMaskImport.prepareAlphaMaskFromDataUrl.mockReturnValueOnce(
      pending.promise,
    );
    const project = createEmptyProject("Preparation merge");
    project.assets.push({ ...legacyAsset });
    await restoreProject(project);

    fireEvent.click(
      screen.getByRole("button", { name: `Select ${legacyAsset.name}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare as spawn silhouette" }),
    );
    await waitFor(() =>
      expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(
      screen.getByRole("button", { name: `Remove ${legacyAsset.name}` }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByRole("textbox", { name: `Rename ${legacyAsset.name}` }),
      { target: { value: "Renamed during preparation" } },
    );
    fireEvent.click(screen.getByLabelText("Use as a flipbook sprite sheet"));

    await act(async () => pending.resolve(preparedMask));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Remove Renamed during preparation",
        }),
      ).toBeEnabled(),
    );

    const saved = await saveVisibleProject();
    expect(
      saved.assets.find((asset) => asset.id === legacyAsset.id),
    ).toMatchObject({
      name: "Renamed during preparation",
      alphaMask: preparedMask.alphaMask,
      spriteSheet: expect.objectContaining({ frameCount: 2 }),
    });
  });

  it("discards legacy preparation after the source project is replaced", async () => {
    const pending = deferred<PreparedImageAlphaMask>();
    alphaMaskImport.prepareAlphaMaskFromDataUrl.mockReturnValueOnce(
      pending.promise,
    );
    const project = createEmptyProject("Discard preparation");
    project.assets.push({ ...legacyAsset });
    await restoreProject(project);

    fireEvent.click(
      screen.getByRole("button", { name: `Select ${legacyAsset.name}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare as spawn silhouette" }),
    );
    await waitFor(() =>
      expect(alphaMaskImport.prepareAlphaMaskFromDataUrl).toHaveBeenCalledTimes(
        1,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard changes and start new",
      }),
    );

    await act(async () => pending.resolve(preparedMask));
    expect(
      screen.queryByText(/preparation (?:stopped|was discarded)/i),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: `Select ${legacyAsset.name}` }),
    ).not.toBeInTheDocument();
    const saved = await saveVisibleProject();
    expect(saved.assets.every((asset) => Boolean(asset.builtIn))).toBe(true);
  });
});
