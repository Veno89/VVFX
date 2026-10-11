"use client";

import {
  BookOpen,
  ChevronDown,
  CopyPlus,
  Download,
  File as FileIcon,
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
import { useRef, useState, type KeyboardEvent } from "react";
import { MAX_VFX_NAME_LENGTH } from "../../vfx/inputLimits";
import { useFocusRegion } from "../useFocusRegion";

const FILE_MENU_ID = "topbar-file-menu";

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
  onActionIntent,
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
  /** Pointer or focus reached the project actions; warm their dialogs. */
  onActionIntent?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileTriggerRef = useRef<HTMLButtonElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [fileMenuIndex, setFileMenuIndex] = useState(0);
  const fileMenuRef = useFocusRegion<HTMLDivElement>({
    active: fileMenuOpen,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: fileTriggerRef,
    onEscape: () => setFileMenuOpen(false),
  });

  // Rarely used project actions share one menu so a beginner's top bar shows
  // only Learn, Save, and Export.
  const fileActions = [
    {
      label: "New",
      icon: FilePlus2,
      hint: "Start a new empty project",
      run: onNewProject,
    },
    {
      label: "Save As",
      icon: CopyPlus,
      hint: "Ctrl+Shift+S",
      run: onSaveAs,
    },
    {
      label: "Load",
      icon: FolderOpen,
      hint: "Saved projects",
      run: onOpenProjects,
    },
    {
      label: "Templates",
      icon: Library,
      hint: "Save and reuse effects",
      run: onOpenTemplates,
    },
    {
      label: "Import",
      icon: Upload,
      hint: ".vvfx file",
      run: null,
    },
  ];

  const runFileAction = (action: (() => void) | null) => {
    setFileMenuOpen(false);
    // The menu item is about to unmount; dialogs opened by the action must
    // return focus to something that still exists.
    fileTriggerRef.current?.focus({ preventScroll: true });
    // Import has no callback of its own: it opens the hidden file picker.
    if (action) action();
    else inputRef.current?.click();
  };
  const toggleFileMenu = () => {
    if (fileMenuOpen) {
      setFileMenuOpen(false);
      return;
    }
    setFileMenuIndex(0);
    setFileMenuOpen(true);
  };
  const moveFileMenuFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not([disabled])",
      ),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      currentIndex < 0
        ? event.key === "ArrowUp" || event.key === "End"
          ? items.length - 1
          : 0
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? (currentIndex - 1 + items.length) % items.length
              : (currentIndex + 1) % items.length;
    setFileMenuIndex(nextIndex);
    items[nextIndex]?.focus();
  };

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
          maxLength={MAX_VFX_NAME_LENGTH}
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
      <nav
        className="topbar-actions"
        aria-label="Project actions"
        onPointerEnter={onActionIntent}
        onFocus={onActionIntent}
      >
        <div className="topbar-file-menu">
          <button
            ref={fileTriggerRef}
            type="button"
            className="topbar-file-menu__trigger"
            aria-controls={FILE_MENU_ID}
            aria-expanded={fileMenuOpen}
            aria-haspopup="menu"
            title="New, Save As, Load, Templates, and Import"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              toggleFileMenu();
            }}
          >
            <FileIcon size={14} /> File <ChevronDown size={13} />
          </button>
          {fileMenuOpen && (
            <div
              ref={fileMenuRef}
              id={FILE_MENU_ID}
              className="topbar-actions__menu"
              role="menu"
              aria-label="File"
              tabIndex={-1}
              onKeyDown={moveFileMenuFocus}
            >
              {fileActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    tabIndex={fileMenuIndex === index ? 0 : -1}
                    onFocus={() => setFileMenuIndex(index)}
                    onClick={() => runFileAction(action.run)}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{action.label}</span>
                    <small aria-hidden="true">{action.hint}</small>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onLearn}
          title="Tours and beginner tutorials"
        >
          <BookOpen size={14} /> Learn
        </button>
        <button type="button" onClick={onSave} title="Save (Ctrl+S)">
          <Save size={14} /> Save
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
