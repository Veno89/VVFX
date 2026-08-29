import { describe, expect, it } from "vitest";
import { validateRuntimeDefinition } from "../packages/phaser-runtime/src";
import { checkVersionPairs } from "../scripts/check-version-pairs.mjs";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import {
  createRuntimeDefinition,
  generatePhaserCode,
} from "../src/vfx/exporters";
import { validateProject } from "../src/vfx/serialization";
import {
  createTemplateFromProject,
  validateTemplate,
} from "../src/vfx/templates";

describe("release version pairs", () => {
  it("binds exact source revisions, schemas, and retained runtime artifacts", async () => {
    await expect(checkVersionPairs()).resolves.toMatchObject({
      rollbackPair: "project-17-runtime-15",
      currentPair: "project-18-runtime-16",
      policy: {
        destructiveDowngradeAllowed: false,
        runtimeJsonAndPackageAreAtomic: true,
        newerBrowserRecordsDuringRollback: "preserve-unmodified",
      },
    });
  });

  it("accepts N-1 projects and templates but rejects future versions", () => {
    const project = createEmptyProject("Compatibility matrix");
    project.layers.push(createLayer("animated", "Ring", "builtin-ring"));
    const previousProject = structuredClone(project) as unknown as Record<
      string,
      unknown
    >;
    previousProject.formatVersion = 17;
    expect(validateProject(previousProject).ok).toBe(true);
    expect(validateProject({ ...project, formatVersion: 19 }).ok).toBe(false);

    const template = createTemplateFromProject(project, "Versioned ring");
    expect(validateTemplate({ ...template, projectFormatVersion: 17 }).ok).toBe(
      true,
    );
    expect(validateTemplate({ ...template, projectFormatVersion: 19 }).ok).toBe(
      false,
    );
  });

  it("keeps runtime JSON, generated TypeScript, and package versions paired", () => {
    const project = createEmptyProject("Runtime pair");
    project.layers.push(createLayer("animated", "Ring", "builtin-ring"));
    const current = createRuntimeDefinition(project);
    const previous = { ...current, formatVersion: 15 };

    expect(validateRuntimeDefinition(previous).ok).toBe(true);
    expect(
      validateRuntimeDefinition({ ...current, formatVersion: 17 }).ok,
    ).toBe(false);
    expect(current.formatVersion).toBe(16);
    expect(generatePhaserCode(project)).toContain('"formatVersion": 16');
  });

  it("leaves newer IndexedDB records byte-identical during an N-1 open", async () => {
    const databaseName = `vvfx-rollback-drill-${crypto.randomUUID()}`;
    const newerRecord = {
      formatVersion: 18,
      metadata: { id: "newer", name: "Preserve me" },
      sentinel: "byte-identical",
    };
    const open = (version: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, version);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("projects"))
            request.result.createObjectStore("projects", {
              keyPath: "metadata.id",
            });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const currentDatabase = await open(4);
    await new Promise<void>((resolve, reject) => {
      const transaction = currentDatabase.transaction("projects", "readwrite");
      transaction.objectStore("projects").put(newerRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    currentDatabase.close();

    await expect(open(3)).rejects.toMatchObject({ name: "VersionError" });
    const recoveredDatabase = await open(4);
    const recovered = await new Promise<unknown>((resolve, reject) => {
      const request = recoveredDatabase
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get("newer");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    recoveredDatabase.close();
    expect(recovered).toEqual(newerRecord);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
});
