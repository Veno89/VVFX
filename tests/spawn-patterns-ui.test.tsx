import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/editor/components/Inspector";
import { createLayer } from "../src/vfx/defaults";
import type { SpawnLayer } from "../src/vfx/types";

afterEach(cleanup);

function renderLayer(layer: SpawnLayer) {
  const onChange = vi.fn();
  render(
    <Inspector
      layer={layer}
      assets={[]}
      layers={[layer]}
      onChange={onChange}
      onAssetChange={vi.fn()}
      onCopy={vi.fn()}
      onPaste={vi.fn()}
      canPaste={false}
    />,
  );
  return onChange;
}

function placementSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", {
    name: "Placement pattern",
  }) as HTMLSelectElement;
}

describe("richer placement Inspector controls", () => {
  it("explains interior coverage separately from rectangle edge patterns", () => {
    const layer = createLayer("burst", "Filled field", "builtin-spark");
    layer.spawn.shape = "rectangle";
    layer.spawn.distribution = "stratified";
    const onChange = renderLayer(layer);

    expect(
      [...placementSelect().options].map((option) => option.textContent),
    ).toEqual([
      "Random inside",
      "Even coverage inside",
      "Random around edge",
      "Evenly around edge",
      "One clump near center",
      "Several clumps",
    ]);
    expect(screen.getByLabelText("Natural variation")).toHaveValue(65);
    fireEvent.change(screen.getByLabelText("Natural variation"), {
      target: { value: "40" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spawn: expect.objectContaining({ stratifiedJitter: 0.4 }),
      }),
    );
  });

  it("uses existing circle edge semantics for explicit ring choices", () => {
    const layer = createLayer("burst", "Ring", "builtin-ring");
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "even";
    renderLayer(layer);

    expect(
      [...placementSelect().options].map((option) => option.textContent),
    ).toEqual([
      "Random inside",
      "Even coverage inside",
      "Random ring",
      "Even ring",
      "One clump near center",
      "Several clumps",
    ]);
  });

  it("offers bounded clump controls without duplicating line stratification", () => {
    const layer = createLayer("burst", "Spark pockets", "builtin-spark");
    layer.spawn.shape = "line";
    layer.spawn.distribution = "clusters";
    const onChange = renderLayer(layer);

    expect(
      [...placementSelect().options].map((option) => option.textContent),
    ).toEqual([
      "Random along shape",
      "Evenly spaced along shape",
      "One clump near middle",
      "Several clumps",
    ]);
    expect(screen.queryByText("Even coverage inside")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Number of clumps")).toHaveValue(3);
    expect(screen.getByLabelText("Clump size")).toHaveValue(18);
    fireEvent.change(screen.getByLabelText("Number of clumps"), {
      target: { value: "6" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spawn: expect.objectContaining({ clusterCount: 6 }),
      }),
    );
  });
});
