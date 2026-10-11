import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const PERFORMANCE_BUDGET_PROFILE = Object.freeze({
  version: 1,
  fixture: "production editor root and @vvfx/phaser-runtime build",
  buildCommand: "npm.cmd run build:all",
  measuredOn: "2026-08-29",
  baselineRuns: 3,
  baselineConsistency: "3/3 production builds were byte-identical",
  environment: "Node 22.15.0, Windows 11 x64, production mode",
  rationale:
    "Deterministic byte budgets use the Phase 0 three-run build baseline plus a reviewed regression band. Hardware-dependent latency and GPU budgets remain a separate qualification gate.",
});

// 2026-10: the client totals were re-baselined for two reviewed additions
// that do not touch startup: the static-export HTML pages (index.html,
// 404.html, index.rsc) and the Web page export's player script, a lazy chunk
// that loads only when that export runs. The band above baseline stays ~5%.
export const PERFORMANCE_BUDGETS = Object.freeze({
  editorClientTotalBytes: {
    baseline: 2_653_262,
    maximum: 2_790_000,
    description: "complete production client output",
  },
  editorClientJavaScriptBytes: {
    baseline: 2_492_619,
    maximum: 2_620_000,
    description: "all production client JavaScript",
  },
  editorPhaserBytes: {
    baseline: 1_374_706,
    maximum: 1_390_000,
    description: "isolated Phaser client chunk",
  },
  editorVfxEditorBytes: {
    baseline: 522_352,
    maximum: 550_000,
    description: "VfxEditor client chunk",
  },
  editorGifWorkerBytes: {
    baseline: 2_732,
    maximum: 10_000,
    description: "off-main-thread GIF encoding worker",
  },
  // 2026-10: runtime budgets re-baselined for the reviewed runtime transform
  // controls (scale, rotation, flip, time scale, tint, follow) and the
  // speed/emission curves and attractor, all shared with the editor engine.
  runtimeJavaScriptBytes: {
    baseline: 265_833,
    maximum: 279_000,
    description: "packaged runtime JavaScript",
  },
  runtimeSourceMapBytes: {
    baseline: 614_609,
    maximum: 645_000,
    description: "packaged runtime source map",
  },
  runtimeTotalBytes: {
    baseline: 880_442,
    maximum: 925_000,
    description: "complete packaged runtime build output",
  },
});

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

async function sumFiles(files) {
  const sizes = await Promise.all(files.map((file) => stat(file)));
  return sizes.reduce((total, entry) => total + entry.size, 0);
}

function requireMatchingFile(files, pattern, label) {
  const matches = files.filter((file) =>
    pattern.test(file.replaceAll("\\", "/")),
  );
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${label} build artifact, but found ${matches.length}. Run npm.cmd run build:all and review any chunk-layout change.`,
    );
  return matches[0];
}

export async function collectBuildPerformanceMetrics({
  repositoryRoot = resolve(import.meta.dirname, ".."),
} = {}) {
  const clientDirectory = resolve(repositoryRoot, "dist", "client");
  const runtimeDirectory = resolve(
    repositoryRoot,
    "packages",
    "phaser-runtime",
    "dist",
  );
  let clientFiles;
  let runtimeFiles;
  try {
    [clientFiles, runtimeFiles] = await Promise.all([
      listFiles(clientDirectory),
      listFiles(runtimeDirectory),
    ]);
  } catch (error) {
    throw new Error(
      `Production build output is missing. Run npm.cmd run build:all before checking performance budgets. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  const clientJavaScript = clientFiles.filter((file) => file.endsWith(".js"));
  const phaserChunk = requireMatchingFile(
    clientFiles,
    /\/phaser\.esm-[^/]+\.js$/,
    "Phaser client chunk",
  );
  const editorChunk = requireMatchingFile(
    clientFiles,
    /\/VfxEditor-[^/]+\.js$/,
    "VfxEditor client chunk",
  );
  const gifWorker = requireMatchingFile(
    clientFiles,
    /\/gifEncoder\.worker-[^/]+\.js$/,
    "GIF worker",
  );
  const runtimeJavaScript = requireMatchingFile(
    runtimeFiles,
    /\/vvfx-phaser-runtime\.js$/,
    "runtime JavaScript",
  );
  const runtimeSourceMap = requireMatchingFile(
    runtimeFiles,
    /\/vvfx-phaser-runtime\.js\.map$/,
    "runtime source map",
  );

  return {
    editorClientTotalBytes: await sumFiles(clientFiles),
    editorClientJavaScriptBytes: await sumFiles(clientJavaScript),
    editorPhaserBytes: (await stat(phaserChunk)).size,
    editorVfxEditorBytes: (await stat(editorChunk)).size,
    editorGifWorkerBytes: (await stat(gifWorker)).size,
    runtimeJavaScriptBytes: (await stat(runtimeJavaScript)).size,
    runtimeSourceMapBytes: (await stat(runtimeSourceMap)).size,
    runtimeTotalBytes: await sumFiles(runtimeFiles),
  };
}

/**
 * @param {Record<string, number>} metrics
 * @param {Record<string, { baseline: number; maximum: number; description: string }>} budgets
 */
export function evaluatePerformanceBudgets(
  metrics,
  budgets = PERFORMANCE_BUDGETS,
) {
  return Object.entries(budgets).flatMap(([id, budget]) => {
    const actual = metrics[id];
    if (!Number.isFinite(actual))
      return [{ id, actual, ...budget, reason: "metric is missing" }];
    if (actual <= budget.maximum) return [];
    return [{ id, actual, ...budget, reason: "maximum exceeded" }];
  });
}
