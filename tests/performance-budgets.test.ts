import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectBuildPerformanceMetrics,
  evaluatePerformanceBudgets,
  PERFORMANCE_BUDGETS,
  PERFORMANCE_BUDGET_PROFILE,
} from "../scripts/performance-budgets.mjs";

describe("production performance budgets", () => {
  it("records a versioned baseline and explicit numeric limits", () => {
    expect(PERFORMANCE_BUDGET_PROFILE).toMatchObject({
      version: 1,
      baselineRuns: 3,
      baselineConsistency: "3/3 production builds were byte-identical",
      buildCommand: "npm.cmd run build:all",
    });
    expect(Object.keys(PERFORMANCE_BUDGETS)).toHaveLength(8);
    for (const budget of Object.values(PERFORMANCE_BUDGETS)) {
      expect(budget.baseline).toBeGreaterThan(0);
      expect(budget.maximum).toBeGreaterThanOrEqual(budget.baseline);
      expect(budget.description).not.toHaveLength(0);
    }
  });

  it("accepts an exact limit and fails an intentional one-byte regression", () => {
    const budgets = {
      fixtureBytes: {
        baseline: 90,
        maximum: 100,
        description: "intentional threshold fixture",
      },
    };

    expect(evaluatePerformanceBudgets({ fixtureBytes: 100 }, budgets)).toEqual(
      [],
    );
    expect(
      evaluatePerformanceBudgets({ fixtureBytes: 101 }, budgets),
    ).toMatchObject([
      { id: "fixtureBytes", actual: 101, reason: "maximum exceeded" },
    ]);
  });

  it("collects build metrics from an isolated fixture without requiring a prior build", async () => {
    const repositoryRoot = await mkdtemp(
      resolve(tmpdir(), "vvfx-performance-budgets-"),
    );
    const clientDirectory = resolve(repositoryRoot, "dist", "client");
    const nestedClientDirectory = resolve(clientDirectory, "assets", "nested");
    const runtimeDirectory = resolve(
      repositoryRoot,
      "packages",
      "phaser-runtime",
      "dist",
    );

    try {
      await Promise.all([
        mkdir(nestedClientDirectory, { recursive: true }),
        mkdir(runtimeDirectory, { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          resolve(clientDirectory, "phaser.esm-fixture.js"),
          Buffer.alloc(11),
        ),
        writeFile(
          resolve(clientDirectory, "VfxEditor-fixture.js"),
          Buffer.alloc(13),
        ),
        writeFile(
          resolve(clientDirectory, "gifEncoder.worker-fixture.js"),
          Buffer.alloc(17),
        ),
        writeFile(resolve(clientDirectory, "styles.css"), Buffer.alloc(19)),
        writeFile(
          resolve(nestedClientDirectory, "sprite.bin"),
          Buffer.alloc(23),
        ),
        writeFile(
          resolve(runtimeDirectory, "vvfx-phaser-runtime.js"),
          Buffer.alloc(29),
        ),
        writeFile(
          resolve(runtimeDirectory, "vvfx-phaser-runtime.js.map"),
          Buffer.alloc(31),
        ),
        writeFile(resolve(runtimeDirectory, "index.d.ts"), Buffer.alloc(37)),
      ]);

      await expect(
        collectBuildPerformanceMetrics({ repositoryRoot }),
      ).resolves.toEqual({
        editorClientTotalBytes: 83,
        editorClientJavaScriptBytes: 41,
        editorPhaserBytes: 11,
        editorVfxEditorBytes: 13,
        editorGifWorkerBytes: 17,
        runtimeJavaScriptBytes: 29,
        runtimeSourceMapBytes: 31,
        runtimeTotalBytes: 97,
      });
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
});
