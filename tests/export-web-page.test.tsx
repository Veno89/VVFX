import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/editor/components/ExportDialog";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";

const exporter = vi.hoisted(() => ({ buildHtmlPlayerPage: vi.fn() }));
vi.mock("../src/editor/htmlPlayerExport", () => exporter);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:page");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  exporter.buildHtmlPlayerPage.mockReset();
});

const renderDialog = (withLayer = true) => {
  const project = createEmptyProject("Share me");
  if (withLayer)
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
  render(
    <ExportDialog
      project={project}
      activeDuration={800}
      onRecordPreview={vi.fn()}
      onClose={vi.fn()}
      initialTab="html"
    />,
  );
  return project;
};

describe("Web page export tab", () => {
  it("builds with the chosen options and reports the download", async () => {
    exporter.buildHtmlPlayerPage.mockResolvedValue("<!doctype html>");
    const project = renderDialog();

    expect(screen.getByRole("tabpanel", { name: "Web page" })).toBeVisible();
    fireEvent.click(screen.getByLabelText("Loop playback"));
    fireEvent.click(screen.getByLabelText(/Works offline/));
    expect(
      screen.getByText(/viewers need an internet connection/),
    ).toBeVisible();
    expect(screen.getByText(/plays once/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Download \.html/ }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Downloaded share-me.html",
      ),
    );
    expect(exporter.buildHtmlPlayerPage).toHaveBeenCalledWith(project, {
      offline: false,
      loop: false,
    });
  });

  it("shows why a page could not be built", async () => {
    exporter.buildHtmlPlayerPage.mockRejectedValue(
      new Error("Phaser could not be downloaded for offline use."),
    );
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Download \.html/ }));
    await waitFor(() =>
      expect(
        screen.getByText("Phaser could not be downloaded for offline use."),
      ).toHaveAttribute("role", "alert"),
    );
    expect(
      screen.getByRole("button", { name: /Download \.html/ }),
    ).toBeEnabled();
  });

  it("needs a visible image layer", () => {
    renderDialog(false);
    expect(
      screen.getByText(/Add and enable a visible image layer/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Download \.html/ }),
    ).toBeDisabled();
  });
});
