import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runtimeDefinitionToProject,
  validateRuntimeDefinition,
} from "../packages/phaser-runtime/src/definition";
import { evaluateProject } from "../src/vfx/engine";
import { generatePhaserCode } from "../src/vfx/exporters";
import { validateProject } from "../src/vfx/serialization";
import { validateTemplate } from "../src/vfx/templates";

interface HistoricalFixtureManifestEntry {
  id: string;
  file: string;
  sourceCommit: string;
  projectFormat: number;
  runtimeFormat: number;
  templateFormat: number;
  expectedLosses: string[];
  sha256: string;
}

interface HistoricalFixtureManifest {
  fixtures: HistoricalFixtureManifestEntry[];
  unavailableReleaseAuthenticHistory: {
    projectFormats: number[];
    runtimeFormats: number[];
    reason: string;
  };
}

interface HistoricalFixture {
  project: Record<string, unknown>;
  runtime: Record<string, unknown>;
  template: Record<string, unknown>;
}

const fixtureDirectory = resolve("tests", "fixtures", "historical");

async function manifest(): Promise<HistoricalFixtureManifest> {
  return JSON.parse(
    await readFile(resolve(fixtureDirectory, "manifest.json"), "utf8"),
  ) as HistoricalFixtureManifest;
}

const semanticSnapshot = (project: Parameters<typeof evaluateProject>[0]) =>
  evaluateProject(project, 1_500, null).map(
    ({ layerId, assetId, x, y, scaleX, scaleY, opacity, rotation, frame }) => ({
      layerId,
      assetId,
      x,
      y,
      scaleX,
      scaleY,
      opacity,
      rotation,
      frame,
    }),
  );

describe("repository-authentic historical fixture corpus", () => {
  it("binds every frozen fixture to its provenance hash", async () => {
    for (const entry of (await manifest()).fixtures) {
      const bytes = await readFile(resolve(fixtureDirectory, entry.file));
      expect(createHash("sha256").update(bytes).digest("hex"), entry.id).toBe(
        entry.sha256,
      );
      expect(entry.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.expectedLosses).toEqual([]);
    }
  });

  it("migrates project, runtime, and template shapes without semantic loss", async () => {
    for (const entry of (await manifest()).fixtures) {
      const fixture = JSON.parse(
        await readFile(resolve(fixtureDirectory, entry.file), "utf8"),
      ) as HistoricalFixture;
      expect(fixture.project.formatVersion, entry.id).toBe(entry.projectFormat);
      expect(fixture.runtime.formatVersion, entry.id).toBe(entry.runtimeFormat);
      expect(fixture.template.formatVersion, entry.id).toBe(
        entry.templateFormat,
      );

      const project = validateProject(fixture.project);
      const runtime = validateRuntimeDefinition(fixture.runtime);
      const template = validateTemplate(fixture.template);
      expect(project.ok, entry.id).toBe(true);
      expect(runtime.ok, entry.id).toBe(true);
      expect(template.ok, entry.id).toBe(true);
      expect(project.project?.formatVersion, entry.id).toBe(18);
      expect(runtime.definition?.formatVersion, entry.id).toBe(16);
      expect(template.template?.projectFormatVersion, entry.id).toBe(18);

      const projectSnapshot = semanticSnapshot(project.project!);
      const runtimeSnapshot = semanticSnapshot(
        runtimeDefinitionToProject(runtime.definition!),
      );
      expect(projectSnapshot, entry.id).toEqual([
        {
          layerId: "layer-historical-flash",
          assetId: "builtin-flash",
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          rotation: 0,
          frame: null,
        },
      ]);
      expect(runtimeSnapshot, entry.id).toEqual(projectSnapshot);

      const advancedTypeScript = generatePhaserCode(project.project!);
      expect(advancedTypeScript, entry.id).toContain(
        'from "@vvfx/phaser-runtime"',
      );
      expect(advancedTypeScript, entry.id).toContain('"formatVersion": 16');
      expect(advancedTypeScript, entry.id).toContain(
        "Historical compatibility fixture",
      );
    }
  });

  it("rejects future versions and records unavailable authentic history", async () => {
    const corpus = await manifest();
    expect(corpus.unavailableReleaseAuthenticHistory.projectFormats).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    expect(corpus.unavailableReleaseAuthenticHistory.runtimeFormats).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    expect(corpus.unavailableReleaseAuthenticHistory.reason).toMatch(
      /does not relabel them release-authentic/i,
    );

    const latest = JSON.parse(
      await readFile(
        resolve(fixtureDirectory, "project18-runtime16.json"),
        "utf8",
      ),
    ) as HistoricalFixture;
    expect(validateProject({ ...latest.project, formatVersion: 19 }).ok).toBe(
      false,
    );
    expect(
      validateRuntimeDefinition({ ...latest.runtime, formatVersion: 17 }).ok,
    ).toBe(false);
    expect(
      validateTemplate({
        ...latest.template,
        projectFormatVersion: 19,
      }).ok,
    ).toBe(false);
  });
});
