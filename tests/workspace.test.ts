import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  loadWorkspacePreferences,
  normalizeWorkspacePreferences,
  saveWorkspacePreferences,
  updateWorkspaceProjectView,
  workspaceProjectView,
} from "../src/editor/workspace";

describe("professional workspace preferences", () => {
  it("bounds panel geometry and repairs project organization", () => {
    const workspace = normalizeWorkspacePreferences({
      leftWidth: -100,
      inspectorWidth: 50_000,
      timelineHeight: Number.POSITIVE_INFINITY,
      assetSplit: 99,
      projectOrder: ["project-a", "__proto__"],
      projects: {
        "project-a": {
          timelineZoom: 10,
          workStart: 900,
          workEnd: 200,
          layerSearch: "x".repeat(500),
          lockedLayerIds: ["layer-a", "missing", "layer-a"],
          folders: [
            {
              id: "folder-a",
              name: "Energy",
              layerIds: ["layer-a", "missing"],
              collapsed: true,
            },
            {
              id: "folder-b",
              name: "Glow",
              layerIds: ["layer-a", "layer-b"],
            },
          ],
        },
      },
    });
    const view = workspaceProjectView(
      workspace,
      "project-a",
      ["layer-a", "layer-b"],
      1_000,
    );

    expect(workspace).toMatchObject({
      leftWidth: 210,
      inspectorWidth: 540,
      timelineHeight: 250,
      assetSplit: 70,
    });
    expect(view).toMatchObject({
      timelineZoom: 4,
      workStart: 900,
      workEnd: null,
      lockedLayerIds: ["layer-a"],
    });
    expect(view.folders.map((folder) => folder.layerIds)).toEqual([
      ["layer-a"],
      ["layer-b"],
    ]);
  });

  it("stores a bounded recent project view without mutating the source", () => {
    const next = updateWorkspaceProjectView(
      DEFAULT_WORKSPACE_PREFERENCES,
      "project-a",
      {
        timelineZoom: 2,
        workStart: 100,
        workEnd: 800,
        layerSearch: "spark",
        lockedLayerIds: ["layer-a"],
        folders: [],
      },
    );
    expect(next.projects["project-a"].timelineZoom).toBe(2);
    expect(DEFAULT_WORKSPACE_PREFERENCES.projectOrder).toEqual([]);
  });

  it("fails closed when browser storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadWorkspacePreferences(storage)).toMatchObject({ version: 1 });
    expect(
      saveWorkspacePreferences(storage, DEFAULT_WORKSPACE_PREFERENCES),
    ).toBe(false);
  });
});
