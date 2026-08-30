import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  coverageRegressions,
  PRODUCTION_COVERAGE_BASELINE,
  PRODUCTION_COVERAGE_COUNTS,
  PRODUCTION_COVERAGE_INCLUDE,
  PRODUCTION_COVERAGE_THRESHOLDS,
  REVIEWED_COVERAGE_EXCLUSIONS,
} from "../scripts/coverage-policy.mjs";

const execFileAsync = promisify(execFile);

describe("canonical quality gates", () => {
  it("measures every reviewed production source family at the recorded baseline", () => {
    expect(PRODUCTION_COVERAGE_INCLUDE).toEqual([
      "app/**/*.{ts,tsx}",
      "build/**/*.ts",
      "packages/phaser-runtime/src/**/*.ts",
      "src/**/*.{ts,tsx}",
      "next.config.ts",
    ]);
    expect(REVIEWED_COVERAGE_EXCLUSIONS).toEqual([
      "**/*.d.ts",
      "vite.config.ts",
      "packages/phaser-runtime/vite.config.ts",
    ]);
    expect(PRODUCTION_COVERAGE_THRESHOLDS).toEqual(
      PRODUCTION_COVERAGE_BASELINE,
    );
    expect(PRODUCTION_COVERAGE_COUNTS).toEqual({
      statements: { covered: 7_783, total: 10_386 },
      branches: { covered: 5_990, total: 8_353 },
      functions: { covered: 1_630, total: 2_348 },
      lines: { covered: 7_284, total: 9_470 },
    });
  });

  it("rejects an intentional regression in every coverage metric", () => {
    const regressed = Object.fromEntries(
      Object.entries(PRODUCTION_COVERAGE_BASELINE).map(([metric, value]) => [
        metric,
        value - 0.01,
      ]),
    );
    expect(coverageRegressions(regressed).map(({ metric }) => metric)).toEqual([
      "statements",
      "branches",
      "functions",
      "lines",
    ]);
    expect(coverageRegressions(PRODUCTION_COVERAGE_BASELINE)).toEqual([]);
  });

  it("makes a build-source lint violation fail the canonical command", async () => {
    const fixture = resolve(
      "build",
      `__vvfx_lint_scope_fixture_${process.pid}.ts`,
    );
    await writeFile(fixture, "const deliberatelyUnused = true;\n", "utf8");
    try {
      const command =
        process.platform === "win32"
          ? {
              executable: process.env.ComSpec ?? "cmd.exe",
              arguments: ["/d", "/s", "/c", "npm.cmd run lint"],
            }
          : { executable: "npm", arguments: ["run", "lint"] };
      const failure = await execFileAsync(
        command.executable,
        command.arguments,
        {
          cwd: resolve("."),
          maxBuffer: 8 * 1024 * 1024,
          timeout: 90_000,
        },
      ).then(
        () => null,
        (error: unknown) => error as { stdout?: string; stderr?: string },
      );
      expect(failure).not.toBeNull();
      expect(`${failure?.stdout ?? ""}\n${failure?.stderr ?? ""}`).toMatch(
        /deliberatelyUnused|no-unused-vars/,
      );
    } finally {
      await rm(fixture, { force: true });
    }
  }, 120_000);
});
