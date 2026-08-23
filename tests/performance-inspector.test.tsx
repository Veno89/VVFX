import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceInspector } from "../src/editor/components/PerformanceInspector";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";

const sample = {
  liveSprites: 42,
  baseSprites: 42,
  newSpritesPerSecond: 18,
  requestedCopies: 1,
  effectiveCopies: 1,
  stressLimited: false,
};

afterEach(cleanup);

describe("effect performance inspector", () => {
  it("separates measured values from estimates and changes session stress copies", () => {
    const project = createEmptyProject();
    project.layers = [createLayer("animated", "Long smoke", "builtin-cloud")];
    const onCopiesChange = vi.fn();

    render(
      <PerformanceInspector
        project={project}
        sample={sample}
        peakSprites={64}
        requestedCopies={1}
        captureMode={false}
        onCopiesChange={onCopiesChange}
        onResetPeak={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Effect performance" }),
    ).toBeVisible();
    expect(screen.getAllByText("Measured")).toHaveLength(3);
    expect(screen.getByText("Estimated")).toBeVisible();
    expect(screen.getByText("Long smoke")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "25×" }));
    expect(onCopiesChange).toHaveBeenCalledWith(25);
  });

  it("disables stress changes and explains the clean-copy recording rule", () => {
    render(
      <PerformanceInspector
        project={createEmptyProject()}
        sample={{
          ...sample,
          requestedCopies: 50,
          effectiveCopies: 1,
          stressLimited: true,
        }}
        peakSprites={42}
        requestedCopies={50}
        captureMode
        onCopiesChange={vi.fn()}
        onResetPeak={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Recording temporarily uses one clean effect copy."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "50×" })).toBeDisabled();
    expect(screen.getByText(/never changes the saved project/i)).toBeVisible();
  });
});
