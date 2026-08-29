import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const versionPairManifestPath = resolve(
  repositoryRoot,
  "release",
  "version-pairs.json",
);

const integerMatch = (source, expression, label) => {
  const match = source.match(expression);
  if (!match) throw new Error(`Could not read ${label}.`);
  return Number(match[1]);
};

async function gitFile(revision, path) {
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${revision}:${path}`],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout;
}

async function sourceContract(revision) {
  const [projects, runtimeTypes, runtimeDefinition, templates, packageSource] =
    await Promise.all([
      gitFile(revision, "src/vfx/serialization.ts"),
      gitFile(revision, "packages/phaser-runtime/src/types.ts"),
      gitFile(revision, "packages/phaser-runtime/src/definition.ts"),
      gitFile(revision, "src/vfx/templates.ts"),
      gitFile(revision, "packages/phaser-runtime/package.json"),
    ]);
  return {
    projectFormat: integerMatch(
      projects,
      /CURRENT_PROJECT_FORMAT_VERSION\s*=\s*(\d+)/,
      "project format version",
    ),
    runtimeFormat: integerMatch(
      runtimeTypes,
      /formatVersion:\s*(\d+)\s*;/,
      "runtime format version",
    ),
    runtimeMaximumAccepted: integerMatch(
      runtimeDefinition,
      /SUPPORTED_RUNTIME_VERSIONS[\s\S]*?Array\.from\(\{ length:\s*(\d+) \}/,
      "runtime maximum accepted version",
    ),
    templateFormat: integerMatch(
      templates,
      /TEMPLATE_FORMAT_VERSION\s*=\s*(\d+)/,
      "template format version",
    ),
    templateProjectFormat: integerMatch(
      templates,
      /CURRENT_PROJECT_FORMAT_VERSION\s*=\s*(\d+)/,
      "template project format version",
    ),
    runtimePackageVersion: JSON.parse(packageSource).version,
  };
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

export async function checkVersionPairs(
  manifestPath = versionPairManifestPath,
) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.pairs?.length !== 2)
    throw new Error(
      "The version-pair manifest must contain exact N and N-1 pairs.",
    );
  if (
    manifest.policy?.destructiveDowngradeAllowed !== false ||
    manifest.policy?.runtimeJsonAndPackageAreAtomic !== true ||
    manifest.policy?.newerBrowserRecordsDuringRollback !==
      "preserve-unmodified" ||
    manifest.policy?.recoveryRoute !== "redeploy-current-pair-and-export"
  )
    throw new Error("The rollback preservation policy is incomplete.");

  const [previous, current] = manifest.pairs;
  if (
    previous.id !== manifest.rollbackPair ||
    current.id !== manifest.currentPair ||
    current.projectFormat !== previous.projectFormat + 1 ||
    current.runtimeFormat !== previous.runtimeFormat + 1
  )
    throw new Error("The manifest does not describe consecutive N/N-1 pairs.");

  for (const pair of manifest.pairs) {
    if (!/^[0-9a-f]{40}$/.test(pair.editorRevision))
      throw new Error(`${pair.id} does not bind a full editor Git SHA.`);
    const source = await sourceContract(pair.editorRevision);
    for (const field of [
      "projectFormat",
      "runtimeFormat",
      "templateFormat",
      "templateProjectFormat",
    ])
      if (pair[field] !== source[field])
        throw new Error(`${pair.id} has a stale ${field}.`);
    if (source.runtimeMaximumAccepted !== pair.runtimeFormat)
      throw new Error(`${pair.id} runtime guard and emitted format disagree.`);
    if (pair.runtimePackage.version !== source.runtimePackageVersion)
      throw new Error(`${pair.id} has a mismatched runtime package version.`);
    const artifactPath = resolve(repositoryRoot, pair.runtimePackage.path);
    const artifactStat = await stat(artifactPath);
    if (artifactStat.size !== pair.runtimePackage.bytes)
      throw new Error(`${pair.id} runtime artifact size does not match.`);
    if ((await sha256(artifactPath)) !== pair.runtimePackage.sha256)
      throw new Error(`${pair.id} runtime artifact SHA-256 does not match.`);
  }
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = await checkVersionPairs();
  console.log(
    `Verified rollback pairs ${manifest.rollbackPair} -> ${manifest.currentPair}.`,
  );
}
