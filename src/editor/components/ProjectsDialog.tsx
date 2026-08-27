"use client";

import { CopyPlus, FolderOpen, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { VfxProject } from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

export function ProjectsDialog({
  projects,
  invalidSavedCount = 0,
  excessSavedCount = 0,
  onLoad,
  onDuplicate,
  onDelete,
  onRemoveInvalidSaved,
  onClose,
}: {
  projects: VfxProject[];
  invalidSavedCount?: number;
  excessSavedCount?: number;
  onLoad: (project: VfxProject) => void;
  onDuplicate: (project: VfxProject) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRemoveInvalidSaved?: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const requestClose = () => {
    if (!busyRef.current) onClose();
  };
  const dialogRef = useFocusRegion<HTMLElement>({
    escapeEnabled: !busy,
    onEscape: requestClose,
  });

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

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busyRef.current && event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog projects-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="projects-title"
      >
        <header>
          <div>
            <span className="eyebrow">Saved on this device</span>
            <h2 id="projects-title">Load a saved project</h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close project list"
          >
            <X size={18} />
          </button>
        </header>
        {error && (
          <p className="template-library-error" role="alert">
            {error}
          </p>
        )}
        {invalidSavedCount > 0 && (
          <div className="storage-repair-warning" role="alert">
            <div>
              <strong>
                {invalidSavedCount} unreadable project save
                {invalidSavedCount === 1 ? "" : "s"} found
              </strong>
              <p>
                Vvfx preserved the stored data, but it cannot safely open it.
                Remove {invalidSavedCount === 1 ? "this" : "these"} unreadable
                {invalidSavedCount === 1 ? " save" : " saves"} to free browser
                storage.
              </p>
            </div>
            {onRemoveInvalidSaved && (
              <button
                type="button"
                className="danger-action"
                disabled={busy}
                onClick={() =>
                  void runBusy(
                    onRemoveInvalidSaved,
                    "The unreadable project data could not be removed.",
                  )
                }
              >
                <Trash2 size={14} /> Remove unreadable
              </button>
            )}
          </div>
        )}
        {excessSavedCount > 0 && (
          <div className="storage-repair-warning" role="alert">
            <div>
              <strong>Project save limit exceeded</strong>
              <p>
                This browser has {excessSavedCount} project
                {excessSavedCount === 1 ? "" : "s"} beyond the supported limit.
                Your saves were preserved; remove at least {excessSavedCount}{" "}
                saved {excessSavedCount === 1 ? "entry" : "entries"} from the
                list below to make the library writable again.
              </p>
            </div>
          </div>
        )}
        {projects.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={28} />
            <strong>
              {invalidSavedCount > 0
                ? "No readable browser saves"
                : "No browser saves yet"}
            </strong>
            <p>
              {invalidSavedCount > 0
                ? "Remove the unreadable data above, then save or import a healthy project."
                : "Choose Save in the top bar and your project will appear here."}
            </p>
          </div>
        ) : (
          <div className="saved-project-list">
            {projects.map((project) => (
              <article key={project.metadata.id}>
                <button
                  className="saved-project-main"
                  type="button"
                  disabled={busy}
                  onClick={() => onLoad(project)}
                >
                  <strong>{project.metadata.name}</strong>
                  <span>
                    {project.layers.length} layers ·{" "}
                    {project.assets.filter((asset) => !asset.builtIn).length}{" "}
                    uploaded images
                  </span>
                  <small>
                    Saved{" "}
                    {new Date(project.metadata.updatedAt).toLocaleString()}
                    {" · Click to open"}
                  </small>
                </button>
                <span className="saved-project-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runBusy(
                        () => onDuplicate(project),
                        "The project could not be duplicated.",
                      )
                    }
                    aria-label={`Duplicate ${project.metadata.name}`}
                    title="Duplicate project"
                  >
                    <CopyPlus size={15} />
                  </button>
                  <button
                    type="button"
                    className="danger-icon"
                    disabled={busy}
                    onClick={() =>
                      void runBusy(
                        () => onDelete(project.metadata.id),
                        "The saved project could not be removed.",
                      )
                    }
                    aria-label={`Delete ${project.metadata.name}`}
                    title="Remove browser save"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
        <footer>
          <p>
            Browser saves stay on this device. Export a .vvfx file for a
            portable backup.
          </p>
        </footer>
      </section>
    </div>
  );
}
