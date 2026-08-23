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
import { useEffect, useRef, useState } from "react";
import { LAYER_TYPE_LABELS } from "../guidance";
import { COMPOSITION_PRESETS, LAYER_PRESETS } from "../../vfx/presets";
import type { LayerType, VfxGroup, VfxLayer } from "../../vfx/types";

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editingId) return;
    const frame = window.requestAnimationFrame(() => editRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);
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
  return (
    <section className="panel layer-panel" aria-label="Effect layers">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Composition</span>
          <h2>Layers</h2>
        </div>
        <div className="menu-wrap">
          <button
            className="primary-small"
            type="button"
            onClick={() => setAddOpen((open) => !open)}
          >
            <Plus size={14} /> Add
          </button>
          {addOpen && (
            <div className="add-menu">
              <span className="menu-label">Start from scratch</span>
              {(["static", "animated", "burst", "emitter"] as LayerType[]).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
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
                          : type === "burst"
                            ? "Many appear at once"
                            : "Copies appear over time"}
                    </small>
                  </button>
                ),
              )}
              <span className="menu-label">Guided presets</span>
              {COMPOSITION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
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
              {LAYER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
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
              <span className="layer-more">
                <button
                  type="button"
                  title="Layer actions"
                  aria-label={`Actions for ${layer.name}`}
                >
                  <MoreHorizontal size={14} />
                </button>
                <span className="layer-more__menu">
                  <button type="button" onClick={() => startRename(layer)}>
                    <Pencil size={13} /> Rename
                  </button>
                  <button type="button" onClick={() => onDuplicate(layer.id)}>
                    <Copy size={13} /> Duplicate
                  </button>
                  <button type="button" onClick={() => onDelete(layer.id)}>
                    <Trash2 size={13} /> Delete
                  </button>
                </span>
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
