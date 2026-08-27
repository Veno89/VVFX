import {
  isSafeImageDimensions,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_BYTES,
} from "./inputLimits";

export type PortableImageMimeType = "image/png" | "image/webp";

export type PortableImageInspection =
  | {
      ok: true;
      mimeType: PortableImageMimeType;
      byteLength: number;
      width: number;
      height: number;
    }
  | { ok: false; error: string };

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodedBase64Length(encoded: string): number {
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return (encoded.length / 4) * 3 - padding;
}

function decodeBase64Prefix(encoded: string, maximumBytes = 32): Uint8Array {
  const output = new Uint8Array(
    Math.min(maximumBytes, decodedBase64Length(encoded)),
  );
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (const character of encoded) {
    if (character === "=" || outputIndex >= output.length) break;
    accumulator = (accumulator << 6) | BASE64_ALPHABET.indexOf(character);
    bits += 6;
    if (bits < 8) continue;
    bits -= 8;
    output[outputIndex] = (accumulator >> bits) & 0xff;
    outputIndex += 1;
    accumulator &= bits === 0 ? 0 : (1 << bits) - 1;
  }
  return output;
}

const hasBytes = (
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
) => expected.every((value, index) => bytes[offset + index] === value);

const littleEndian24 = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function pngChunkCrc(
  bytes: Uint8Array,
  typeOffset: number,
  dataLength: number,
): number {
  let crc = 0xffffffff;
  const end = typeOffset + 4 + dataLength;
  for (let offset = typeOffset; offset < end; offset += 1)
    crc = CRC32_TABLE[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function hasValidPngStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 57) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunkIndex = 0;
  let colorType = -1;
  let bitDepth = -1;
  let hasPalette = false;
  let hasImageData = false;
  let imageDataBytes = 0;
  let imageDataEnded = false;
  while (offset + 12 <= bytes.length) {
    const dataLength = view.getUint32(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + dataLength + 4;
    if (chunkEnd > bytes.length) return false;
    const type = String.fromCharCode(
      bytes[typeOffset],
      bytes[typeOffset + 1],
      bytes[typeOffset + 2],
      bytes[typeOffset + 3],
    );
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (chunkIndex === 0 && (type !== "IHDR" || dataLength !== 13))
      return false;
    if (type === "IHDR" && chunkIndex !== 0) return false;
    if (type === "IHDR") {
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      const allowedBitDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !allowedBitDepths[colorType]?.includes(bitDepth) ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        (bytes[dataOffset + 12] !== 0 && bytes[dataOffset + 12] !== 1)
      )
        return false;
    }
    if (type === "acTL" || type === "fcTL" || type === "fdAT") return false;
    if (type === "PLTE") {
      if (
        hasPalette ||
        hasImageData ||
        colorType === 0 ||
        colorType === 4 ||
        dataLength === 0 ||
        dataLength > 768 ||
        dataLength % 3 !== 0 ||
        (colorType === 3 && dataLength / 3 > 2 ** bitDepth)
      )
        return false;
      hasPalette = true;
    }
    if (type === "IDAT") {
      if (imageDataEnded || (colorType === 3 && !hasPalette)) return false;
      hasImageData = true;
      imageDataBytes += dataLength;
    } else if (hasImageData && type !== "IEND") imageDataEnded = true;
    if (
      type[0] >= "A" &&
      type[0] <= "Z" &&
      type !== "IHDR" &&
      type !== "PLTE" &&
      type !== "IDAT" &&
      type !== "IEND"
    )
      return false;
    const declaredCrc = view.getUint32(dataOffset + dataLength);
    if (pngChunkCrc(bytes, typeOffset, dataLength) !== declaredCrc)
      return false;
    offset = chunkEnd;
    chunkIndex += 1;
    if (type === "IEND")
      return (
        dataLength === 0 &&
        hasImageData &&
        imageDataBytes > 0 &&
        (colorType !== 3 || hasPalette) &&
        offset === bytes.length
      );
  }
  return false;
}

