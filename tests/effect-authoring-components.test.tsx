import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EffectInspector } from "../src/editor/components/EffectInspector";
import { EffectToolbelt } from "../src/editor/components/EffectToolbelt";
import { createLayer } from "../src/vfx/defaults";

afterEach(cleanup);

describe("effect toolbelt", () => {
  it("exposes an accessible add palette and prevents a second clip of the same type", () => {
    const onAdd = vi.fn();
    const onSelect = vi.fn();

    render(
      <EffectToolbelt
        layerName="Chain lightning"
        clips={[
          { id: "glow-clip", effect: "outerGlow", enabled: false },
          { id: "blur-clip", effect: "blur", enabled: true },
        ]}
        selectedClipId="blur-clip"
        onAdd={onAdd}
        onSelect={onSelect}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Effects for Chain lightning" }),
    ).toBeInTheDocument();

    const glowChip = screen.getByRole("button", {
      name: /Outer glow.*Off/,
    });
    const blurChip = screen.getByRole("button", { name: "Blur" });
    expect(glowChip).toHaveClass("is-disabled");
    expect(glowChip).toHaveAttribute("aria-pressed", "false");
    expect(blurChip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(glowChip);
    expect(onSelect).toHaveBeenCalledWith("glow-clip");

    const add = screen.getByRole("button", { name: "Add effect" });
    expect(add).toHaveAttribute("aria-haspopup", "dialog");
    expect(add).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(add);

    expect(add).toHaveAttribute("aria-expanded", "true");
    const palette = screen.getByRole("dialog", {
      name: "Add an effect to Chain lightning",
    });
    expect(palette).toHaveAttribute("aria-modal", "false");

    expect(
      within(palette).getByRole("button", {
        name: /Outer glow.*Already added/,
      }),
    ).toBeDisabled();
    expect(
      within(palette).getByRole("button", { name: /Blur.*Already added/ }),
    ).toBeDisabled();

    fireEvent.click(
      within(palette).getByRole("button", {
        name: /Shine.*Sweep a moving highlight across the artwork/,
      }),
    );

    expect(onAdd).toHaveBeenCalledWith("animatedShine");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(add).toHaveAttribute("aria-expanded", "false");
  });
});

describe("effect inspector", () => {
  it("edits focused timing and fade controls and exposes lifecycle actions", () => {
    const layer = createLayer("static", "Chain lightning");
    layer.timing.duration = 2_000;
    layer.appearance.effects.outerGlow.enabled = true;
    const onBack = vi.fn();
    const onLayerChange = vi.fn();
    const onClipChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <EffectInspector
        layer={layer}
        clip={{
          id: "glow-clip",
          effect: "outerGlow",
          start: 0.25,
          end: 0.75,
          fadeIn: 0.1,
          fadeOut: 0.2,
          fadeEasing: "smooth",
        }}
        assets={[]}
        onBack={onBack}
        onLayerChange={onLayerChange}
        onClipChange={onClipChange}
        onRemove={onRemove}
      />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Outer glow settings for Chain lightning",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Outer glow" })).toHaveFocus();
    expect(screen.getByText("1000 ms long")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "90" },
    });
    fireEvent.change(screen.getByLabelText("Fade in"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Fade out"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("Fade shape"), {
      target: { value: "ease-out" },
    });

    expect(onClipChange).toHaveBeenNthCalledWith(1, { start: 0.4 });
    expect(onClipChange).toHaveBeenNthCalledWith(2, { end: 0.9 });
    expect(onClipChange).toHaveBeenNthCalledWith(3, { fadeIn: 0.3 });
    expect(onClipChange).toHaveBeenNthCalledWith(4, { fadeOut: 0.4 });
    expect(onClipChange).toHaveBeenNthCalledWith(5, {
      fadeEasing: "ease-out",
    });

    const enabled = screen.getByRole("switch", { name: "Soft outer glow" });
    expect(enabled).toHaveAttribute("aria-checked", "true");
    fireEvent.click(enabled);

    expect(onLayerChange).toHaveBeenCalledTimes(1);
    expect(
      onLayerChange.mock.calls[0][0].appearance.effects.outerGlow.enabled,
    ).toBe(false);
    expect(layer.appearance.effects.outerGlow.enabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to Chain lightning settings",
      }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove effect" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
