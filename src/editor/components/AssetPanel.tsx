"use client";

import {
  CircleCheck,
  Film,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { prepareAlphaMaskFromDataUrl } from "../alphaMaskImport";
import { DEFAULT_FRAME_ANIMATION } from "../../vfx/defaults";
import { maximumAlphaMaskValue } from "../../vfx/alphaMask";
import {
  normalizeSpriteSheet,
  spriteSheetFromGrid,
  spriteSheetGrid,
  suggestedSpriteSheet,
} from "../../vfx/spriteSheet";
import type { VfxAsset } from "../../vfx/types";
import { FlipbookPreview } from "./FlipbookPreview";

async function readImage(file: File): Promise<VfxAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This image could not be read."));
    reader.readAsDataURL(file);
  });
  const inspection = await prepareAlphaMaskFromDataUrl(dataUrl);
  return {
    id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name.replace(/\.(png|webp)$/i, ""),
    mimeType: file.type === "image/webp" ? "image/webp" : "image/png",
    dataUrl,
    transparency: inspection.transparency,
    width: inspection.width,
    height: inspection.height,
    alphaMask: inspection.alphaMask,
    spriteSheet: null,
    atlasFrame: null,
  };
}

function AssetThumb({ asset }: { asset: VfxAsset }) {
  if (asset.builtIn)
    return (
      <span className={`built-in-thumb built-in-thumb--${asset.builtIn}`} />
    );
  // Uploaded data URLs are already local and do not benefit from route-level image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.dataUrl} alt="" />;
}

function AssetFlipbookSetup({
  asset,
  onChange,
}: {
  asset: VfxAsset;
  onChange: (asset: VfxAsset) => void;
}) {
  const sheet = asset.spriteSheet;
  const grid = sheet ? spriteSheetGrid(asset, sheet) : null;
  return (
    <div className="asset-flipbook-setup">
      <label>
        <span>
          <Film size={13} /> Use as a flipbook sprite sheet
        </span>
        <input
          type="checkbox"
          checked={Boolean(sheet)}
          onChange={(event) =>
            onChange({
              ...asset,
              spriteSheet: event.target.checked
                ? suggestedSpriteSheet(asset)
                : null,
            })
          }
        />
      </label>
      {sheet && grid && (
        <>
          <div className="asset-flipbook-grid-fields">
            <label>
              Columns
              <input
                type="number"
                min={1}
                max={64}
                value={grid.columns}
                onChange={(event) =>
                  onChange({
                    ...asset,
                    spriteSheet: spriteSheetFromGrid(
                      asset,
                      Number(event.target.value),
                      grid.rows,
                    ),
                  })
                }
              />
            </label>
            <label>
              Rows
              <input
                type="number"
                min={1}
                max={64}
                value={grid.rows}
                onChange={(event) =>
                  onChange({
                    ...asset,
                    spriteSheet: spriteSheetFromGrid(
                      asset,
                      grid.columns,
                      Number(event.target.value),
                    ),
                  })
                }
              />
            </label>
            <label>
              Frames used
              <input
                type="number"
                min={1}
                max={grid.capacity}
                value={sheet.frameCount}
                onChange={(event) =>
                  onChange({
                    ...asset,
                    spriteSheet: normalizeSpriteSheet(asset, {
                      ...sheet,
                      frameCount: Number(event.target.value),
                    }),
                  })
                }
              />
            </label>
          </div>
          <FlipbookPreview
            asset={asset}
            animation={{
              ...DEFAULT_FRAME_ANIMATION,
              endFrame: sheet.frameCount - 1,
            }}
          />
          <p>
            Configure and preview the source frames here before adding a layer.
            Each layer can choose its own FPS, range, direction, and loop later.
          </p>
        </>
      )}
    </div>
  );
}

