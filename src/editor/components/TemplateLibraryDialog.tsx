"use client";

import {
  Download,
  Copy,
  Pencil,
  Layers3,
  Library,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TemplateImportSummary } from "../../persistence/templates";
import { COMPOSITION_PRESETS } from "../../vfx/presets";
import type {
  TemplateDependencySummary,
  TemplateScope,
  VfxTemplate,
} from "../../vfx/templates";
import { useFocusRegion } from "../useFocusRegion";

export type TemplateSaveScope = TemplateScope;

const scopeLabel: Record<TemplateSaveScope, string> = {
  effect: "Complete effect",
  layer: "Layer",
  group: "Group",
};

function importSummaryText(summary: TemplateImportSummary): string {
  return [
    `${summary.added} added`,
    `${summary.alreadyHere} already here`,
    `${summary.importedAsCopy} imported as ${summary.importedAsCopy === 1 ? "a copy" : "copies"}`,
  ].join(" · ");
}

export function TemplateLibraryDialog({
  projectName,
  selectedLayerName,
  selectedGroupName,
  canSaveCurrent,
  templates,
  invalidSavedCount = 0,
  excessSavedCount = 0,
  saveSummaries = {},
  onSaveCurrent,
  onInsert,
  onInsertBuiltIn,
  onRename,
  onDuplicate,
  onExportOne,
  onDelete,
  onRemoveInvalidSaved,
  onImport,
  onExport,
  onClose,
}: {
  projectName: string;
  selectedLayerName?: string;
  selectedGroupName?: string;
  canSaveCurrent: boolean;
  templates: VfxTemplate[];
  invalidSavedCount?: number;
  excessSavedCount?: number;
  saveSummaries?: Partial<Record<TemplateSaveScope, TemplateDependencySummary>>;
  onSaveCurrent: (
    name: string,
    description: string,
    scope: TemplateSaveScope,
  ) => Promise<void>;
  onInsert: (template: VfxTemplate) => void | Promise<void>;
  onInsertBuiltIn: (presetId: string) => void;
  onRename: (template: VfxTemplate, name: string) => Promise<void>;
  onDuplicate: (template: VfxTemplate) => Promise<void>;
  onExportOne: (template: VfxTemplate) => void;
  onDelete: (template: VfxTemplate) => Promise<void>;
  onRemoveInvalidSaved?: () => Promise<void>;
  onImport: (file: File) => Promise<TemplateImportSummary>;
  onExport: () => void;
  onClose: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TemplateSaveScope>("effect");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const saveTriggerRef = useRef<HTMLButtonElement>(null);
  const templateNameRef = useRef<HTMLInputElement>(null);
  const closeSaveForm = () => {
    setSaveOpen(false);
    window.requestAnimationFrame(() => saveTriggerRef.current?.focus());
  };
  const dialogRef = useFocusRegion<HTMLElement>({
    escapeEnabled: !busy,
    onEscape: saveOpen ? closeSaveForm : onClose,
  });
  const saveSummary = saveSummaries[scope];

  useEffect(() => {
    if (!saveOpen) return;
    const frame = window.requestAnimationFrame(() => {
      templateNameRef.current?.focus();
      templateNameRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [saveOpen]);

  const runBusy = async (
    operation: () => Promise<void>,
    fallbackMessage: string,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveCurrent = async () => {
    await runBusy(async () => {
      await onSaveCurrent(name, description, scope);
      closeSaveForm();
      setDescription("");
    }, "The template could not be saved.");
  };

  const importPack = async (file: File) => {
    setImportResult(null);
    await runBusy(async () => {
      const result = await onImport(file);
      setImportResult(importSummaryText(result));
    }, "The template pack could not be imported.");
  };

  const insertSavedTemplate = async (template: VfxTemplate) => {
    await runBusy(async () => {
      await onInsert(template);
    }, "The template could not be inserted.");
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.currentTarget === event.target) {
          if (saveOpen) closeSaveForm();
          else onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="dialog template-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="template-library-title"
      >
        <header>
          <div>
            <span className="eyebrow">Reusable effects on this device</span>
            <h2 id="template-library-title">Effect templates</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close template library"
          >
            <X size={18} />
          </button>
        </header>
        <div className="template-library-scroll">
          <div className="template-library-toolbar">
            <button
              ref={saveTriggerRef}
              type="button"
              className="primary-action"
              disabled={!canSaveCurrent || busy}
              onClick={() => {
                setName(projectName);
                setScope("effect");
                setSaveOpen(true);
                setError(null);
              }}
              aria-controls="template-save-current-form"
              aria-expanded={saveOpen}
            >
              <Save size={14} /> Save current effect
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => importRef.current?.click()}
            >
              <Upload size={14} /> Import template or pack
            </button>
            <button
              type="button"
              disabled={templates.length === 0 || busy || excessSavedCount > 0}
              title={
                excessSavedCount > 0
                  ? "Resolve the template limit before exporting a complete backup."
                  : "Export every saved template"
              }
              onClick={onExport}
            >
              <Download size={14} /> Export all
            </button>
            <input
              ref={importRef}
              hidden
              disabled={busy}
              type="file"
              accept=".vvfx-template,.vvfx-templates,.json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importPack(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          {saveOpen && (
            <form
              id="template-save-current-form"
              className="template-save-form"
              aria-labelledby="template-save-current-title"
              onSubmit={(event) => {
                event.preventDefault();
                void saveCurrent();
              }}
            >
              <div>
                <strong id="template-save-current-title">
                  Save reusable layers
                </strong>
                <p>
                  Inserted templates become ordinary editable layers. Timing,
                  event links, groups, and used images travel with the copy.
                </p>
                {saveSummary && (
                  <div className="template-dependency-summary">
                    <p>
                      <strong>
                        {saveSummary.layerCount} layer
                        {saveSummary.layerCount === 1 ? "" : "s"}
                      </strong>
                      {" · "}
                      {saveSummary.assetCount} used image
                      {saveSummary.assetCount === 1 ? "" : "s"}
                      {saveSummary.uploadedAssetCount > 0
                        ? ` (${saveSummary.uploadedAssetCount} uploaded)`
                        : ""}
                    </p>
                    <p>
                      {scope === "effect"
                        ? "Leading silence is kept; the effect anchor is inserted at the playhead."
                        : "The earliest Timeline layer starts at the playhead. Triggered timing stays relative."}
                    </p>
                    {(saveSummary.omittedParentLinks > 0 ||
                      saveSummary.omittedEventLinks > 0) && (
                      <p className="template-dependency-warning">
                        Outside the selected scope:{" "}
                        {saveSummary.omittedParentLinks} attachment
                        {saveSummary.omittedParentLinks === 1 ? "" : "s"}
                        {" and "}
                        {saveSummary.omittedEventLinks} event link
                        {saveSummary.omittedEventLinks === 1 ? "" : "s"}
                        {" will not be included."}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <label>
                What to save
                <select
                  disabled={busy}
                  value={scope}
                  onChange={(event) => {
                    const next = event.target.value as TemplateSaveScope;
                    setScope(next);
                    if (next === "layer" && selectedLayerName)
                      setName(selectedLayerName);
                    else if (next === "group" && selectedGroupName)
                      setName(selectedGroupName);
                    else setName(projectName);
                  }}
                >
                  <option value="effect">Complete effect</option>
                  <option value="layer" disabled={!selectedLayerName}>
                    Selected layer
                    {selectedLayerName ? ` — ${selectedLayerName}` : ""}
                  </option>
                  <option value="group" disabled={!selectedGroupName}>
                    Selected group
                    {selectedGroupName ? ` — ${selectedGroupName}` : ""}
                  </option>
                </select>
                <small>
                  Save one useful layer, a grouped mini-effect, or the complete
                  composition.
                </small>
              </label>
              <label>
                Template name
                <input
                  ref={templateNameRef}
                  disabled={busy}
                  value={name}
                  required
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Short reminder <small>optional</small>
                <textarea
                  disabled={busy}
                  value={description}
                  maxLength={280}
                  placeholder="For example: Quick blue impact for enemy hits"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div>
                <button type="button" disabled={busy} onClick={closeSaveForm}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={busy || !name.trim()}
                >
                  <Plus size={14} /> {busy ? "Saving…" : "Save template"}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="template-library-error" role="alert">
              {error}
            </p>
          )}
          {importResult && (
            <p
              className="template-library-result"
              role="status"
              aria-live="polite"
            >
              Import complete: {importResult}.
            </p>
          )}
          {invalidSavedCount > 0 && (
            <div className="storage-repair-warning" role="alert">
              <div>
                <strong>
                  {invalidSavedCount} unreadable template
                  {invalidSavedCount === 1 ? "" : "s"} found
                </strong>
                <p>
                  Vvfx preserved the stored data, but it cannot safely use it.
                  Remove {invalidSavedCount === 1 ? "this" : "these"}
                  {invalidSavedCount === 1
                    ? " unreadable template"
                    : " unreadable templates"}{" "}
                  to free browser storage.
                </p>
              </div>
              {onRemoveInvalidSaved && (
                <button
                  type="button"
                  className="danger-action"
                  disabled={busy}
                  onClick={() => {
                    void runBusy(
                      onRemoveInvalidSaved,
                      "The unreadable templates could not be removed.",
                    );
                  }}
                >
                  <Trash2 size={14} /> Remove unreadable
                </button>
              )}
            </div>
          )}
          {excessSavedCount > 0 && (
            <div className="storage-repair-warning" role="alert">
              <div>
                <strong>Template save limit exceeded</strong>
                <p>
                  This browser has {excessSavedCount} template
                  {excessSavedCount === 1 ? "" : "s"} beyond the supported
                  limit. Your templates were preserved; remove at least{" "}
                  {excessSavedCount} saved{" "}
                  {excessSavedCount === 1 ? "entry" : "entries"} from the list
                  below to make the library writable again. Export all is
                  disabled until the complete library can be included.
                </p>
              </div>
            </div>
          )}
          <div className="template-section-heading">
            <div>
              <span className="eyebrow">Built-in</span>
              <h3>Complete-effect starters</h3>
            </div>
            <small>Provided by Vvfx</small>
          </div>
          <div
            className="template-list template-list--built-in"
            role="list"
            aria-label="Complete-effect starters"
          >
            {COMPOSITION_PRESETS.map((preset) => (
              <article key={preset.id} role="listitem">
                <span className="template-list-icon">
                  <Sparkles size={18} />
                </span>
                <div>
                  <strong>{preset.name}</strong>
                  <p>{preset.description}</p>
                  <small>
                    <span className="template-scope-badge">
                      Complete effect
                    </span>
                    {" · "}
                    {preset.ingredients.join(" · ")}
                    {" · Inserts at playhead"}
                  </small>
                </div>
                <span className="template-list-actions">
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={() => onInsertBuiltIn(preset.id)}
                  >
                    <Plus size={14} /> Insert copy
                  </button>
                </span>
              </article>
            ))}
          </div>
          <div className="template-section-heading">
            <div>
              <span className="eyebrow">My templates</span>
              <h3>Saved on this device</h3>
            </div>
            <small>{templates.length} saved</small>
          </div>
          {templates.length === 0 ? (
            <div className="empty-state template-library-empty">
              <Library size={30} />
              <strong>
                {invalidSavedCount > 0
                  ? "No readable effect templates"
                  : "No saved effect templates yet"}
              </strong>
              <p>
                {invalidSavedCount > 0
                  ? "Remove the unreadable data above, then save or import a healthy template."
                  : "Build an effect, save it here, then insert a fresh copy into any project later."}
              </p>
            </div>
          ) : (
            <div
              className="template-list"
              role="list"
              aria-label="Saved effect templates"
            >
              {templates.map((template) => (
                <article key={template.id} role="listitem">
                  <span className="template-list-icon">
                    <Layers3 size={18} />
                  </span>
                  <div>
                    <strong>{template.name}</strong>
                    <p>
                      {template.description ||
                        "A reusable Vvfx effect with its original layer settings."}
                    </p>
                    <small>
                      <span className="template-scope-badge">
                        {scopeLabel[template.scope]}
                      </span>
                      {" · Inserts at playhead · "}
                      {template.layers.length} layer
                      {template.layers.length === 1 ? "" : "s"} ·{" "}
                      {(template.duration / 1000).toFixed(2)}s ·{" "}
                      {template.assets.filter((asset) => !asset.builtIn).length}{" "}
                      uploaded image
                      {template.assets.filter((asset) => !asset.builtIn)
                        .length === 1
                        ? ""
                        : "s"}
                    </small>
                  </div>
                  <span className="template-list-actions">
                    <button
                      type="button"
                      className="primary-action"
                      disabled={busy}
                      onClick={() => void insertSavedTemplate(template)}
                    >
                      <Plus size={14} /> Insert copy
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      title="Rename template"
                      aria-label={`Rename ${template.name}`}
                      onClick={() => {
                        const nextName = window.prompt(
                          "Rename this template",
                          template.name,
                        );
                        if (
                          !nextName?.trim() ||
                          nextName.trim() === template.name
                        )
                          return;
                        void runBusy(
                          () => onRename(template, nextName.trim()),
                          "The template could not be renamed.",
                        );
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      title="Duplicate template"
                      aria-label={`Duplicate ${template.name}`}
                      onClick={() => {
                        void runBusy(
                          () => onDuplicate(template),
                          "The template could not be duplicated.",
                        );
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      title="Export this template"
                      aria-label={`Export ${template.name}`}
                      onClick={() => onExportOne(template)}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      type="button"
                      className="danger-icon"
                      disabled={busy}
                      title="Delete template"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete “${template.name}” from this browser?`,
                          )
                        )
                          void runBusy(
                            () => onDelete(template),
                            "The template could not be deleted.",
                          );
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </article>
              ))}
            </div>
          )}
        </div>
        <footer>
          <p>
            Templates stay on this device. Export one `.vvfx-template` to share
            a single effect, or export all as a `.vvfx-templates` pack.
          </p>
        </footer>
      </section>
    </div>
  );
}
