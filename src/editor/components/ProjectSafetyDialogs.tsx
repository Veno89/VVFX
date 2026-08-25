"use client";

import { AlertTriangle, FilePlus2, History, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecoveryDraft } from "../../persistence/projects";
import { useFocusRegion } from "../useFocusRegion";

export function NewProjectDialog({
  projectName,
  onConfirm,
  onClose,
}: {
  projectName: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useFocusRegion<HTMLElement>({
    initialFocusRef: keepEditingRef,
    onEscape: onClose,
  });

  return (
    <div
      className="dialog-backdrop new-project-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog compact-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        aria-describedby="new-project-description"
      >
        <header>
          <div>
            <span className="eyebrow">Unsaved work</span>
            <h2 id="new-project-title">Start a new project?</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Keep editing current project"
          >
            <X size={18} />
          </button>
        </header>
        <div className="project-safety-form">
          <p id="new-project-description" className="destructive-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              <strong>{projectName}</strong> has unsaved changes. Starting over
              replaces the current editor state and its recovery draft. This
              cannot be undone.
            </span>
          </p>
          <footer>
            <button ref={keepEditingRef} type="button" onClick={onClose}>
              Keep editing
            </button>
            <button type="button" className="danger-action" onClick={onConfirm}>
              <FilePlus2 size={14} /> Discard changes and start new
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

export function SaveAsDialog({
  suggestedName,
  onSave,
  onClose,
}: {
  suggestedName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusRegion<HTMLElement>({
    initialFocusRef: inputRef,
    onEscape: onClose,
  });
  const trimmedName = name.trim();
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="dialog compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-as-title"
      >
        <header>
          <div>
            <span className="eyebrow">Keep a separate version</span>
            <h2 id="save-as-title">Save project as</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Save As">
            <X size={18} />
          </button>
        </header>
        <form
          className="project-safety-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedName) onSave(trimmedName);
          }}
        >
          <label>
            Project name
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
          <p>
            This creates a separate browser save and switches the editor to the
            new copy.
          </p>
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-action"
              disabled={!trimmedName}
            >
              <Save size={14} /> Save copy
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function RecoveryDialog({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: RecoveryDraft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const dialogRef = useFocusRegion<HTMLElement>();
  const uploadedImages = draft.project.assets.filter(
    (asset) => !asset.builtIn,
  ).length;
  return (
    <div className="dialog-backdrop recovery-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="dialog compact-dialog recovery-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
      >
        <header>
          <div>
            <span className="eyebrow">Work found on this device</span>
            <h2 id="recovery-title">Recover your last editing session?</h2>
          </div>
          <span className="recovery-icon" aria-hidden="true">
            <History size={19} />
          </span>
        </header>
        <div className="recovery-summary">
          <strong>{draft.project.metadata.name}</strong>
          <span>
            {draft.project.layers.length} layer
            {draft.project.layers.length === 1 ? "" : "s"} · {uploadedImages}{" "}
            uploaded image{uploadedImages === 1 ? "" : "s"}
          </span>
          <small>
            Recovery saved {new Date(draft.savedAt).toLocaleString()}
          </small>
          <p id="recovery-description">
            Vvfx kept these unsaved changes separately from your named project
            saves.
          </p>
        </div>
        <footer>
          <button type="button" onClick={onDiscard}>
            Discard recovery
          </button>
          <button type="button" className="primary-action" onClick={onRestore}>
            <History size={14} /> Restore session
          </button>
        </footer>
      </section>
    </div>
  );
}