function webpPayloadDimensions(
  bytes: Uint8Array,
  type: string,
  dataOffset: number,
  dataLength: number,
): { width: number; height: number } | null {
  if (type === "VP8L") {
    if (
      dataLength < 5 ||
      dataOffset + 5 > bytes.length ||
      bytes[dataOffset] !== 0x2f ||
      (bytes[dataOffset + 4] & 0xe0) !== 0
    )
      return null;
    return {
      width: 1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8),
      height:
        1 +
        (bytes[dataOffset + 2] >> 6) +
        (bytes[dataOffset + 3] << 2) +
        ((bytes[dataOffset + 4] & 0x0f) << 10),
    };
  }
  if (
    type !== "VP8 " ||
    dataLength < 10 ||
    dataOffset + 10 > bytes.length ||
    (bytes[dataOffset] & 1) !== 0 ||
    !hasBytes(bytes, dataOffset + 3, [0x9d, 0x01, 0x2a])
  )
    return null;
  return {
    width: (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff,
    height: (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff,
  };
}

function hasValidWebpStructure(
  bytes: Uint8Array,
  expectedWidth: number,
  expectedHeight: number,
): boolean {
  if (bytes.length < 30) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    !hasBytes(bytes, 0, [82, 73, 70, 70]) ||
    !hasBytes(bytes, 8, [87, 69, 66, 80]) ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    return false;
  let offset = 12;
  let chunkIndex = 0;
  let hasImagePayload = false;
  let hasAlphaChunk = false;
  let extended = false;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    if (!/^[\x20-\x7e]{4}$/.test(type)) return false;
    const dataLength = view.getUint32(offset + 4, true);
    const paddedLength = dataLength + (dataLength % 2);
    const chunkEnd = offset + 8 + paddedLength;
    if (chunkEnd > bytes.length) return false;
    if (
      chunkIndex === 0 &&
      type !== "VP8 " &&
      type !== "VP8L" &&
      type !== "VP8X"
    )
      return false;
    const dataOffset = offset + 8;
    if (dataLength % 2 === 1 && bytes[dataOffset + dataLength] !== 0)
      return false;
    if (type === "VP8X") {
      if (
        chunkIndex !== 0 ||
        dataLength !== 10 ||
        (bytes[dataOffset] & 0xc1) !== 0 ||
        (bytes[dataOffset] & 0x02) !== 0 ||
        bytes[dataOffset + 1] !== 0 ||
        bytes[dataOffset + 2] !== 0 ||
        bytes[dataOffset + 3] !== 0 ||
        littleEndian24(bytes, dataOffset + 4) + 1 !== expectedWidth ||
        littleEndian24(bytes, dataOffset + 7) + 1 !== expectedHeight
      )
        return false;
      extended = true;
    } else if (type === "ANIM" || type === "ANMF") return false;
    else if (type === "ALPH") {
      if (!extended || hasAlphaChunk || hasImagePayload || dataLength === 0)
        return false;
      hasAlphaChunk = true;
    } else if (type === "VP8 " || type === "VP8L") {
      if (hasImagePayload || (!extended && chunkIndex !== 0)) return false;
      const dimensions = webpPayloadDimensions(
        bytes,
        type,
        dataOffset,
        dataLength,
      );
      if (
        !dimensions ||
        dimensions.width !== expectedWidth ||
        dimensions.height !== expectedHeight
      )
        return false;
      hasImagePayload = true;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  return offset === bytes.length && hasImagePayload;
}

function hasValidContainerStructure(
  bytes: Uint8Array,
  mimeType: PortableImageMimeType,
  width: number,
  height: number,
): boolean {
  return mimeType === "image/png"
    ? hasValidPngStructure(bytes)
    : hasValidWebpStructure(bytes, width, height);
}

function imageDimensions(
  bytes: Uint8Array,
  mimeType: PortableImageMimeType,
  totalBytes: number,
): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (
      bytes.length < 24 ||
      totalBytes < 33 ||
      !hasBytes(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]) ||
      !hasBytes(bytes, 12, [73, 72, 68, 82])
    )
      return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (
    bytes.length < 25 ||
    !hasBytes(bytes, 0, [82, 73, 70, 70]) ||
    !hasBytes(bytes, 8, [87, 69, 66, 80])
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== totalBytes) return null;
  const firstChunkSize = view.getUint32(16, true);
  const paddedChunkSize = firstChunkSize + (firstChunkSize % 2);
  const firstChunkEnd = 20 + paddedChunkSize;
  if (firstChunkEnd > totalBytes) return null;
  if (hasBytes(bytes, 12, [86, 80, 56, 88])) {
    if (
      bytes.length < 30 ||
      firstChunkSize !== 10 ||
      firstChunkEnd + 8 > totalBytes
    )
      return null;
    return {
      width: littleEndian24(bytes, 24) + 1,
      height: littleEndian24(bytes, 27) + 1,
    };
  }
  if (hasBytes(bytes, 12, [86, 80, 56, 76])) {
    return webpPayloadDimensions(bytes, "VP8L", 20, firstChunkSize);
  }
  if (hasBytes(bytes, 12, [86, 80, 56, 32])) {
    return webpPayloadDimensions(bytes, "VP8 ", 20, firstChunkSize);
  }
  return null;
}

