import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reviewed advisories that may stay in the lockfile. Each entry needs a reason
 * it cannot affect VVFX; remove it as soon as a fixed version ships.
 */
export const REVIEWED_ADVISORIES = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    package: "braces",
    reason:
      "Deeply nested glob patterns can exhaust the stack. braces is reached " +
      "only through dev tooling (@next/eslint-plugin-next and vinext, via " +
      "fast-glob and micromatch), whose patterns come from this repository's " +
      "own config, and no fixed release exists yet.",
  },
];

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

const advisoryId = (url) => url?.match(/GHSA(?:-[0-9a-z]{4}){3}/i)?.[0];

/**
 * Reads `npm audit --json` output and returns the blocking advisories that
 * are not reviewed, plus reviewed entries that no longer appear.
 */
export function auditFindings(report, reviewed = REVIEWED_ADVISORIES) {
  if (report.error)
    throw new Error(`npm audit failed: ${report.error.summary ?? "unknown"}`);
  const reviewedIds = new Set(reviewed.map((entry) => entry.id));
  const seen = new Set();
  const blocking = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {}))
    for (const via of vulnerability.via)
      // String entries point at another package; its own advisory is listed
      // under that package, so only advisory objects are checked here.
      if (typeof via === "object" && BLOCKING_SEVERITIES.has(via.severity)) {
        const id = advisoryId(via.url) ?? String(via.source);
        seen.add(id);
        if (!reviewedIds.has(id))
          blocking.set(id, {
            id,
            package: via.name,
            severity: via.severity,
            title: via.title,
            url: via.url,
          });
      }
  return {
    blocking: [...blocking.values()],
    stale: reviewed.filter((entry) => !seen.has(entry.id)),
  };
}

function runAudit() {
  return new Promise((resolvePromise, reject) => {
    execFile(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["audit", "--json"],
      { maxBuffer: 32 * 1024 * 1024, shell: process.platform === "win32" },
      // npm audit exits non-zero whenever it finds anything; the JSON decides.
      (error, stdout) => {
        try {
          resolvePromise(JSON.parse(stdout));
        } catch {
          reject(error ?? new Error("npm audit returned no JSON."));
        }
      },
    );
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { blocking, stale } = auditFindings(await runAudit());
  for (const entry of stale)
    console.warn(
      `${entry.id} (${entry.package}) is no longer reported; remove it from REVIEWED_ADVISORIES in scripts/check-audit.mjs.`,
    );
  if (blocking.length > 0) {
    for (const advisory of blocking)
      console.error(
        `${advisory.severity}: ${advisory.package} — ${advisory.title} (${advisory.url})`,
      );
    console.error(
      `${blocking.length} high or critical advisor${blocking.length === 1 ? "y" : "ies"} need attention. Run npm audit for details.`,
    );
    process.exit(1);
  }
  const ignored = REVIEWED_ADVISORIES.length - stale.length;
  console.log(
    `Dependency audit passed (${ignored} reviewed advisor${ignored === 1 ? "y" : "ies"} ignored).`,
  );
}
