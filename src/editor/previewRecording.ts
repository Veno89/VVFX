import { GifEncoder } from "./gifEncoder";

export const WEBM_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export interface PreviewRecording {
  blob: Blob;
  mimeType: string;
  format: "webm" | "gif";
  width: number;
  height: number;
  duration: number;
}

export interface PreviewExportSize {
  width?: number;
  height?: number;
}

export interface PreviewRecordingRequest {
  format: "webm" | "gif";
  size: PreviewExportSize;
}

export function centeredCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  if (sourceAspect > targetAspect) {
    const width = sourceHeight * targetAspect;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetAspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

function outputDimensions(source: HTMLCanvasElement, size: PreviewExportSize) {
  return {
    width: Math.max(2, Math.floor((size.width ?? source.width) / 2) * 2),
    height: Math.max(2, Math.floor((size.height ?? source.height) / 2) * 2),
  };
}

function drawOutputFrame(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const crop = centeredCoverSourceRect(
    source.width,
    source.height,
    width,
    height,
  );
  context.clearRect(0, 0, width, height);
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
}

export function selectWebmMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return WEBM_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? null;
}

export function canRecordWebm(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "captureStream" in HTMLCanvasElement.prototype &&
    selectWebmMimeType((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) !== null
  );
}

export function waitForAnimationFrames(count = 1): Promise<void> {
  return new Promise((resolve) => {
    const wait = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => wait(remaining - 1));
    };
    wait(count);
  });
}

export async function recordCanvasAsWebm({
  source,
  duration,
  framesPerSecond = 30,
  size = {},
  renderFrame,
  onProgress,
}: {
  source: HTMLCanvasElement;
  duration: number;
  framesPerSecond?: number;
  size?: PreviewExportSize;
  renderFrame: (time: number) => Promise<void>;
  onProgress?: (progress: number) => void;
}): Promise<PreviewRecording> {
  if (!canRecordWebm())
    throw new Error(
      "This browser cannot record WebM video. Try the latest Chrome, Edge, or Firefox.",
    );

  const mimeType = selectWebmMimeType((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );
  if (!mimeType) throw new Error("No compatible WebM encoder was found.");

  const output = document.createElement("canvas");
  const dimensions = outputDimensions(source, size);
  output.width = dimensions.width;
  output.height = dimensions.height;
  const context = output.getContext("2d", { alpha: true });
  if (!context) throw new Error("The preview canvas could not be prepared.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const stream = output.captureStream(framesPerSecond);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks: Blob[] = [];
  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", () =>
      reject(new Error("The browser stopped recording the preview.")),
    );
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        reject(new Error("The browser produced an empty preview video."));
        return;
      }
      resolve(blob);
    });
  });

  const draw = () => {
    drawOutputFrame(context, source, output.width, output.height);
  };

  try {
    await renderFrame(0);
    draw();
    recorder.start(250);
    const startedAt = performance.now();
    let elapsed = 0;
    while (elapsed < duration) {
      await renderFrame(elapsed);
      draw();
      onProgress?.(Math.min(0.99, elapsed / duration));
      elapsed = performance.now() - startedAt;
    }
    await renderFrame(duration);
    draw();
    onProgress?.(1);
    await waitForAnimationFrames(1);
    recorder.stop();
    const blob = await completed;
    return {
      blob,
      mimeType,
      format: "webm",
      width: output.width,
      height: output.height,
      duration,
    };
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  }
}

export async function recordCanvasAsGif({
  source,
  duration,
  framesPerSecond = 15,
  size = {},
  renderFrame,
  onProgress,
}: {
  source: HTMLCanvasElement;
  duration: number;
  framesPerSecond?: number;
  size?: PreviewExportSize;
  renderFrame: (time: number) => Promise<void>;
  onProgress?: (progress: number) => void;
}): Promise<PreviewRecording> {
  const dimensions = outputDimensions(source, size);
  const output = document.createElement("canvas");
  output.width = dimensions.width;
  output.height = dimensions.height;
  const context = output.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });
  if (!context) throw new Error("The GIF canvas could not be prepared.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const frameCount = Math.max(
    1,
    Math.ceil((Math.max(1, duration) / 1000) * framesPerSecond),
  );
  const encoder = new GifEncoder(output.width, output.height);
  const delayMs = Math.max(20, duration / frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    const frameTime = Math.min(
      Math.max(0, duration - 1),
      (index / framesPerSecond) * 1000,
    );
    await renderFrame(frameTime);
    drawOutputFrame(context, source, output.width, output.height);
    encoder.addFrame({
      rgba: context.getImageData(0, 0, output.width, output.height).data,
      delayMs,
    });
    onProgress?.((index + 1) / frameCount);
  }
  const bytes = encoder.finish();
  const gifBuffer = Uint8Array.from(bytes).buffer;
  return {
    blob: new Blob([gifBuffer], { type: "image/gif" }),
    mimeType: "image/gif",
    format: "gif",
    width: output.width,
    height: output.height,
    duration,
  };
}
