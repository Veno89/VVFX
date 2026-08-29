import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyQualifiedRuntimeArchive(
  archivePath,
  manifestPath,
  { requireCleanSource = true } = {},
) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bytes = await readFile(archivePath);
  const archiveStat = await stat(archivePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (manifest.archive !== basename(archivePath))
    throw new Error("The qualification manifest names a different archive.");
  if (manifest.bytes !== archiveStat.size || manifest.sha256 !== sha256)
    throw new Error(
      "The qualified runtime archive bytes do not match the manifest.",
    );
  if (requireCleanSource && manifest.cleanSource !== true)
    throw new Error(
      "A dirty-source candidate cannot be promoted. Commit the release candidate and qualify it again.",
    );
  return { manifest, bytes };
}

export async function promoteQualifiedRuntimeArchive(
  archivePath,
  manifestPath,
  destinationDirectory,
) {
  const qualified = await verifyQualifiedRuntimeArchive(
    archivePath,
    manifestPath,
  );
  await mkdir(destinationDirectory, { recursive: true });
  const destination = resolve(destinationDirectory, basename(archivePath));
  await copyFile(archivePath, destination);
  await verifyQualifiedRuntimeArchive(destination, manifestPath);
  return { destination, sha256: qualified.manifest.sha256 };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [archivePath, manifestPath, destinationDirectory] =
    process.argv.slice(2);
  if (!archivePath || !manifestPath || !destinationDirectory)
    throw new Error(
      "Usage: node scripts/promote-runtime-package.mjs <archive> <manifest> <destination-directory>",
    );
  const result = await promoteQualifiedRuntimeArchive(
    resolve(archivePath),
    resolve(manifestPath),
    resolve(destinationDirectory),
  );
  console.log(`Promoted ${result.destination} (${result.sha256}).`);
}
