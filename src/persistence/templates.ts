import { openDatabase, TEMPLATE_STORE } from "./database";
import { makeId } from "../vfx/defaults";
import { MAX_SAVED_TEMPLATES } from "../vfx/inputLimits";
import {
  serializeTemplatePack,
  validateTemplate,
  type VfxTemplate,
} from "../vfx/templates";

export interface TemplateImportSummary {
  added: number;
  alreadyHere: number;
  importedAsCopy: number;
}

export interface TemplateImportResult extends TemplateImportSummary {
  committedTemplates: VfxTemplate[];
}

export interface InvalidStoredTemplateRecord {
  key: IDBValidKey;
  reason: string;
}

export interface StoredTemplateInspection {
  templates: VfxTemplate[];
  invalidRecords: InvalidStoredTemplateRecord[];
  totalRecords: number;
  excessRecords: number;
}

interface StoredTemplateEntry {
  key: IDBValidKey;
  value: unknown;
}

interface StoredTemplateEntryRead {
  entries: StoredTemplateEntry[];
  totalRecords: number;
}

interface TemplateImportPlan extends TemplateImportSummary {
  templatesToSave: VfxTemplate[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function readStoredTemplateEntries(
  db: IDBDatabase,
): Promise<StoredTemplateEntryRead> {
  return new Promise<StoredTemplateEntryRead>((resolve, reject) => {
    const transaction = db.transaction(TEMPLATE_STORE, "readonly");
    const store = transaction.objectStore(TEMPLATE_STORE);
    const valuesRequest = store.getAll(undefined, MAX_SAVED_TEMPLATES + 1);
    const keysRequest = store.getAllKeys(undefined, MAX_SAVED_TEMPLATES + 1);
    const countRequest = store.count();
    transaction.oncomplete = () => {
      const values = valuesRequest.result as unknown[];
      const keys = keysRequest.result;
      if (values.length !== keys.length) {
        reject(new Error("Saved templates could not be inspected safely."));
        return;
      }
      resolve({
        entries: values.map((value, index) => ({
          key: keys[index],
          value,
        })),
        totalRecords: countRequest.result,
      });
    };
    transaction.onerror = () =>
      reject(new Error("Saved templates could not be read."));
    transaction.onabort = () =>
      reject(new Error("Saved templates could not be read."));
  });
}

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
  if (
    incoming.length > MAX_SAVED_TEMPLATES ||
    existing.length > MAX_SAVED_TEMPLATES
  )
    throw new Error(
      `A template library can contain at most ${MAX_SAVED_TEMPLATES} entries.`,
    );
  const existingById = new Map(
    existing.map((template) => [template.id, template]),
  );
  const usedIds = new Set(existingById.keys());
  let reservedCount = 0;
  for (const id of reservedIds) {
    reservedCount += 1;
    if (reservedCount > MAX_SAVED_TEMPLATES + 1)
      throw new Error("The stored template identifiers exceed their limit.");
    usedIds.add(id);
  }
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
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
      const store = transaction.objectStore(TEMPLATE_STORE);
      const request = store.getAll(undefined, MAX_SAVED_TEMPLATES + 1);
      let failureMessage = "This template could not be saved in the browser.";
      request.onsuccess = () => {
        try {
          const stored = request.result as unknown[];
          if (stored.length > MAX_SAVED_TEMPLATES)
            throw new Error(
              "The saved template library exceeds its safety limit.",
            );
          const replacing = stored.some(
            (candidate) =>
              typeof candidate === "object" &&
              candidate !== null &&
              "id" in candidate &&
              candidate.id === result.template?.id,
          );
          if (replacing) {
            const storedMatch = stored.find(
              (candidate) =>
                typeof candidate === "object" &&
                candidate !== null &&
                "id" in candidate &&
                candidate.id === result.template?.id,
            );
            if (storedMatch && !validateTemplate(storedMatch).ok)
              throw new Error(
                "A damaged saved record already uses this template identifier. Remove that invalid record before saving.",
              );
          }
          if (!replacing && stored.length >= MAX_SAVED_TEMPLATES)
            throw new Error(
              `Save or remove templates before adding more than ${MAX_SAVED_TEMPLATES}.`,
            );
          const existing = stored.flatMap((candidate) => {
            const validation = validateTemplate(candidate);
            return validation.ok &&
              validation.template &&
              validation.template.id !== result.template?.id
              ? [validation.template]
              : [];
          });
          serializeTemplatePack([...existing, result.template!]);
          store.put(result.template!);
        } catch (error) {
          failureMessage =
            error instanceof Error ? error.message : failureMessage;
          transaction.abort();
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
  return result.template;
}

export async function saveTemplates(
  templates: VfxTemplate[],
): Promise<TemplateImportResult> {
  if (templates.length === 0)
    return {
      added: 0,
      alreadyHere: 0,
      importedAsCopy: 0,
      committedTemplates: [],
    };
  if (templates.length > MAX_SAVED_TEMPLATES)
    throw new Error(`Import at most ${MAX_SAVED_TEMPLATES} templates at once.`);
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
    return await new Promise<TemplateImportResult>((resolve, reject) => {
      const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
      const store = transaction.objectStore(TEMPLATE_STORE);
      const request = store.getAll(undefined, MAX_SAVED_TEMPLATES + 1);
      let plan: TemplateImportPlan | null = null;
      let failureMessage = "The template import could not be saved.";
      request.onsuccess = () => {
        try {
          const storedCandidates = request.result as unknown[];
          if (storedCandidates.length > MAX_SAVED_TEMPLATES)
            throw new Error(
              "The saved template library exceeds its safety limit.",
            );
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
          if (
            storedCandidates.length + plan.templatesToSave.length >
            MAX_SAVED_TEMPLATES
          )
            throw new Error(
              `The saved library can contain at most ${MAX_SAVED_TEMPLATES} templates.`,
            );
          serializeTemplatePack([...existing, ...plan.templatesToSave]);
          plan.templatesToSave.forEach((template) => store.put(template));
        } catch (error) {
          failureMessage =
            error instanceof Error ? error.message : failureMessage;
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
          committedTemplates: plan.templatesToSave,
        });
      };
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
}

export async function inspectStoredTemplates(): Promise<StoredTemplateInspection> {
  const db = await openDatabase();
  let stored: StoredTemplateEntryRead;
  try {
    stored = await readStoredTemplateEntries(db);
  } finally {
    db.close();
  }
  const templates: VfxTemplate[] = [];
  const invalidRecords: InvalidStoredTemplateRecord[] = [];
  for (const entry of stored.entries) {
    const result = validateTemplate(entry.value);
    if (result.ok && result.template) templates.push(result.template);
    else
      invalidRecords.push({
        key: entry.key,
        reason: result.error ?? "This saved template record is damaged.",
      });
  }
  templates.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  return {
    templates,
    invalidRecords,
    totalRecords: stored.totalRecords,
    excessRecords: Math.max(0, stored.totalRecords - MAX_SAVED_TEMPLATES),
  };
}

export async function listTemplates(): Promise<VfxTemplate[]> {
  const inspection = await inspectStoredTemplates();
  if (inspection.excessRecords > 0)
    throw new Error(
      `The saved template library contains ${inspection.totalRecords} records and exceeds its safety limit by ${inspection.excessRecords}. Inspect or remove records before continuing.`,
    );
  if (inspection.invalidRecords.length > 0)
    throw new Error(
      `The saved template library contains ${inspection.invalidRecords.length} invalid ${inspection.invalidRecords.length === 1 ? "record" : "records"}. Inspect or remove them before continuing.`,
    );
  return inspection.templates;
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
      transaction.objectStore(TEMPLATE_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("The saved template could not be removed."));
    });
  } finally {
    db.close();
  }
}

export async function deleteInvalidTemplateRecord(
  key: IDBValidKey,
): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(TEMPLATE_STORE, "readwrite");
      const store = transaction.objectStore(TEMPLATE_STORE);
      const request = store.get(key);
      let failureMessage = "The invalid template record could not be removed.";
      request.onsuccess = () => {
        if (request.result === undefined) return;
        if (validateTemplate(request.result).ok) {
          failureMessage =
            "This saved record is now a valid template and was not removed.";
          transaction.abort();
          return;
        }
        store.delete(key);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(failureMessage));
      transaction.onabort = () => reject(new Error(failureMessage));
    });
  } finally {
    db.close();
  }
}
