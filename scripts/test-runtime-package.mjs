import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const temporaryRoot = await mkdtemp(join(tmpdir(), "vvfx-runtime-consumer-"));
const packDirectory = join(temporaryRoot, "pack");
const consumerDirectory = join(temporaryRoot, "consumer");
const cacheDirectory = join(temporaryRoot, "npm-cache");

try {
  await mkdir(packDirectory);
  await mkdir(consumerDirectory);
  await mkdir(cacheDirectory);

  const packOutput = run(
    process.execPath,
    [
      npmCli,
      "pack",
      runtimeDirectory,
      "--pack-destination",
      packDirectory,
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

  const archive = join(packDirectory, packed.filename);
  await writeFile(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        name: "vvfx-runtime-consumer-check",
        private: true,
        type: "module",
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
      archive,
      "--offline",
      "--ignore-scripts",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
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
`,
  );

  const phaserTypes = join(
    repositoryRoot,
    "node_modules",
    "phaser",
    "types",
    "phaser.d.ts",
  ).replaceAll("\\", "/");
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
          paths: { phaser: [phaserTypes] },
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

  console.log(
    `Packed runtime consumer passed (${packed.entryCount} files, ${packed.size} bytes).`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
