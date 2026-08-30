import { deflateSync } from "node:zlib";
import type { PortableImageMimeType } from "../../src/vfx/portableImage";

export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export const TINY_WEBP_BASE64 =
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;
export const TINY_WEBP_DATA_URL = `data:image/webp;base64,${TINY_WEBP_BASE64}`;

export function bytesFromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}

export function portableImageBytes(
  mimeType: PortableImageMimeType,
): Uint8Array {
  return bytesFromBase64(
    mimeType === "image/png" ? TINY_PNG_BASE64 : TINY_WEBP_BASE64,
  );
}

export function portableImageDataUrl(
  mimeType: PortableImageMimeType,
  bytes: Uint8Array,
): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function portableImageFile(
  mimeType: PortableImageMimeType,
  name = mimeType === "image/png" ? "tiny.png" : "tiny.webp",
  width = 1,
  height = 1,
): File {
  const bytes =
    mimeType === "image/png"
      ? validPngBytes(width, height)
      : portableImageBytes(mimeType);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], name, { type: mimeType });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, Buffer.from(data)])),
    8 + data.byteLength,
  );
  return chunk;
}

export function validPngBytes(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number] = [255, 255, 255, 255],
  compressionLevel?: number,
): Uint8Array {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("PNG fixture dimensions must be positive integers.");

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowLength = 1 + width * 4;
  const pixels = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength + 1;
    for (let x = 0; x < width; x += 1) {
      const pixelStart = rowStart + x * 4;
      pixels[pixelStart] = rgba[0];
      pixels[pixelStart + 1] = rgba[1];
      pixels[pixelStart + 2] = rgba[2];
      pixels[pixelStart + 3] = rgba[3];
    }
  }

  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk(
        "IDAT",
        deflateSync(
          pixels,
          compressionLevel === undefined
            ? undefined
            : { level: compressionLevel },
        ),
      ),
      pngChunk("IEND", new Uint8Array()),
    ]),
  );
}

/**
 * Produces a valid, deliberately low-compression PNG for aggregate byte-limit
 * browser tests. A solid image keeps the fixture deterministic while zlib
 * level 0 prevents it from collapsing to a tiny payload.
 */
export function validStoredPngBytes(
  width: number,
  height: number,
  rgba?: readonly [number, number, number, number],
): Uint8Array {
  return validPngBytes(width, height, rgba, 0);
}

export function validPngDataUrl(
  width: number,
  height: number,
  rgba?: readonly [number, number, number, number],
): string {
  return portableImageDataUrl("image/png", validPngBytes(width, height, rgba));
}

export function pngWithDimensions(width: number, height: number): Uint8Array {
  const bytes = portableImageBytes("image/png");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(16, width);
  view.setUint32(20, height);
  // Keep the mutated IHDR structurally valid so boundary tests exercise the
  // dimension and aggregate-pixel limits instead of failing at the CRC check.
  view.setUint32(29, crc32(bytes.subarray(12, 29)));
  return bytes;
}

export function pngWithIhdrLength(length: number): Uint8Array {
  const bytes = portableImageBytes("image/png");
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    8,
    length,
  );
  return bytes;
}

export function pngWithAnimationControl(): Uint8Array {
  const bytes = portableImageBytes("image/png");
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(1, 0);
  animationControl.writeUInt32BE(0, 4);
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from(bytes.subarray(0, 33)),
      pngChunk("acTL", animationControl),
      Buffer.from(bytes.subarray(33)),
    ]),
  );
}

export function pngWithIhdrMethod(
  field: "compression" | "filter" | "interlace",
  value: number,
): Uint8Array {
  const bytes = portableImageBytes("image/png");
  const fieldOffset = { compression: 26, filter: 27, interlace: 28 }[field];
  bytes[fieldOffset] = value;
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    29,
    crc32(bytes.subarray(12, 29)),
  );
  return bytes;
}

function webpChunk(type: string, data: Uint8Array): Buffer {
  const paddedLength = data.byteLength + (data.byteLength % 2);
  const chunk = Buffer.alloc(8 + paddedLength);
  chunk.write(type, 0, 4, "ascii");
  chunk.writeUInt32LE(data.byteLength, 4);
  Buffer.from(data).copy(chunk, 8);
  return chunk;
}

export function extendedWebpBytes(
  canvasWidth: number,
  canvasHeight: number,
  payloadWidth: number,
  payloadHeight: number,
  animated = false,
): Uint8Array {
  const source = portableImageBytes("image/webp");
  const sourceView = new DataView(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  const payloadLength = sourceView.getUint32(16, true);
  const payload = Uint8Array.from(source.subarray(20, 20 + payloadLength));
  const widthBits = payloadWidth - 1;
  const heightBits = payloadHeight - 1;
  payload[1] = widthBits & 0xff;
  payload[2] = ((widthBits >> 8) & 0x3f) | ((heightBits & 0x03) << 6);
  payload[3] = (heightBits >> 2) & 0xff;
  payload[4] = (heightBits >> 10) & 0x0f;

  const extendedHeader = Buffer.alloc(10);
  extendedHeader[0] = animated ? 0x02 : 0;
  extendedHeader.writeUIntLE(canvasWidth - 1, 4, 3);
  extendedHeader.writeUIntLE(canvasHeight - 1, 7, 3);
  const chunks = Buffer.concat([
    webpChunk("VP8X", extendedHeader),
    webpChunk("VP8L", payload),
  ]);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, 4, "ascii");
  riff.writeUInt32LE(4 + chunks.byteLength, 4);
  riff.write("WEBP", 8, 4, "ascii");
  return Uint8Array.from(Buffer.concat([riff, chunks]));
}

export function webpWithRiffSize(size: number): Uint8Array {
  const bytes = portableImageBytes("image/webp");
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    4,
    size,
    true,
  );
  return bytes;
}

export function webpWithChunkSize(size: number): Uint8Array {
  const bytes = portableImageBytes("image/webp");
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    16,
    size,
    true,
  );
  return bytes;
}
