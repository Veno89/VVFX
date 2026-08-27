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
import { DEFAULT_FRAME_ANIMATION, makeId } from "../../vfx/defaults";
import { maximumAlphaMaskValue } from "../../vfx/alphaMask";
import {
  MAX_IMAGE_FILE_BYTES,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_EMBEDDED_IMAGE_BYTES,
  MAX_PROJECT_IMAGE_PIXELS,
  MAX_UPLOAD_FILES,
  MAX_VFX_NAME_LENGTH,
} from "../../vfx/inputLimits";
import {
  inspectPortableImageDataUrl,
  inspectPortableImageHeader,
  type PortableImageInspection,
  type PortableImageMimeType,
} from "../../vfx/portableImage";
import {
  normalizeSpriteSheet,
  spriteSheetFromGrid,
  spriteSheetGrid,
  suggestedSpriteSheet,
} from "../../vfx/spriteSheet";
import type { VfxAsset } from "../../vfx/types";
import { FlipbookPreview } from "./FlipbookPreview";

export type PreparedAssetMetadata = Pick<
  VfxAsset,
  "alphaMask" | "transparency" | "width" | "height"
>;

const cancelled = () =>
  new DOMException("Image preparation was cancelled.", "AbortError");

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw cancelled();
}

function readBlob(
  blob: Blob,
  mode: "array-buffer" | "data-url",
  signal: AbortSignal,
): Promise<ArrayBuffer | string> {
  ensureActive(signal);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = () => {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      signal.removeEventListener("abort", abort);
    };
    const finish = (value: ArrayBuffer | string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => {
      try {
        if (reader.readyState === FileReader.LOADING) reader.abort();
      } catch {
        // The cancellation still rejects even when a browser shim cannot abort.
      }
      fail(cancelled());
    };
    reader.onload = () => {
      if (mode === "array-buffer" && reader.result instanceof ArrayBuffer)
        finish(reader.result);
      else if (mode === "data-url" && typeof reader.result === "string")
        finish(reader.result);
      else fail(new Error("This image could not be read."));
    };
    reader.onerror = () => fail(new Error("This image could not be read."));
    reader.onabort = () => fail(cancelled());
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (mode === "array-buffer") reader.readAsArrayBuffer(blob);
      else reader.readAsDataURL(blob);
    } catch (error) {
      fail(
        error instanceof Error
          ? error
          : new Error("This image could not be read."),
      );
    }
  });
}

async function inspectImageFile(
  file: File,
  signal: AbortSignal,
): Promise<Extract<PortableImageInspection, { ok: true }>> {
  const mimeType = file.type as PortableImageMimeType;
  const header = (await readBlob(
    file.slice(0, 32),
    "array-buffer",
    signal,
  )) as ArrayBuffer;
  const headerInspection = inspectPortableImageHeader(
    new Uint8Array(header),
    mimeType,
    file.size,
  );
  if (!headerInspection.ok) throw new Error(headerInspection.error);
  return headerInspection;
}

