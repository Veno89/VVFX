import {
  createGifEncodingSession,
  type GifEncodingSession,
} from "./gifEncodingWorker";

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
  signal: AbortSignal;
}

export const GIF_MAX_FRAMES = 450;
export const GIF_MAX_PIXEL_FRAMES = 124_416_000;
export const GIF_MAX_ESTIMATED_OUTPUT_BYTES = 64 * 1024 * 1024;
export const GIF_ESTIMATED_BYTES_PER_PIXEL_FRAME = 1.4;
export const WEBM_STOP_TIMEOUT_MS = 5_000;

export interface GifRecordingWork {
  allowed: boolean;
  frameCount: number;
  pixelFrames: number;
  estimatedOutputBytes: number;
  maxDurationMs: number;
  reason: string | null;
}

export function previewRecordingCancellationError(): Error {
  const error = new Error("Preview export canceled.");
  error.name = "AbortError";
  return error;
}

export function isPreviewRecordingCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfRecordingAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw previewRecordingCancellationError();
}

export function analyzeGifRecordingWork({
  duration,
  width,
  height,
  framesPerSecond = 15,
}: {
  duration: number;
  width: number;
  height: number;
  framesPerSecond?: number;
}): GifRecordingWork {
  const normalizedWidth = Math.max(2, Math.floor(width / 2) * 2);
  const normalizedHeight = Math.max(2, Math.floor(height / 2) * 2);
  const normalizedFps = Math.max(1, framesPerSecond);
  const frameCount = Math.max(
    1,
    Math.ceil((Math.max(1, duration) / 1000) * normalizedFps),
  );
  const pixelFrames = normalizedWidth * normalizedHeight * frameCount;
  const estimatedBytesPerFrame =
    normalizedWidth * normalizedHeight * GIF_ESTIMATED_BYTES_PER_PIXEL_FRAME +
    2_048;
  const estimatedOutputBytes = Math.ceil(estimatedBytesPerFrame * frameCount);
  const maxFramesForSize = Math.max(
    1,
    Math.min(
      GIF_MAX_FRAMES,
      Math.floor(GIF_MAX_PIXEL_FRAMES / (normalizedWidth * normalizedHeight)),
      Math.floor(GIF_MAX_ESTIMATED_OUTPUT_BYTES / estimatedBytesPerFrame),
    ),
  );
  const maxDurationMs = Math.floor((maxFramesForSize / normalizedFps) * 1000);
  const allowed =
    frameCount <= GIF_MAX_FRAMES &&
    pixelFrames <= GIF_MAX_PIXEL_FRAMES &&
    estimatedOutputBytes <= GIF_MAX_ESTIMATED_OUTPUT_BYTES;
  return {
    allowed,
    frameCount,
    pixelFrames,
    estimatedOutputBytes,
    maxDurationMs,
    reason: allowed
      ? null
      : `This GIF would encode ${frameCount} frames (${(
          pixelFrames / 1_000_000
        ).toFixed(1)} megapixel-frames, about ${(
          estimatedOutputBytes /
          (1024 * 1024)
        ).toFixed(
          1,
        )} MiB), above the safe export limit. Choose a smaller size or shorten the effect to about ${(
          maxDurationMs / 1000
        ).toFixed(1)} seconds or less.`,
  };
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

export function waitForAnimationFrames(
  count = 1,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frameId: number | null = null;
    let settled = false;
    const cleanup = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(previewRecordingCancellationError());
    };
    const wait = (remaining: number) => {
      if (remaining <= 0) {
        finish();
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        wait(remaining - 1);
      });
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    wait(count);
  });
}

