import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/editor/components/Inspector";
import { PreviewPanel } from "../src/editor/components/PreviewPanel";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import type { VfxAsset } from "../src/vfx/types";
import { validPngDataUrl } from "./fixtures/portableImages";

vi.mock("../src/preview/PhaserPreview", () => ({
  PhaserPreview: () => <canvas aria-label="Effect preview" />,
}));

afterEach(cleanup);

function explicitLabel(labelText: string): {
  label: HTMLLabelElement;
  control: HTMLElement;
} {
  const label = screen.getByText(labelText, {
    selector: "label",
  }) as HTMLLabelElement;
  const control = label.control;
  expect(control).not.toBeNull();
  expect(control).toHaveAccessibleName(labelText);
  return { label, control: control as HTMLElement };
}

function expectDetachedButton(
  label: HTMLLabelElement,
  control: HTMLElement,
  buttonName: string | RegExp,
) {
  const button = screen.getByLabelText(buttonName, { selector: "button" });
  expect(label).not.toContainElement(button);

  const accidentalControlClick = vi.fn();
  control.addEventListener("click", accidentalControlClick);
  fireEvent.click(button);
  expect(accidentalControlClick).not.toHaveBeenCalled();
  control.removeEventListener("click", accidentalControlClick);
}

describe("HelpTip field label associations", () => {
  it("keeps every Inspector help button outside its explicitly labelled control", () => {
    const asset: VfxAsset = {
      id: "uploaded-artwork",
      name: "Uploaded artwork",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(32, 32),
      width: 32,
      height: 32,
      spriteSheet: null,
      atlasFrame: null,
      alphaMask: null,
    };
    const source = createLayer("animated", "Source", asset.id);
    const target = createLayer("animated", "Target", "builtin-flash");
    const group = createGroup("Impact group");
    source.groupId = group.id;
    source.events = [
      {
        id: "event-one",
        enabled: true,
        trigger: "finish",
        percentage: 0.5,
        action: "play",
        targetLayerId: target.id,
        chance: 1,
        maxTriggers: 32,
      },
    ];
    source.appearance.effects.outerGlow.enabled = true;
    source.appearance.effects.blur.enabled = true;
    source.appearance.effects.spatialGradient.enabled = true;
    const onChange = vi.fn();
    const onAssetChange = vi.fn();

    render(
      <Inspector
        layer={source}
        assets={[...createEmptyProject().assets, asset]}
        groups={[group]}
        layers={[source, target]}
        onChange={onChange}
        onAssetChange={onAssetChange}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );

    const cases: Array<[string, string]> = [
      ["Image", "Help for Image"],
      ["Effect group", "Help for Effect group"],
      ["Atlas frame name", "Help for Atlas frame name"],
      ["When this happens", "Help for When this happens for event 1"],
      ["Do this", "Help for Do this for event 1"],
      ["Target layer", "Help for Target layer for event 1"],
      ["Tint color", "Help for Tint color"],
      ["Glow color", "Help for Glow color"],
      ["Blur color", "Help for Blur color"],
      ["Gradient color A", "Help for Gradient color A"],
      ["Gradient color B", "Help for Gradient color B"],
    ];

    for (const [labelText, helpName] of cases) {
      const { label, control } = explicitLabel(labelText);
      expectDetachedButton(label, control, helpName);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(onAssetChange).not.toHaveBeenCalled();

    const tint = explicitLabel("Tint color");
    const clear = screen.getByRole("button", { name: "Clear", hidden: true });
    expect(tint.label).not.toContainElement(clear);
    const accidentalTintClick = vi.fn();
    tint.control.addEventListener("click", accidentalTintClick);
    fireEvent.click(clear);
    expect(accidentalTintClick).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({ tint: null }),
      }),
    );
  }, 30_000);

  it("keeps Preview help and action buttons outside their labelled controls", () => {
    const project = createEmptyProject();
    const onProjectChange = vi.fn();
    const onViewChange = vi.fn();
    render(
      <PreviewPanel
        project={project}
        time={0}
        playing={false}
        speed={1}
        loopEnd={project.preview.duration}
        selectedId={null}
        onProjectChange={onProjectChange}
        onViewChange={onViewChange}
        onMoveLayer={vi.fn()}
        onMovePathPoint={vi.fn()}
        onPlayToggle={vi.fn()}
        onRestart={vi.fn()}
        onSpeedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Preview appearance"));
    const background = explicitLabel("Background");
    const seed = explicitLabel("Random seed");
    expectDetachedButton(
      background.label,
      background.control,
      "Help for Background",
    );
    expectDetachedButton(seed.label, seed.control, "Help for Random seed");

    const backgroundHelp = screen.getByRole("button", {
      name: "Help for Background",
    });
    expect(backgroundHelp).not.toHaveAccessibleDescription();
    fireEvent.focus(backgroundHelp);
    expect(backgroundHelp).toHaveAccessibleName("Help for Background");
    expect(backgroundHelp).toHaveAccessibleDescription(
      "Bright effects can look completely different on light and dark backgrounds. Check both before you finish.",
    );
    expect(backgroundHelp).not.toHaveAccessibleName(
      /Bright effects can look completely different/,
    );
    fireEvent.blur(backgroundHelp);
    expect(onViewChange).not.toHaveBeenCalled();
    expect(onProjectChange).not.toHaveBeenCalled();

    const newVersion = screen.getByRole("button", { name: "New version" });
    expect(seed.label).not.toContainElement(newVersion);
    const accidentalSeedClick = vi.fn();
    seed.control.addEventListener("click", accidentalSeedClick);
    fireEvent.click(newVersion);
    expect(accidentalSeedClick).not.toHaveBeenCalled();
    expect(onProjectChange).toHaveBeenCalledOnce();
  });
});
