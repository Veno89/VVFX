import {
  previewRecordingCancellationError,
  type PreviewExportSize,
  type PreviewRecording,
} from "./previewRecording";
import {
  createSpriteSheetAtlas,
  planSpriteSheet,
  spriteSheetFrameName,
} from "./spriteSheetPlan";
import { createZip, type ZipEntry } from "./zip";

function exportBaseName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "effect"
  );
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("A sprite-sheet frame could not be encoded.");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Steps the preview through the active range and returns one ZIP holding the
 * packed sheet, its atlas JSON, and every frame as its own PNG.
 */
export async function recordCanvasAsSpriteSheet({
  source,
  duration,
  framesPerSecond = 15,
  size = {},
  name,
  renderFrame,
  onProgress,
  signal,
}: {
  source: HTMLCanvasElement;
  duration: number;
  framesPerSecond?: number;
  size?: PreviewExportSize;
  name: string;
  renderFrame: (time: number) => Promise<void>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}): Promise<PreviewRecording> {
  const abortIfNeeded = () => {
    if (signal?.aborted) throw previewRecordingCancellationError();
  };
  abortIfNeeded();
  const frameWidth = Math.max(2, Math.round(size.width ?? source.width));
  const frameHeight = Math.max(2, Math.round(size.height ?? source.height));
  const plan = planSpriteSheet({
    duration,
    framesPerSecond,
    frameWidth,
    frameHeight,
  });
  if (!plan.allowed) throw new Error(plan.reason ?? "Sprite sheet too large.");

  const frame = document.createElement("canvas");
  frame.width = frameWidth;
  frame.height = frameHeight;
  const sheet = document.createElement("canvas");
  sheet.width = plan.sheetWidth;
  sheet.height = plan.sheetHeight;
  const frameContext = frame.getContext("2d", { alpha: true });
  const sheetContext = sheet.getContext("2d", { alpha: true });
  if (!frameContext || !sheetContext)
    throw new Error("The sprite-sheet canvas could not be prepared.");
  frameContext.imageSmoothingQuality = "high";

  const baseName = exportBaseName(name);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < plan.frameCount; index += 1) {
    abortIfNeeded();
    const frameTime = Math.min(
      Math.max(0, duration - 1),
      (index / framesPerSecond) * 1000,
    );
    await renderFrame(frameTime);
    abortIfNeeded();
    // Same centered cover crop as video export, so the origin stays centered.
    const sourceAspect = source.width / source.height;
    const targetAspect = frameWidth / frameHeight;
    const cropWidth =
      sourceAspect > targetAspect ? source.height * targetAspect : source.width;
    const cropHeight =
      sourceAspect > targetAspect ? source.height : source.width / targetAspect;
    frameContext.clearRect(0, 0, frameWidth, frameHeight);
    frameContext.drawImage(
      source,
      (source.width - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      frameWidth,
      frameHeight,
    );
    sheetContext.drawImage(
      frame,
      (index % plan.columns) * frameWidth,
      Math.floor(index / plan.columns) * frameHeight,
    );
    entries.push({
      name: `frames/${spriteSheetFrameName(baseName, index)}`,
      data: await canvasPng(frame),
    });
    onProgress?.(((index + 1) / plan.frameCount) * 0.95);
  }
  abortIfNeeded();
  const atlas = createSpriteSheetAtlas({
    baseName,
    plan,
    frameWidth,
    frameHeight,
    framesPerSecond,
  });
  const archive = createZip([
    { name: `${baseName}-sheet.png`, data: await canvasPng(sheet) },
    {
      name: `${baseName}-sheet.json`,
      data: new TextEncoder().encode(JSON.stringify(atlas, null, 2)),
    },
    ...entries,
  ]);
  onProgress?.(1);
  return {
    blob: new Blob([archive.buffer as ArrayBuffer], {
      type: "application/zip",
    }),
    mimeType: "application/zip",
    format: "spritesheet",
    width: plan.sheetWidth,
    height: plan.sheetHeight,
    duration,
  };
}
