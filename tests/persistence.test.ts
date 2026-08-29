import { describe, expect, it, vi } from "vitest";
import {
  clearRecoveryDraft,
  deleteInvalidProjectRecord,
  deleteInvalidRecoveryDraft,
  deleteProject,
  inspectStoredProjects,
  InvalidRecoveryDraftError,
  listProjectSummaries,
  loadProject,
  loadRecoveryDraft,
  saveRecoveryDraft,
  saveProject,
} from "../src/persistence/projects";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  saveTemplates,
} from "../src/persistence/templates";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { serializeProject } from "../src/vfx/serialization";
import { createTemplateFromProject } from "../src/vfx/templates";
import {
  openDatabase,
  PROJECT_STORE,
  PROJECT_SUMMARY_STORE,
  RECOVERY_STORE,
} from "../src/persistence/database";
import {
  MAX_SAVED_PROJECT_LIBRARY_BYTES,
  MAX_SAVED_PROJECTS,
  utf8ByteLength,
} from "../src/vfx/inputLimits";
import { createCurrentProjectSummary } from "../src/persistence/projectSummaries";

async function putRawRecord(storeName: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function getRawRecord(
  storeName: string,
  key: IDBValidKey,
): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function countRawRecords(storeName: string): Promise<number> {
  const database = await openDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      const request = database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function putRawRecords(
  storeName: string,
  values: unknown[],
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      values.forEach((value) => store.put(value));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function deleteRawRecords(
  storeName: string,
  keys: IDBValidKey[],
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      keys.forEach((key) => store.delete(key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

describe("browser project saves", () => {
  it("upgrades existing project storage without losing version-one saves", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("vvfx-local");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const existing = createEmptyProject("Existing browser save");
    const versionOne = existing as unknown as Record<string, unknown>;
    versionOne.formatVersion = 1;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("vvfx-local", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects", {
          keyPath: "metadata.id",
        });
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(existing);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });

    expect(await loadRecoveryDraft()).toBeNull();
    expect((await loadProject(existing.metadata.id)).formatVersion).toBe(18);
    expect(await listTemplates()).toEqual([]);
    await deleteProject(existing.metadata.id);
  });

  it("saves, lists, loads, and removes a complete editable project", async () => {
    const project = createEmptyProject("Saved shockwave");
    project.layers.push(createLayer("animated", "Ring", "builtin-ring"));
    await saveProject(project);

    const saved = await listProjectSummaries();
    const summary = saved.find(
      (candidate) => candidate.id === project.metadata.id,
    );
    const loaded = await loadProject(project.metadata.id);
    expect(summary?.name).toBe("Saved shockwave");
    expect(loaded.layers[0].name).toBe("Ring");

    await deleteProject(project.metadata.id);
    expect(
      (await listProjectSummaries()).some(
        (candidate) => candidate.id === project.metadata.id,
      ),
    ).toBe(false);
  });

  it("keeps recovery work separate from named project saves", async () => {
    const draftProject = createEmptyProject("Interrupted experiment");
    draftProject.layers.push(createLayer("burst", "Draft sparks"));

    await clearRecoveryDraft();
    await saveRecoveryDraft(draftProject);

    const draft = await loadRecoveryDraft();
    expect(draft?.project.metadata.name).toBe("Interrupted experiment");
    expect(draft?.project.layers[0].name).toBe("Draft sparks");
    expect(
      (await listProjectSummaries()).some(
        (project) => project.id === draftProject.metadata.id,
      ),
    ).toBe(false);

    await clearRecoveryDraft();
    expect(await loadRecoveryDraft()).toBeNull();
  });

  it("surfaces invalid project records and removes them only through their stored keys", async () => {
    const valid = createEmptyProject("Inspectable project");
    const invalidKey = createEmptyProject("Damaged slot").metadata.id;
    const opaqueNumericKey = 42_017;
    await saveProject(valid);
    await putRawRecord(PROJECT_STORE, {
      formatVersion: 17,
      metadata: { id: invalidKey, name: "Damaged project" },
      layers: "not-an-array",
      assets: [],
      sentinel: "preserve-me",
    });
    await putRawRecord(PROJECT_STORE, {
      formatVersion: 17,
      metadata: { id: opaqueNumericKey, name: "Opaque damaged key" },
      layers: [],
      assets: [],
    });

    try {
      const inspection = await inspectStoredProjects();
      expect(
        inspection.summaries.some(
          (project) => project.id === valid.metadata.id,
        ),
      ).toBe(true);
      expect(inspection.invalidRecords).toHaveLength(2);
      expect(inspection.invalidRecords).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: invalidKey,
            reason: expect.stringMatching(/trusted summary/i),
          }),
          expect.objectContaining({ key: opaqueNumericKey }),
        ]),
      );
      await expect(listProjectSummaries()).rejects.toThrow(/invalid record/i);
      await expect(
        deleteInvalidProjectRecord(valid.metadata.id),
      ).rejects.toThrow(/valid project/i);

      const replacement = createEmptyProject("Replacement project");
      replacement.metadata.id = invalidKey;
      await expect(saveProject(replacement)).rejects.toThrow(
        /index is damaged/i,
      );
      expect(await getRawRecord(PROJECT_STORE, invalidKey)).toMatchObject({
        sentinel: "preserve-me",
      });

      await deleteInvalidProjectRecord(invalidKey);
      await deleteInvalidProjectRecord(opaqueNumericKey);
      expect((await inspectStoredProjects()).invalidRecords).toEqual([]);
      expect(
        (await listProjectSummaries()).some(
          (project) => project.id === valid.metadata.id,
        ),
      ).toBe(true);
    } finally {
      await deleteInvalidProjectRecord(invalidKey);
      await deleteInvalidProjectRecord(opaqueNumericKey);
      await deleteProject(valid.metadata.id);
    }
  });

  it("keeps an oversized project library inspectable through a bounded repair view", async () => {
    const baseline = await countRawRecords(PROJECT_STORE);
    const projects = Array.from(
      { length: MAX_SAVED_PROJECTS + 1 },
      (_, index) => createEmptyProject(`Overflow inspection ${index}`),
    );
    const keys = projects.map((project) => project.metadata.id);
    await putRawRecords(PROJECT_STORE, projects);

    try {
      const inspection = await inspectStoredProjects();
      expect(inspection.totalRecords).toBe(baseline + projects.length);
      expect(inspection.excessRecords).toBe(
        Math.max(0, inspection.totalRecords - MAX_SAVED_PROJECTS),
      );
      expect(
        inspection.summaries.length + inspection.invalidRecords.length,
      ).toBeLessThanOrEqual(
        Math.min(inspection.totalRecords, MAX_SAVED_PROJECTS + 1),
      );
      await expect(listProjectSummaries()).rejects.toThrow(
        /exceeds.*safety limit/i,
      );
    } finally {
      await deleteRawRecords(PROJECT_STORE, keys);
    }

    expect(await countRawRecords(PROJECT_STORE)).toBe(baseline);
  });

  it("enforces the aggregate byte boundary transactionally", async () => {
    const filler = createEmptyProject("Aggregate filler");
    const candidate = createEmptyProject("Aggregate candidate");
    const candidateBytes = utf8ByteLength(serializeProject(candidate));
    const fillerSummary = createCurrentProjectSummary(
      filler,
      MAX_SAVED_PROJECT_LIBRARY_BYTES - candidateBytes,
    );
    await putRawRecord(PROJECT_STORE, filler);
    await putRawRecord(PROJECT_SUMMARY_STORE, fillerSummary);

    try {
      await expect(saveProject(candidate)).resolves.toMatchObject({
        metadata: { id: candidate.metadata.id },
      });
      expect((await inspectStoredProjects()).aggregateBytes).toBe(
        MAX_SAVED_PROJECT_LIBRARY_BYTES,
      );
      await deleteProject(candidate.metadata.id);

      await putRawRecord(PROJECT_SUMMARY_STORE, {
        ...fillerSummary,
        byteLength: fillerSummary.byteLength + 1,
      });
      const fillerBefore = await getRawRecord(
        PROJECT_STORE,
        filler.metadata.id,
      );
      await expect(saveProject(candidate)).rejects.toThrow(
        /at most 160 MB.*export or delete/i,
      );
      expect(
        await getRawRecord(PROJECT_STORE, candidate.metadata.id),
      ).toBeUndefined();
      expect(await getRawRecord(PROJECT_STORE, filler.metadata.id)).toEqual(
        fillerBefore,
      );
    } finally {
      await deleteProject(candidate.metadata.id);
      await deleteProject(filler.metadata.id);
    }
  });

  it("lists only summaries until one project is selected", async () => {
    const project = createEmptyProject("Summary-only listing");
    await saveProject(project);
    const getAllSpy = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const getSpy = vi.spyOn(IDBObjectStore.prototype, "get");
    try {
      const inspection = await inspectStoredProjects();
      expect(inspection.summaries).toEqual([
        expect.objectContaining({
          id: project.metadata.id,
          name: "Summary-only listing",
        }),
      ]);
      expect(
        getAllSpy.mock.contexts.some(
          (store) => (store as IDBObjectStore).name === PROJECT_STORE,
        ),
      ).toBe(false);
      expect(
        getSpy.mock.contexts.some(
          (store) => (store as IDBObjectStore).name === PROJECT_STORE,
        ),
      ).toBe(false);

      await expect(loadProject(project.metadata.id)).resolves.toMatchObject({
        metadata: { name: "Summary-only listing" },
      });
      expect(
        getSpy.mock.contexts.some(
          (store) => (store as IDBObjectStore).name === PROJECT_STORE,
        ),
      ).toBe(true);
    } finally {
      getAllSpy.mockRestore();
      getSpy.mockRestore();
      await deleteProject(project.metadata.id);
    }
  });

  it("paginates summaries and deletes an indexed corrupt record without reading its payload", async () => {
    const projects = Array.from({ length: 25 }, (_, index) =>
      createEmptyProject(`Paged project ${index}`),
    );
    for (const project of projects) await saveProject(project);
    const corrupt = createEmptyProject("Oversize corrupt record");
    await putRawRecord(PROJECT_STORE, corrupt);
    await putRawRecord(PROJECT_SUMMARY_STORE, {
      ...createCurrentProjectSummary(corrupt),
      valid: false,
      reason: "This saved project exceeds the supported record size.",
    });

    try {
      const first = await inspectStoredProjects({ page: 0, pageSize: 10 });
      const last = await inspectStoredProjects({ page: 2, pageSize: 10 });
      expect(first.summaries).toHaveLength(10);
      expect(first.totalPages).toBe(3);
      expect(last.summaries).toHaveLength(5);
      expect(first.invalidRecords).toEqual([
        expect.objectContaining({ key: corrupt.metadata.id }),
      ]);

      const getSpy = vi.spyOn(IDBObjectStore.prototype, "get");
      await deleteInvalidProjectRecord(corrupt.metadata.id);
      expect(
        getSpy.mock.contexts.some(
          (store) => (store as IDBObjectStore).name === PROJECT_STORE,
        ),
      ).toBe(false);
      getSpy.mockRestore();
      expect(
        await getRawRecord(PROJECT_STORE, corrupt.metadata.id),
      ).toBeUndefined();
    } finally {
      await deleteInvalidProjectRecord(corrupt.metadata.id);
      for (const project of projects) await deleteProject(project.metadata.id);
    }
  });

  it("throws for a damaged recovery draft without deleting it", async () => {
    await clearRecoveryDraft();
    await putRawRecord(RECOVERY_STORE, {
      id: "current",
      project: { formatVersion: 17, damaged: true },
      savedAt: new Date().toISOString(),
      sentinel: "keep-recovery",
    });

    try {
      await expect(loadRecoveryDraft()).rejects.toBeInstanceOf(
        InvalidRecoveryDraftError,
      );
      await expect(
        saveRecoveryDraft(createEmptyProject("Do not overwrite corruption")),
      ).rejects.toThrow(/preserved/i);
      await expect(clearRecoveryDraft()).rejects.toThrow(/preserved/i);
      expect(await getRawRecord(RECOVERY_STORE, "current")).toMatchObject({
        sentinel: "keep-recovery",
      });
    } finally {
      await deleteInvalidRecoveryDraft();
    }
    expect(await loadRecoveryDraft()).toBeNull();
  });

  it("revalidates an invalid recovery draft atomically before deleting it", async () => {
    await clearRecoveryDraft();
    await putRawRecord(RECOVERY_STORE, {
      id: "current",
      project: { formatVersion: 17, damaged: true },
      savedAt: new Date().toISOString(),
    });
    await expect(loadRecoveryDraft()).rejects.toBeInstanceOf(
      InvalidRecoveryDraftError,
    );

    const repairedProject = createEmptyProject("Recovered before deletion");
    await putRawRecord(RECOVERY_STORE, {
      id: "current",
      project: repairedProject,
      savedAt: new Date().toISOString(),
    });

    await expect(deleteInvalidRecoveryDraft()).rejects.toThrow(
      /now valid.*not removed/i,
    );
    expect((await loadRecoveryDraft())?.project.metadata.id).toBe(
      repairedProject.metadata.id,
    );
    await clearRecoveryDraft();

    await putRawRecord(RECOVERY_STORE, {
      id: "current",
      project: { formatVersion: 17, damaged: true },
      savedAt: new Date().toISOString(),
    });
    await deleteInvalidRecoveryDraft();
    expect(await loadRecoveryDraft()).toBeNull();
  });

  it("rejects invalid saves before they can overwrite good project or recovery data", async () => {
    const valid = createEmptyProject("Last known good");
    valid.layers.push(createLayer("animated", "Safe ring", "builtin-ring"));
    await saveProject(valid);
    await clearRecoveryDraft();
    await saveRecoveryDraft(valid);

    const invalid = structuredClone(valid);
    invalid.metadata.name = "Invalid overwrite";
    const first = createLayer("animated", "First", "builtin-ring");
    const second = createLayer("animated", "Second", "builtin-spark");
    first.parentId = second.id;
    second.parentId = first.id;
    invalid.layers = [first, second];

    await expect(saveProject(invalid)).rejects.toThrow(/circular/i);
    await expect(saveRecoveryDraft(invalid)).rejects.toThrow(/circular/i);

    const stored = await loadProject(valid.metadata.id);
    expect(stored.metadata.name).toBe("Last known good");
    expect(stored.layers.map((layer) => layer.name)).toEqual(["Safe ring"]);
    expect((await loadRecoveryDraft())?.project.metadata.name).toBe(
      "Last known good",
    );

    await deleteProject(valid.metadata.id);
    await clearRecoveryDraft();
  });

  it("rejects a malformed root before opening the save database", async () => {
    await expect(
      saveProject(null as unknown as ReturnType<typeof createEmptyProject>),
    ).rejects.toThrow(/cannot be saved/i);
  });

  it("saves, lists, and removes reusable effect templates", async () => {
    const project = createEmptyProject("Reusable pulse");
    project.layers.push(createLayer("animated", "Pulse", "builtin-ring"));
    const template = createTemplateFromProject(
      project,
      "Purple pulse",
      "Reusable impact ring",
    );

    const saved = await saveTemplate(template);
    const listed = await listTemplates();
    expect(listed.find((candidate) => candidate.id === saved.id)?.name).toBe(
      "Purple pulse",
    );
    expect(
      listed.find((candidate) => candidate.id === saved.id)?.layers[0].name,
    ).toBe("Pulse");

    await deleteTemplate(saved.id);
    expect(
      (await listTemplates()).some((candidate) => candidate.id === saved.id),
    ).toBe(false);
  });

  it("never overwrites a conflicting imported template identifier", async () => {
    const project = createEmptyProject("Import collisions");
    project.layers.push(createLayer("animated", "Pulse", "builtin-ring"));
    const original = await saveTemplate(
      createTemplateFromProject(project, "Shared pulse", "Original"),
    );

    expect(await saveTemplates([original])).toEqual({
      added: 0,
      alreadyHere: 1,
      importedAsCopy: 0,
      committedTemplates: [],
    });
    const conflict = { ...original, description: "Different shared copy" };
    const conflictResult = await saveTemplates([conflict]);
    expect(conflictResult).toMatchObject({
      added: 0,
      alreadyHere: 0,
      importedAsCopy: 1,
    });
    expect(conflictResult.committedTemplates).toEqual([
      expect.objectContaining({
        description: "Different shared copy",
        name: "Shared pulse (imported)",
      }),
    ]);

    const listed = await listTemplates();
    const kept = listed.find((template) => template.id === original.id);
    const imported = listed.find(
      (template) =>
        template.id !== original.id && template.name.endsWith("(imported)"),
    );
    expect(kept?.description).toBe("Original");
    expect(imported?.description).toBe("Different shared copy");

    await expect(saveTemplates([original, original])).rejects.toThrow(
      /identifier.*more than once/i,
    );
    await deleteTemplate(original.id);
    if (imported) await deleteTemplate(imported.id);
  });
});
