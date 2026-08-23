interface GifFrame {
  rgba: Uint8ClampedArray;
  delayMs: number;
}

class BitWriter {
  private readonly bytes: number[] = [];
  private current = 0;
  private bitCount = 0;

  write(code: number, size: number) {
    this.current |= code << this.bitCount;
    this.bitCount += size;
    while (this.bitCount >= 8) {
      this.bytes.push(this.current & 0xff);
      this.current >>>= 8;
      this.bitCount -= 8;
    }
  }

  finish(): number[] {
    if (this.bitCount > 0) this.bytes.push(this.current & 0xff);
    return this.bytes;
  }
}

function word(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function palette(): number[] {
  const result = [0, 0, 0];
  for (let red = 0; red < 6; red += 1) {
    for (let green = 0; green < 7; green += 1) {
      for (let blue = 0; blue < 6; blue += 1) {
        result.push(
          Math.round((red / 5) * 255),
          Math.round((green / 6) * 255),
          Math.round((blue / 5) * 255),
        );
      }
    }
  }
  while (result.length < 256 * 3) result.push(0, 0, 0);
  return result.slice(0, 256 * 3);
}

function quantize(rgba: Uint8ClampedArray): Uint8Array {
  const indexed = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    if (rgba[source + 3] < 16) {
      indexed[target] = 0;
    } else {
      const red = Math.round((rgba[source] / 255) * 5);
      const green = Math.round((rgba[source + 1] / 255) * 6);
      const blue = Math.round((rgba[source + 2] / 255) * 5);
      indexed[target] = 1 + (red * 7 + green) * 6 + blue;
    }
    target += 1;
  }
  return indexed;
}

function lzw(indices: Uint8Array): number[] {
  const minimumCodeSize = 8;
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const writer = new BitWriter();
  let dictionary = new Map<number, number>();
  let nextCode = endCode + 1;
  let codeSize = minimumCodeSize + 1;
  const reset = () => {
    dictionary = new Map();
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
  };

  writer.write(clearCode, codeSize);
  if (indices.length === 0) {
    writer.write(endCode, codeSize);
    return writer.finish();
  }

  let prefix = indices[0];
  for (let index = 1; index < indices.length; index += 1) {
    const symbol = indices[index];
    const key = prefix * 256 + symbol;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }

    writer.write(prefix, codeSize);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      // The decoder adds each dictionary entry one emitted code later than
      // the encoder, so the wider code size begins only after this boundary.
      if (nextCode > 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      writer.write(clearCode, codeSize);
      reset();
    }
    prefix = symbol;
  }
  writer.write(prefix, codeSize);
  writer.write(endCode, codeSize);
  return writer.finish();
}

function subBlocks(bytes: number[]): number[] {
  const blocks: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const block = bytes.slice(offset, offset + 255);
    blocks.push(block.length, ...block);
  }
  blocks.push(0);
  return blocks;
}

function header(width: number, height: number): number[] {
  if (width < 1 || height < 1 || width > 65_535 || height > 65_535)
    throw new Error("GIF dimensions must be between 1 and 65535 pixels.");
  return [
    ...[..."GIF89a"].map((character) => character.charCodeAt(0)),
    ...word(width),
    ...word(height),
    0xf7,
    0,
    0,
    ...palette(),
    0x21,
    0xff,
    0x0b,
    ...[..."NETSCAPE2.0"].map((character) => character.charCodeAt(0)),
    0x03,
    0x01,
    0,
    0,
    0,
  ];
}

export class GifEncoder {
  private readonly chunks: Uint8Array[];
  private frameCount = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.chunks = [Uint8Array.from(header(width, height))];
  }

  addFrame(frame: GifFrame) {
    if (frame.rgba.length !== this.width * this.height * 4)
      throw new Error("A GIF frame does not match the requested dimensions.");
    const delay = Math.max(2, Math.min(65_535, Math.round(frame.delayMs / 10)));
    const compressed = lzw(quantize(frame.rgba));
    this.chunks.push(
      Uint8Array.from([
        0x21,
        0xf9,
        0x04,
        0x09,
        ...word(delay),
        0,
        0,
        0x2c,
        0,
        0,
        0,
        0,
        ...word(this.width),
        ...word(this.height),
        0,
        8,
        ...subBlocks(compressed),
      ]),
    );
    this.frameCount += 1;
  }

  finish(): Uint8Array {
    if (this.frameCount === 0)
      throw new Error("A GIF needs at least one frame.");
    const length =
      this.chunks.reduce((total, chunk) => total + chunk.length, 0) + 1;
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    result[offset] = 0x3b;
    return result;
  }
}

export function encodeGif(
  width: number,
  height: number,
  frames: GifFrame[],
): Uint8Array {
  const encoder = new GifEncoder(width, height);
  frames.forEach((frame) => encoder.addFrame(frame));
  return encoder.finish();
}
