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
import type { PreviewRecordingRequest } from "../src/editor/previewRecording";
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
  it("lets Escape cancel an active preview export without closing the dialog", async () => {
    const onClose = vi.fn();
    const onRecordPreview = vi.fn(
      (request: PreviewRecordingRequest) =>
        new Promise<never>((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("canceled");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
    );
    render(
      <ExportDialog
        project={projectWithLayer()}
        activeDuration={800}
        onRecordPreview={onRecordPreview}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "gif" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Export & download .gif" }),
    );

    expect(
      await screen.findByRole("button", { name: "Cancel export" }),
    ).toBeVisible();
    expect(onRecordPreview).toHaveBeenCalledOnce();
    const activeSignal = onRecordPreview.mock.calls[0][0].signal;
    expect(activeSignal.aborted).toBe(false);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview export canceled.",
    );
    expect(activeSignal.aborted).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks an oversized GIF preset before starting export", () => {
    const onRecordPreview = vi.fn();
    render(
      <ExportDialog
        project={projectWithLayer()}
        activeDuration={9_001}
        onRecordPreview={onRecordPreview}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "gif" },
    });
    fireEvent.change(screen.getByLabelText("Size and aspect ratio"), {
      target: { value: "hd" },
    });

    expect(screen.getByText(/above the safe export limit/i)).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByRole("button", { name: "Export & download .gif" }),
    ).toBeDisabled();
    expect(onRecordPreview).not.toHaveBeenCalled();
  });

  it("scopes successful copy feedback to the copied export tab", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    renderExport();

    fireEvent.click(screen.getByRole("tab", { name: "Runtime JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
    expect(writeText).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Advanced TypeScript" }));

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
    fireEvent.click(screen.getByRole("tab", { name: "Advanced TypeScript" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Advanced TypeScript" }));
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
