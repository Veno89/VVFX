"use client";

import { X } from "lucide-react";
import type { VfxProject } from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

export const DEFINITION_DRAWER_ID = "vvfx-definition-drawer";

export function DefinitionDrawer({
  project,
  onClose,
}: {
  project: VfxProject;
  onClose: () => void;
}) {
  const drawerRef = useFocusRegion<HTMLElement>({
    onEscape: onClose,
    trapFocus: false,
  });

  return (
    <aside
      ref={drawerRef}
      id={DEFINITION_DRAWER_ID}
      className="json-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="definition-drawer-title"
    >
      <header>
        <div>
          <span className="eyebrow">Advanced view</span>
          <h2 id="definition-drawer-title">Live VFX definition</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close JSON definition"
        >
          <X size={16} />
        </button>
      </header>
      <p>
        This is the complete editor project. It updates as you change settings.
      </p>
      <pre>
        <code>{JSON.stringify(project, null, 2)}</code>
      </pre>
    </aside>
  );
}
