import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { VfxEditor } from "../src/editor/VfxEditor";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { activeTimelineEnd } from "../src/vfx/projectState";
import { validateProject } from "../src/vfx/serialization";
import {
  availableAspects,
  createVariations,
  effectColors,
  rotateHue,
} from "../src/vfx/variations";

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: ({
    project,
  }: {
    project: { preview: { randomSeed: number } };
  }) => (
    <canvas
      aria-label="Effect preview"
      data-seed={project.preview.randomSeed}
    />
  ),
}));

afterEach(cleanup);

function coloredProject() {
  const project = createEmptyProject("Colorful");
  project.preview.duration = 1_000;
  const flash = createLayer("animated", "Flash", "builtin-flash");
  flash.appearance.tint = "#ff6633";
  flash.timing.duration = 600;
  const sparks = createLayer("burst", "Sparks", "builtin-spark");
  sparks.appearance.colorOverLifetime = {
    enabled: true,
    stops: [
      { time: 0, color: "#ffee88" },
      { time: 1, color: "#ff2200" },
    ],
  };
  project.layers.push(flash, sparks);
  project.timeline.markers = [{ id: "hit", time: 300, label: "impact" }];
  return project;
}

describe("effect variations", () => {
  it("rotates hues while keeping lightness and ignoring greys", () => {
    expect(rotateHue("#ff0000", 120)).toBe("#00ff00");
    expect(rotateHue("#ff0000", -120)).toBe("#0000ff");
    expect(rotateHue("#808080", 90)).toBe("#808080");
    expect(effectColors(coloredProject())).toEqual([
      "#ff6633",
      "#ffee88",
      "#ff2200",
    ]);
  });

  it("is deterministic per roll and returns only valid projects", () => {
    const project = coloredProject();
    const aspects = ["colors", "size", "speed", "randomness"] as const;
    const first = createVariations(project, aspects, 1);
    const again = createVariations(project, aspects, 1);
    const next = createVariations(project, aspects, 2);

    expect(first).toHaveLength(6);
    expect(first.map((variation) => variation.changes)).toEqual(
      again.map((variation) => variation.changes),
    );
    expect(first[0].changes).not.toEqual(next[0].changes);
    for (const variation of first) {
      expect(validateProject(variation.project).ok).toBe(true);
      expect(variation.changes).toHaveLength(4);
      expect(variation.swatches.length).toBeGreaterThan(0);
    }
    // The source project is never mutated.
    expect(project.layers[0].appearance.tint).toBe("#ff6633");
  });

  it("changes only the chosen aspects", () => {
    const project = coloredProject();
    const [sized] = createVariations(project, ["size"], 3);
    const factor =
      sized.project.layers[0].transform.startScale /
      project.layers[0].transform.startScale;
    expect(Math.abs(factor - 1)).toBeGreaterThan(0.1);
    expect(sized.project.layers[0].appearance.tint).toBe("#ff6633");
    expect(sized.project.preview.randomSeed).toBe(project.preview.randomSeed);
    expect(sized.project.layers[0].timing.duration).toBe(600);

    const [timed] = createVariations(project, ["speed"], 4);
    const stretch = timed.project.layers[0].timing.duration / 600;
    expect(Math.abs(stretch - 1)).toBeGreaterThan(0.1);
    // Cues and the composition length move with the content.
    expect(timed.project.timeline.markers[0].time).toBe(
      Math.round(300 * stretch),
    );
    expect(activeTimelineEnd(timed.project)).toBeLessThanOrEqual(
      timed.project.preview.duration,
    );
    expect(timed.project.layers[0].transform.startScale).toBe(
      project.layers[0].transform.startScale,
    );
  });

  it("skips colors for an effect without any and needs one aspect", () => {
    const project = createEmptyProject("White");
    project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
    expect(effectColors(project)).toEqual([]);
    expect(createVariations(project, ["colors"], 1)).toEqual([]);
    expect(createVariations(project, [], 1)).toEqual([]);
    expect(
      createVariations(project, ["colors", "randomness"], 1)[0].changes,
    ).toEqual(["New random pattern"]);
  });
});

