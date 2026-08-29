interface WorkerResponse {
  id: number;
  ok: boolean;
  bytes?: ArrayBuffer;
  error?: string;
}

interface PendingRequest {
  resolve: (value: ArrayBuffer | undefined) => void;
  reject: (reason: Error) => void;
  removeAbortListener: () => void;
}

export interface GifEncodingSession {
  addFrame(
    rgba: Uint8ClampedArray,
    delayMs: number,
    signal?: AbortSignal,
  ): Promise<void>;
  finish(signal?: AbortSignal): Promise<Uint8Array>;
  cancel(): void;
}

function cancellationError() {
  const error = new Error("Preview export canceled.");
  error.name = "AbortError";
  return error;
}

export async function createGifEncodingSession(
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<GifEncodingSession> {
  if (typeof Worker === "undefined")
    throw new Error(
      "Animated GIF export requires Web Worker support in this browser.",
    );

  const worker = new Worker(
    new URL("./gifEncoder.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  let nextRequestId = 0;
  let closed = false;
  const pending = new Map<number, PendingRequest>();

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      request.removeAbortListener();
      request.reject(error);
    }
    pending.clear();
  };

  const cancel = () => {
    if (closed) return;
    closed = true;
    worker.terminate();
    rejectPending(cancellationError());
  };

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    request.removeAbortListener();
    if (response.ok) request.resolve(response.bytes);
    else request.reject(new Error(response.error ?? "GIF encoding failed."));
  });
  worker.addEventListener("error", () => {
    if (closed) return;
    closed = true;
    worker.terminate();
    rejectPending(new Error("The GIF encoding worker stopped unexpectedly."));
  });

  const request = (
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
    requestSignal?: AbortSignal,
  ) => {
    if (closed)
      return Promise.reject(new Error("The GIF encoding session is closed."));
    if (requestSignal?.aborted) {
      cancel();
      return Promise.reject(cancellationError());
    }
    const id = ++nextRequestId;
    return new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const onAbort = () => cancel();
      requestSignal?.addEventListener("abort", onAbort, { once: true });
      pending.set(id, {
        resolve,
        reject,
        removeAbortListener: () =>
          requestSignal?.removeEventListener("abort", onAbort),
      });
      try {
        worker.postMessage({ ...message, id }, transfer);
      } catch (error) {
        pending.delete(id);
        requestSignal?.removeEventListener("abort", onAbort);
        reject(
          error instanceof Error
            ? error
            : new Error("The GIF encoding worker could not accept a frame."),
        );
      }
    });
  };

  try {
    await request({ type: "init", width, height }, [], signal);
  } catch (error) {
    cancel();
    throw error;
  }

  return {
    async addFrame(rgba, delayMs, frameSignal) {
      const bytes = rgba.slice();
      await request(
        { type: "frame", rgba: bytes.buffer, delayMs },
        [bytes.buffer],
        frameSignal,
      );
    },
    async finish(finishSignal) {
      const bytes = await request({ type: "finish" }, [], finishSignal);
      if (!bytes) throw new Error("The GIF encoder returned no data.");
      closed = true;
      worker.terminate();
      return new Uint8Array(bytes);
    },
    cancel,
  };
}
