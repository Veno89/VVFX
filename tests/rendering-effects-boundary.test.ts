import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(resolve(path), "utf8");

describe("rendering effects architecture boundary", () => {
  it("keeps the model and evaluator framework-neutral", async () => {
    const model = await source("src/vfx/renderingEffectsModel.ts");
    expect(model).not.toMatch(/(?:from|import\()\s*["']phaser["']/);
    expect(model).not.toContain("Phaser.");
    expect(model).toContain("export function evaluateRenderingEffects");
  });

  it("keeps Phaser resource ownership in the adapter", async () => {
    const adapter = await source("src/vfx/phaserRenderingEffects.ts");
    expect(adapter).toMatch(/import type Phaser from ["']phaser["']/);
    expect(adapter).toContain("export function syncPhaserRenderingEffects");
    expect(adapter).toContain("export function clearPhaserRenderingEffects");
    expect(adapter).toContain("handlesBySprite");
  });

  it("preserves the historical import facade without coupling pure modules", async () => {
    const facade = await source("src/vfx/renderingEffects.ts");
    expect(facade).toContain('export * from "./renderingEffectsModel"');
    expect(facade).toContain('export * from "./phaserRenderingEffects"');

    const pureModules = (await readdir(resolve("src/vfx")))
      .filter((file) => file.endsWith(".ts"))
      .filter(
        (file) =>
          ![
            "renderingEffects.ts",
            "renderingEffectsModel.ts",
            "phaserRenderingEffects.ts",
          ].includes(file),
      );
    for (const file of pureModules) {
      const contents = await source(`src/vfx/${file}`);
      expect(contents, file).not.toContain('from "./renderingEffects"');
      expect(contents, file).not.toContain("phaserRenderingEffects");
    }
  });
});
