import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/editor/components/Inspector";
import { AssetRemovalDialog } from "../src/editor/components/ProjectSafetyDialogs";
import {
  analyzeAssetUsage,
  layersAfterAssetChanged,
  layersAfterAssetRemoved,
  projectAfterAssetChanged,
  projectAfterAssetRemoved,
} from "../src/vfx/assetReferences";
import {
  createEmptyProject,
  createLayer,
  DEFAULT_FRAME_ANIMATION,
} from "../src/vfx/defaults";
import type { VfxAsset } from "../src/vfx/types";
import { validPngDataUrl } from "./fixtures/portableImages";

afterEach(cleanup);

const uploadedAsset = (id = "uploaded-mask"): VfxAsset => ({
  id,
  name: "Uploaded mask",
  mimeType: "image/png",
  dataUrl: validPngDataUrl(32, 32),
  width: 32,
  height: 32,
  spriteSheet: null,
  atlasFrame: null,
  alphaMask: { columns: 1, rows: 1, alpha: [255] },
});

describe("asset dependency analysis and removal", () => {
  it("reports each affected layer once with active and stored role counts", () => {
    const project = createEmptyProject("Asset usage");
    const asset = uploadedAsset();
    project.assets.push(asset);

    const active = createLayer("burst", "Active multi-role layer", asset.id);
    active.visible = false;
    active.spawn.shape = "mask";
    active.spawn.maskAssetId = asset.id;
    active.appearance.effects.visualMask = {
      ...active.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: asset.id,
    };
    const stored = createLayer("emitter", "Stored choices", "builtin-spark");
    stored.enabled = false;
    stored.spawn.shape = "circle";
    stored.spawn.maskAssetId = asset.id;
    stored.appearance.effects.visualMask = {
      ...stored.appearance.effects.visualMask,
      enabled: false,
      maskAssetId: asset.id,
    };
    project.layers.push(active, stored, createLayer("animated", "Unrelated"));

    const report = analyzeAssetUsage(project, asset.id);

    expect(report.counts).toEqual({
      affectedLayers: 2,
      artwork: 1,
      visualMaskActive: 1,
      visualMaskStored: 1,
      spawnSilhouetteActive: 1,
      spawnSilhouetteStored: 1,
    });
    expect(report.layers).toEqual([
      {
        layerId: active.id,
        layerName: active.name,
        roles: {
          artwork: true,
          visualMaskActive: true,
          visualMaskStored: false,
          spawnSilhouetteActive: true,
          spawnSilhouetteStored: false,
        },
      },
      {
        layerId: stored.id,
        layerName: stored.name,
        roles: {
          artwork: false,
          visualMaskActive: false,
          visualMaskStored: true,
          spawnSilhouetteActive: false,
          spawnSilhouetteStored: true,
        },
      },
    ]);
  });

  it("preserves non-mask spawn geometry when only a stored choice is removed", () => {
    const layer = createLayer("burst", "Circle burst", "builtin-spark");
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "clusters";
    layer.spawn.maskAssetId = "stored-silhouette";

    const [next] = layersAfterAssetRemoved([layer], "stored-silhouette");

    expect(next.type === "burst" && next.spawn).toMatchObject({
      shape: "circle",
      distribution: "clusters",
      maskAssetId: null,
    });
  });

  it("preserves non-mask spawn geometry when a stored silhouette becomes unusable", () => {
    const asset = {
      ...uploadedAsset("stored-silhouette"),
      spriteSheet: { frameWidth: 16, frameHeight: 16, frameCount: 4 },
    } satisfies VfxAsset;
    const layer = createLayer("burst", "Circle burst", "builtin-spark");
    layer.spawn.shape = "circle";
    layer.spawn.distribution = "clusters";
    layer.spawn.maskAssetId = asset.id;

    const [next] = layersAfterAssetChanged([layer], asset);

    expect(next.type === "burst" && next.spawn).toMatchObject({
      shape: "circle",
      distribution: "clusters",
      maskAssetId: null,
    });
  });

  it("removes per-layer flipbook settings when sprite-sheet treatment is removed", () => {
    const project = createEmptyProject("Remove flipbook treatment");
    const sheet = {
      ...uploadedAsset("shared-sheet"),
      width: 64,
      height: 16,
      spriteSheet: { frameWidth: 16, frameHeight: 16, frameCount: 4 },
    } satisfies VfxAsset;
    const layer = createLayer("animated", "Configured flipbook", sheet.id);
    layer.frameAnimation = {
      framesPerSecond: 30,
      startFrame: 1,
      endFrame: 2,
      playback: "ping-pong",
      loop: false,
      randomStartFrame: true,
    };
    project.assets.push(sheet);
    project.layers.push(layer);

    const removed = projectAfterAssetChanged(project, {
      ...sheet,
      spriteSheet: null,
    });
    expect(removed.layers[0].frameAnimation).toEqual(DEFAULT_FRAME_ANIMATION);

    const addedAgain = projectAfterAssetChanged(removed, sheet);
    expect(addedAgain.layers[0].frameAnimation).toEqual(
      DEFAULT_FRAME_ANIMATION,
    );
  });

  it("starts from default frame playback when a layer chooses another image", () => {
    const first = {
      ...uploadedAsset("first-sheet"),
      width: 64,
      height: 16,
      spriteSheet: { frameWidth: 16, frameHeight: 16, frameCount: 4 },
    } satisfies VfxAsset;
    const second = {
      ...uploadedAsset("second-sheet"),
      width: 64,
      height: 16,
      spriteSheet: { frameWidth: 16, frameHeight: 16, frameCount: 4 },
    } satisfies VfxAsset;
    const layer = createLayer("animated", "Configured flipbook", first.id);
    layer.frameAnimation = {
      framesPerSecond: 30,
      startFrame: 1,
      endFrame: 2,
      playback: "ping-pong",
      loop: false,
      randomStartFrame: true,
    };
    const onChange = vi.fn();

    render(
      <Inspector
        layer={layer}
        assets={[first, second]}
        layers={[layer]}
        onChange={onChange}
        onAssetChange={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Image"), {
      target: { value: second.id },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: second.id,
        frameAnimation: DEFAULT_FRAME_ANIMATION,
      }),
    );
  });

  it("removes an uploaded asset and all of its references in one project value", () => {
    const project = createEmptyProject("Remove shared image");
    const asset = {
      ...uploadedAsset(),
      width: 64,
      height: 16,
      spriteSheet: { frameWidth: 16, frameHeight: 16, frameCount: 4 },
    } satisfies VfxAsset;
    const layer = createLayer("burst", "Shared roles", asset.id);
    layer.frameAnimation = {
      framesPerSecond: 30,
      startFrame: 1,
      endFrame: 2,
      playback: "ping-pong",
      loop: false,
      randomStartFrame: true,
    };
    layer.spawn.shape = "mask";
    layer.spawn.maskAssetId = asset.id;
    layer.appearance.effects.visualMask = {
      ...layer.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: asset.id,
    };
    project.assets.push(asset);
    project.layers.push(layer);

    const next = projectAfterAssetRemoved(project, asset.id);

    expect(next.assets).not.toContainEqual(asset);
    expect(next.layers[0]).toMatchObject({ assetId: null });
    expect(next.layers[0].frameAnimation).toEqual(DEFAULT_FRAME_ANIMATION);
    expect(next.layers[0].appearance.effects.visualMask).toMatchObject({
      enabled: false,
      maskAssetId: null,
    });
    expect(
      next.layers[0].type === "burst" && next.layers[0].spawn,
    ).toMatchObject({
      shape: "point",
      distribution: "random",
      maskAssetId: null,
    });
    expect(project.assets).toContainEqual(asset);
    expect(layer.assetId).toBe(asset.id);
  });
});

