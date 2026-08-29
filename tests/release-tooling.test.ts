import {
  appendFile,
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_BROWSER_TEST_BASE_URL,
  resolveBrowserTestTarget,
  runBrowserTestFlow,
} from "../scripts/browser-test-runner.mjs";
import {
  checkRuntimeTypes,
  defaultTypesDirectory,
  snapshotDeclarations,
} from "../scripts/runtime-types.mjs";
import { verifyQualifiedRuntimeArchive } from "../scripts/promote-runtime-package.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("release tooling", () => {
  it("rejects changed bytes instead of promoting a repacked runtime", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "vvfx-promotion-test-"));
    temporaryDirectories.push(temporaryRoot);
    const archive = resolve(temporaryRoot, "runtime.tgz");
    const manifest = resolve(temporaryRoot, "manifest.json");
    const original = Buffer.from("qualified archive bytes");
    await writeFile(archive, original);
    await writeFile(
      manifest,
      JSON.stringify({
        archive: "runtime.tgz",
        bytes: original.byteLength,
        sha256: createHash("sha256").update(original).digest("hex"),
        cleanSource: true,
      }),
    );

    await expect(
      verifyQualifiedRuntimeArchive(archive, manifest),
    ).resolves.toMatchObject({ bytes: original });
    await appendFile(archive, "repacked");
    await expect(
      verifyQualifiedRuntimeArchive(archive, manifest),
    ).rejects.toThrow(/bytes do not match/i);
  });

  it("pins every third-party GitHub Action to an immutable commit", async () => {
    const workflowDirectory = resolve(".github", "workflows");
    const workflowFiles = (await readdir(workflowDirectory)).filter((file) =>
      /\.ya?ml$/i.test(file),
    );
    const mutableActions: string[] = [];
    for (const file of workflowFiles) {
      const source = await readFile(resolve(workflowDirectory, file), "utf8");
      source.split(/\r?\n/).forEach((line, index) => {
        const action = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/)?.[1];
        if (action && !/@[0-9a-f]{40}$/.test(action))
          mutableActions.push(`${file}:${index + 1} ${action}`);
      });
    }

    expect(mutableActions).toEqual([]);
  });

  it("keeps production build and hosting source in canonical lint scope", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const eslintConfig = await readFile(resolve("eslint.config.mjs"), "utf8");

    expect(packageJson.scripts.lint).toMatch(/\bbuild\b/);
    expect(packageJson.scripts.lint).toContain("next.config.ts");
    expect(eslintConfig).not.toContain('"build/**"');
  });

  it("checks declaration freshness before any build can regenerate it", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const verify = packageJson.scripts.verify;

    expect(verify.indexOf("npm run check:runtime-types")).toBeGreaterThan(-1);
    expect(verify.indexOf("npm run check:runtime-types")).toBeLessThan(
      verify.indexOf("npm run build:all"),
    );
    expect(packageJson.scripts["verify:release"]).toContain("npm run verify");
  });

  it("detects a stale declaration without modifying the checked directory", async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "vvfx-stale-types-test-"),
    );
    temporaryDirectories.push(temporaryRoot);
    const committedCopy = resolve(temporaryRoot, "types");
    await cp(defaultTypesDirectory, committedCopy, { recursive: true });
    const stalePath = resolve(
      committedCopy,
      "packages",
      "phaser-runtime",
      "src",
      "index.d.ts",
    );
    await appendFile(
      stalePath,
      "\n// deliberately stale test fixture\n",
      "utf8",
    );
    const before = await snapshotDeclarations(committedCopy);

    const result = await checkRuntimeTypes({
      committedDirectory: committedCopy,
      stdio: "pipe",
    });

    expect(result.changes).toContain("packages/phaser-runtime/src/index.d.ts");
    expect(await snapshotDeclarations(committedCopy)).toEqual(before);
  }, 30_000);

  it("normalizes and validates an external browser-test origin", () => {
    expect(
      resolveBrowserTestTarget({
        VVFX_BROWSER_BASE_URL: " https://example.test:444/ ",
      }),
    ).toEqual({ baseURL: "https://example.test:444", managedServer: false });
    expect(() =>
      resolveBrowserTestTarget({
        VVFX_BROWSER_BASE_URL: "https://example.test/path",
      }),
    ).toThrow(/origin without a path/i);
  });

  it("does not probe, start, or stop a local server for an external target", async () => {
    const ensureLocalPortAvailable = vi.fn();
    const startLocalServer = vi.fn();
    const stopLocalServer = vi.fn();
    const waitForServer = vi.fn().mockResolvedValue(undefined);
    const runPlaywright = vi.fn().mockResolvedValue(0);

    await expect(
      runBrowserTestFlow({
        environment: { VVFX_BROWSER_BASE_URL: "http://127.0.0.1:9876" },
        ensureLocalPortAvailable,
        startLocalServer,
        stopLocalServer,
        waitForServer,
        runPlaywright,
      }),
    ).resolves.toBe(0);

    expect(ensureLocalPortAvailable).not.toHaveBeenCalled();
    expect(startLocalServer).not.toHaveBeenCalled();
    expect(stopLocalServer).not.toHaveBeenCalled();
    expect(waitForServer).toHaveBeenCalledWith("http://127.0.0.1:9876", null);
    expect(runPlaywright).toHaveBeenCalledWith("http://127.0.0.1:9876");
  });

  it("owns and stops only the local server in managed mode", async () => {
    const server = { pid: 1234 };
    const ensureLocalPortAvailable = vi.fn().mockResolvedValue(undefined);
    const startLocalServer = vi.fn(() => server);
    const stopLocalServer = vi.fn().mockResolvedValue(undefined);
    const waitForServer = vi.fn().mockResolvedValue(undefined);
    const runPlaywright = vi.fn().mockRejectedValue(new Error("test failure"));

    await expect(
      runBrowserTestFlow({
        environment: {},
        ensureLocalPortAvailable,
        startLocalServer,
        stopLocalServer,
        waitForServer,
        runPlaywright,
      }),
    ).rejects.toThrow("test failure");

    expect(resolveBrowserTestTarget({})).toEqual({
      baseURL: LOCAL_BROWSER_TEST_BASE_URL,
      managedServer: true,
    });
    expect(ensureLocalPortAvailable).toHaveBeenCalledOnce();
    expect(startLocalServer).toHaveBeenCalledOnce();
    expect(waitForServer).toHaveBeenCalledWith(
      LOCAL_BROWSER_TEST_BASE_URL,
      server,
    );
    expect(stopLocalServer).toHaveBeenCalledOnce();
    expect(stopLocalServer).toHaveBeenCalledWith(server);
  });
});
