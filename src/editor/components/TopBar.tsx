"use client";

import {
  BookOpen,
  CopyPlus,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Library,
  MoreHorizontal,
  Redo2,
  Save,
  Undo2,
  Upload,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MAX_VFX_NAME_LENGTH } from "../../vfx/inputLimits";
import { useFocusRegion } from "../useFocusRegion";

const RESPONSIVE_ACTIONS_MENU_ID = "topbar-responsive-actions-menu";

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
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const responsiveActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreDesktopFocusRef = useRef(false);
  const [responsiveActionsOpen, setResponsiveActionsOpen] = useState(false);
  const [responsiveMenuIndex, setResponsiveMenuIndex] = useState(0);
  const responsiveActionsMenuRef = useFocusRegion<HTMLDivElement>({
    active: responsiveActionsOpen,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: responsiveActionsTriggerRef,
    onEscape: () => setResponsiveActionsOpen(false),
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const compactLayout = window.matchMedia("(max-width: 1119px)");
    const closeWhenDesktopReturns = () => {
      if (compactLayout.matches) return;
      const menu = responsiveActionsMenuRef.current;
      const focused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      restoreDesktopFocusRef.current =
        menu !== null &&
        focused !== null &&
        (menu.contains(focused) ||
          (responsiveActionsTriggerRef.current?.contains(focused) ?? false));
      setResponsiveActionsOpen(false);
    };
    compactLayout.addEventListener("change", closeWhenDesktopReturns);
    return () =>
      compactLayout.removeEventListener("change", closeWhenDesktopReturns);
  }, [responsiveActionsMenuRef]);

  useEffect(() => {
    if (responsiveActionsOpen || !restoreDesktopFocusRef.current) return;
    restoreDesktopFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const fallback = exportButtonRef.current ?? saveButtonRef.current;
      if (fallback?.isConnected) fallback.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [responsiveActionsOpen]);

  const runResponsiveAction = (action: () => void) => {
    setResponsiveActionsOpen(false);
    action();
  };
  const toggleResponsiveActions = () => {
    if (responsiveActionsOpen) {
      setResponsiveActionsOpen(false);
      return;
    }
    setResponsiveMenuIndex(0);
    setResponsiveActionsOpen(true);
  };
  const moveResponsiveMenuFocus = (event: KeyboardEvent<HTMLDivElement>) => {
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
    setResponsiveMenuIndex(nextIndex);
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
      <nav className="topbar-actions" aria-label="Project actions">
        <button
          className="topbar-action--overflow"
          type="button"
          onClick={onNewProject}
          title="Start a new empty project"
        >
          <FilePlus2 size={14} /> New
        </button>
        <button
          className="topbar-action--overflow"
          type="button"
          onClick={onLearn}
          title="Tours and beginner tutorials"
        >
          <BookOpen size={14} /> Learn
        </button>
        <button ref={saveButtonRef} type="button" onClick={onSave}>
          <Save size={14} /> Save
        </button>
        <button
          className="topbar-action--overflow"
          type="button"
          onClick={onSaveAs}
          title="Save a separate copy (Ctrl+Shift+S)"
        >
          <CopyPlus size={14} /> Save As
        </button>
        <button
          className="topbar-action--overflow"
          type="button"
          onClick={onOpenProjects}
        >
          <FolderOpen size={14} /> Load
        </button>
        <button
          className="topbar-action--overflow"
          type="button"
          onClick={onOpenTemplates}
          title="Save and reuse complete effects"
        >
          <Library size={14} /> Templates
        </button>
        <button
          className="topbar-action--overflow"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} /> Import
        </button>
        <button
          ref={exportButtonRef}
          className="export-button"
          type="button"
          onClick={onExport}
        >
          <Download size={14} /> Export <FileCode2 size={13} />
        </button>
        <div className="topbar-actions__more">
          <button
            ref={responsiveActionsTriggerRef}
            type="button"
            className="topbar-actions__more-trigger"
            aria-controls={RESPONSIVE_ACTIONS_MENU_ID}
            aria-expanded={responsiveActionsOpen}
            aria-haspopup="menu"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              toggleResponsiveActions();
            }}
          >
            <MoreHorizontal size={15} /> Actions
          </button>
          {responsiveActionsOpen && (
            <div
              ref={responsiveActionsMenuRef}
              id={RESPONSIVE_ACTIONS_MENU_ID}
              className="topbar-actions__menu"
              role="menu"
              aria-label="More project actions"
              tabIndex={-1}
              onKeyDown={moveResponsiveMenuFocus}
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={responsiveMenuIndex === 0 ? 0 : -1}
                onFocus={() => setResponsiveMenuIndex(0)}
                onClick={() => runResponsiveAction(onNewProject)}
              >
                <FilePlus2 size={14} /> New
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={responsiveMenuIndex === 1 ? 0 : -1}
                onFocus={() => setResponsiveMenuIndex(1)}
                onClick={() => runResponsiveAction(onLearn)}
              >
                <BookOpen size={14} /> Learn
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={responsiveMenuIndex === 2 ? 0 : -1}
                onFocus={() => setResponsiveMenuIndex(2)}
                onClick={() => runResponsiveAction(onSaveAs)}
              >
                <CopyPlus size={14} /> Save As
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={responsiveMenuIndex === 3 ? 0 : -1}
                onFocus={() => setResponsiveMenuIndex(3)}
                onClick={() => runResponsiveAction(onOpenProjects)}
              >
                <FolderOpen size={14} /> Load
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={responsiveMenuIndex === 4 ? 0 : -1}
                onFocus={() => setResponsiveMenuIndex(4)}
                onClick={() => runResponsiveAction(onOpenTemplates)}
              >
                <Library size={14} /> Templates
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={responsiveMenuIndex === 5 ? 0 : -1}
                onFocus={() => setResponsiveMenuIndex(5)}
                onClick={() =>
                  runResponsiveAction(() => inputRef.current?.click())
                }
              >
                <Upload size={14} /> Import
              </button>
            </div>
          )}
        </div>
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
