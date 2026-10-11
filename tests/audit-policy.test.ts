import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditFindings, REVIEWED_ADVISORIES } from "../scripts/check-audit.mjs";

const advisory = (
  name: string,
  id: string,
  severity = "high",
): Record<string, unknown> => ({
  source: 1,
  name,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
  severity,
});

const report = (vulnerabilities: Record<string, unknown[]>) => ({
  vulnerabilities: Object.fromEntries(
    Object.entries(vulnerabilities).map(([name, via]) => [name, { name, via }]),
  ),
});

describe("dependency audit policy", () => {
  it("records a reason for every reviewed advisory", () => {
    for (const entry of REVIEWED_ADVISORIES) {
      expect(entry.id).toMatch(/^GHSA(-[0-9a-z]{4}){3}$/);
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });

  it("ignores reviewed advisories and the packages that only depend on them", () => {
    const findings = auditFindings(
      report({
        braces: [advisory("braces", "GHSA-vfj7-8cjw-p6xm")],
        micromatch: ["braces"],
      }),
    );
    expect(findings).toEqual({ blocking: [], stale: [] });
  });

  it("blocks new high and critical advisories but not lower ones", () => {
    const { blocking } = auditFindings(
      report({
        braces: [advisory("braces", "GHSA-vfj7-8cjw-p6xm")],
        lodash: [advisory("lodash", "GHSA-aaaa-bbbb-cccc", "critical")],
        tiny: [advisory("tiny", "GHSA-dddd-eeee-ffff", "moderate")],
      }),
    );
    expect(blocking.map((entry) => entry.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });

  it("reports reviewed entries that no longer appear", () => {
    expect(auditFindings(report({})).stale).toEqual(REVIEWED_ADVISORIES);
  });

  it("fails loudly when npm audit itself errors", () => {
    expect(() =>
      auditFindings({ error: { summary: "registry unreachable" } }),
    ).toThrow(/registry unreachable/);
  });

  it("is the audit gate in CI and release verification", async () => {
    const [workflow, manifest] = await Promise.all([
      readFile(".github/workflows/ci.yml", "utf8"),
      readFile("package.json", "utf8"),
    ]);
    expect(workflow).toContain("run: npm run check:audit");
    expect(workflow).not.toContain("npm audit --audit-level");
    expect(JSON.parse(manifest).scripts["verify:release"]).toMatch(
      /^npm run check:audit && /,
    );
  });
});
