import { EMBEDDED_IMAGE_VALIDATION_TIMEOUT_MS } from "../vfx/inputLimits";
import type { VfxAsset } from "../vfx/types";
import { verifyPortableImageDataUrl } from "./alphaMaskImport";

const MAX_CONCURRENT_IMAGE_DECODES = 2;

const cancelledError = () =>
  new DOMException("Embedded image validation was cancelled.", "AbortError");

/**
 * Fully decodes embedded assets before an imported or stored collection can be
 * activated. Work and lifetime are bounded independently of the collection's
 * structural limits.
 */
export async function verifyEmbeddedAssetImages(
  assets: readonly VfxAsset[],
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw cancelledError();

  const seenSources = new Set<string>();
  const embedded = assets.filter((asset) => {
    if (asset.builtIn || seenSources.has(asset.dataUrl)) return false;
    seenSources.add(asset.dataUrl);
    return true;
  });
  if (embedded.length === 0) return;

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, EMBEDDED_IMAGE_VALIDATION_TIMEOUT_MS);
  let cursor = 0;

  const worker = async () => {
    while (cursor < embedded.length) {
      const asset = embedded[cursor++];
      try {
        await verifyPortableImageDataUrl(asset.dataUrl, controller.signal);
      } catch (error) {
        if (timedOut)
          throw new Error(
            "Embedded image validation took too long and was stopped.",
          );
        if (signal?.aborted) throw cancelledError();
        const reason =
          error instanceof Error ? error.message : "The image is unreadable.";
        throw new Error(
          `The image “${asset.name}” could not be decoded. ${reason}`,
        );
      }
    }
  };

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_IMAGE_DECODES, embedded.length) },
        () => worker(),
      ),
    );
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
    controller.abort();
  }
}