export function inspectPortableImageHeader(
  bytes: Uint8Array,
  mimeType: PortableImageMimeType,
  totalBytes: number,
  maximumBytes = MAX_IMAGE_FILE_BYTES,
): PortableImageInspection {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0)
    return { ok: false, error: "The image file is empty or damaged." };
  if (totalBytes > maximumBytes)
    return {
      ok: false,
      error: `Each image must be ${Math.floor(maximumBytes / 1024 / 1024)} MB or smaller.`,
    };
  const dimensions = imageDimensions(bytes, mimeType, totalBytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0)
    return {
      ok: false,
      error: `The file contents are not a valid ${mimeType === "image/png" ? "PNG" : "WebP"} image.`,
    };
  if (!isSafeImageDimensions(dimensions.width, dimensions.height))
    return {
      ok: false,
      error: `Images are limited to ${MAX_IMAGE_DIMENSION} by ${MAX_IMAGE_DIMENSION} pixels.`,
    };
  return {
    ok: true,
    mimeType,
    byteLength: totalBytes,
    ...dimensions,
  };
}

export function inspectPortableImageDataUrl(
  dataUrl: string,
  expectedMimeType?: PortableImageMimeType,
  maximumBytes = MAX_IMAGE_FILE_BYTES,
): PortableImageInspection {
  if (typeof dataUrl !== "string")
    return {
      ok: false,
      error: "Images must use a canonical embedded PNG or WebP data URL.",
    };
  const mimeType: PortableImageMimeType | null = dataUrl.startsWith(
    "data:image/png;base64,",
  )
    ? "image/png"
    : dataUrl.startsWith("data:image/webp;base64,")
      ? "image/webp"
      : null;
  if (!mimeType || (expectedMimeType && expectedMimeType !== mimeType))
    return {
      ok: false,
      error: "Images must use a canonical embedded PNG or WebP data URL.",
    };
  const encoded = dataUrl.slice(`data:${mimeType};base64,`.length);
  const maximumEncodedLength = Math.ceil(maximumBytes / 3) * 4;
  if (
    encoded.length === 0 ||
    encoded.length > maximumEncodedLength ||
    encoded.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(encoded)
  )
    return {
      ok: false,
      error: "The embedded image data is damaged or exceeds its size limit.",
    };
  const finalDataCharacter =
    encoded[encoded.length - (encoded.endsWith("==") ? 3 : 2)];
  const finalValue = BASE64_ALPHABET.indexOf(finalDataCharacter);
  if (
    (encoded.endsWith("==") && (finalValue & 0x0f) !== 0) ||
    (encoded.endsWith("=") &&
      !encoded.endsWith("==") &&
      (finalValue & 0x03) !== 0)
  )
    return {
      ok: false,
      error: "The embedded image data is not canonical base64.",
    };
  const byteLength = decodedBase64Length(encoded);
  const bytes = decodeBase64Prefix(encoded, byteLength);
  const inspection = inspectPortableImageHeader(
    bytes,
    mimeType,
    byteLength,
    maximumBytes,
  );
  if (!inspection.ok) return inspection;
  if (
    !hasValidContainerStructure(
      bytes,
      mimeType,
      inspection.width,
      inspection.height,
    )
  )
    return {
      ok: false,
      error: `The ${mimeType === "image/png" ? "PNG" : "WebP"} container is incomplete or damaged.`,
    };
  return inspection;
}