function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(previewRecordingCancellationError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(previewRecordingCancellationError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function awaitWithSignalAndTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () =>
      finish(() => reject(previewRecordingCancellationError()));
    const timer = window.setTimeout(
      () => finish(() => reject(new Error(timeoutMessage))),
      Math.max(1, timeoutMs),
    );
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export async function recordCanvasAsWebm({
  source,
  duration,
  framesPerSecond = 30,
  size = {},
  renderFrame,
  onProgress,
  signal,
  stopTimeoutMs = WEBM_STOP_TIMEOUT_MS,
}: {
  source: HTMLCanvasElement;
  duration: number;
  framesPerSecond?: number;
  size?: PreviewExportSize;
  renderFrame: (time: number) => Promise<void>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  stopTimeoutMs?: number;
}): Promise<PreviewRecording> {
  throwIfRecordingAborted(signal);
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
  let recordingFailure: Error | null = null;
  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      recordingFailure = new Error(
        "The browser stopped recording the preview.",
      );
      reject(recordingFailure);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        reject(new Error("The browser produced an empty preview video."));
        return;
      }
      resolve(blob);
    });
  });
  void completed.catch(() => undefined);

  const draw = () => {
    drawOutputFrame(context, source, output.width, output.height);
  };

  try {
    await awaitWithSignal(renderFrame(0), signal);
    throwIfRecordingAborted(signal);
    draw();
    recorder.start(250);
    const startedAt = performance.now();
    let elapsed = 0;
    while (elapsed < duration) {
      if (recordingFailure) throw recordingFailure;
      await awaitWithSignal(renderFrame(elapsed), signal);
      throwIfRecordingAborted(signal);
      draw();
      onProgress?.(Math.min(0.99, elapsed / duration));
      elapsed = performance.now() - startedAt;
    }
    if (recordingFailure) throw recordingFailure;
    await awaitWithSignal(renderFrame(duration), signal);
    throwIfRecordingAborted(signal);
    draw();
    onProgress?.(1);
    await waitForAnimationFrames(1, signal);
    recorder.stop();
    const blob = await awaitWithSignalAndTimeout(
      completed,
      signal,
      stopTimeoutMs,
      "The browser did not finish the WebM file in time. Try a shorter recording or restart the browser.",
    );
    return {
      blob,
      mimeType,
      format: "webm",
      width: output.width,
      height: output.height,
      duration,
    };
  } finally {
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // The recorder may already be stopping after an abort or encoder error.
      }
    }
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
  signal,
  createEncoder = createGifEncodingSession,
}: {
  source: HTMLCanvasElement;
  duration: number;
  framesPerSecond?: number;
  size?: PreviewExportSize;
  renderFrame: (time: number) => Promise<void>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  createEncoder?: (
    width: number,
    height: number,
    signal?: AbortSignal,
  ) => Promise<GifEncodingSession>;
}): Promise<PreviewRecording> {
  throwIfRecordingAborted(signal);
  const dimensions = outputDimensions(source, size);
  const work = analyzeGifRecordingWork({
    duration,
    width: dimensions.width,
    height: dimensions.height,
    framesPerSecond,
  });
  if (!work.allowed) throw new Error(work.reason ?? "GIF export is too large.");

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

  const encoder = await createEncoder(output.width, output.height, signal);
  let finished = false;
  try {
    const delayMs = Math.max(20, duration / work.frameCount);
    for (let index = 0; index < work.frameCount; index += 1) {
      throwIfRecordingAborted(signal);
      const frameTime = Math.min(
        Math.max(0, duration - 1),
        (index / framesPerSecond) * 1000,
      );
      await awaitWithSignal(renderFrame(frameTime), signal);
      throwIfRecordingAborted(signal);
      drawOutputFrame(context, source, output.width, output.height);
      await encoder.addFrame(
        context.getImageData(0, 0, output.width, output.height).data,
        delayMs,
        signal,
      );
      onProgress?.((index + 1) / work.frameCount);
    }
    const bytes = await encoder.finish(signal);
    finished = true;
    const gifBuffer = Uint8Array.from(bytes).buffer;
    return {
      blob: new Blob([gifBuffer], { type: "image/gif" }),
      mimeType: "image/gif",
      format: "gif",
      width: output.width,
      height: output.height,
      duration,
    };
  } finally {
    if (!finished) encoder.cancel();
  }
}
