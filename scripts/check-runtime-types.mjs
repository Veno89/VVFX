import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedTypes = resolve(
  repositoryRoot,
  "packages",
  "phaser-runtime",
  "types",
);
const generator = resolve(repositoryRoot, "scripts", "build-runtime-types.mjs");

async function snapshot(directory) {
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

const before = await snapshot(generatedTypes);
const build = spawnSync(process.execPath, [generator], {
  cwd: repositoryRoot,
  stdio: "inherit",
  windowsHide: true,
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const after = await snapshot(generatedTypes);

const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
const changes = paths.filter((path) => before.get(path) !== after.get(path));
if (changes.length > 0) {
  process.stderr.write(
    `Generated runtime declarations were stale:\n${changes.map((path) => `- ${path}`).join("\n")}\nCommit the regenerated result.\n`,
  );
  process.exit(1);
}

console.log(
  `Generated runtime declarations are current (${after.size} files).`,
);
