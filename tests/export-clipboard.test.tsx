import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/editor/components/ExportDialog";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";

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

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const originalCaptureStream = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "captureStream",
);

function projectWithLayer() {
  const project = createEmptyProject("Clipboard export");
  project.layers.push(
    createLayer("animated", "Exportable flash", "builtin-flash"),
  );
  return project;
}

function renderExport() {
  return render(
    <ExportDialog
      project={projectWithLayer()}
      activeDuration={800}
      onRecordPreview={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

function mockClipboard(writeText: (content: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }

  if (originalCaptureStream) {
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      "captureStream",
      originalCaptureStream,
    );
  } else {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream");
  }
});

describe("ExportDialog clipboard and WebM capability state", () => {
  it("scopes successful copy feedback to the copied export tab", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    renderExport();

    fireEvent.click(screen.getByRole("tab", { name: "Runtime JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
    expect(writeText).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Phaser code" }));

    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
  });

  it("reports clipboard rejection without showing success feedback", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error("Clipboard permission denied"));
    mockClipboard(writeText);
    renderExport();

    fireEvent.click(screen.getByRole("tab", { name: "Runtime JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Clipboard permission denied");
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it("ignores a stale Runtime failure after the newer Phaser copy succeeds", async () => {
    const runtimeCopy = deferred<void>();
    const phaserCopy = deferred<void>();
    const writeText = vi
      .fn()
      .mockImplementationOnce(() => runtimeCopy.promise)
      .mockImplementationOnce(() => phaserCopy.promise);
    mockClipboard(writeText);
    renderExport();

    fireEvent.click(screen.getByRole("tab", { name: "Runtime JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("tab", { name: "Phaser code" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledTimes(2);

    await act(async () => phaserCopy.resolve());
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();

    await act(async () =>
      runtimeCopy.reject(new Error("Stale Runtime clipboard failure")),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("ignores a stale Runtime success after the newer Phaser copy fails", async () => {
    const runtimeCopy = deferred<void>();
    const phaserCopy = deferred<void>();
    const writeText = vi
      .fn()
      .mockImplementationOnce(() => runtimeCopy.promise)
      .mockImplementationOnce(() => phaserCopy.promise);
    mockClipboard(writeText);
    renderExport();

    fireEvent.click(screen.getByRole("tab", { name: "Runtime JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("tab", { name: "Phaser code" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await act(async () =>
      phaserCopy.reject(new Error("Current Phaser clipboard failure")),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Current Phaser clipboard failure",
    );
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();

    await act(async () => runtimeCopy.resolve());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Current Phaser clipboard failure",
    );
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
  });

  it("waits for WebM capability detection before announcing unsupported", () => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: vi.fn(),
    });
    class UnsupportedMediaRecorder {
      static isTypeSupported = vi.fn(() => false);
    }
    vi.stubGlobal("MediaRecorder", UnsupportedMediaRecorder);

    renderExport();

    const unavailable = /WebM recording is unavailable in this browser/i;
    expect(screen.queryByText(unavailable)).toBeNull();

    act(() => vi.runOnlyPendingTimers());

    expect(screen.getByText(unavailable)).toHaveAttribute("role", "alert");
  });
});