describe("asset removal dialog", () => {
  it("focuses Cancel and explains every removal consequence", () => {
    const project = createEmptyProject("Dialog usage");
    const asset = uploadedAsset();
    const active = createLayer("burst", "Active layer", asset.id);
    active.spawn.shape = "mask";
    active.spawn.maskAssetId = asset.id;
    active.appearance.effects.visualMask = {
      ...active.appearance.effects.visualMask,
      enabled: true,
      maskAssetId: asset.id,
    };
    const stored = createLayer("burst", "Stored layer", "builtin-spark");
    stored.spawn.shape = "line";
    stored.spawn.maskAssetId = asset.id;
    stored.appearance.effects.visualMask = {
      ...stored.appearance.effects.visualMask,
      enabled: false,
      maskAssetId: asset.id,
    };
    project.layers.push(active, stored);
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AssetRemovalDialog
        assetName={asset.name}
        usage={analyzeAssetUsage(project, asset.id)}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: `Remove “${asset.name}”?`,
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(dialog).toHaveTextContent("used by 2 layers");
    expect(dialog).toHaveTextContent("Clear artwork from 1 layer");
    expect(dialog).toHaveTextContent("Turn off visual masking on 1 layer");
    expect(dialog).toHaveTextContent(
      "Forget the saved visual-mask choice on 1 layer",
    );
    expect(dialog).toHaveTextContent(
      "Reset silhouette spawning to one point on 1 layer",
    );
    expect(dialog).toHaveTextContent(
      "Forget the saved spawn-silhouette choice on 1 layer",
    );
    expect(dialog).toHaveTextContent("Active layer");
    expect(dialog).toHaveTextContent("Stored layer");
    expect(dialog).toHaveTextContent("Undo restores the image");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove image" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explains unused removal and closes from its backdrop", () => {
    const project = createEmptyProject("Unused image");
    const asset = uploadedAsset();
    const onClose = vi.fn();
    const { container } = render(
      <AssetRemovalDialog
        assetName={asset.name}
        usage={analyzeAssetUsage(project, asset.id)}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "not used by any layers",
    );
    expect(screen.queryByText("What will change")).toBeNull();
    const backdrop = container.querySelector(".asset-removal-backdrop");
    if (!backdrop) throw new Error("Missing asset-removal backdrop.");
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
