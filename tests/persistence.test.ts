import { describe, expect, it } from "vitest";
import {
  clearRecoveryDraft,
  deleteProject,
  listProjects,
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
import { createTemplateFromProject } from "../src/vfx/templates";

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
    expect(
      (await listProjects()).find(
        (project) => project.metadata.id === existing.metadata.id,
      )?.formatVersion,
    ).toBe(16);
    expect(await listTemplates()).toEqual([]);
    await deleteProject(existing.metadata.id);
  });

  it("saves, lists, loads, and removes a complete editable project", async () => {
    const project = createEmptyProject("Saved shockwave");
    project.layers.push(createLayer("animated", "Ring", "builtin-ring"));
    await saveProject(project);

    const saved = await listProjects();
    const loaded = saved.find(
      (candidate) => candidate.metadata.id === project.metadata.id,
    );
    expect(loaded?.metadata.name).toBe("Saved shockwave");
    expect(loaded?.layers[0].name).toBe("Ring");

    await deleteProject(project.metadata.id);
    expect(
      (await listProjects()).some(
        (candidate) => candidate.metadata.id === project.metadata.id,
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
      (await listProjects()).some(
        (project) => project.metadata.id === draftProject.metadata.id,
      ),
    ).toBe(false);

    await clearRecoveryDraft();
    expect(await loadRecoveryDraft()).toBeNull();
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
    });
    const conflict = { ...original, description: "Different shared copy" };
    expect(await saveTemplates([conflict])).toEqual({
      added: 0,
      alreadyHere: 0,
      importedAsCopy: 1,
    });

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