async function readImage(
  file: File,
  headerInspection: Extract<PortableImageInspection, { ok: true }>,
  signal: AbortSignal,
): Promise<VfxAsset> {
  ensureActive(signal);
  const mimeType = file.type as PortableImageMimeType;
  const dataUrl = (await readBlob(file, "data-url", signal)) as string;
  const dataInspection = inspectPortableImageDataUrl(dataUrl, mimeType);
  if (!dataInspection.ok) throw new Error(dataInspection.error);
  if (
    dataInspection.width !== headerInspection.width ||
    dataInspection.height !== headerInspection.height ||
    dataInspection.byteLength !== headerInspection.byteLength
  )
    throw new Error("The image changed while it was being imported.");
  const inspection = await prepareAlphaMaskFromDataUrl(dataUrl, signal);
  ensureActive(signal);
  if (
    inspection.width !== headerInspection.width ||
    inspection.height !== headerInspection.height
  )
    throw new Error("The decoded image dimensions do not match its header.");
  return {
    id: makeId("asset"),
    name:
      file.name
        .replace(/\.(png|webp)$/i, "")
        .trim()
        .slice(0, MAX_VFX_NAME_LENGTH) || "Imported image",
    mimeType,
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
  projectGeneration = 0,
  selectedId,
  onSelect,
  onUpload,
  onRename,
  onChangeAsset,
  onPrepareAsset,
  onRemove,
  onCreateLayer,
  onError,
}: {
  assets: VfxAsset[];
  projectGeneration?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpload: (assets: VfxAsset[], projectGeneration: number) => boolean | void;
  onRename: (id: string, name: string) => void;
  onChangeAsset: (asset: VfxAsset) => void;
  onPrepareAsset?: (
    assetId: string,
    metadata: PreparedAssetMetadata,
    projectGeneration: number,
  ) => boolean | void;
  onRemove: (id: string) => void;
  onCreateLayer: (assetId: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUploadRef = useRef<AbortController | null>(null);
  const activeLegacyPreparationRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
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

  useEffect(() => {
    const upload = activeUploadRef.current;
    const legacyPreparation = activeLegacyPreparationRef.current;
    activeUploadRef.current = null;
    activeLegacyPreparationRef.current = null;
    upload?.abort();
    legacyPreparation?.abort();
    queueMicrotask(() => {
      if (
        !mountedRef.current ||
        activeUploadRef.current ||
        activeLegacyPreparationRef.current
      ) {
        return;
      }
      setPreparingUploads(false);
      setPreparingAssetId(null);
      setPreparationNotice(null);
      setDraggingFiles(false);
    });
  }, [projectGeneration]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const upload = activeUploadRef.current;
      const legacyPreparation = activeLegacyPreparationRef.current;
      activeUploadRef.current = null;
      activeLegacyPreparationRef.current = null;
      upload?.abort();
      legacyPreparation?.abort();
    };
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || preparingUploads || activeUploadRef.current) return;
    const uploadProjectGeneration = projectGeneration;
    if (files.length > MAX_UPLOAD_FILES) {
      const message = `Add at most ${MAX_UPLOAD_FILES} images at once.`;
      setPreparationNotice({ kind: "error", message });
      onError(message);
      return;
    }
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
    if (assets.length + allowed.length > MAX_PROJECT_ASSETS) {
      const message = `A project can contain at most ${MAX_PROJECT_ASSETS} images, including built-ins.`;
      setPreparationNotice({ kind: "error", message });
      onError(message);
      return;
    }
    const oversized = allowed.find((file) => file.size > MAX_IMAGE_FILE_BYTES);
    if (oversized) {
      const message = `${oversized.name} is larger than the supported ${MAX_IMAGE_FILE_BYTES / 1024 / 1024} MB image limit.`;
      setPreparationNotice({ kind: "error", message });
      onError(message);
      return;
    }
    const controller = new AbortController();
    activeUploadRef.current = controller;
    setPreparingUploads(true);
    setPreparationNotice({
      kind: "status",
      message: `Preparing ${allowed.length === 1 ? "image" : `${allowed.length} images`} and spawn ${allowed.length === 1 ? "silhouette" : "silhouettes"}…`,
    });
    try {
      let existingBytes = 0;
      let existingPixels = 0;
      for (const asset of assets) {
        if (asset.builtIn) continue;
        const inspection = inspectPortableImageDataUrl(
          asset.dataUrl,
          asset.mimeType === "image/webp" ? "image/webp" : "image/png",
        );
        if (!inspection.ok)
          throw new Error(
            `The existing image "${asset.name}" is damaged. Replace or remove it before importing more images.`,
          );
        existingBytes += inspection.byteLength;
        existingPixels += inspection.width * inspection.height;
      }
      const headers: Extract<PortableImageInspection, { ok: true }>[] = [];
      for (const file of allowed) {
        ensureActive(controller.signal);
        headers.push(await inspectImageFile(file, controller.signal));
      }
      const incomingBytes = headers.reduce(
        (total, inspection) => total + inspection.byteLength,
        0,
      );
      if (existingBytes + incomingBytes > MAX_PROJECT_EMBEDDED_IMAGE_BYTES)
        throw new Error(
          `Embedded project images are limited to ${MAX_PROJECT_EMBEDDED_IMAGE_BYTES / 1024 / 1024} MB in total.`,
        );
      const incomingPixels = headers.reduce(
        (total, inspection) => total + inspection.width * inspection.height,
        0,
      );
      if (existingPixels + incomingPixels > MAX_PROJECT_IMAGE_PIXELS)
        throw new Error(
          "These images exceed the project's decoded texture budget.",
        );
      const uploaded: VfxAsset[] = [];
      for (const [index, file] of allowed.entries()) {
        ensureActive(controller.signal);
        uploaded.push(await readImage(file, headers[index], controller.signal));
      }
      if (onUpload(uploaded, uploadProjectGeneration) === false) {
        if (activeUploadRef.current === controller)
          setPreparationNotice({
            kind: "error",
            message:
              "Those images were not added because the project or image library changed.",
          });
        return;
      }
      const readyCount = uploaded.filter(
        (asset) =>
          asset.alphaMask && maximumAlphaMaskValue(asset.alphaMask) > 0,
      ).length;
      if (activeUploadRef.current === controller)
        setPreparationNotice({
          kind: "status",
          message:
            readyCount === uploaded.length
              ? `${uploaded.length === 1 ? uploaded[0].name : `${uploaded.length} images`} added with ${uploaded.length === 1 ? "a spawn silhouette" : "spawn silhouettes"} ready.`
              : `${uploaded.length === 1 ? uploaded[0].name : `${uploaded.length} images`} added. ${uploaded.length - readyCount} contained no visible pixels for silhouette spawning.`,
        });
    } catch (error) {
      if (controller.signal.aborted || activeUploadRef.current !== controller)
        return;
      const message =
        error instanceof Error
          ? error.message
          : "One of these images could not be prepared. Try exporting it again as PNG or WebP.";
      setPreparationNotice({ kind: "error", message });
      onError(message);
    } finally {
      if (activeUploadRef.current === controller) {
        activeUploadRef.current = null;
        if (mountedRef.current) setPreparingUploads(false);
      }
    }
  };

  const prepareLegacyAsset = async (asset: VfxAsset) => {
    if (asset.builtIn || preparingAssetId || activeLegacyPreparationRef.current)
      return;
    const controller = new AbortController();
    activeLegacyPreparationRef.current = controller;
    const preparationProjectGeneration = projectGeneration;
    setPreparingAssetId(asset.id);
    setPreparationNotice({
      kind: "status",
      message: `Preparing ${asset.name} as a spawn silhouette…`,
    });
    try {
      const prepared = await prepareAlphaMaskFromDataUrl(
        asset.dataUrl,
        controller.signal,
      );
      ensureActive(controller.signal);
      const metadata: PreparedAssetMetadata = {
        alphaMask: prepared.alphaMask,
        transparency: prepared.transparency,
        width: prepared.width,
        height: prepared.height,
      };
      const accepted = onPrepareAsset
        ? onPrepareAsset(asset.id, metadata, preparationProjectGeneration)
        : onChangeAsset({ ...asset, ...metadata });
      if (accepted === false) {
        setPreparationNotice({
          kind: "error",
          message:
            "Spawn silhouette preparation was discarded because the image or project changed.",
        });
        return;
      }
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
      if (
        controller.signal.aborted ||
        activeLegacyPreparationRef.current !== controller
      )
        return;
      const message = `${asset.name} could not be prepared as a spawn silhouette. Re-upload the original PNG or WebP and try again.`;
      setPreparationNotice({ kind: "error", message });
      onError(message);
    } finally {
      if (activeLegacyPreparationRef.current === controller) {
        activeLegacyPreparationRef.current = null;
        if (mountedRef.current) setPreparingAssetId(null);
      }
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
              data-asset-select={asset.id}
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
                maxLength={MAX_VFX_NAME_LENGTH}
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
                  disabled={preparingAssetId === asset.id}
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
              <div className="asset-card__details">
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
              </div>
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
