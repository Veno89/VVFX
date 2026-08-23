"use client";

import { Boxes, Clock3, Move, Trash2 } from "lucide-react";
import type { VfxGroup, VfxLayer } from "../../vfx/types";
import { RangeField, SettingsSection } from "./Controls";

export function GroupInspector({
  group,
  layers,
  onChange,
  onLayerGroupChange,
  onDelete,
}: {
  group: VfxGroup;
  layers: VfxLayer[];
  onChange: (group: VfxGroup) => void;
  onLayerGroupChange: (layerId: string, groupId: string | null) => void;
  onDelete: () => void;
}) {
  const memberCount = layers.filter(
    (layer) => layer.groupId === group.id,
  ).length;
  return (
    <aside
      className="panel inspector"
      aria-label={`Settings for ${group.name}`}
    >
      <div className="inspector-header group-inspector-header">
        <div>
          <span className="eyebrow">Selected effect group</span>
          <input
            className="layer-name-input"
            value={group.name}
            aria-label="Group name"
            onChange={(event) =>
              onChange({ ...group, name: event.target.value })
            }
          />
        </div>
        <button
          type="button"
          className="group-delete-button"
          onClick={onDelete}
          title="Delete group and keep its layers"
          aria-label={`Delete ${group.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="inspector-scroll">
        <p className="group-explainer">
          Shared offsets move or delay all members without changing their own
          layer settings. Deleting this group keeps every layer.
        </p>
        <SettingsSection
          title="Shared position"
          icon={<Move size={15} />}
          defaultOpen
        >
          <div className="field-grid">
            <RangeField
              label="Group position X"
              value={group.x}
              defaultValue={0}
              min={-800}
              max={800}
              unit="px"
              help="Moves every member left or right together."
              onChange={(x) => onChange({ ...group, x })}
            />
            <RangeField
              label="Group position Y"
              value={group.y}
              defaultValue={0}
              min={-500}
              max={500}
              unit="px"
              help="Moves every member up or down together."
              onChange={(y) => onChange({ ...group, y })}
            />
          </div>
        </SettingsSection>
        <SettingsSection
          title="Shared timing"
          icon={<Clock3 size={15} />}
          defaultOpen
        >
          <RangeField
            label="Group start offset"
            value={group.delay}
            defaultValue={0}
            min={0}
            max={30_000}
            step={10}
            unit="ms"
            help="Delays every member by the same amount. You can also drag the group bar on the timeline."
            onChange={(delay) => onChange({ ...group, delay })}
          />
        </SettingsSection>
        <SettingsSection
          title={`Members (${memberCount})`}
          icon={<Boxes size={15} />}
          defaultOpen
        >
          <p className="section-note">
            Check the layers that should share this group. Selecting a layer
            already used by another group moves it here.
          </p>
          <div className="group-member-list">
            {layers.length === 0 ? (
              <p>No layers are available yet.</p>
            ) : (
              layers.map((layer) => (
                <label
                  key={layer.id}
                  aria-label={`${layer.name} group membership`}
                >
                  <input
                    type="checkbox"
                    checked={layer.groupId === group.id}
                    onChange={(event) =>
                      onLayerGroupChange(
                        layer.id,
                        event.target.checked ? group.id : null,
                      )
                    }
                  />
                  <span>
                    <strong>{layer.name}</strong>
                    <small>{layer.type}</small>
                  </span>
                </label>
              ))
            )}
          </div>
        </SettingsSection>
      </div>
    </aside>
  );
}