function AssetSpawnMaskSetup({
  asset,
  isPreparing,
  onPrepare,
}: {
  asset: VfxAsset;
  isPreparing: boolean;
  onPrepare: () => void;
}) {
  const alphaMask = asset.alphaMask ?? null;
  const maskIsEmpty = Boolean(
    alphaMask && maximumAlphaMaskValue(alphaMask) === 0,
  );
  const usableAlphaMask = asset.spriteSheet || maskIsEmpty ? null : alphaMask;
  return (
    <section
      className={`asset-mask-setup ${usableAlphaMask ? "is-ready" : "is-unavailable"}`}
      aria-label="Spawn silhouette"
      aria-busy={isPreparing}
    >
      <div className="asset-mask-setup__heading">
        <span>
          {usableAlphaMask ? (
            <CircleCheck size={14} aria-hidden="true" />
          ) : (
            <WandSparkles size={14} aria-hidden="true" />
          )}
          <strong>
            {usableAlphaMask
              ? "Spawn silhouette ready"
              : "Spawn silhouette unavailable"}
          </strong>
        </span>
        {usableAlphaMask && (
          <small>
            {usableAlphaMask.columns} × {usableAlphaMask.rows}
          </small>
        )}
      </div>

      {asset.spriteSheet ? (
        <p className="asset-mask-setup__note">
          <strong>Sprite sheets cannot be spawn silhouettes.</strong> Upload a
          separate still PNG or WebP for the silhouette shape.
        </p>
      ) : maskIsEmpty ? (
        <p className="asset-mask-setup__note">
          No visible pixels were found. Choose another still image with visible
          artwork before using it as a spawn silhouette.
        </p>
      ) : usableAlphaMask ? (
        <p>
          This image can guide particle placement across its visible shape. The
          compact mask is saved inside the project for reliable preview and
          export.
        </p>
      ) : (
        <>
          <p>
            This older upload has no spawn silhouette yet. Prepare it once to
            sample its visible pixels without changing the artwork.
          </p>
          <button
            className="asset-mask-setup__prepare"
            type="button"
            disabled={isPreparing}
            aria-busy={isPreparing}
            onClick={onPrepare}
          >
            {isPreparing ? (
              <LoaderCircle
                className="asset-mask-setup__spinner"
                size={13}
                aria-hidden="true"
              />
            ) : (
              <WandSparkles size={13} aria-hidden="true" />
            )}
            {isPreparing
              ? "Preparing spawn silhouette…"
              : "Prepare as spawn silhouette"}
          </button>
        </>
      )}

      {usableAlphaMask && asset.transparency === "no" && (
        <p className="asset-mask-setup__note">
          No transparent pixels were found, so this silhouette fills the
          image&apos;s full rectangle.
        </p>
      )}
    </section>
  );
}

function AssetVisualMaskStatus({ asset }: { asset: VfxAsset }) {
  const ready = !asset.spriteSheet;
  return (
    <section
      className={`asset-mask-setup ${ready ? "is-ready" : "is-unavailable"}`}
      aria-label="Visual mask"
    >
      <div className="asset-mask-setup__heading">
        <span>
          {ready ? (
            <CircleCheck size={14} aria-hidden="true" />
          ) : (
            <WandSparkles size={14} aria-hidden="true" />
          )}
          <strong>
            {ready ? "Ready for visual masking" : "Visual mask unavailable"}
          </strong>
        </span>
      </div>
      <p className={ready ? undefined : "asset-mask-setup__note"}>
        {ready
          ? "Experimental Clipping can use this still image directly at full resolution. No Spawn silhouette preparation is needed."
          : "Sprite sheets cannot be mask images in this bounded version. They can still be clipped by a separate still mask."}
      </p>
    </section>
  );
}

