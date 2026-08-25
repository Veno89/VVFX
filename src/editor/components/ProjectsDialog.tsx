"use client";

import { CopyPlus, FolderOpen, Trash2, X } from "lucide-react";
import type { VfxProject } from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

export function ProjectsDialog({
  projects,
  onLoad,
  onDuplicate,
  onDelete,
  onClose,
}: {
  projects: VfxProject[];
  onLoad: (project: VfxProject) => void;
  onDuplicate: (project: VfxProject) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useFocusRegion<HTMLElement>({ onEscape: onClose });
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog projects-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-title"
      >
        <header>
          <div>
            <span className="eyebrow">Saved on this device</span>
            <h2 id="projects-title">Load a saved project</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close project list"
          >
            <X size={18} />
          </button>
        </header>
        {projects.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={28} />
            <strong>No browser saves yet</strong>
            <p>Choose Save in the top bar and your project will appear here.</p>
          </div>
        ) : (
          <div className="saved-project-list">
            {projects.map((project) => (
              <article key={project.metadata.id}>
                <button
                  className="saved-project-main"
                  type="button"
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
                    onClick={() => onDuplicate(project)}
                    aria-label={`Duplicate ${project.metadata.name}`}
                    title="Duplicate project"
                  >
                    <CopyPlus size={15} />
                  </button>
                  <button
                    type="button"
                    className="danger-icon"
                    onClick={() => onDelete(project.metadata.id)}
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
