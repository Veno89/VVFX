import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = resolve(repositoryRoot, "packages", "phaser-runtime");
const typesDirectory = resolve(runtimeDirectory, "types");

if (dirname(typesDirectory) !== runtimeDirectory)
  throw new Error("Refusing to clean an unexpected declaration directory.");

await rm(typesDirectory, { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [
    resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
    "--project",
    resolve(runtimeDirectory, "tsconfig.types.json"),
  ],
  { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" },
);

if (result.status !== 0)
  throw new Error(
    `Runtime declaration generation failed with exit code ${result.status}.`,
  );

const formatResult = spawnSync(
  process.execPath,
  [
    resolve(repositoryRoot, "node_modules", "prettier", "bin", "prettier.cjs"),
    "--write",
    "--log-level",
    "silent",
    typesDirectory,
  ],
  { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" },
);

if (formatResult.status !== 0)
  throw new Error(
    `Runtime declaration formatting failed with exit code ${formatResult.status}.`,
  );
