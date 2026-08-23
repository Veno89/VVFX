import { openDatabase, TEMPLATE_STORE } from "./database";
import { makeId } from "../vfx/defaults";
import { validateTemplate, type VfxTemplate } from "../vfx/templates";

export interface TemplateImportSummary {
  added: number;
  alreadyHere: number;
  importedAsCopy: number;
}

interface TemplateImportPlan extends TemplateImportSummary {
  templatesToSave: VfxTemplate[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function semanticTemplateFingerprint(template: VfxTemplate): string {
  return JSON.stringify({
    ...template,
    id: "",
    createdAt: "",
    updatedAt: "",
  });
}

function importedCopyName(name: string): string {
  const suffix = " (imported)";
  return `${name.slice(0, 120 - suffix.length).trimEnd()}${suffix}`;
}

export function planTemplateImport(
  incoming: VfxTemplate[],
  existing: VfxTemplate[],
  reservedIds: Iterable<string> = [],
): TemplateImportPlan {
  const existingById = new Map(
    existing.map((template) => [template.id, template]),
  );
  const usedIds = new Set([...reservedIds, ...existingById.keys()]);
  const templatesToSave: VfxTemplate[] = [];
  let added = 0;
  let alreadyHere = 0;
  let importedAsCopy = 0;

  for (const candidate of incoming) {
    const stored = existingById.get(candidate.id);
    if (!stored && !usedIds.has(candidate.id)) {
      templatesToSave.push(candidate);
      existingById.set(candidate.id, candidate);
      usedIds.add(candidate.id);
      added += 1;
      continue;
    }
    if (
      stored &&
      semanticTemplateFingerprint(stored) ===
        semanticTemplateFingerprint(candidate)
    ) {
      alreadyHere += 1;
      continue;
    }
    let id = makeId("template");
    while (usedIds.has(id)) id = makeId("template");
    const now = new Date().toISOString();
    const copy: VfxTemplate = {
      ...clone(candidate),
      id,
      name: importedCopyName(candidate.name),
      createdAt: now,
      updatedAt: now,
    };
    templatesToSave.push(copy);
    existingById.set(copy.id, copy);
    usedIds.add(copy.id);
    importedAsCopy += 1;
  }
  return { templatesToSave, added, alreadyHere, importedAsCopy };
}

export async function saveTemplate(
  template: VfxTemplate,
): Promise<VfxTemplate> {
  const result = validateTemplate({
    ...template,
    updatedAt: new Date().toISOString(),
  });
  if (!result.ok || !result.template)
    throw new Error(result.error ?? "This template could not be saved.");
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
    transaction.objectStore(TEMPLATE_STORE).put(result.template);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("This template could not be saved in the browser."));
  });
  db.close();
  return result.template;
}

export async function saveTemplates(
  templates: VfxTemplate[],
): Promise<TemplateImportSummary> {
  const suppliedIds = new Set<string>();
  const normalized = templates.map((template) => {
    const result = validateTemplate(template);
    if (!result.ok || !result.template)
      throw new Error(result.error ?? "A template could not be imported.");
    if (suppliedIds.has(result.template.id))
      throw new Error(
        `The import contains the template identifier “${result.template.id}” more than once.`,
      );
    suppliedIds.add(result.template.id);
    return result.template;
  });
  const db = await openDatabase();
  try {
    return await new Promise<TemplateImportSummary>((resolve, reject) => {
      const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
      const store = transaction.objectStore(TEMPLATE_STORE);
      const request = store.getAll();
      let plan: TemplateImportPlan | null = null;
      request.onsuccess = () => {
        try {
          const storedCandidates = request.result as unknown[];
          const existing = storedCandidates.flatMap((candidate) => {
            const result = validateTemplate(candidate);
            return result.ok && result.template ? [result.template] : [];
          });
          const reservedIds = storedCandidates.flatMap((candidate) =>
            typeof candidate === "object" &&
            candidate !== null &&
            "id" in candidate &&
            typeof candidate.id === "string"
              ? [candidate.id]
              : [],
          );
          plan = planTemplateImport(normalized, existing, reservedIds);
          plan.templatesToSave.forEach((template) => store.put(template));
        } catch {
          transaction.abort();
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        if (!plan) {
          reject(new Error("The template import could not be planned."));
          return;
        }
        resolve({
          added: plan.added,
          alreadyHere: plan.alreadyHere,
          importedAsCopy: plan.importedAsCopy,
        });
      };
      transaction.onerror = () =>
        reject(new Error("The template import could not be saved."));
      transaction.onabort = () =>
        reject(new Error("The template import could not be saved."));
    });
  } finally {
    db.close();
  }
}

export async function listTemplates(): Promise<VfxTemplate[]> {
  const db = await openDatabase();
  const stored = await new Promise<unknown[]>((resolve, reject) => {
    const request = db
      .transaction(TEMPLATE_STORE, "readonly")
      .objectStore(TEMPLATE_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () =>
      reject(new Error("Saved templates could not be read."));
  });
  db.close();
  return stored
    .flatMap((candidate) => {
      const result = validateTemplate(candidate);
      return result.ok && result.template ? [result.template] : [];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
    transaction.objectStore(TEMPLATE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("The saved template could not be removed."));
  });
  db.close();
}
