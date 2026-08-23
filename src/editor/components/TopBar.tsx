"use client";

import {
  BookOpen,
  CopyPlus,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Library,
  Redo2,
  Save,
  Undo2,
  Upload,
  Zap,
} from "lucide-react";
import { useRef } from "react";

export type ProjectSaveStatus =
  "new" | "saved" | "unsaved" | "recovering" | "protected" | "error";

const SAVE_STATUS_LABELS: Record<ProjectSaveStatus, string> = {
  new: "Not saved yet",
  saved: "Saved",
  unsaved: "Unsaved changes",
  recovering: "Saving recovery…",
  protected: "Unsaved · recovery protected",
  error: "Recovery unavailable",
};

export function TopBar({
  projectName,
  canUndo,
  canRedo,
  saveStatus,
  onNameChange,
  onUndo,
  onRedo,
  onSave,
  onSaveAs,
  onOpenProjects,
  onOpenTemplates,
  onImport,
  onExport,
  onNewProject,
  onLearn,
}: {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: ProjectSaveStatus;
  onNameChange: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenProjects: () => void;
  onOpenTemplates: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onNewProject: () => void;
  onLearn: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Zap size={17} fill="currentColor" />
        </span>
        <span>Vvfx</span>
        <small>2D effect studio</small>
      </div>
      <span className="topbar-divider" />
      <label className="project-name">
        <span className="project-name__label">Project</span>
        <input
          value={projectName}
          aria-label="Project name"
          onChange={(event) => onNameChange(event.target.value)}
        />
        <span
          className={`project-save-status project-save-status--${saveStatus}`}
          title={SAVE_STATUS_LABELS[saveStatus]}
        >
          <i aria-hidden="true" />
          <span>{SAVE_STATUS_LABELS[saveStatus]}</span>
        </span>
      </label>
      <div className="history-actions">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo authoring change (Ctrl+Z or Alt+Z)"
          aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>
      </div>
      <nav className="topbar-actions" aria-label="Project actions">
        <button
          type="button"
          onClick={onNewProject}
          title="Start a new empty project"
        >
          <FilePlus2 size={14} /> New
        </button>
        <button
          type="button"
          onClick={onLearn}
          title="Tours and beginner tutorials"
        >
          <BookOpen size={14} /> Learn
        </button>
        <button type="button" onClick={onSave}>
          <Save size={14} /> Save
        </button>
        <button
          type="button"
          onClick={onSaveAs}
          title="Save a separate copy (Ctrl+Shift+S)"
        >
          <CopyPlus size={14} /> Save As
        </button>
        <button type="button" onClick={onOpenProjects}>
          <FolderOpen size={14} /> Load
        </button>
        <button
          type="button"
          onClick={onOpenTemplates}
          title="Save and reuse complete effects"
        >
          <Library size={14} /> Templates
        </button>
        <button type="button" onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> Import
        </button>
        <button className="export-button" type="button" onClick={onExport}>
          <Download size={14} /> Export <FileCode2 size={13} />
        </button>
      </nav>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".vvfx,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.currentTarget.value = "";
        }}
      />
    </header>
  );
}
