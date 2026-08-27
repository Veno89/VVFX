"use client";

import {
  AlertTriangle,
  FilePlus2,
  History,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecoveryDraft } from "../../persistence/projects";
import type {
  AssetLayerUsage,
  AssetUsageCounts,
  AssetUsageReport,
} from "../../vfx/assetReferences";
import { useFocusRegion } from "../useFocusRegion";

const countLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

function assetUsageRoleLabels(usage: AssetLayerUsage): string[] {
  const labels: string[] = [];
  if (usage.roles.artwork) labels.push("artwork");
  if (usage.roles.visualMaskActive) labels.push("active visual mask");
  if (usage.roles.visualMaskStored) labels.push("saved visual-mask choice");
  if (usage.roles.spawnSilhouetteActive) labels.push("active spawn silhouette");
  if (usage.roles.spawnSilhouetteStored)
    labels.push("saved spawn-silhouette choice");
  return labels;
}

function removalConsequences(counts: AssetUsageCounts): string[] {
  return [
    counts.artwork > 0
      ? `Clear artwork from ${countLabel(counts.artwork, "layer")}`
      : null,
    counts.visualMaskActive > 0
      ? `Turn off visual masking on ${countLabel(counts.visualMaskActive, "layer")}`
      : null,
    counts.visualMaskStored > 0
      ? `Forget the saved visual-mask choice on ${countLabel(counts.visualMaskStored, "layer")}`
      : null,
    counts.spawnSilhouetteActive > 0
      ? `Reset silhouette spawning to one point on ${countLabel(counts.spawnSilhouetteActive, "layer")}`
      : null,
    counts.spawnSilhouetteStored > 0
      ? `Forget the saved spawn-silhouette choice on ${countLabel(counts.spawnSilhouetteStored, "layer")}`
      : null,
  ].filter((item): item is string => item !== null);
}

export function AssetRemovalDialog({
  assetName,
  usage,
  onConfirm,
  onClose,
}: {
  assetName: string;
  usage: AssetUsageReport;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useFocusRegion<HTMLElement>({
    initialFocusRef: cancelRef,
    onEscape: onClose,
  });
  const consequences = removalConsequences(usage.counts);
  const shownLayers = usage.layers.slice(0, 5);
  const hiddenLayerCount = usage.layers.length - shownLayers.length;

  return (
    <div
      className="dialog-backdrop asset-removal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog compact-dialog asset-removal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="asset-removal-title"
        aria-describedby="asset-removal-description asset-removal-undo"
      >
        <header>
          <div>
            <span className="eyebrow">Remove project image</span>
            <h2 id="asset-removal-title">Remove “{assetName}”?</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel removing image"
          >
            <X size={18} />
          </button>
        </header>
        <div className="project-safety-form asset-removal-form">
          <p id="asset-removal-description" className="destructive-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              {usage.counts.affectedLayers === 0 ? (
                <>
                  This image is not used by any layers. Removing it deletes its
                  embedded copy from this project.
                </>
              ) : (
                <>
                  This image is used by{" "}
                  <strong>
                    {countLabel(usage.counts.affectedLayers, "layer")}
                  </strong>
                  . Removing it also changes those layer settings.
                </>
              )}
            </span>
          </p>

          {consequences.length > 0 && (
            <section
              className="asset-removal-impact"
              aria-labelledby="asset-removal-impact-title"
            >
              <strong id="asset-removal-impact-title">What will change</strong>
              <ul>
                {consequences.map((consequence) => (
                  <li key={consequence}>{consequence}</li>
                ))}
              </ul>
            </section>
          )}

          {shownLayers.length > 0 && (
            <section
              className="asset-removal-layers"
              aria-labelledby="asset-removal-layers-title"
            >
              <strong id="asset-removal-layers-title">Affected layers</strong>
              <ul>
                {shownLayers.map((layer) => (
                  <li key={layer.layerId}>
                    <span>{layer.layerName}</span>
                    <small>{assetUsageRoleLabels(layer).join(" · ")}</small>
                  </li>
                ))}
              </ul>
              {hiddenLayerCount > 0 && (
                <small>
                  Plus {countLabel(hiddenLayerCount, "other layer")}.
                </small>
              )}
            </section>
          )}

          <p id="asset-removal-undo" className="asset-removal-undo">
            Removing the image is one authoring change. Undo restores the image
            and these references while you keep editing this project.
          </p>
          <footer>
            <button ref={cancelRef} type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="danger-action" onClick={onConfirm}>
              <Trash2 size={14} /> Remove image
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

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
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusRegion<HTMLElement>({
    initialFocusRef: inputRef,
    escapeEnabled: !busy,
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
  const saveCopy = async () => {
    if (!trimmedName || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmedName);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This copy could not be saved.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="save-as-title"
      >
        <header>
          <div>
            <span className="eyebrow">Keep a separate version</span>
            <h2 id="save-as-title">Save project as</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close Save As"
          >
            <X size={18} />
          </button>
        </header>
        <form
          className="project-safety-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveCopy();
          }}
        >
          <label>
            Project name
            <input
              ref={inputRef}
              disabled={busy}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
          <p>
            This creates a separate browser save and switches the editor to the
            new copy.
          </p>
          {error && (
            <p className="friendly-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-action"
              disabled={busy || !trimmedName}
            >
              <Save size={14} /> {busy ? "Saving…" : "Save copy"}
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
