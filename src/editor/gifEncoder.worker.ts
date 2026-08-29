/// <reference lib="webworker" />

import { GifEncoder } from "./gifEncoder";

type GifWorkerRequest =
  | { id: number; type: "init"; width: number; height: number }
  | {
      id: number;
      type: "frame";
      rgba: ArrayBuffer;
      delayMs: number;
    }
  | { id: number; type: "finish" };

const workerScope = self as DedicatedWorkerGlobalScope;
let encoder: GifEncoder | null = null;

workerScope.addEventListener(
  "message",
  (event: MessageEvent<GifWorkerRequest>) => {
    const request = event.data;
    try {
      if (request.type === "init") {
        encoder = new GifEncoder(request.width, request.height);
        workerScope.postMessage({ id: request.id, ok: true });
        return;
      }
      if (!encoder) throw new Error("The GIF encoder was not initialized.");
      if (request.type === "frame") {
        encoder.addFrame({
          rgba: new Uint8ClampedArray(request.rgba),
          delayMs: request.delayMs,
        });
        workerScope.postMessage({ id: request.id, ok: true });
        return;
      }

      const bytes = Uint8Array.from(encoder.finish());
      encoder = null;
      workerScope.postMessage(
        { id: request.id, ok: true, bytes: bytes.buffer },
        [bytes.buffer],
      );
    } catch (error) {
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "GIF encoding failed.",
      });
    }
  },
);
