import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_FORMAT = 18;
const RUNTIME_FORMAT = 16;
const RUNTIME_PACKAGE = "0.16.0";

async function source(path: string) {
  return readFile(resolve(path), "utf8");
}

describe("format-version reconciliation", () => {
  it("enumerates every intentional project and runtime source copy", async () => {
    const expectations: Array<[string, RegExp]> = [
      ["src/vfx/types.ts", /formatVersion:\s*18;/],
      ["src/vfx/defaults.ts", /formatVersion:\s*18,/],
      ["src/vfx/serialization.ts", /CURRENT_PROJECT_FORMAT_VERSION\s*=\s*18/],
      ["src/vfx/templates.ts", /CURRENT_PROJECT_FORMAT_VERSION\s*=\s*18/],
      ["src/vfx/exporters.ts", /formatVersion:\s*16,/],
      ["packages/phaser-runtime/src/types.ts", /formatVersion:\s*16;/],
      [
        "packages/phaser-runtime/src/definition.ts",
        /Array\.from\(\{ length:\s*16 \}/,
      ],
    ];
    for (const [path, expression] of expectations)
      expect(await source(path), path).toMatch(expression);
    expect(PROJECT_FORMAT).toBe(18);
    expect(RUNTIME_FORMAT).toBe(16);
  });

  it("reconciles package and active documentation claims", async () => {
    const runtimeManifest = JSON.parse(
      await source("packages/phaser-runtime/package.json"),
    );
    const manifest = JSON.parse(await source("release/version-pairs.json"));
    const current = manifest.pairs.find(
      (pair: { id: string }) => pair.id === manifest.currentPair,
    );
    expect(runtimeManifest.version).toBe(RUNTIME_PACKAGE);
    expect(current).toMatchObject({
      projectFormat: PROJECT_FORMAT,
      runtimeFormat: RUNTIME_FORMAT,
      runtimePackage: { version: RUNTIME_PACKAGE },
    });
    for (const path of [
      "README.md",
      "docs/architecture.md",
      "docs/capability-matrix.md",
      "docs/vfx-format.md",
      "packages/phaser-runtime/README.md",
    ])
      expect(await source(path), path).toContain(RUNTIME_PACKAGE);
    expect(await source("docs/vfx-format.md")).toContain(
      `formatVersion: ${PROJECT_FORMAT}`,
    );
    expect(await source("docs/vfx-format.md")).toContain(
      `formatVersion: ${RUNTIME_FORMAT}`,
    );
  });
});
