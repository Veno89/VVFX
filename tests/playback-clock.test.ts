import { act, render } from "@testing-library/react";
import { createElement, Fragment } from "react";
import { describe, expect, it, vi } from "vitest";
import { ClockedPreviewPanel, ClockedTimeline } from "../src/editor/VfxEditor";
import { createPlaybackClock } from "../src/editor/playbackClock";
import { createEmptyProject } from "../src/vfx/defaults";

const surfaceRenders = vi.hoisted(() => ({
  preview: vi.fn(),
  timeline: vi.fn(),
}));

vi.mock("../src/editor/components/PreviewPanel", () => ({
  PreviewPanel: ({ time }: { time: number }) => {
    surfaceRenders.preview(time);
    return null;
  },
}));

vi.mock("../src/editor/components/Timeline", () => ({
  Timeline: ({ time }: { time: number }) => {
    surfaceRenders.timeline(time);
    return null;
  },
}));

describe("playback clock", () => {
  it("notifies subscribers for changed timestamps without owning React state", () => {
    const clock = createPlaybackClock(10);
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);

    clock.set((current) => current + 15);
    expect(clock.getSnapshot()).toBe(25);
    expect(listener).toHaveBeenCalledTimes(1);

    clock.set(25);
    clock.set(Number.NaN);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    clock.set(30);
    expect(clock.getSnapshot()).toBe(30);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rerenders only the clocked preview and timeline when playback advances", () => {
    const clock = createPlaybackClock(7);
    const project = createEmptyProject();
    const rootRender = vi.fn();
    const staticPanelRender = vi.fn();
    const noop = vi.fn();

    function StaticEditorPanel() {
      staticPanelRender();
      return null;
    }

    function EditorHarness() {
      rootRender();
      return createElement(
        Fragment,
        null,
        createElement(StaticEditorPanel),
        createElement(ClockedPreviewPanel, {
          clock,
          project,
          playing: true,
          speed: 1,
          loopEnd: project.preview.duration,
          selectedId: null,
          onProjectChange: noop,
          onViewChange: noop,
          onMoveLayer: noop,
          onMovePathPoint: noop,
          onPlayToggle: noop,
          onRestart: noop,
          onSpeedChange: noop,
        }),
        createElement(ClockedTimeline, {
          clock,
          layers: project.layers,
          groups: project.groups,
          duration: project.preview.duration,
          selectedId: null,
          selectedGroupId: null,
          onSelect: noop,
          onSelectGroup: noop,
          onSeek: noop,
          onLayerChange: noop,
          onGroupChange: noop,
          onDurationChange: noop,
        }),
      );
    }

    render(createElement(EditorHarness));
    const initialRootRenders = rootRender.mock.calls.length;
    const initialStaticRenders = staticPanelRender.mock.calls.length;
    const initialPreviewRenders = surfaceRenders.preview.mock.calls.length;
    const initialTimelineRenders = surfaceRenders.timeline.mock.calls.length;

    expect(surfaceRenders.preview).toHaveBeenLastCalledWith(7);
    expect(surfaceRenders.timeline).toHaveBeenLastCalledWith(7);

    act(() => clock.set(25));

    expect(rootRender).toHaveBeenCalledTimes(initialRootRenders);
    expect(staticPanelRender).toHaveBeenCalledTimes(initialStaticRenders);
    expect(surfaceRenders.preview).toHaveBeenCalledTimes(
      initialPreviewRenders + 1,
    );
    expect(surfaceRenders.timeline).toHaveBeenCalledTimes(
      initialTimelineRenders + 1,
    );
    expect(surfaceRenders.preview).toHaveBeenLastCalledWith(25);
    expect(surfaceRenders.timeline).toHaveBeenLastCalledWith(25);
  });
});
