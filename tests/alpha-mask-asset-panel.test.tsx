import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetPanel } from "../src/editor/components/AssetPanel";
import type { VfxAsset } from "../src/vfx/types";

afterEach(cleanup);

const legacyAsset: VfxAsset = {
  id: "legacy-upload",
  name: "Legacy spark",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
  width: 128,
  height: 64,
  spriteSheet: null,
  atlasFrame: null,
};

function renderAsset(asset: VfxAsset) {
  render(
    <AssetPanel
      assets={[asset]}
      selectedId={asset.id}
      onSelect={vi.fn()}
      onUpload={vi.fn()}
      onRename={vi.fn()}
      onChangeAsset={vi.fn()}
      onRemove={vi.fn()}
      onCreateLayer={vi.fn()}
      onError={vi.fn()}
    />,
  );
}

describe("asset spawn-silhouette preparation guidance", () => {
  it("announces an unsupported upload error accessibly", () => {
    render(
      <AssetPanel
        assets={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onRename={vi.fn()}
        onChangeAsset={vi.fn()}
        onRemove={vi.fn()}
        onCreateLayer={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.drop(
      screen.getByRole("button", { name: /bring in your images/i }),
      {
        dataTransfer: {
          files: [
            new File(["not an image"], "mask.jpg", { type: "image/jpeg" }),
          ],
          types: ["Files"],
        },
      },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Vvfx can currently import PNG and WebP images.",
    );
  });

  it("offers one-click preparation for a selected legacy upload", () => {
    renderAsset(legacyAsset);

    expect(
      screen.getByRole("region", { name: "Spawn silhouette" }),
    ).toHaveTextContent("Spawn silhouette unavailable");
    expect(
      screen.getByRole("button", { name: "Prepare as spawn silhouette" }),
    ).toBeEnabled();
  });

  it("shows the stored mask resolution when an upload is ready", () => {
    renderAsset({
      ...legacyAsset,
      alphaMask: {
        columns: 64,
        rows: 32,
        alpha: Array(64 * 32).fill(255),
      },
    });

    const guidance = screen.getByRole("region", {
      name: "Spawn silhouette",
    });
    expect(guidance).toHaveTextContent("Spawn silhouette ready");
    expect(guidance).toHaveTextContent("64 × 32");
    expect(
      screen.queryByRole("button", { name: "Prepare as spawn silhouette" }),
    ).not.toBeInTheDocument();
  });

  it("explains that sprite sheets need a separate still silhouette", () => {
    renderAsset({
      ...legacyAsset,
      spriteSheet: { frameWidth: 32, frameHeight: 32, frameCount: 8 },
      alphaMask: {
        columns: 64,
        rows: 32,
        alpha: Array(64 * 32).fill(255),
      },
    });

    expect(
      screen.getByText("Sprite sheets cannot be spawn silhouettes.")
        .parentElement,
    ).toHaveTextContent("Upload a separate still PNG or WebP");
  });
});