describe("copy count and layer scope", () => {
  it("varies how many copies bursts and emitters make", () => {
    const project = coloredProject();
    const [counted] = createVariations(project, ["count"], 2);
    const before = project.layers[1].spawn!.count;
    const after = counted.project.layers[1].spawn!.count;
    expect(after).not.toBe(before);
    expect(counted.changes[0]).toMatch(/copies/);
    // Layers without copies are untouched.
    expect(counted.project.layers[0]).toEqual(
      validateProject(project).project!.layers[0],
    );
  });

  it("changes only the chosen layer and keeps the effect's timing", () => {
    const project = coloredProject();
    const sparks = project.layers[1];
    const variations = createVariations(
      project,
      ["colors", "size", "speed", "count", "randomness"],
      5,
      6,
      sparks.id,
    );
    expect(variations).toHaveLength(6);
    const normalized = validateProject(project).project!;
    for (const variation of variations) {
      expect(variation.project.layers[0]).toEqual(normalized.layers[0]);
      expect(variation.project.preview.randomSeed).toBe(
        project.preview.randomSeed,
      );
      expect(variation.project.timeline.markers).toEqual(
        project.timeline.markers,
      );
      expect(variation.changes).not.toContain("New random pattern");
      expect(activeTimelineEnd(variation.project)).toBeLessThanOrEqual(
        variation.project.preview.duration,
      );
    }
    expect(variations[0].id).toContain(sparks.id);
  });

  it("offers only aspects that can change something in scope", () => {
    const project = coloredProject();
    expect(availableAspects(project)).toEqual([
      "colors",
      "size",
      "speed",
      "count",
      "randomness",
    ]);
    expect(availableAspects(project, project.layers[0].id)).toEqual([
      "colors",
      "size",
      "speed",
    ]);
    expect(availableAspects(project, "missing")).toEqual([]);
  });
});

describe("Variations in the editor", () => {
  it("previews a variation, then keeps it as one undoable change or goes back", () => {
    render(<VfxEditor />);
    fireEvent.click(screen.getAllByRole("button", { name: /Magic impact/ })[0]);
    const canvas = () => screen.getByLabelText("Effect preview");
    const originalSeed = canvas().getAttribute("data-seed");

    fireEvent.click(screen.getByRole("button", { name: "Variations" }));
    const menu = screen.getByRole("dialog", { name: "Effect variations" });
    const versions = within(menu).getAllByRole("button", { name: /Version/ });
    expect(versions).toHaveLength(6);

    fireEvent.click(versions[0]);
    expect(versions[0]).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("group", { name: "Variation preview" }),
    ).toBeInTheDocument();
    expect(canvas().getAttribute("data-seed")).not.toBe(originalSeed);

    fireEvent.click(screen.getByRole("button", { name: "Back to original" }));
    expect(canvas().getAttribute("data-seed")).toBe(originalSeed);
    expect(
      screen.queryByRole("group", { name: "Variation preview" }),
    ).toBeNull();

    fireEvent.click(versions[1]);
    const triedSeed = canvas().getAttribute("data-seed");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    });
    expect(canvas().getAttribute("data-seed")).toBe(triedSeed);
    expect(
      screen.queryByRole("group", { name: "Variation preview" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(canvas().getAttribute("data-seed")).toBe(originalSeed);
  }, 30_000);

  it("varies only the selected layer when asked", () => {
    render(<VfxEditor />);
    fireEvent.click(screen.getAllByRole("button", { name: /Magic impact/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Variations" }));
    const menu = screen.getByRole("dialog", { name: "Effect variations" });
    const layerOnly = within(menu).getByRole("radio", { name: /^Only / });
    fireEvent.click(layerOnly);
    expect(layerOnly).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByLabelText("Randomness")).toBeDisabled();
    expect(
      within(menu).getAllByRole("button", { name: /Version/ }).length,
    ).toBeGreaterThan(0);
  }, 30_000);
});
