"use client";

import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  GripVertical,
  Layers3,
  ListChecks,
  Lock,
  LockOpen,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { LAYER_TYPE_LABELS } from "../guidance";
import { useFocusRegion } from "../useFocusRegion";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../../vfx/presets";
import { MAX_VFX_NAME_LENGTH } from "../../vfx/inputLimits";
import type { LayerType, VfxGroup, VfxLayer } from "../../vfx/types";
import type { LayerWorkspaceFolder } from "../workspace";

const SCRATCH_LAYER_TYPES: LayerType[] = [
  "static",
  "animated",
  "beam",
  "burst",
  "emitter",
];

const CONVERSION_LAYER_TYPES: LayerType[] = [
  "beam",
  "animated",
  "static",
  "burst",
  "emitter",
];

export interface BulkLayerConversionResult {
  converted: number;
  skipped: number;
}

export function LayerPanel({
  layers,
  groups,
  selectedId,
  selectedGroupId,
  onSelect,
  onSelectGroup,
  onCreateGroup,
  onAdd,
  onAddPreset,
  onUpdate,
  onConvert,
  onBulkConvert,
  onDuplicate,
  onDelete,
  onReorder,
  search = "",
  onSearchChange,
  lockedLayerIds = [],
  folders = [],
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveToFolder,
  onToggleLock,
}: {
  layers: VfxLayer[];
  groups: VfxGroup[];
  selectedId: string | null;
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onCreateGroup: () => void;
  onAdd: (type: LayerType) => void;
  onAddPreset: (presetId: string) => void;
  onUpdate: (id: string, patch: Partial<VfxLayer>) => void;
  onConvert?: (id: string, type: LayerType) => void;
  onBulkConvert?: (ids: string[], type: LayerType) => BulkLayerConversionResult;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
  lockedLayerIds?: string[];
  folders?: LayerWorkspaceFolder[];
  onCreateFolder?: () => void;
  onUpdateFolder?: (
    id: string,
    patch: Partial<Pick<LayerWorkspaceFolder, "name" | "collapsed">>,
  ) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveToFolder?: (layerId: string, folderId: string | null) => void;
  onToggleLock?: (layerId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [addMenuIndex, setAddMenuIndex] = useState(0);
  const [actionsMenuIndex, setActionsMenuIndex] = useState(0);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [actionAnnouncement, setActionAnnouncement] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [dragModelIndex, setDragModelIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const layerNameRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteFocusFrameRef = useRef<number | null>(null);
  const lockedIds = new Set(lockedLayerIds);
  const selectableLayerIds = layers
    .filter((layer) => !lockedIds.has(layer.id))
    .map((layer) => layer.id);
  const selectableIds = new Set(selectableLayerIds);
  const selectedBulkLayerIds = bulkSelectedIds.filter((id) =>
    selectableIds.has(id),
  );
  const selectedBulkIds = new Set(selectedBulkLayerIds);
  const folderByLayerId = new Map<string, LayerWorkspaceFolder>();
  for (const folder of folders)
    for (const layerId of folder.layerIds)
      if (!folderByLayerId.has(layerId)) folderByLayerId.set(layerId, folder);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchesSearch = (layer: VfxLayer) => {
    if (!normalizedSearch) return true;
    const folderName = folderByLayerId.get(layer.id)?.name ?? "";
    return `${layer.name} ${layer.type} ${folderName}`
      .toLocaleLowerCase()
      .includes(normalizedSearch);
  };
  const displayedLayerEntries = layers
    .map((layer, modelIndex) => ({ layer, modelIndex }))
    .filter(({ layer }) => matchesSearch(layer))
    .reverse();
  const displayedLayers = displayedLayerEntries.map(({ layer }) => layer);
  const firstDisplayedLayerByFolder = new Map<string, string>();
  for (const layer of displayedLayers) {
    const folder = folderByLayerId.get(layer.id);
    if (folder && !firstDisplayedLayerByFolder.has(folder.id))
      firstDisplayedLayerByFolder.set(folder.id, layer.id);
  }
  const addMenuRef = useFocusRegion<HTMLDivElement>({
    active: addOpen,
    trapFocus: false,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: addTriggerRef,
    onEscape: () => setAddOpen(false),
  });
  const actionsMenuRef = useFocusRegion<HTMLSpanElement>({
    active: actionsOpenId !== null,
    activationKey: actionsOpenId,
    trapFocus: false,
    // The portaled menu stays visibility:hidden until its fixed position is
    // measured. Real browsers reject focus inside that hidden subtree, so let
    // the focus region autofocus only after positioning makes it visible.
    autoFocus: actionsMenuPosition !== null,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: actionsTriggerRef,
    onEscape: () => setActionsOpenId(null),
  });
  useEffect(() => {
    if (!editingId) return;
    const frame = window.requestAnimationFrame(() => editRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);
  useEffect(
    () => () => {
      if (deleteFocusFrameRef.current !== null)
        window.cancelAnimationFrame(deleteFocusFrameRef.current);
    },
    [],
  );
  useLayoutEffect(() => {
    if (!actionsOpenId) return;
    const positionMenu = () => {
      const trigger = actionsTriggerRef.current;
      const menu = actionsMenuRef.current;
      if (!trigger || !menu) return;
      const triggerBox = trigger.getBoundingClientRect();
      const menuBox = menu.getBoundingClientRect();
      const viewportMargin = 8;
      const gap = 4;
      const width = menuBox.width || 190;
      const height = menuBox.height || 180;
      const left = Math.min(
        window.innerWidth - viewportMargin - width,
        Math.max(viewportMargin, triggerBox.right - width),
      );
      const below = triggerBox.bottom + gap;
      const above = triggerBox.top - gap - height;
      const top =
        below + height <= window.innerHeight - viewportMargin
          ? below
          : Math.max(viewportMargin, above);
      setActionsMenuPosition({ left, top });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", positionMenu, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(positionMenu);
    if (actionsMenuRef.current) observer?.observe(actionsMenuRef.current);
    return () => {
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", positionMenu, true);
      observer?.disconnect();
    };
  }, [actionsMenuRef, actionsOpenId]);
  const startRename = (layer: VfxLayer) => {
    if (lockedIds.has(layer.id)) return;
    setEditingId(layer.id);
    setEditValue(layer.name);
    onSelect(layer.id);
  };
  const finishRename = (layer: VfxLayer) => {
    const name = editValue.trim();
    if (name && name !== layer.name)
      onUpdate(layer.id, { name } as Partial<VfxLayer>);
    setEditingId(null);
  };
  const restoreFocusAfterDelete = (layerIndex: number) => {
    const fallbackLayerIds = [
      layers[layerIndex + 1]?.id,
      layers[layerIndex - 1]?.id,
    ].filter((id): id is string => Boolean(id));
    if (deleteFocusFrameRef.current !== null)
      window.cancelAnimationFrame(deleteFocusFrameRef.current);
    deleteFocusFrameRef.current = window.requestAnimationFrame(() => {
      deleteFocusFrameRef.current = null;
      const fallbackLayer = fallbackLayerIds
        .map((id) => layerNameRefs.current.get(id))
        .find((candidate) => candidate?.isConnected);
      const fallback =
        fallbackLayer?.isConnected === true
          ? fallbackLayer
          : addTriggerRef.current;
      if (fallback?.isConnected) fallback.focus({ preventScroll: true });
    });
  };
  const moveMenuFocus = (
    event: KeyboardEvent<HTMLElement>,
    setMenuIndex: (index: number) => void,
  ) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;
    const allItems = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
    );
    const items = allItems.filter(
      (item) => !(item instanceof HTMLButtonElement && item.disabled),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
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
    setMenuIndex(allItems.indexOf(items[nextIndex]));
    items[nextIndex]?.focus();
  };
  return (
    <section className="panel layer-panel" aria-label="Effect layers">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Composition</span>
          <h2>Layers</h2>
        </div>
        <div className="menu-wrap">
          <button
            ref={addTriggerRef}
            className="primary-small"
            type="button"
            onClick={() => {
              setActionsOpenId(null);
              if (addOpen) setAddOpen(false);
              else {
                setAddMenuIndex(0);
                setAddOpen(true);
              }
            }}
            aria-controls="layer-add-menu"
            aria-expanded={addOpen}
            aria-haspopup="menu"
          >
            <Plus size={14} /> Add
          </button>
          {addOpen && (
            <div
              ref={addMenuRef}
              id="layer-add-menu"
              className="add-menu"
              role="menu"
              tabIndex={-1}
              aria-label="Add layer"
              onKeyDown={(event) => moveMenuFocus(event, setAddMenuIndex)}
            >
              <span className="menu-label">Start from scratch</span>
              {SCRATCH_LAYER_TYPES.map((type, menuIndex) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  tabIndex={addMenuIndex === menuIndex ? 0 : -1}
                  onFocus={() => setAddMenuIndex(menuIndex)}
                  onClick={() => {
                    onAdd(type);
                    setAddOpen(false);
                  }}
                >
                  <strong>{LAYER_TYPE_LABELS[type]}</strong>
                  <small>
                    {type === "static"
                      ? "Stays in place"
                      : type === "animated"
                        ? "One image changes"
                        : type === "beam"
                          ? "Fits between two endpoints"
                          : type === "burst"
                            ? "Many appear at once"
                            : "Copies appear over time"}
                  </small>
                </button>
              ))}
              <span className="menu-label">Guided presets</span>
              {COMPOSITION_PRESETS.map((preset, presetIndex) => (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitem"
                  tabIndex={
                    addMenuIndex === SCRATCH_LAYER_TYPES.length + presetIndex
                      ? 0
                      : -1
                  }
                  onFocus={() =>
                    setAddMenuIndex(SCRATCH_LAYER_TYPES.length + presetIndex)
                  }
                  onClick={() => {
                    onAddPreset(preset.id);
                    setAddOpen(false);
                  }}
                >
                  <strong>{preset.name} · complete effect</strong>
                  <small>{preset.description}</small>
                  <small>Ingredients: {preset.ingredients.join(" + ")}</small>
                </button>
              ))}
              {LAYER_PRESETS.map((preset, presetIndex) => (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitem"
                  tabIndex={
                    addMenuIndex ===
                    SCRATCH_LAYER_TYPES.length +
                      COMPOSITION_PRESETS.length +
                      presetIndex
                      ? 0
                      : -1
                  }
                  onFocus={() =>
                    setAddMenuIndex(
                      SCRATCH_LAYER_TYPES.length +
                        COMPOSITION_PRESETS.length +
                        presetIndex,
                    )
                  }
                  onClick={() => {
                    onAddPreset(preset.id);
                    setAddOpen(false);
                  }}
                >
                  <strong>
                    {preset.name}
                    {preset.maturity === "experimental" && (
                      <span className="preset-maturity">Experimental</span>
                    )}
                  </strong>
                  <small>{preset.description}</small>
                  <small>Good for: {preset.goodFor}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="layer-organizer-toolbar">
        <label>
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            value={search}
            maxLength={MAX_VFX_NAME_LENGTH}
            placeholder="Find layers"
            aria-label="Search layers"
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!onCreateFolder}
          onClick={onCreateFolder}
          title="Create an organization folder"
        >
          <FolderPlus size={13} /> Folder
        </button>
        {onBulkConvert && (layers.length > 0 || bulkMode) && (
          <button
            type="button"
            className={bulkMode ? "is-active" : ""}
            aria-label={bulkMode ? "Exit layer selection" : "Select layers"}
            aria-pressed={bulkMode}
            onClick={() => {
              setAddOpen(false);
              setActionsOpenId(null);
              setBulkMode((current) => {
                if (current) setBulkSelectedIds([]);
                return !current;
              });
            }}
          >
            <ListChecks size={13} /> {bulkMode ? "Done" : "Select"}
          </button>
        )}
      </div>
      <div className="group-list-block">
        <div className="group-list-heading">
          <span>
            <Boxes size={13} /> Effect groups
          </span>
          <button type="button" onClick={onCreateGroup}>
            <Plus size={12} /> Group
          </button>
        </div>
        {groups.length === 0 ? (
          <p>Group related layers to move or delay them together.</p>
        ) : (
          <div className="group-list">
            {groups.map((group) => {
              const members = layers.filter(
                (layer) => layer.groupId === group.id,
              ).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  className={selectedGroupId === group.id ? "is-selected" : ""}
                  onClick={() => onSelectGroup(group.id)}
                >
                  <Boxes size={13} />
                  <span>
                    <strong>{group.name}</strong>
                    <small>
                      {members} layer{members === 1 ? "" : "s"} · +{group.delay}
                      ms
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {bulkMode && onBulkConvert && (
        <div className="layer-bulk-bar" role="group" aria-label="Bulk layers">
          <div className="layer-bulk-bar__summary">
            <strong>{selectedBulkLayerIds.length} selected</strong>
            <span>
              <button
                type="button"
                onClick={() => setBulkSelectedIds(selectableLayerIds)}
                disabled={
                  selectableLayerIds.length === 0 ||
                  selectedBulkLayerIds.length === selectableLayerIds.length
                }
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setBulkSelectedIds([])}
                disabled={selectedBulkLayerIds.length === 0}
              >
                Clear
              </button>
            </span>
          </div>
          <label>
            <span>Change type</span>
            <select
              aria-label="Change type for selected layers"
              value=""
              disabled={selectedBulkLayerIds.length === 0}
              onChange={(event) => {
                const type = event.target.value as LayerType | "";
                if (!type) return;
                const result = onBulkConvert(selectedBulkLayerIds, type);
                setActionAnnouncement(
                  `${result.converted} layer${result.converted === 1 ? "" : "s"} converted to ${LAYER_TYPE_LABELS[type]}. ${result.skipped} skipped. Undo restores the batch.`,
                );
              }}
            >
              <option value="">Choose a target type...</option>
              {CONVERSION_LAYER_TYPES.map((type) => (
                <option key={type} value={type}>
                  Convert selected to {LAYER_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <small>Locked layers stay unchanged and cannot be selected.</small>
        </div>
      )}
      <div className="layer-list">
        {layers.length === 0 && (
          <div className="empty-state">
            <Layers3 size={24} />
            <strong>Your effect has no layers</strong>
            <p>Add a preset or use an image from the library.</p>
          </div>
        )}
        {layers.length > 0 && displayedLayers.length === 0 && (
          <div className="empty-state empty-state--compact">
            <Search size={20} />
            <strong>No matching layers</strong>
            <p>Try a name, type, or folder.</p>
          </div>
        )}
        {folders
          .filter((folder) => folder.layerIds.length === 0)
          .map((folder) => (
            <div className="layer-folder-heading" key={folder.id}>
              <Folder size={12} />
              <input
                aria-label={`Rename folder ${folder.name}`}
                value={folder.name}
                maxLength={MAX_VFX_NAME_LENGTH}
                onChange={(event) =>
                  onUpdateFolder?.(folder.id, { name: event.target.value })
                }
              />
              <small>Empty</small>
              <button
                type="button"
                aria-label={`Delete folder ${folder.name}`}
                onClick={() => onDeleteFolder?.(folder.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        {displayedLayerEntries.map(({ layer, modelIndex }) => {
          const folder = folderByLayerId.get(layer.id);
          const firstInFolder =
            folder && firstDisplayedLayerByFolder.get(folder.id) === layer.id;
          const hiddenByFolder =
            folder?.collapsed === true && normalizedSearch.length === 0;
          const locked = lockedIds.has(layer.id);
          const conversionTypes = onConvert
            ? CONVERSION_LAYER_TYPES.filter((type) => type !== layer.type)
            : [];
          const deleteMenuIndex = 6;
          return (
            <Fragment key={layer.id}>
              {firstInFolder && folder && (
                <div className="layer-folder-heading">
                  <button
                    type="button"
                    aria-label={`${folder.collapsed ? "Expand" : "Collapse"} ${folder.name}`}
                    onClick={() =>
                      onUpdateFolder?.(folder.id, {
                        collapsed: !folder.collapsed,
                      })
                    }
                  >
                    {folder.collapsed ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                  </button>
                  <Folder size={12} />
                  <input
                    aria-label={`Rename folder ${folder.name}`}
                    value={folder.name}
                    maxLength={MAX_VFX_NAME_LENGTH}
                    onChange={(event) =>
                      onUpdateFolder?.(folder.id, {
                        name: event.target.value,
                      })
                    }
                  />
                  <small>
                    {folder.layerIds.length} layer
                    {folder.layerIds.length === 1 ? "" : "s"}
                  </small>
                  <button
                    type="button"
                    aria-label={`Delete folder ${folder.name}`}
                    onClick={() => onDeleteFolder?.(folder.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
              {!hiddenByFolder && (
                <div
                  className={`layer-row ${selectedId === layer.id ? "is-selected" : ""} ${selectedBulkIds.has(layer.id) ? "is-bulk-selected" : ""} ${!layer.enabled ? "is-disabled" : ""} ${locked ? "is-locked" : ""}`}
                  draggable={!bulkMode && !locked && editingId !== layer.id}
                  onDragStart={() => setDragModelIndex(modelIndex)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (
                      dragModelIndex !== null &&
                      dragModelIndex !== modelIndex
                    )
                      onReorder(dragModelIndex, modelIndex);
                    setDragModelIndex(null);
                  }}
                  onDragEnd={() => setDragModelIndex(null)}
                >
                  {bulkMode ? (
                    <label
                      className="layer-bulk-check"
                      title={locked ? "Locked layers cannot be selected" : ""}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${layer.name} for bulk changes`}
                        checked={selectedBulkIds.has(layer.id)}
                        disabled={locked}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setBulkSelectedIds((current) =>
                            checked
                              ? current.includes(layer.id)
                                ? current
                                : [...current, layer.id]
                              : current.filter((id) => id !== layer.id),
                          );
                        }}
                      />
                    </label>
                  ) : (
                    <span className="drag-handle" aria-hidden="true">
                      {locked ? <Lock size={12} /> : <GripVertical size={14} />}
                    </span>
                  )}
                  <div
                    className="layer-main"
                    onDoubleClick={() => startRename(layer)}
                  >
                    <span
                      className={`layer-type-dot layer-type-dot--${layer.type}`}
                    />
                    {editingId === layer.id ? (
                      <input
                        ref={editRef}
                        className="layer-name-edit"
                        value={editValue}
                        aria-label={`Rename ${layer.name}`}
                        maxLength={MAX_VFX_NAME_LENGTH}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setEditValue(event.target.value)}
                        onBlur={() => finishRename(layer)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") finishRename(layer);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <button
                        ref={(element) => {
                          if (element)
                            layerNameRefs.current.set(layer.id, element);
                          else layerNameRefs.current.delete(layer.id);
                        }}
                        className="layer-name-button"
                        type="button"
                        aria-pressed={selectedId === layer.id}
                        onClick={() => onSelect(layer.id)}
                        title="Select layer · double-click to rename"
                      >
                        <strong>{layer.name}</strong>
                        <small>
                          {LAYER_TYPE_LABELS[layer.type]}
                          {layer.groupId
                            ? ` · ${groups.find((group) => group.id === layer.groupId)?.name ?? "Group"}`
                            : ""}
                        </small>
                      </button>
                    )}
                  </div>
                  <span className="layer-actions">
                    <button
                      type="button"
                      className={locked ? "is-active" : ""}
                      onClick={() => {
                        if (!locked)
                          setBulkSelectedIds((current) =>
                            current.filter((id) => id !== layer.id),
                          );
                        onToggleLock?.(layer.id);
                      }}
                      title={
                        locked ? "Unlock layer editing" : "Lock layer editing"
                      }
                      aria-label={`${locked ? "Unlock" : "Lock"} ${layer.name}`}
                      aria-pressed={locked}
                    >
                      {locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                    <button
                      type="button"
                      className={layer.solo ? "is-active" : ""}
                      onClick={() =>
                        onUpdate(layer.id, {
                          solo: !layer.solo,
                        } as Partial<VfxLayer>)
                      }
                      title="Solo this layer"
                      aria-label={`Solo ${layer.name}`}
                      aria-pressed={layer.solo}
                    >
                      <span className="solo-letter">S</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(layer.id, {
                          visible: !layer.visible,
                        } as Partial<VfxLayer>)
                      }
                      title={layer.visible ? "Hide layer" : "Show layer"}
                      aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                    >
                      {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(layer.id, {
                          enabled: !layer.enabled,
                        } as Partial<VfxLayer>)
                      }
                      title={layer.enabled ? "Disable layer" : "Enable layer"}
                      aria-label={`${layer.enabled ? "Disable" : "Enable"} ${layer.name}`}
                    >
                      <PauseCircle size={14} />
                    </button>
                    <span
                      className={`layer-more ${actionsOpenId === layer.id ? "is-open" : ""}`}
                    >
                      <button
                        ref={
                          actionsOpenId === layer.id
                            ? actionsTriggerRef
                            : undefined
                        }
                        type="button"
                        title="Layer actions"
                        aria-label={`Actions for ${layer.name}`}
                        aria-controls={`layer-actions-menu-${modelIndex}`}
                        aria-expanded={actionsOpenId === layer.id}
                        aria-haspopup="menu"
                        onClick={() => {
                          setAddOpen(false);
                          if (actionsOpenId === layer.id)
                            setActionsOpenId(null);
                          else {
                            setActionsMenuPosition(null);
                            setActionsMenuIndex(locked ? 1 : 0);
                            setActionsOpenId(layer.id);
                          }
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {actionsOpenId === layer.id &&
                        typeof document !== "undefined" &&
                        createPortal(
                          <span
                            ref={actionsMenuRef}
                            id={`layer-actions-menu-${modelIndex}`}
                            className="layer-more__menu layer-more__menu--floating"
                            role="menu"
                            tabIndex={-1}
                            aria-label={`Actions for ${layer.name}`}
                            style={{
                              left: actionsMenuPosition?.left ?? 0,
                              top: actionsMenuPosition?.top ?? 0,
                              visibility: actionsMenuPosition
                                ? "visible"
                                : "hidden",
                            }}
                            onKeyDown={(event) =>
                              moveMenuFocus(event, setActionsMenuIndex)
                            }
                          >
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={actionsMenuIndex === 0 ? 0 : -1}
                              onFocus={() => setActionsMenuIndex(0)}
                              onClick={() => {
                                setActionsOpenId(null);
                                startRename(layer);
                              }}
                              disabled={locked}
                            >
                              <Pencil size={13} /> Rename
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={actionsMenuIndex === 1 ? 0 : -1}
                              onFocus={() => setActionsMenuIndex(1)}
                              onClick={() => {
                                setActionsOpenId(null);
                                onDuplicate(layer.id);
                              }}
                            >
                              <Copy size={13} /> Duplicate
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={actionsMenuIndex === 2 ? 0 : -1}
                              onFocus={() => setActionsMenuIndex(2)}
                              aria-label={`Bring ${layer.name} forward, currently position ${layers.length - modelIndex} of ${layers.length}`}
                              onClick={() => {
                                setActionsOpenId(null);
                                onReorder(modelIndex, modelIndex + 1);
                                setActionAnnouncement(
                                  `${layer.name} moved forward to position ${layers.length - modelIndex - 1} of ${layers.length}.`,
                                );
                              }}
                              disabled={
                                locked || modelIndex === layers.length - 1
                              }
                            >
                              <ArrowUp size={13} /> Bring forward
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={actionsMenuIndex === 3 ? 0 : -1}
                              onFocus={() => setActionsMenuIndex(3)}
                              aria-label={`Send ${layer.name} backward, currently position ${layers.length - modelIndex} of ${layers.length}`}
                              onClick={() => {
                                setActionsOpenId(null);
                                onReorder(modelIndex, modelIndex - 1);
                                setActionAnnouncement(
                                  `${layer.name} moved backward to position ${layers.length - modelIndex + 1} of ${layers.length}.`,
                                );
                              }}
                              disabled={locked || modelIndex === 0}
                            >
                              <ArrowDown size={13} /> Send backward
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={actionsMenuIndex === 4 ? 0 : -1}
                              onFocus={() => setActionsMenuIndex(4)}
                              aria-label={`Bring ${layer.name} to front, currently position ${layers.length - modelIndex} of ${layers.length}`}
                              onClick={() => {
                                setActionsOpenId(null);
                                onReorder(modelIndex, layers.length - 1);
                                setActionAnnouncement(
                                  `${layer.name} brought to front and is now frontmost, position 1 of ${layers.length}.`,
                                );
                              }}
                              disabled={
                                locked || modelIndex === layers.length - 1
                              }
                            >
                              <ChevronsUp size={13} /> Bring to front
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={actionsMenuIndex === 5 ? 0 : -1}
                              onFocus={() => setActionsMenuIndex(5)}
                              aria-label={`Send ${layer.name} to back, currently position ${layers.length - modelIndex} of ${layers.length}`}
                              onClick={() => {
                                setActionsOpenId(null);
                                onReorder(modelIndex, 0);
                                setActionAnnouncement(
                                  `${layer.name} sent to back and is now backmost, position ${layers.length} of ${layers.length}.`,
                                );
                              }}
                              disabled={locked || modelIndex === 0}
                            >
                              <ChevronsDown size={13} /> Send to back
                            </button>
                            {conversionTypes.length > 0 && (
                              <span className="layer-type-picker" role="none">
                                <span>
                                  <RefreshCw size={12} />
                                  <strong>Change type</strong>
                                </span>
                                <select
                                  aria-label={`Change type for ${layer.name}`}
                                  value={layer.type}
                                  disabled={locked}
                                  onChange={(event) => {
                                    const type = event.target
                                      .value as LayerType;
                                    if (type === layer.type) return;
                                    setActionsOpenId(null);
                                    onConvert?.(layer.id, type);
                                    setActionAnnouncement(
                                      `${layer.name} converted to ${LAYER_TYPE_LABELS[type]}. Compatible settings were kept. Undo restores the previous type.`,
                                    );
                                  }}
                                >
                                  <option value={layer.type}>
                                    {LAYER_TYPE_LABELS[layer.type]} (current)
                                  </option>
                                  {conversionTypes.map((type) => (
                                    <option key={type} value={type}>
                                      Convert to {LAYER_TYPE_LABELS[type]}
                                    </option>
                                  ))}
                                </select>
                                <small>
                                  Keeps compatible settings. Beam endpoints
                                  replace path, angle, movement, and X/Y scale.
                                  Undo restores the original.
                                </small>
                              </span>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={
                                actionsMenuIndex === deleteMenuIndex ? 0 : -1
                              }
                              onFocus={() =>
                                setActionsMenuIndex(deleteMenuIndex)
                              }
                              onClick={() => {
                                setActionsOpenId(null);
                                onDelete(layer.id);
                                restoreFocusAfterDelete(modelIndex);
                              }}
                              disabled={locked}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                            <span className="layer-folder-picker" role="none">
                              <Folder size={12} />
                              <select
                                aria-label={`Move ${layer.name} to folder`}
                                value={folder?.id ?? ""}
                                onChange={(event) =>
                                  onMoveToFolder?.(
                                    layer.id,
                                    event.target.value || null,
                                  )
                                }
                              >
                                <option value="">No folder</option>
                                {folders.map((candidate) => (
                                  <option
                                    key={candidate.id}
                                    value={candidate.id}
                                  >
                                    {candidate.name}
                                  </option>
                                ))}
                              </select>
                            </span>
                          </span>,
                          document.body,
                        )}
                    </span>
                  </span>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      <span
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {actionAnnouncement}
      </span>
      <p className="panel-footnote">
        Top layers render in front · drag or use layer Actions to reorder ·
        folders and locks stay in this browser workspace.
      </p>
    </section>
  );
}
