import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const runtimeDirectory = resolve(
  repositoryRoot,
  "packages",
  "phaser-runtime",
);
export const defaultTypesDirectory = resolve(runtimeDirectory, "types");

function commandFailure(label, result) {
  const details = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  return new Error(
    `${label} failed with exit code ${result.status ?? "unknown"}.${details ? `\n${details}` : ""}`,
  );
}

export async function snapshotDeclarations(directory) {
  const files = new Map();

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const contents = await readFile(path);
        files.set(
          relative(directory, path).replaceAll("\\", "/"),
          createHash("sha256").update(contents).digest("hex"),
        );
      }
    }
  }

  await visit(directory);
  return files;
}

export function changedDeclarationPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .filter((path) => before.get(path) !== after.get(path));
}

export async function generateRuntimeTypes({
  outputDirectory = defaultTypesDirectory,
  clean = outputDirectory === defaultTypesDirectory,
  stdio = "inherit",
} = {}) {
  const target = resolve(outputDirectory);
  if (clean && target !== defaultTypesDirectory)
    throw new Error(
      "Refusing to clean a custom runtime declaration directory.",
    );
  if (clean) {
    if (dirname(target) !== runtimeDirectory)
      throw new Error("Refusing to clean an unexpected declaration directory.");
    await rm(target, { recursive: true, force: true });
  }

  const compile = spawnSync(
    process.execPath,
    [
      resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      resolve(runtimeDirectory, "tsconfig.types.json"),
      "--outDir",
      target,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio,
      windowsHide: true,
    },
  );
  if (compile.error) throw compile.error;
  if (compile.status !== 0)
    throw commandFailure("Runtime declaration generation", compile);

  const format = spawnSync(
    process.execPath,
    [
      resolve(
        repositoryRoot,
        "node_modules",
        "prettier",
        "bin",
        "prettier.cjs",
      ),
      "--write",
      "--log-level",
      "silent",
      target,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio,
      windowsHide: true,
    },
  );
  if (format.error) throw format.error;
  if (format.status !== 0)
    throw commandFailure("Runtime declaration formatting", format);

  return snapshotDeclarations(target);
}

export async function checkRuntimeTypes({
  committedDirectory = defaultTypesDirectory,
  stdio = "inherit",
} = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "vvfx-runtime-types-"));
  const generatedDirectory = resolve(temporaryRoot, "generated");
  try {
    const committed = await snapshotDeclarations(resolve(committedDirectory));
    const generated = await generateRuntimeTypes({
      outputDirectory: generatedDirectory,
      clean: false,
      stdio,
    });
    return {
      changes: changedDeclarationPaths(committed, generated),
      fileCount: generated.size,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
