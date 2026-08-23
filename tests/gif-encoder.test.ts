import { describe, expect, it } from "vitest";
import { encodeGif } from "../src/editor/gifEncoder";
import { centeredCoverSourceRect } from "../src/editor/previewRecording";

function decodeImageData(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  const globalTableSize = 2 ** ((bytes[10] & 0x07) + 1) * 3;
  let offset = 13 + globalTableSize;

  while (offset < bytes.length && bytes[offset] !== 0x3b) {
    const marker = bytes[offset++];
    if (marker === 0x21) {
      offset += 1;
      while (bytes[offset] !== 0) offset += bytes[offset] + 1;
      offset += 1;
      continue;
    }
    if (marker !== 0x2c) throw new Error("Unexpected GIF block.");

    const packed = bytes[offset + 8];
    offset += 9;
    if (packed & 0x80) offset += 2 ** ((packed & 0x07) + 1) * 3;
    const minimumCodeSize = bytes[offset++];
    const compressed: number[] = [];
    while (bytes[offset] !== 0) {
      const length = bytes[offset++];
      compressed.push(...bytes.slice(offset, offset + length));
      offset += length;
    }
    offset += 1;

    const clearCode = 1 << minimumCodeSize;
    const endCode = clearCode + 1;
    let dictionary: number[][] = [];
    let codeSize = minimumCodeSize + 1;
    let bitOffset = 0;
    let previous: number[] | null = null;
    const output: number[] = [];
    const reset = () => {
      dictionary = Array.from({ length: endCode + 1 }, (_, index) =>
        index < clearCode ? [index] : [],
      );
      codeSize = minimumCodeSize + 1;
      previous = null;
    };
    const readCode = () => {
      let code = 0;
      for (let bit = 0; bit < codeSize; bit += 1) {
        const absoluteBit = bitOffset + bit;
        code |=
          ((compressed[Math.floor(absoluteBit / 8)] >> (absoluteBit % 8)) &
            1) <<
          bit;
      }
      bitOffset += codeSize;
      return code;
    };

    reset();
    while (bitOffset + codeSize <= compressed.length * 8) {
      const code = readCode();
      if (code === clearCode) {
        reset();
        continue;
      }
      if (code === endCode) break;
      const entry: number[] | null =
        code < dictionary.length
          ? dictionary[code]
          : code === dictionary.length && previous
            ? [...previous, previous[0]]
            : null;
      if (!entry?.length) throw new Error("Invalid GIF LZW code.");
      output.push(...entry);
      if (previous) {
        dictionary.push([...previous, entry[0]]);
        if (dictionary.length === 1 << codeSize && codeSize < 12) codeSize += 1;
      }
      previous = entry;
    }
    frames.push(Uint8Array.from(output));
  }
  return frames;
}

describe("local GIF preview export", () => {
  it("encodes a looping transparent multi-frame GIF", () => {
    const first = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const second = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255]);
    const bytes = encodeGif(2, 1, [
      { rgba: first, delayMs: 100 },
      { rgba: second, delayMs: 100 },
    ]);

    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
    expect(bytes[6]).toBe(2);
    expect(bytes[7]).toBe(0);
    expect(bytes[8]).toBe(1);
    expect(bytes.at(-1)).toBe(0x3b);
    const graphicControls = [...bytes].filter(
      (value, index) => value === 0x21 && bytes[index + 1] === 0xf9,
    );
    expect(graphicControls).toHaveLength(2);
    expect(new TextDecoder().decode(bytes)).toContain("NETSCAPE2.0");
    expect(decodeImageData(bytes)).toEqual([
      Uint8Array.from([211, 0]),
      Uint8Array.from([37, 6]),
    ]);
  });

  it("keeps LZW code-width changes valid on larger frames", () => {
    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    for (let pixel = 0; pixel < 64 * 64; pixel += 1) {
      rgba[pixel * 4] = (pixel * 17) % 256;
      rgba[pixel * 4 + 1] = (pixel * 31) % 256;
      rgba[pixel * 4 + 2] = (pixel * 47) % 256;
      rgba[pixel * 4 + 3] = 255;
    }
    const [decoded] = decodeImageData(
      encodeGif(64, 64, [{ rgba, delayMs: 67 }]),
    );
    expect(decoded).toHaveLength(64 * 64);
  });

  it("rejects empty or incorrectly sized frame sets", () => {
    expect(() => encodeGif(2, 2, [])).toThrow(/at least one frame/i);
    expect(() =>
      encodeGif(2, 2, [{ rgba: new Uint8ClampedArray(4), delayMs: 100 }]),
    ).toThrow(/dimensions/i);
  });

  it("computes centered crops for square and widescreen outputs", () => {
    expect(centeredCoverSourceRect(820, 470, 720, 720)).toEqual({
      x: 175,
      y: 0,
      width: 470,
      height: 470,
    });
    const widescreen = centeredCoverSourceRect(820, 470, 1280, 720);
    expect(widescreen.x).toBe(0);
    expect(widescreen.width).toBe(820);
    expect(widescreen.y).toBeCloseTo(4.375);
    expect(widescreen.height).toBeCloseTo(461.25);
  });
});
