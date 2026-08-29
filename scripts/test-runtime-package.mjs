import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = join(repositoryRoot, "packages", "phaser-runtime");
const runtimeEntry = join(runtimeDirectory, "dist", "vvfx-phaser-runtime.js");
const runtimeTypes = join(
  runtimeDirectory,
  "types",
  "packages",
  "phaser-runtime",
  "src",
  "index.d.ts",
);
const qualifiedDirectory = join(
  repositoryRoot,
  "artifacts",
  "runtime",
  "candidate",
);
const npmCli = process.env.npm_execpath;

if (!npmCli)
  throw new Error("Run this package check through npm so npm_execpath is set.");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = [result.error?.message, result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}.\n${detail}`,
    );
  }
  return result.stdout.trim();
}

function runExpectingFailure(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0)
    throw new Error(`${command} ${args.join(" ")} unexpectedly succeeded.`);
  return `${result.stdout}\n${result.stderr}`;
}

if (!existsSync(runtimeEntry) || !existsSync(runtimeTypes)) {
  throw new Error(
    "Build the runtime JavaScript and declarations before testing its package.",
  );
}

const runtimeManifest = JSON.parse(
  await readFile(join(runtimeDirectory, "package.json"), "utf8"),
);
const repositoryLicense = await readFile(
  join(repositoryRoot, "LICENSE"),
  "utf8",
);
const runtimeLicense = await readFile(
  join(runtimeDirectory, "LICENSE"),
  "utf8",
);
if (runtimeLicense !== repositoryLicense)
  throw new Error("The runtime and repository MIT license files have drifted.");

const historicalRuntimeDefinitions = await Promise.all(
  [
    "project16-runtime14.json",
    "project17-runtime15.json",
    "project18-runtime16.json",
  ].map(async (file) => {
    const fixture = JSON.parse(
      await readFile(
        join(repositoryRoot, "tests", "fixtures", "historical", file),
        "utf8",
      ),
    );
    return fixture.runtime;
  }),
);

const temporaryRoot = await mkdtemp(join(tmpdir(), "vvfx-runtime-consumer-"));
const consumerDirectory = join(temporaryRoot, "consumer");
const unsupportedDirectory = join(temporaryRoot, "unsupported-consumer");
const cacheDirectory = join(temporaryRoot, "npm-cache");

try {
  await mkdir(qualifiedDirectory, { recursive: true });
  await mkdir(consumerDirectory);
  await mkdir(unsupportedDirectory);
  await mkdir(cacheDirectory);

  const packOutput = run(
    process.execPath,
    [
      npmCli,
      "pack",
      runtimeDirectory,
      "--pack-destination",
      qualifiedDirectory,
      "--cache",
      cacheDirectory,
      "--json",
    ],
    repositoryRoot,
  );
  const packResult = JSON.parse(packOutput);
  const packed = packResult[0];
  if (!packed?.filename || !Array.isArray(packed.files))
    throw new Error("npm pack did not return a package manifest.");

  const packedPaths = new Set(packed.files.map((file) => file.path));
  for (const requiredPath of [
    "LICENSE",
    "README.md",
    "dist/vvfx-phaser-runtime.js",
    "package.json",
    "types/packages/phaser-runtime/src/index.d.ts",
  ]) {
    if (!packedPaths.has(requiredPath))
      throw new Error(`Packed runtime is missing ${requiredPath}.`);
  }

  const archive = join(qualifiedDirectory, packed.filename);
  await writeFile(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        name: "vvfx-runtime-consumer-check",
        private: true,
        type: "module",
        dependencies: {
          "@vvfx/phaser-runtime": `file:${archive.replaceAll("\\", "/")}`,
          phaser: "4.2.1",
        },
      },
      null,
      2,
    ),
  );
  run(
    process.execPath,
    [
      npmCli,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      cacheDirectory,
    ],
    consumerDirectory,
  );

  await writeFile(
    join(consumerDirectory, "consumer.mjs"),
    `import {
  VvfxEffect,
  loadVvfxAssets,
  playVvfx,
  validateRuntimeDefinition,
} from "@vvfx/phaser-runtime";

for (const exported of [
  VvfxEffect,
  loadVvfxAssets,
  playVvfx,
  validateRuntimeDefinition,
]) {
  if (typeof exported !== "function") {
    throw new Error("The packed runtime is missing a documented JavaScript export.");
  }
}

const validation = validateRuntimeDefinition({
  format: "vvfx-runtime",
  formatVersion: 15,
  name: "Packed consumer smoke",
  duration: 1000,
  seed: 1,
  assets: [],
  layers: [],
});
if (!validation.ok) throw new Error(validation.error ?? "Runtime validation failed.");

const historicalRuntimeDefinitions = ${JSON.stringify(historicalRuntimeDefinitions)};
for (const definition of historicalRuntimeDefinitions) {
  const historicalValidation = validateRuntimeDefinition(definition);
  if (!historicalValidation.ok) {
    throw new Error(
      historicalValidation.error ??
        "Historical runtime v" +
          definition.formatVersion +
          " validation failed.",
    );
  }
  if (historicalValidation.definition.formatVersion !== 16) {
    throw new Error(
      "Historical runtime v" +
        definition.formatVersion +
        " did not migrate to v16.",
    );
  }
}
`,
  );

  await writeFile(
    join(consumerDirectory, "consumer.ts"),
    `import type Phaser from "phaser";
