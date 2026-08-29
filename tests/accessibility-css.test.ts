import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff)
  );
}

function contrast(left: string, right: string) {
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("editor accessibility CSS contract", () => {
  it("keeps semantic secondary text above 4.5:1 on every panel token", () => {
    for (const foreground of ["#a0a9ba", "#8e97a9"])
      for (const background of ["#090b11", "#10131b", "#151923", "#1a1f2b"])
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("defines reduced-motion, forced-color, and narrow reflow safeguards", async () => {
    const css = await readFile(resolve("app", "globals.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/forced-colors:\s*active/);
    expect(css).toMatch(/min-width:\s*320px/);
    expect(css).not.toMatch(/min-width:\s*1120px/);
  });
});
