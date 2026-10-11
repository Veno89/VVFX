import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPreviewBackdrop,
  loadPreviewBackdrop,
  normalizeBackdropSettings,
  savePreviewBackdropImage,
  savePreviewBackdropSettings,
} from "../src/persistence/previewBackdrop";
import { usePreviewBackdrop } from "../src/editor/usePreviewBackdrop";
import { PreviewPanel } from "../src/editor/components/PreviewPanel";
import { createEmptyProject } from "../src/vfx/defaults";

const previewProps = vi.hoisted(() => ({ transparent: [] as boolean[] }));
vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: ({
    transparentBackground,
  }: {
    transparentBackground?: boolean;
  }) => {
    previewProps.transparent.push(Boolean(transparentBackground));
    return <canvas aria-label="Effect preview" />;
  },
}));

const image = (bytes = 4) => ({
  name: "Dungeon.png",
  type: "image/png",
  data: new Uint8Array(bytes).fill(7).buffer,
  width: 640,
  height: 360,
});

const screenshot = (type = "image/png", name = "Arena.png") =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

let urls = 0;

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:backdrop-${++urls}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("preview backdrop storage", () => {
  it("stores the image and settings separately and loads them together", async () => {
    expect(await loadPreviewBackdrop()).toBeNull();
    await savePreviewBackdropImage(image());
    expect(await loadPreviewBackdrop()).toMatchObject({
      name: "Dungeon.png",
      width: 640,
      pixelScale: 1,
      opacity: 1,
    });

    await savePreviewBackdropSettings({ pixelScale: 3, opacity: 0.4 });
    const loaded = await loadPreviewBackdrop();
    expect(loaded).toMatchObject({ pixelScale: 3, opacity: 0.4 });
    expect(new Uint8Array(loaded!.data)).toEqual(new Uint8Array(4).fill(7));

    await clearPreviewBackdrop();
    expect(await loadPreviewBackdrop()).toBeNull();
  });

  it("ignores invalid stored images and normalizes settings", async () => {
    await savePreviewBackdropImage({ ...image(), type: "image/svg+xml" });
    expect(await loadPreviewBackdrop()).toBeNull();
    await savePreviewBackdropImage({ ...image(), width: 9000 });
    expect(await loadPreviewBackdrop()).toBeNull();
    await savePreviewBackdropImage(image(0));
    expect(await loadPreviewBackdrop()).toBeNull();

    expect(normalizeBackdropSettings(5, 2)).toEqual({
      pixelScale: 1,
      opacity: 1,
    });
    expect(normalizeBackdropSettings(0.5, 0)).toEqual({
      pixelScale: 0.5,
      opacity: 0.1,
    });
    expect(normalizeBackdropSettings("2", Number.NaN)).toEqual({
      pixelScale: 1,
      opacity: 1,
    });
  });
});

describe("usePreviewBackdrop", () => {
  const measure = vi.fn(async () => ({ width: 1280, height: 720 }));

  it("adds, adjusts, persists, and removes a screenshot", async () => {
    const { result, unmount } = renderHook(() => usePreviewBackdrop(measure));
    expect(result.current.backdrop).toBeNull();

    await act(() => result.current.choose(screenshot()));
    expect(result.current.backdrop).toMatchObject({
      name: "Arena.png",
      width: 1280,
      height: 720,
      pixelScale: 1,
      opacity: 1,
    });
    expect(result.current.url).toBe("blob:backdrop-1");

    act(() => result.current.update({ pixelScale: 2, opacity: 0.55 }));
    expect(result.current.backdrop).toMatchObject({
      pixelScale: 2,
      opacity: 0.55,
    });
    await waitFor(async () =>
      expect(await loadPreviewBackdrop()).toMatchObject({
        name: "Arena.png",
        pixelScale: 2,
        opacity: 0.55,
      }),
    );
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:backdrop-1");

    const reloaded = renderHook(() => usePreviewBackdrop(measure));
    await waitFor(() =>
      expect(reloaded.result.current.backdrop).toMatchObject({
        name: "Arena.png",
        pixelScale: 2,
      }),
    );

    act(() => reloaded.result.current.remove());
    expect(reloaded.result.current.backdrop).toBeNull();
    expect(reloaded.result.current.url).toBeNull();
    await waitFor(async () => expect(await loadPreviewBackdrop()).toBeNull());
  });

  it("explains rejected screenshots without replacing the current one", async () => {
    const { result } = renderHook(() => usePreviewBackdrop(measure));
    await act(() => result.current.choose(screenshot()));

    await act(() => result.current.choose(screenshot("image/gif", "Anim.gif")));
    expect(result.current.error).toMatch(/PNG, JPEG, or WebP/);

    measure.mockResolvedValueOnce({ width: 10_000, height: 100 });
    await act(() => result.current.choose(screenshot()));
    expect(result.current.error).toMatch(/8192 pixels/);

    measure.mockRejectedValueOnce(new Error("decode"));
    await act(() => result.current.choose(screenshot()));
    expect(result.current.error).toMatch(/could not be opened/);

    const huge = screenshot();
    Object.defineProperty(huge, "size", { value: 26 * 1024 * 1024 });
    await act(() => result.current.choose(huge));
    expect(result.current.error).toMatch(/under 25 MB/);

    expect(result.current.backdrop?.name).toBe("Arena.png");
  });
});

describe("preview panel backdrop", () => {
  const renderPanel = (captureMode = false) => {
    const project = createEmptyProject();
    project.preview.zoom = 1.5;
    project.preview.background = "black";
    return render(
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
        onSpeedChange={vi.fn()}
        captureMode={captureMode}
      />,
    );
  };

  it("draws the stored screenshot behind a clear canvas at preview zoom", async () => {
    await savePreviewBackdropImage(image());
    await savePreviewBackdropSettings({ pixelScale: 2, opacity: 0.5 });
    const { container } = renderPanel();

    const backdrop = await waitFor(() => {
      const element = container.querySelector<HTMLImageElement>(
        "img.preview-backdrop",
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(backdrop.style.transform).toContain("scale(3)");
    expect(backdrop.style.opacity).toBe("0.5");
    expect(backdrop).toHaveAttribute("width", "640");
    expect(previewProps.transparent.at(-1)).toBe(true);
    expect(container.querySelector(".preview-canvas-shell")).toHaveClass(
      "has-backdrop",
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview appearance" }));
    const dialog = screen.getByRole("dialog", { name: "Preview appearance" });
    expect(within(dialog).getByText(/Dungeon\.png · 640×360/)).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Screenshot pixel size"), {
      target: { value: "1" },
    });
    expect(backdrop.style.transform).toContain("scale(1.5)");
    fireEvent.click(within(dialog).getByRole("button", { name: /Remove/ }));
    expect(container.querySelector("img.preview-backdrop")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: /Add game screenshot/ }),
    ).toBeVisible();
  });

  it("hides the screenshot while recording", async () => {
    await savePreviewBackdropImage(image());
    const { container } = renderPanel(true);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(container.querySelector("img.preview-backdrop")).toBeNull();
    expect(previewProps.transparent.at(-1)).toBe(false);
  });
});
