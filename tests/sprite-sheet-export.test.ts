import { describe, expect, it } from "vitest";
import {
  createSpriteSheetAtlas,
  planSpriteSheet,
  SPRITE_SHEET_MAX_SIDE,
  spriteSheetFrameName,
} from "../src/editor/spriteSheetPlan";
import { crc32, createZip } from "../src/editor/zip";

/** Reads a store-only archive back through its central directory. */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: Array<{ name: string; data: Uint8Array; crc: number }> = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(local + 26, true);
    const start = local + 30 + localNameLength;
    entries.push({ name, data: bytes.subarray(start, start + size), crc });
    offset += 46 + nameLength;
  }
  return entries;
}

describe("sprite-sheet export", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a readable, reproducible store-only ZIP", () => {
    const entries = [
      { name: "effect-sheet.json", data: new TextEncoder().encode("{}") },
      { name: "frames/effect_000.png", data: new Uint8Array([1, 2, 3, 4]) },
    ];
    const archive = createZip(entries);
    expect(createZip(entries)).toEqual(archive);
    const read = readZip(archive);
    expect(read.map((entry) => entry.name)).toEqual(
      entries.map((entry) => entry.name),
    );
    read.forEach((entry, index) => {
      expect([...entry.data]).toEqual([...entries[index].data]);
      expect(entry.crc).toBe(crc32(entries[index].data));
    });
  });

  it("packs frames into the squarest grid within texture limits", () => {
    const plan = planSpriteSheet({
      duration: 1_000,
      framesPerSecond: 15,
      frameWidth: 256,
      frameHeight: 256,
    });
    expect(plan).toMatchObject({
      allowed: true,
      frameCount: 15,
      columns: 4,
      rows: 4,
      sheetWidth: 1024,
      sheetHeight: 1024,
    });

    const wide = planSpriteSheet({
      duration: 3_000,
      framesPerSecond: 30,
      frameWidth: 1280,
      frameHeight: 720,
    });
    expect(wide.sheetWidth).toBeLessThanOrEqual(SPRITE_SHEET_MAX_SIDE);
    expect(wide.allowed).toBe(false);
    expect(wide.reason).toMatch(/limit/);

    expect(
      planSpriteSheet({
        duration: 20_000,
        framesPerSecond: 30,
        frameWidth: 64,
        frameHeight: 64,
      }).reason,
    ).toMatch(/at most/);
  });

  it("describes every frame in a TexturePacker-style atlas", () => {
    const plan = planSpriteSheet({
      duration: 500,
      framesPerSecond: 12,
      frameWidth: 128,
      frameHeight: 64,
    });
    const atlas = createSpriteSheetAtlas({
      baseName: "magic-impact",
      plan,
      frameWidth: 128,
      frameHeight: 64,
      framesPerSecond: 12,
    });
    const names = Object.keys(atlas.frames);
    expect(names).toHaveLength(plan.frameCount);
    expect(names[0]).toBe(spriteSheetFrameName("magic-impact", 0));
    const last = atlas.frames[names.at(-1)!] as {
      frame: { x: number; y: number; w: number; h: number };
    };
    expect(last.frame.x + last.frame.w).toBeLessThanOrEqual(plan.sheetWidth);
    expect(last.frame.y + last.frame.h).toBeLessThanOrEqual(plan.sheetHeight);
    expect(atlas.meta).toMatchObject({
      image: "magic-impact-sheet.png",
      size: { w: plan.sheetWidth, h: plan.sheetHeight },
      frameRate: 12,
    });
  });
});
