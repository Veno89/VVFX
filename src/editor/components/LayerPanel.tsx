"use client";

import {
  Boxes,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers3,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LAYER_TYPE_LABELS } from "../guidance";
import { useFocusRegion } from "../useFocusRegion";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../../vfx/presets";
import { MAX_VFX_NAME_LENGTH } from "../../vfx/inputLimits";
import type { LayerType, VfxGroup, VfxLayer } from "../../vfx/types";

const SCRATCH_LAYER_TYPES: LayerType[] = [
  "static",
  "animated",
  "beam",
  "burst",
  "emitter",
];

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
  onDuplicate,
  onDelete,
  onReorder,
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
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [addMenuIndex, setAddMenuIndex] = useState(0);
  const [actionsMenuIndex, setActionsMenuIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const layerNameRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteFocusFrameRef = useRef<number | null>(null);
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
  const startRename = (layer: VfxLayer) => {
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
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
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
    setMenuIndex(nextIndex);
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
      <div className="layer-list">
        {layers.length === 0 && (
          <div className="empty-state">
            <Layers3 size={24} />
            <strong>Your effect has no layers</strong>
            <p>Add a preset or use an image from the library.</p>
          </div>
        )}
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`layer-row ${selectedId === layer.id ? "is-selected" : ""} ${!layer.enabled ? "is-disabled" : ""}`}
            draggable={editingId !== layer.id}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index)
                onReorder(dragIndex, index);
              setDragIndex(null);
            }}
          >
            <span className="drag-handle" aria-hidden="true">
              <GripVertical size={14} />
            </span>
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
                    if (element) layerNameRefs.current.set(layer.id, element);
                    else layerNameRefs.current.delete(layer.id);
                  }}
                  className="layer-name-button"
                  type="button"
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
                className={layer.solo ? "is-active" : ""}
                onClick={() =>
                  onUpdate(layer.id, { solo: !layer.solo } as Partial<VfxLayer>)
                }
                title="Solo this layer"
                aria-label={`Solo ${layer.name}`}
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
                    actionsOpenId === layer.id ? actionsTriggerRef : undefined
                  }
                  type="button"
                  title="Layer actions"
                  aria-label={`Actions for ${layer.name}`}
                  aria-controls={`layer-actions-menu-${index}`}
                  aria-expanded={actionsOpenId === layer.id}
                  aria-haspopup="menu"
                  onClick={() => {
                    setAddOpen(false);
                    if (actionsOpenId === layer.id) setActionsOpenId(null);
                    else {
                      setActionsMenuIndex(0);
                      setActionsOpenId(layer.id);
                    }
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
                {actionsOpenId === layer.id && (
                  <span
                    ref={actionsMenuRef}
                    id={`layer-actions-menu-${index}`}
                    className="layer-more__menu"
                    role="menu"
                    tabIndex={-1}
                    aria-label={`Actions for ${layer.name}`}
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
                      onClick={() => {
                        setActionsOpenId(null);
                        onDelete(layer.id);
                        restoreFocusAfterDelete(index);
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </span>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="panel-footnote">
        Drag to reorder · double-click a layer name to rename it.
      </p>
    </section>
  );
}