import {
  type BeamEndpoints,
  type BeamFit,
  type VvfxEffect,
  type VvfxEffectOptions,
  type VvfxRuntimeDefinition,
  playVvfx,
  validateRuntimeDefinition,
} from "@vvfx/phaser-runtime";

declare const scene: Phaser.Scene;
const endpoints: BeamEndpoints = { startX: 0, startY: 0, endX: 100, endY: 0 };
const beamFit: BeamFit = "crop";
const options: VvfxEffectOptions = {
  beamEndpoints: endpoints,
  beamFit,
  beamThicknessScale: 0.75,
  maxDurationMs: 420,
  autoplay: false,
};
const definition: VvfxRuntimeDefinition = {
  format: "vvfx-runtime",
  formatVersion: 16,
  name: "Typed consumer smoke",
  duration: 1000,
  seed: 1,
  assets: [],
  layers: [],
};
const validation = validateRuntimeDefinition(definition);
const effect: Promise<VvfxEffect> = playVvfx(scene, definition, options);
void validation;
void effect;
`,
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    ),
  );

  run(
    process.execPath,
    [
      join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      "tsconfig.json",
    ],
    consumerDirectory,
  );
  run(process.execPath, ["consumer.mjs"], consumerDirectory);
  const installedTree = JSON.parse(
    run(
      process.execPath,
      [npmCli, "ls", "@vvfx/phaser-runtime", "phaser", "--json"],
      consumerDirectory,
    ),
  );
  if (
    installedTree.dependencies?.phaser?.version !== "4.2.1" ||
    installedTree.dependencies?.["@vvfx/phaser-runtime"]?.version !==
      runtimeManifest.version
  )
    throw new Error("The normal npm peer installation is not satisfied.");

  await writeFile(
    join(unsupportedDirectory, "package.json"),
    JSON.stringify(
      {
        name: "vvfx-unsupported-peer-check",
        private: true,
        dependencies: {
          "@vvfx/phaser-runtime": `file:${archive.replaceAll("\\", "/")}`,
          phaser: "4.2.0",
        },
      },
      null,
      2,
    ),
  );
  const unsupportedInstall = runExpectingFailure(
    process.execPath,
    [
      npmCli,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      cacheDirectory,
    ],
    unsupportedDirectory,
  );
  if (!/ERESOLVE|peer dep|peer dependency/i.test(unsupportedInstall))
    throw new Error(
      "The unsupported Phaser peer failed without a peer diagnostic.",
    );

  const installedManifest = JSON.parse(
    await readFile(
      join(
        consumerDirectory,
        "node_modules",
        "@vvfx",
        "phaser-runtime",
        "package.json",
      ),
      "utf8",
    ),
  );
  if (installedManifest.version !== runtimeManifest.version)
    throw new Error("The packed runtime version does not match its manifest.");

  const sourceMap = JSON.parse(
    await readFile(
      join(runtimeDirectory, "dist", "vvfx-phaser-runtime.js.map"),
      "utf8",
    ),
  );
  if (
    !Array.isArray(sourceMap.sources) ||
    !Array.isArray(sourceMap.sourcesContent) ||
    sourceMap.sources.length === 0 ||
    sourceMap.sources.length !== sourceMap.sourcesContent.length
  )
    throw new Error(
      "The runtime source map does not retain exact source content.",
    );
  const archiveBytes = await readFile(archive);
  const archiveStat = await stat(archive);
  const gitCommit = run("git", ["rev-parse", "HEAD"], repositoryRoot);
  const workingTreeStatus = run(
    "git",
    ["status", "--porcelain"],
    repositoryRoot,
  );
  const runtimeTypesSource = await readFile(
    join(runtimeDirectory, "src", "types.ts"),
    "utf8",
  );
  const runtimeFormat = Number(
    runtimeTypesSource.match(/formatVersion:\s*(\d+)\s*;/)?.[1],
  );
  const qualificationManifest = {
    schemaVersion: 1,
    archive: packed.filename,
    sha256: createHash("sha256").update(archiveBytes).digest("hex"),
    bytes: archiveStat.size,
    fileCount: packed.entryCount,
    gitCommit,
    cleanSource: workingTreeStatus.length === 0,
    packageName: runtimeManifest.name,
    packageVersion: runtimeManifest.version,
    runtimeFormat,
    phaserPeerRange: runtimeManifest.peerDependencies.phaser,
    testedPhaserVersions: ["4.2.1"],
    rejectedPhaserVersions: ["4.2.0"],
    sourceMapPolicy: "all-sources-with-embedded-content",
  };
  await writeFile(
    join(qualifiedDirectory, "qualification-manifest.json"),
    `${JSON.stringify(qualificationManifest, null, 2)}\n`,
  );

  console.log(
    `Qualified exact runtime archive ${packed.filename} (${packed.entryCount} files, ${packed.size} bytes, Phaser 4.2.1 peer satisfied).`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