export function AssetPanel({
  assets,
  selectedId,
  onSelect,
  onUpload,
  onRename,
  onChangeAsset,
  onRemove,
  onCreateLayer,
  onError,
}: {
  assets: VfxAsset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpload: (assets: VfxAsset[]) => void;
  onRename: (id: string, name: string) => void;
  onChangeAsset: (asset: VfxAsset) => void;
  onRemove: (id: string) => void;
  onCreateLayer: (assetId: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [preparingUploads, setPreparingUploads] = useState(false);
  const [preparingAssetId, setPreparingAssetId] = useState<string | null>(null);
  const [preparationNotice, setPreparationNotice] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || preparingUploads) return;
    const allowed = [...files].filter(
      (file) => file.type === "image/png" || file.type === "image/webp",
    );
    if (!allowed.length) {
      const message = "Vvfx can currently import PNG and WebP images.";
      setPreparationNotice({ kind: "error", message });
      onError(message);
      return;
    }
    if (allowed.length !== files.length) {
      const message =
        "Some files were skipped. Vvfx currently accepts PNG and WebP images.";
      setPreparationNotice({ kind: "error", message });
      onError(message);
    }
    setPreparingUploads(true);
    setPreparationNotice({
      kind: "status",
      message: `Preparing ${allowed.length === 1 ? "image" : `${allowed.length} images`} and spawn ${allowed.length === 1 ? "silhouette" : "silhouettes"}…`,
    });
    try {
      const uploaded = await Promise.all(allowed.map(readImage));
      onUpload(uploaded);
      const readyCount = uploaded.filter(
        (asset) =>
          asset.alphaMask && maximumAlphaMaskValue(asset.alphaMask) > 0,
      ).length;
      setPreparationNotice({
        kind: "status",
        message:
          readyCount === uploaded.length
            ? `${uploaded.length === 1 ? uploaded[0].name : `${uploaded.length} images`} added with ${uploaded.length === 1 ? "a spawn silhouette" : "spawn silhouettes"} ready.`
            : `${uploaded.length === 1 ? uploaded[0].name : `${uploaded.length} images`} added. ${uploaded.length - readyCount} contained no visible pixels for silhouette spawning.`,
      });
    } catch {
      const message =
        "One of these images could not be prepared. Try exporting it again as PNG or WebP.";
      setPreparationNotice({ kind: "error", message });
      onError(message);
    } finally {
      setPreparingUploads(false);
    }
  };

  const prepareLegacyAsset = async (asset: VfxAsset) => {
    if (asset.builtIn || preparingAssetId) return;
    setPreparingAssetId(asset.id);
    setPreparationNotice({
      kind: "status",
      message: `Preparing ${asset.name} as a spawn silhouette…`,
    });
    try {
      const prepared = await prepareAlphaMaskFromDataUrl(asset.dataUrl);
      onChangeAsset({
        ...asset,
        alphaMask: prepared.alphaMask,
        transparency: prepared.transparency,
        width: prepared.width,
        height: prepared.height,
      });
      if (maximumAlphaMaskValue(prepared.alphaMask) === 0) {
        const message = `${asset.name} contains no visible pixels for silhouette spawning.`;
        setPreparationNotice({ kind: "error", message });
        onError(message);
        return;
      }
      setPreparationNotice({
        kind: "status",
        message: `${asset.name} is ready to use as a spawn silhouette.`,
      });
    } catch {
      const message = `${asset.name} could not be prepared as a spawn silhouette. Re-upload the original PNG or WebP and try again.`;
      setPreparationNotice({ kind: "error", message });
      onError(message);
    } finally {
      setPreparingAssetId(null);
    }
  };

  return (
    <aside
      className="panel asset-panel"
      aria-label="Asset library"
      aria-busy={preparingUploads || Boolean(preparingAssetId)}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Images</span>
          <h2>Asset library</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          disabled={preparingUploads}
          onClick={() => inputRef.current?.click()}
          title="Upload PNG or WebP"
          aria-label="Upload images"
        >
          <Upload size={16} />
        </button>
      </div>
      <button
        data-asset-dropzone
        className={`upload-zone ${draggingFiles ? "is-dragging" : ""}`}
        type="button"
        disabled={preparingUploads}
        aria-busy={preparingUploads}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDraggingFiles(true);
          }
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setDraggingFiles(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraggingFiles(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <ImagePlus size={18} />
        <span>
          <strong>
            {preparingUploads
              ? "Preparing images and silhouettes…"
              : draggingFiles
                ? "Drop to add images"
                : "Bring in your images"}
          </strong>
          <small>
            {preparingUploads
              ? "This usually takes only a moment"
              : "Drop or browse · PNG or WebP · several at once"}
          </small>
        </span>
      </button>
      <input
        ref={inputRef}
        hidden
        multiple
        disabled={preparingUploads}
        type="file"
        accept="image/png,image/webp,.png,.webp"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {preparationNotice && (
        <p
          className={`asset-preparation-notice asset-preparation-notice--${preparationNotice.kind}`}
          role={preparationNotice.kind === "error" ? "alert" : "status"}
          aria-live={
            preparationNotice.kind === "error" ? "assertive" : "polite"
          }
        >
          {preparationNotice.message}
        </p>
      )}

      <div className="asset-list">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className={`asset-card ${selectedId === asset.id ? "is-selected" : ""}`}
          >
            <button
              className="asset-card__select"
              type="button"
              onClick={() => onSelect(asset.id)}
              aria-label={`Select ${asset.name}`}
              aria-pressed={selectedId === asset.id}
            >
              <span className="asset-card__thumb">
                <AssetThumb asset={asset} />
              </span>
            </button>
            <span className="asset-card__meta">
              <input
                aria-label={`Rename ${asset.name}`}
                value={asset.name}
                onFocus={() => onSelect(asset.id)}
                onChange={(event) => onRename(asset.id, event.target.value)}
              />
              <small>
                {asset.builtIn
                  ? "Built-in shape"
                  : asset.spriteSheet
                    ? `Sprite sheet · ${asset.spriteSheet.frameCount} frames`
                    : asset.atlasFrame
                      ? `Atlas frame · ${asset.atlasFrame}`
                      : asset.mimeType.replace("image/", "").toUpperCase()}
              </small>
            </span>
            <span className="asset-card__actions">
              <button
                type="button"
                onClick={() => onCreateLayer(asset.id)}
                title="Use in a new animated layer"
                aria-label={`Create a layer with ${asset.name}`}
              >
                <Plus size={14} />
              </button>
              {!asset.builtIn && (
                <button
                  type="button"
                  onClick={() => onRemove(asset.id)}
                  title="Remove asset"
                  aria-label={`Remove ${asset.name}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </span>
            {asset.transparency === "no" && (
              <span className="asset-warning">
                No transparent pixels found. It will still work, but its
                background may show.
              </span>
            )}
            {selectedId === asset.id && (
              <>
                <AssetVisualMaskStatus asset={asset} />
                {!asset.builtIn && (
                  <>
                    <AssetSpawnMaskSetup
                      asset={asset}
                      isPreparing={preparingAssetId === asset.id}
                      onPrepare={() => void prepareLegacyAsset(asset)}
                    />
                    <AssetFlipbookSetup
                      asset={asset}
                      onChange={onChangeAsset}
                    />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mini-lesson">
        <WandSparkles size={15} />
        <p>
          <strong>Start with white artwork.</strong> Tint can turn one white
          image into any color later.
        </p>
      </div>
    </aside>
  );
}
