"use client";

import { Boxes, Clock3, Flag, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeId } from "../../vfx/defaults";
import { groupTimelineRange } from "../../vfx/groups";
import { insertKeyframeAt, moveKeyframe } from "../../vfx/keyframes";
import {
  millisecondsAsFrames,
  nextMarkerTime,
  parseTimingPlan,
  snapTimelineTime,
  type TimelineSnapMode,
} from "../../vfx/timelineTiming";
import type {
  TimelineAuthoringSettings,
  TimelineMarker,
  VfxGroup,
  VfxLayer,
} from "../../vfx/types";
import { useFocusRegion } from "../useFocusRegion";

const TIMING_PLAN_ID = "vvfx-timing-plan";
const TIMING_PLAN_TITLE_ID = "vvfx-timing-plan-title";

const percent = (value: number, duration: number) =>
  `${Math.max(0, Math.min(100, (value / duration) * 100))}%`;

type DragMode = "move" | "start" | "end";
export type TimelinePropertyTrack =
  "summary" | "scaleX" | "scaleY" | "opacity" | "rotation";

const PROPERTY_TRACKS: Array<{
  id: TimelinePropertyTrack;
  label: string;
}> = [
  { id: "summary", label: "Property summary" },
  { id: "scaleX", label: "Horizontal scale" },
  { id: "scaleY", label: "Vertical scale" },
  { id: "opacity", label: "Opacity" },
  { id: "rotation", label: "Rotation" },
];

const propertyTrackValue = (
  frame: VfxLayer["keyframes"]["frames"][number],
  track: Exclude<TimelinePropertyTrack, "summary">,
) =>
  track === "scaleX" || track === "scaleY" || track === "opacity"
    ? frame[track] * 100
    : frame.rotation;

const propertyTrackUnit = (track: TimelinePropertyTrack) =>
  track === "rotation" ? "deg" : track === "summary" ? "" : "%";

export function layerAfterTimelinePropertyChange(
  layer: VfxLayer,
  index: number,
  track: Exclude<TimelinePropertyTrack, "summary">,
  displayValue: number,
): VfxLayer {
  if (!Number.isFinite(displayValue) || !layer.keyframes.frames[index])
    return layer;
  const value =
    track === "rotation"
      ? Math.max(-1_080, Math.min(1_080, displayValue))
      : track === "opacity"
        ? Math.max(0, Math.min(100, displayValue)) / 100
        : Math.max(0, Math.min(400, displayValue)) / 100;
  const frames = layer.keyframes.frames.map((frame, frameIndex) =>
    frameIndex === index ? { ...frame, [track]: value } : frame,
  );
  const transform = { ...layer.transform };
  if (index === 0) {
    if (track === "scaleX") {
      transform.startScaleX = value;
      if (!transform.separateScale) transform.startScale = value;
    }
    if (track === "scaleY") transform.startScaleY = value;
    if (track === "opacity") transform.startOpacity = value;
  }
  if (index === frames.length - 1) {
    if (track === "scaleX") {
      transform.endScaleX = value;
      if (!transform.separateScale) transform.endScale = value;
    }
    if (track === "scaleY") transform.endScaleY = value;
    if (track === "opacity") transform.endOpacity = value;
    if (track === "rotation") transform.rotationDuring = value;
  }
  return {
    ...layer,
    transform,
    keyframes: { ...layer.keyframes, frames },
  } as VfxLayer;
}

interface DragPreview {
  layerId: string;
  delay: number;
  duration: number;
  mode: DragMode;
}

interface KeyframeDragPreview {
  layerId: string;
  index: number;
  time: number;
}

interface GroupDragPreview {
  groupId: string;
  delay: number;
}

const DEFAULT_TIMELINE: TimelineAuthoringSettings = { markers: [], notes: "" };

const groupDelayForLayer = (layer: VfxLayer, groups: VfxGroup[]) =>
  groups.find((group) => group.id === layer.groupId)?.delay ?? 0;

export function groupDelayAfterTimelineDrag(
  delay: number,
  effectDuration: number,
  delta: number,
  snapMode: TimelineSnapMode = "10",
  markers: TimelineMarker[] = [],
  bypassSnap = false,
): number {
  return Math.max(
    0,
    Math.min(
      effectDuration - 50,
      snapTimelineTime({
        value: delay + delta,
        mode: snapMode,
        markers,
        duration: effectDuration,
        bypass: bypassSnap,
      }),
    ),
  );
}

export function timingAfterTimelineDrag(
  timing: VfxLayer["timing"],
  effectDuration: number,
  delta: number,
  mode: DragMode,
  snapMode: TimelineSnapMode = "10",
  markers: TimelineMarker[] = [],
  bypassSnap = false,
): Pick<VfxLayer["timing"], "delay" | "duration"> {
  if (mode === "move") {
    const minimumVisibleTime = Math.min(50, timing.duration);
    return {
      delay: Math.max(
        0,
        Math.min(
          effectDuration - minimumVisibleTime,
          snapTimelineTime({
            value: timing.delay + delta,
            mode: snapMode,
            markers,
            duration: effectDuration,
            bypass: bypassSnap,
          }),
        ),
      ),
      duration: timing.duration,
    };
  }

  if (mode === "start") {
    const end = Math.min(effectDuration, timing.delay + timing.duration);
    const delay = Math.max(
      0,
      Math.min(
        end - 50,
        snapTimelineTime({
          value: timing.delay + delta,
          mode: snapMode,
          markers,
          duration: effectDuration,
          bypass: bypassSnap,
        }),
      ),
    );
    return {
      delay,
      duration: end - delay,
    };
  }

  const end = snapTimelineTime({
    value: timing.delay + timing.duration + delta,
    mode: snapMode,
    markers,
    duration: effectDuration,
    bypass: bypassSnap,
  });
  return {
    delay: timing.delay,
    duration: Math.max(
      50,
      Math.min(effectDuration - timing.delay, end - timing.delay),
    ),
  };
}

export function keyframeTimeAfterTimelineDrag(
  layer: VfxLayer,
  index: number,
  deltaMs: number,
): number {
  const original = layer.keyframes.frames[index]?.time ?? 0;
  return (
    moveKeyframe(
      layer.keyframes.frames,
      index,
      original + deltaMs / Math.max(50, layer.timing.duration),
    )[index]?.time ?? original
  );
}

export function Timeline({
  layers,
  groups,
  duration,
  time,
  selectedId,
  selectedGroupId,
  onSelect,
  onSelectGroup,
  onSeek,
  onLayerChange,
  onLayersChange,
  onGroupChange,
  onDurationChange,
  timeline = DEFAULT_TIMELINE,
  onTimelineChange,
  zoom = 1,
  workStart = 0,
  workEnd = null,
  onViewChange,
  lockedLayerIds = [],
}: {
  layers: VfxLayer[];
  groups: VfxGroup[];
  duration: number;
  time: number;
  selectedId: string | null;
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onSeek: (time: number) => void;
  onLayerChange: (layer: VfxLayer) => void;
  onLayersChange?: (layers: VfxLayer[]) => void;
  onGroupChange: (group: VfxGroup) => void;
  onDurationChange: (duration: number) => void;
  timeline?: TimelineAuthoringSettings;
  onTimelineChange?: (
    timeline: TimelineAuthoringSettings,
    duration?: number,
  ) => void;
  zoom?: number;
  workStart?: number;
  workEnd?: number | null;
  onViewChange?: (patch: {
    zoom?: number;
    workStart?: number;
    workEnd?: number | null;
  }) => void;
  lockedLayerIds?: string[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [keyframeDragPreview, setKeyframeDragPreview] =
    useState<KeyframeDragPreview | null>(null);
  const [groupDragPreview, setGroupDragPreview] =
    useState<GroupDragPreview | null>(null);
  const [markerDragPreview, setMarkerDragPreview] = useState<{
    id: string;
    time: number;
  } | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedTimingIds, setSelectedTimingIds] = useState<string[]>(
    selectedId ? [selectedId] : [],
  );
  const [snapMode, setSnapMode] = useState<TimelineSnapMode>("10");
  const [staggerAmount, setStaggerAmount] = useState(20);
  const [notesEditor, setNotesEditor] = useState({
    source: timeline.notes,
    draft: timeline.notes,
  });
  const [timingPlanOpen, setTimingPlanOpen] = useState(false);
  const [propertyTrack, setPropertyTrack] =
    useState<TimelinePropertyTrack>("summary");
  const [selectedMoment, setSelectedMoment] = useState<{
    layerId: string;
    index: number;
  } | null>(null);
  const lockedIds = new Set(lockedLayerIds);

  useEffect(() => () => dragCleanupRef.current?.(), []);
  const selectedMomentIndex =
    selectedMoment?.layerId === selectedId ? selectedMoment.index : null;
  const effectiveTimingIds =
    selectedId && selectedTimingIds.includes(selectedId)
      ? selectedTimingIds
      : selectedId
        ? [selectedId]
        : [];
  const notesDraft =
    notesEditor.source === timeline.notes ? notesEditor.draft : timeline.notes;
  const setNotesDraft = (draft: string) =>
    setNotesEditor({ source: timeline.notes, draft });
  const timingPlanTriggerRef = useRef<HTMLButtonElement>(null);
  const timingPlanNotesRef = useRef<HTMLTextAreaElement>(null);
  const closeTimingPlan = useCallback(() => {
    if (notesDraft !== timeline.notes) {
      setNotesEditor({ source: notesDraft, draft: notesDraft });
      onTimelineChange?.({ ...timeline, notes: notesDraft });
    }
    setTimingPlanOpen(false);
  }, [notesDraft, onTimelineChange, timeline]);
  const timingPlanRef = useFocusRegion<HTMLDivElement>({
    active: timingPlanOpen,
    trapFocus: false,
    initialFocusRef: timingPlanNotesRef,
    dismissOnFocusOutside: true,
    dismissOnPointerOutside: true,
    dismissBoundaryRef: timingPlanTriggerRef,
    onEscape: closeTimingPlan,
  });

  const selectedTimingLayers = layers.filter((layer) =>
    effectiveTimingIds.includes(layer.id),
  );
  const selectedTimingLayer =
    selectedTimingLayers.length === 1 ? selectedTimingLayers[0] : null;
  const selectedPropertyFrame =
    selectedTimingLayer && selectedMomentIndex !== null
      ? (selectedTimingLayer.keyframes.frames[selectedMomentIndex] ?? null)
      : null;
  const activePropertyTrack =
    propertyTrack === "summary" ? null : propertyTrack;
  const selectedMarker = timeline.markers.find(
    (marker) => marker.id === selectedMarkerId,
  );
  const commitLayers = (nextLayers: VfxLayer[]) => {
    if (onLayersChange) onLayersChange(nextLayers);
    else nextLayers.forEach(onLayerChange);
  };
  const selectForTiming = (id: string, add: boolean) => {
    setSelectedTimingIds((current) => {
      const currentSelection =
        selectedId && current.includes(selectedId)
          ? current
          : selectedId
            ? [selectedId]
            : [];
      if (!add) return [id];
      return currentSelection.includes(id)
        ? currentSelection.filter((candidate) => candidate !== id)
        : [...currentSelection, id];
    });
    onSelect(id);
  };

  const seekAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect)
      onSeek(
        Math.max(
          0,
          Math.min(duration, ((clientX - rect.left) / rect.width) * duration),
        ),
      );
  };
  const startDrag = (
    event: React.PointerEvent,
    layer: VfxLayer,
    mode: DragMode,
  ) => {
    if (event.button !== 0 || lockedIds.has(layer.id)) return;
    event.stopPropagation();
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const batchIds =
      mode === "move" &&
      effectiveTimingIds.includes(layer.id) &&
      effectiveTimingIds.length > 1
        ? effectiveTimingIds.filter((id) => !lockedIds.has(id))
        : [layer.id];
    if (!effectiveTimingIds.includes(layer.id))
      selectForTiming(layer.id, false);
    else onSelect(layer.id);
    const groupDelay = groupDelayForLayer(layer, groups);
    const localMarkers = timeline.markers
      .map((marker) => ({ ...marker, time: marker.time - groupDelay }))
      .filter((marker) => marker.time >= 0);

    const originX = event.clientX;
    let latest = {
      delay: layer.timing.delay,
      duration: layer.timing.duration,
    };

    dragCleanupRef.current?.();
    setDragPreview({ layerId: layer.id, ...latest, mode });

    const timingAt = (clientX: number, bypassSnap = false) =>
      timingAfterTimelineDrag(
        layer.timing,
        Math.max(50, duration - groupDelay),
        ((clientX - originX) / rect.width) * duration,
        mode,
        snapMode,
        localMarkers,
        bypassSnap,
      );

    const move = (moveEvent: PointerEvent) => {
      latest = timingAt(moveEvent.clientX, moveEvent.altKey);
      setDragPreview({ layerId: layer.id, ...latest, mode });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      dragCleanupRef.current = null;
      setDragPreview(null);
    };
    const up = (upEvent: PointerEvent) => {
      latest = timingAt(upEvent.clientX, upEvent.altKey);
      cleanup();
      if (
        latest.delay === layer.timing.delay &&
        latest.duration === layer.timing.duration
      )
        return;
      if (mode === "move" && batchIds.length > 1) {
        const deltaDelay = latest.delay - layer.timing.delay;
        commitLayers(
          layers.map((candidate) => {
            if (!batchIds.includes(candidate.id)) return candidate;
            const candidateGroupDelay = groupDelayForLayer(candidate, groups);
            const maximum = Math.max(
              0,
              duration -
                candidateGroupDelay -
                Math.min(50, candidate.timing.duration),
            );
            return {
              ...candidate,
              timing: {
                ...candidate.timing,
                delay: Math.max(
                  0,
                  Math.min(maximum, candidate.timing.delay + deltaDelay),
                ),
              },
            } as VfxLayer;
          }),
        );
        return;
      }
      onLayerChange({
        ...layer,
        timing: {
          ...layer.timing,
          ...latest,
        },
      });
    };
    const cancel = () => {
      cleanup();
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  };

  const moveWithKeyboard = (event: React.KeyboardEvent, layer: VfxLayer) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (lockedIds.has(layer.id)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    const groupDelay = groupDelayForLayer(layer, groups);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const currentGlobalStart = groupDelay + layer.timing.delay;
    const targetGlobalStart =
      event.ctrlKey || event.metaKey
        ? nextMarkerTime(
            currentGlobalStart,
            direction as -1 | 1,
            timeline.markers,
            duration,
          )
        : currentGlobalStart + direction * (event.shiftKey ? 10 : 1);
    const next = timingAfterTimelineDrag(
      layer.timing,
      Math.max(50, duration - groupDelay),
      targetGlobalStart - currentGlobalStart,
      "move",
      "off",
    );
    if (next.delay === layer.timing.delay) return;
    const activeIds = effectiveTimingIds.includes(layer.id)
      ? effectiveTimingIds
      : [layer.id];
    const deltaDelay = next.delay - layer.timing.delay;
    if (activeIds.length > 1) {
      commitLayers(
        layers.map((candidate) =>
          activeIds.includes(candidate.id)
            ? ({
                ...candidate,
                timing: {
                  ...candidate.timing,
                  delay: Math.max(0, candidate.timing.delay + deltaDelay),
                },
              } as VfxLayer)
            : candidate,
        ),
      );
    } else
      onLayerChange({
        ...layer,
        timing: { ...layer.timing, ...next },
      });
  };

  const startKeyframeDrag = (
    event: React.PointerEvent,
    layer: VfxLayer,
    index: number,
  ) => {
    if (
      event.button !== 0 ||
      lockedIds.has(layer.id) ||
      index <= 0 ||
      index >= layer.keyframes.frames.length - 1
    )
      return;
    event.stopPropagation();
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    onSelect(layer.id);
    const originX = event.clientX;
    let latest = layer.keyframes.frames[index].time;

    dragCleanupRef.current?.();
    setKeyframeDragPreview({ layerId: layer.id, index, time: latest });

    const layerStart = groupDelayForLayer(layer, groups) + layer.timing.delay;
    const timeAt = (clientX: number, bypassSnap = false) => {
      const rawTime = keyframeTimeAfterTimelineDrag(
        layer,
        index,
        ((clientX - originX) / rect.width) * duration,
      );
      const absoluteTime = snapTimelineTime({
        value: layerStart + rawTime * layer.timing.duration,
        mode: snapMode,
        markers: timeline.markers,
        duration,
        bypass: bypassSnap,
      });
      return (
        moveKeyframe(
          layer.keyframes.frames,
          index,
          (absoluteTime - layerStart) / layer.timing.duration,
        )[index]?.time ?? rawTime
      );
    };
    const move = (moveEvent: PointerEvent) => {
      latest = timeAt(moveEvent.clientX, moveEvent.altKey);
      setKeyframeDragPreview({ layerId: layer.id, index, time: latest });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      dragCleanupRef.current = null;
      setKeyframeDragPreview(null);
    };
    const up = (upEvent: PointerEvent) => {
      latest = timeAt(upEvent.clientX, upEvent.altKey);
      cleanup();
      if (latest !== layer.keyframes.frames[index].time)
        onLayerChange({
          ...layer,
          keyframes: {
            ...layer.keyframes,
            frames: moveKeyframe(layer.keyframes.frames, index, latest),
          },
        });
    };
    const cancel = () => cleanup();

    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  };

  const moveKeyframeWithKeyboard = (
    event: React.KeyboardEvent,
    layer: VfxLayer,
    index: number,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (lockedIds.has(layer.id)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const layerStart = groupDelayForLayer(layer, groups) + layer.timing.delay;
    const currentTime =
      layerStart + layer.keyframes.frames[index].time * layer.timing.duration;
    const targetTime =
      event.ctrlKey || event.metaKey
        ? nextMarkerTime(
            currentTime,
            direction as -1 | 1,
            timeline.markers,
            duration,
          )
        : currentTime + direction * (event.shiftKey ? 10 : 1);
    const frameTime = keyframeTimeAfterTimelineDrag(
      layer,
      index,
      targetTime - currentTime,
    );
    if (frameTime === layer.keyframes.frames[index].time) return;
    onLayerChange({
      ...layer,
      keyframes: {
        ...layer.keyframes,
        frames: moveKeyframe(layer.keyframes.frames, index, frameTime),
      },
    });
  };

  const startGroupDrag = (event: React.PointerEvent, group: VfxGroup) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    onSelectGroup(group.id);
    const originX = event.clientX;
    let latest = group.delay;

    dragCleanupRef.current?.();
    setGroupDragPreview({ groupId: group.id, delay: latest });
    const delayAt = (clientX: number, bypassSnap = false) =>
      groupDelayAfterTimelineDrag(
        group.delay,
        duration,
        ((clientX - originX) / rect.width) * duration,
        snapMode,
        timeline.markers,
        bypassSnap,
      );
    const move = (moveEvent: PointerEvent) => {
      latest = delayAt(moveEvent.clientX, moveEvent.altKey);
      setGroupDragPreview({ groupId: group.id, delay: latest });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      dragCleanupRef.current = null;
      setGroupDragPreview(null);
    };
    const up = (upEvent: PointerEvent) => {
      latest = delayAt(upEvent.clientX, upEvent.altKey);
      cleanup();
      if (latest !== group.delay) onGroupChange({ ...group, delay: latest });
    };
    const cancel = () => cleanup();

    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  };

  const moveGroupWithKeyboard = (
    event: React.KeyboardEvent,
    group: VfxGroup,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onSelectGroup(group.id);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const target =
      event.ctrlKey || event.metaKey
        ? nextMarkerTime(
            group.delay,
            direction as -1 | 1,
            timeline.markers,
            duration,
          )
        : group.delay + direction * (event.shiftKey ? 10 : 1);
    const delay = groupDelayAfterTimelineDrag(
      group.delay,
      duration,
      target - group.delay,
      "off",
    );
    if (delay !== group.delay) onGroupChange({ ...group, delay });
  };

  const addMarker = () => {
    const markerTime = snapTimelineTime({
      value: time,
      mode: snapMode === "markers" ? "1" : snapMode,
      markers: timeline.markers,
      duration,
    });
    const marker: TimelineMarker = {
      id: makeId("marker"),
      time: markerTime,
      label: `Marker ${timeline.markers.length + 1}`,
    };
    onTimelineChange?.(
      {
        ...timeline,
        markers: [...timeline.markers, marker].sort(
          (left, right) => left.time - right.time,
        ),
      },
      undefined,
    );
    setSelectedMarkerId(marker.id);
  };

  const updateMarker = (id: string, patch: Partial<TimelineMarker>) => {
    onTimelineChange?.({
      ...timeline,
      markers: timeline.markers
        .map((marker) => (marker.id === id ? { ...marker, ...patch } : marker))
        .sort((left, right) => left.time - right.time),
    });
  };

  const startMarkerDrag = (
    event: React.PointerEvent,
    marker: TimelineMarker,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedMarkerId(marker.id);
    let latest = marker.time;
    const otherMarkers = timeline.markers.filter(
      (candidate) => candidate.id !== marker.id,
    );
    const timeAt = (clientX: number, bypassSnap = false) =>
      snapTimelineTime({
        value: ((clientX - rect.left) / rect.width) * duration,
        mode: snapMode,
        markers: otherMarkers,
        duration,
        bypass: bypassSnap,
      });
    dragCleanupRef.current?.();
    setMarkerDragPreview({ id: marker.id, time: marker.time });
    const move = (moveEvent: PointerEvent) => {
      latest = timeAt(moveEvent.clientX, moveEvent.altKey);
      setMarkerDragPreview({ id: marker.id, time: latest });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      dragCleanupRef.current = null;
      setMarkerDragPreview(null);
    };
    const up = (upEvent: PointerEvent) => {
      latest = timeAt(upEvent.clientX, upEvent.altKey);
      cleanup();
      if (latest !== marker.time) updateMarker(marker.id, { time: latest });
    };
    const cancel = () => cleanup();
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  };

  const updateSelectedTiming = (
    field: "start" | "end" | "duration",
    rawValue: number,
  ) => {
    if (
      !selectedTimingLayer ||
      lockedIds.has(selectedTimingLayer.id) ||
      !Number.isFinite(rawValue)
    )
      return;
    const groupDelay = groupDelayForLayer(selectedTimingLayer, groups);
    const currentStart = groupDelay + selectedTimingLayer.timing.delay;
    const maximumDuration = Math.max(50, duration - currentStart);
    let delay = selectedTimingLayer.timing.delay;
    let layerDuration = selectedTimingLayer.timing.duration;
    if (field === "start")
      delay = Math.max(
        0,
        Math.min(duration - groupDelay - 50, rawValue - groupDelay),
      );
    if (field === "duration")
      layerDuration = Math.max(50, Math.min(maximumDuration, rawValue));
    if (field === "end")
      layerDuration = Math.max(
        50,
        Math.min(maximumDuration, rawValue - currentStart),
      );
    onLayerChange({
      ...selectedTimingLayer,
      timing: { ...selectedTimingLayer.timing, delay, duration: layerDuration },
    });
  };

  const alignSelected = (edge: "start" | "end") => {
    if (selectedTimingLayers.length < 2) return;
    commitLayers(
      layers.map((layer) => {
        if (!effectiveTimingIds.includes(layer.id) || lockedIds.has(layer.id))
          return layer;
        const groupDelay = groupDelayForLayer(layer, groups);
        const desiredDelay =
          edge === "start"
            ? time - groupDelay
            : time - groupDelay - layer.timing.duration;
        const maximum = Math.max(
          0,
          duration - groupDelay - Math.min(50, layer.timing.duration),
        );
        return {
          ...layer,
          timing: {
            ...layer.timing,
            delay: Math.max(0, Math.min(maximum, desiredDelay)),
          },
        } as VfxLayer;
      }),
    );
  };

  const staggerSelected = () => {
    if (selectedTimingLayers.length < 2) return;
    const earliest = Math.min(
      ...selectedTimingLayers.map(
        (layer) => groupDelayForLayer(layer, groups) + layer.timing.delay,
      ),
    );
    const order = new Map(
      selectedTimingLayers.map((layer, index) => [layer.id, index]),
    );
    commitLayers(
      layers.map((layer) => {
        const index = order.get(layer.id);
        if (index === undefined || lockedIds.has(layer.id)) return layer;
        const groupDelay = groupDelayForLayer(layer, groups);
        const maximum = Math.max(
          0,
          duration - groupDelay - Math.min(50, layer.timing.duration),
        );
        return {
          ...layer,
          timing: {
            ...layer.timing,
            delay: Math.max(
              0,
              Math.min(maximum, earliest + index * staggerAmount - groupDelay),
            ),
          },
        } as VfxLayer;
      }),
    );
  };

  const addPropertyMoment = () => {
    if (
      !selectedTimingLayer ||
      lockedIds.has(selectedTimingLayer.id) ||
      selectedTimingLayer.type === "static" ||
      selectedTimingLayer.type === "beam"
    )
      return;
    const groupDelay = groupDelayForLayer(selectedTimingLayer, groups);
    const relativeTime =
      (time - groupDelay - selectedTimingLayer.timing.delay) /
      selectedTimingLayer.timing.duration;
    const keyframes = insertKeyframeAt(
      selectedTimingLayer.keyframes,
      selectedTimingLayer.transform,
      relativeTime,
    );
    if (keyframes === selectedTimingLayer.keyframes) return;
    onLayerChange({ ...selectedTimingLayer, keyframes });
  };

  const createMarkersFromPlan = () => {
    const drafts = parseTimingPlan(notesDraft);
    if (drafts.length === 0) return;
    const additions = drafts
      .filter(
        (draft) =>
          !timeline.markers.some(
            (marker) =>
              marker.time === draft.time && marker.label === draft.label,
          ),
      )
      .map((draft) => ({ ...draft, id: makeId("marker") }));
    const nextDuration = Math.min(
      30_000,
      Math.max(duration, ...drafts.map((draft) => draft.time)),
    );
    setNotesEditor({ source: notesDraft, draft: notesDraft });
    onTimelineChange?.(
      {
        notes: notesDraft,
        markers: [...timeline.markers, ...additions].sort(
          (left, right) => left.time - right.time,
        ),
      },
      nextDuration,
    );
    setTimingPlanOpen(false);
  };
  const tickSegments = Math.max(6, Math.ceil(6 * zoom));
  const ticks = Array.from(
    { length: tickSegments + 1 },
    (_, index) => (index * duration) / tickSegments,
  );
  const effectiveWorkStart = Math.max(0, Math.min(duration - 50, workStart));
  const effectiveWorkEnd = Math.max(
    effectiveWorkStart + 50,
    Math.min(duration, workEnd ?? duration),
  );
  const selectedStart = selectedTimingLayer
    ? groupDelayForLayer(selectedTimingLayer, groups) +
      selectedTimingLayer.timing.delay
    : 0;
  const selectedEnd = selectedTimingLayer
    ? selectedStart + selectedTimingLayer.timing.duration
    : 0;
  const canAddPropertyMoment = Boolean(
    selectedTimingLayer &&
    !lockedIds.has(selectedTimingLayer.id) &&
    selectedTimingLayer.type !== "static" &&
    selectedTimingLayer.type !== "beam" &&
    time > selectedStart + selectedTimingLayer.timing.duration * 0.01 &&
    time < selectedEnd - selectedTimingLayer.timing.duration * 0.01,
  );
  return (
    <section className="timeline-panel" aria-label="Effect timeline">
      <div className="timeline-header">
        <div>
          <Clock3 size={14} />
          <span>Timeline</span>
          <small>
            Drag a group or layer bar to move it. Layer handles adjust start and
            duration. Keyframe diamonds move intermediate moments.
          </small>
        </div>
        <label>
          Effect length{" "}
          <input
            type="number"
            min={500}
            max={30000}
            step={100}
            value={duration}
            onChange={(event) =>
              onDurationChange(Math.max(500, Number(event.target.value)))
            }
          />
          <span>ms</span>
        </label>
      </div>
      <div className="timeline-commandbar">
        <label>
          Snap
          <select
            aria-label="Timeline snapping"
            value={snapMode}
            onChange={(event) =>
              setSnapMode(event.target.value as TimelineSnapMode)
            }
          >
            <option value="off">Off</option>
            <option value="1">1 ms</option>
            <option value="5">5 ms</option>
            <option value="10">10 ms</option>
            <option value="markers">Markers (magnetic)</option>
            <option value="30fps">30 FPS frames</option>
            <option value="60fps">60 FPS frames</option>
          </select>
        </label>
        <label className="timeline-property-track-control">
          Property track
          <select
            aria-label="Timeline property track"
            value={propertyTrack}
            onChange={(event) =>
              setPropertyTrack(event.target.value as TimelinePropertyTrack)
            }
          >
            {PROPERTY_TRACKS.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label}
              </option>
            ))}
          </select>
        </label>
        <span className="timeline-zoom-control">
          <span>Zoom</span>
          <button
            type="button"
            aria-label="Zoom timeline out"
            disabled={!onViewChange || zoom <= 0.5}
            onClick={() => onViewChange?.({ zoom: Math.max(0.5, zoom - 0.25) })}
          >
            −
          </button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button
            type="button"
            aria-label="Zoom timeline in"
            disabled={!onViewChange || zoom >= 4}
            onClick={() => onViewChange?.({ zoom: Math.min(4, zoom + 0.25) })}
          >
            +
          </button>
        </span>
        <span className="timeline-work-controls">
          <span>
            Work {Math.round(effectiveWorkStart)}–{Math.round(effectiveWorkEnd)}
            ms
          </span>
          <button
            type="button"
            disabled={!onViewChange || time >= effectiveWorkEnd - 50}
            onClick={() => onViewChange?.({ workStart: time })}
          >
            Set in
          </button>
          <button
            type="button"
            disabled={!onViewChange || time <= effectiveWorkStart + 50}
            onClick={() => onViewChange?.({ workEnd: time })}
          >
            Set out
          </button>
          <button
            type="button"
            disabled={
              !onViewChange || (effectiveWorkStart === 0 && workEnd === null)
            }
            onClick={() => onViewChange?.({ workStart: 0, workEnd: null })}
          >
            Clear
          </button>
        </span>
        <button type="button" onClick={addMarker} disabled={!onTimelineChange}>
          <Flag size={12} /> Add marker at {Math.round(time)} ms
        </button>
        <button
          ref={timingPlanTriggerRef}
          type="button"
          className={timingPlanOpen ? "is-active" : ""}
          onClick={() => {
            if (timingPlanOpen) closeTimingPlan();
            else setTimingPlanOpen(true);
          }}
          aria-controls={TIMING_PLAN_ID}
          aria-expanded={timingPlanOpen}
          aria-haspopup="dialog"
        >
          Timing plan
        </button>
        <span className="timeline-time-readout">
          Playhead <strong>{Math.round(time)} ms</strong>
          <small>{millisecondsAsFrames(time, 60)}</small>
        </span>
        <small className="timeline-nudge-hint">
          Arrow: 1 ms · Shift: 10 ms · Ctrl/Cmd: next marker · Alt: no snap
        </small>
      </div>
      {timingPlanOpen && (
        <div
          ref={timingPlanRef}
          id={TIMING_PLAN_ID}
          className="timing-plan-popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby={TIMING_PLAN_TITLE_ID}
          data-editor-shortcuts="off"
        >
          <header>
            <div>
              <strong id={TIMING_PLAN_TITLE_ID}>
                Turn feedback into timing markers
              </strong>
              <small>
                Paste lines such as “40–120 ms ring expands and vanishes.”
              </small>
            </div>
            <button
              type="button"
              onClick={closeTimingPlan}
              aria-label="Close timing plan"
            >
              ×
            </button>
          </header>
          <textarea
            ref={timingPlanNotesRef}
            aria-label="Timing plan notes"
            maxLength={12_000}
            value={notesDraft}
            placeholder={
              "0 ms CRIT happens\n0–40 ms flash and splatter expand\n40–120 ms ring vanishes\n120–250 ms splatter settles\n250–700 ms blood fades"
            }
            onChange={(event) => setNotesDraft(event.target.value)}
          />
          <footer>
            <span>Range lines create a start and end marker.</span>
            <button
              type="button"
              onClick={createMarkersFromPlan}
              disabled={parseTimingPlan(notesDraft).length === 0}
            >
              Create markers
            </button>
          </footer>
        </div>
      )}
      {(selectedTimingLayers.length > 0 || selectedMarker) && (
        <div className="timeline-precisionbar">
          {selectedTimingLayer && (
            <>
              <strong title={selectedTimingLayer.name}>
                {selectedTimingLayer.name}
              </strong>
              <label>
                {selectedTimingLayer.startMode === "triggered"
                  ? "Delay after trigger"
                  : "Start"}
                <input
                  aria-label={
                    selectedTimingLayer.startMode === "triggered"
                      ? "Selected layer delay after trigger"
                      : "Selected layer start time"
                  }
                  type="number"
                  min={0}
                  max={duration - 50}
                  step={1}
                  value={Math.round(selectedStart * 100) / 100}
                  onChange={(event) =>
                    updateSelectedTiming("start", Number(event.target.value))
                  }
                />
                ms
              </label>
              <label>
                {selectedTimingLayer.startMode === "triggered"
                  ? "Relative end"
                  : "End"}
                <input
                  aria-label="Selected layer end time"
                  type="number"
                  min={50}
                  max={duration}
                  step={1}
                  value={Math.round(selectedEnd * 100) / 100}
                  onChange={(event) =>
                    updateSelectedTiming("end", Number(event.target.value))
                  }
                />
                ms
              </label>
              <label>
                Duration
                <input
                  aria-label="Selected layer duration"
                  type="number"
                  min={50}
                  max={duration}
                  step={1}
                  value={
                    Math.round(selectedTimingLayer.timing.duration * 100) / 100
                  }
                  onChange={(event) =>
                    updateSelectedTiming("duration", Number(event.target.value))
                  }
                />
                ms
              </label>
              <button
                type="button"
                onClick={addPropertyMoment}
                disabled={!canAddPropertyMoment}
                title="Add a size, opacity, and rotation keyframe at the playhead."
              >
                <Plus size={11} /> Property moment
              </button>
              {activePropertyTrack &&
                selectedPropertyFrame &&
                selectedMomentIndex !== null && (
                  <label className="timeline-property-editor">
                    {
                      PROPERTY_TRACKS.find(
                        (track) => track.id === activePropertyTrack,
                      )?.label
                    }
                    <input
                      aria-label={`Selected moment ${activePropertyTrack}`}
                      type="number"
                      min={activePropertyTrack === "rotation" ? -1080 : 0}
                      max={
                        activePropertyTrack === "rotation"
                          ? 1080
                          : activePropertyTrack === "opacity"
                            ? 100
                            : 400
                      }
                      step={activePropertyTrack === "rotation" ? 1 : 0.5}
                      value={
                        Math.round(
                          propertyTrackValue(
                            selectedPropertyFrame,
                            activePropertyTrack,
                          ) * 100,
                        ) / 100
                      }
                      disabled={lockedIds.has(selectedTimingLayer.id)}
                      onChange={(event) =>
                        onLayerChange(
                          layerAfterTimelinePropertyChange(
                            selectedTimingLayer,
                            selectedMomentIndex,
                            activePropertyTrack,
                            Number(event.target.value),
                          ),
                        )
                      }
                    />
                    {propertyTrackUnit(activePropertyTrack)}
                  </label>
                )}
              {selectedTimingLayer.startMode === "triggered" && (
                <span className="timeline-relative-note">
                  Relative bar — each event reuses this same timing
                </span>
              )}
              {selectedTimingLayer.keyframes.enabled && (
                <span className="timeline-moment-list">
                  Moments
                  {selectedTimingLayer.keyframes.frames.map((frame, index) => {
                    const absolute =
                      selectedStart +
                      frame.time * selectedTimingLayer.timing.duration;
                    return (
                      <button
                        key={`${frame.time}-${index}`}
                        type="button"
                        className={
                          selectedMomentIndex === index ? "is-selected" : ""
                        }
                        aria-pressed={selectedMomentIndex === index}
                        onClick={() => {
                          setSelectedMoment({
                            layerId: selectedTimingLayer.id,
                            index,
                          });
                          onSeek(absolute);
                        }}
                        title={`Size ${Math.round(frame.scaleX * 100)}% × ${Math.round(frame.scaleY * 100)}%, opacity ${Math.round(frame.opacity * 100)}%, rotation ${Math.round(frame.rotation)}°`}
                      >
                        {Math.round(absolute)}
                        {activePropertyTrack
                          ? ` · ${Math.round(
                              propertyTrackValue(frame, activePropertyTrack),
                            )}${propertyTrackUnit(activePropertyTrack)}`
                          : ""}
                      </button>
                    );
                  })}
                  <small>
                    ms · {activePropertyTrack ?? "size / opacity / rotation"}
                  </small>
                </span>
              )}
            </>
          )}
          {selectedTimingLayers.length > 1 && (
            <>
              <strong>{selectedTimingLayers.length} layers selected</strong>
              <button type="button" onClick={() => alignSelected("start")}>
                Starts → playhead
              </button>
              <button type="button" onClick={() => alignSelected("end")}>
                Ends → playhead
              </button>
              <label>
                Stagger
                <input
                  aria-label="Layer stagger amount"
                  type="number"
                  min={0}
                  max={5000}
                  step={1}
                  value={staggerAmount}
                  onChange={(event) =>
                    setStaggerAmount(
                      Math.max(0, Math.min(5000, Number(event.target.value))),
                    )
                  }
                />
                ms
              </label>
              <button type="button" onClick={staggerSelected}>
                Apply stagger
              </button>
            </>
          )}
          {selectedMarker && (
            <div className="timeline-marker-editor">
              <Flag size={11} />
              <input
                key={`${selectedMarker.id}-${selectedMarker.label}`}
                aria-label="Marker label"
                maxLength={120}
                defaultValue={selectedMarker.label}
                onBlur={(event) =>
                  updateMarker(selectedMarker.id, {
                    label: event.target.value.trim() || "Timing marker",
                  })
                }
              />
              <input
                aria-label="Marker time"
                type="number"
                min={0}
                max={duration}
                step={1}
                value={Math.round(selectedMarker.time * 100) / 100}
                onChange={(event) =>
                  updateMarker(selectedMarker.id, {
                    time: Math.max(
                      0,
                      Math.min(duration, Number(event.target.value)),
                    ),
                  })
                }
              />
              <span>ms</span>
              <button
                type="button"
                aria-label={`Delete marker ${selectedMarker.label}`}
                onClick={() => {
                  onTimelineChange?.({
                    ...timeline,
                    markers: timeline.markers.filter(
                      (marker) => marker.id !== selectedMarker.id,
                    ),
                  });
                  setSelectedMarkerId(null);
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="timeline-grid">
        <div className="timeline-labels">
          <div className="timeline-ruler-spacer" />
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`timeline-group-label ${selectedGroupId === group.id ? "is-selected" : ""}`}
              onClick={() => onSelectGroup(group.id)}
            >
              <Boxes size={12} /> {group.name}
            </button>
          ))}
          {layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={
                effectiveTimingIds.includes(layer.id) ? "is-selected" : ""
              }
              onClick={(event) =>
                selectForTiming(
                  layer.id,
                  event.shiftKey || event.ctrlKey || event.metaKey,
                )
              }
              title="Click to select. Shift/Ctrl/Cmd-click selects several layers for choreography tools."
            >
              <span
                className={`layer-type-dot layer-type-dot--${layer.type}`}
              />
              {layer.name}
            </button>
          ))}
        </div>
        <div
          ref={trackRef}
          className="timeline-tracks"
          style={{ width: `${Math.round(zoom * 100)}%` }}
          onPointerDown={(event) => seekAt(event.clientX)}
        >
          <span
            className="timeline-work-range"
            style={{
              left: percent(effectiveWorkStart, duration),
              width: percent(effectiveWorkEnd - effectiveWorkStart, duration),
            }}
            aria-hidden="true"
          />
          <div className="timeline-ruler">
            {ticks.map((tick) => (
              <span key={tick} style={{ left: percent(tick, duration) }}>
                {(tick / 1000).toFixed(1)}s
              </span>
            ))}
            {timeline.markers.map((marker) => {
              const markerTime =
                markerDragPreview?.id === marker.id
                  ? markerDragPreview.time
                  : marker.time;
              return (
                <button
                  key={marker.id}
                  type="button"
                  className={`timeline-marker ${selectedMarkerId === marker.id ? "is-selected" : ""} ${markerTime > duration * 0.82 ? "is-near-end" : ""}`}
                  style={{ left: percent(markerTime, duration) }}
                  aria-label={`${marker.label}, ${Math.round(markerTime)} milliseconds`}
                  title={`${marker.label} · ${Math.round(markerTime)} ms. Drag to move.`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarkerId(marker.id);
                    onSeek(markerTime);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    const direction = event.key === "ArrowLeft" ? -1 : 1;
                    const nextTime =
                      event.ctrlKey || event.metaKey
                        ? nextMarkerTime(
                            markerTime,
                            direction as -1 | 1,
                            timeline.markers.filter(
                              (candidate) => candidate.id !== marker.id,
                            ),
                            duration,
                          )
                        : Math.max(
                            0,
                            Math.min(
                              duration,
                              markerTime +
                                direction * (event.shiftKey ? 10 : 1),
                            ),
                          );
                    updateMarker(marker.id, { time: nextTime });
                    onSeek(nextTime);
                  }}
                  onPointerDown={(event) => startMarkerDrag(event, marker)}
                >
                  <Flag size={9} />
                  <span>{marker.label}</span>
                </button>
              );
            })}
          </div>
          {groups.map((group) => {
            const previewDelay =
              groupDragPreview?.groupId === group.id
                ? groupDragPreview.delay
                : group.delay;
            const range = groupTimelineRange(
              { ...group, delay: previewDelay },
              layers,
            );
            const visibleEnd = Math.min(duration, range.end);
            return (
              <div
                key={group.id}
                className={`timeline-track timeline-group-track ${selectedGroupId === group.id ? "is-selected" : ""}`}
              >
                <span
                  className={`timeline-group-bar ${groupDragPreview?.groupId === group.id ? "is-dragging" : ""}`}
                  style={{
                    left: percent(range.start, duration),
                    width: percent(
                      Math.max(10, visibleEnd - range.start),
                      duration,
                    ),
                  }}
                  role="slider"
                  tabIndex={0}
                  aria-label={`Move ${group.name} on timeline`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(0, duration - 50)}
                  aria-valuenow={Math.round(previewDelay)}
                  aria-valuetext={`Group adds ${Math.round(previewDelay)} milliseconds`}
                  onKeyDown={(event) => moveGroupWithKeyboard(event, group)}
                  onPointerDown={(event) => startGroupDrag(event, group)}
                  title={`${group.name}: shared start offset ${Math.round(previewDelay)} ms. Drag to move every member.`}
                >
                  <Boxes size={11} />
                  <small>{group.name}</small>
                </span>
              </div>
            );
          })}
          {layers.map((layer) => {
            const preview =
              dragPreview?.layerId === layer.id ? dragPreview : null;
            const groupDelay =
              groups.find((group) => group.id === layer.groupId)?.delay ?? 0;
            const layerDelay = preview?.delay ?? layer.timing.delay;
            const delay = layerDelay + groupDelay;
            const layerDuration = preview?.duration ?? layer.timing.duration;
            return (
              <div
                key={layer.id}
                className={`timeline-track ${layer.startMode === "triggered" ? "is-triggered" : ""} ${effectiveTimingIds.includes(layer.id) ? "is-selected" : ""} ${lockedIds.has(layer.id) ? "is-locked" : ""}`}
              >
                <span
                  className={`timeline-bar timeline-bar--${layer.type} ${layer.type === "emitter" ? "is-repeating" : ""} ${preview ? "is-dragging" : ""}`}
                  style={{
                    left: percent(delay, duration),
                    width: percent(
                      Math.min(layerDuration, duration - delay),
                      duration,
                    ),
                  }}
                  role="slider"
                  tabIndex={lockedIds.has(layer.id) ? -1 : 0}
                  aria-disabled={lockedIds.has(layer.id)}
                  aria-label={
                    layer.startMode === "triggered"
                      ? `Change ${layer.name} delay after trigger`
                      : `Move ${layer.name} on timeline`
                  }
                  aria-valuemin={0}
                  aria-valuemax={Math.max(
                    0,
                    duration - Math.min(50, layerDuration),
                  )}
                  aria-valuenow={Math.round(delay)}
                  aria-valuetext={
                    layer.startMode === "triggered"
                      ? `Starts ${Math.round(delay)} milliseconds after its trigger`
                      : `Starts at ${Math.round(delay)} milliseconds`
                  }
                  onKeyDown={(event) => moveWithKeyboard(event, layer)}
                  onPointerDown={(event) => startDrag(event, layer, "move")}
                  title={
                    layer.startMode === "triggered"
                      ? `${layer.name}: relative timing — waits ${Math.round(delay)} ms after each trigger and lasts ${Math.round(layerDuration)} ms. Drag to change the event-relative delay.`
                      : `${layer.name}: starts at ${Math.round(delay)} ms and lasts ${Math.round(layerDuration)} ms. Drag to move it.`
                  }
                >
                  <i
                    className="timeline-handle start"
                    onPointerDown={(event) => startDrag(event, layer, "start")}
                  />
                  <small>
                    {preview
                      ? `${Math.round(delay)}–${Math.round(delay + layerDuration)} ms`
                      : layer.startMode === "triggered"
                        ? `After event · ${layer.name}`
                        : layer.name}
                  </small>
                  {layer.type !== "emitter" &&
                    layer.events
                      .filter((layerEvent) => layerEvent.enabled)
                      .map((layerEvent) => {
                        const position =
                          layerEvent.trigger === "start"
                            ? 0
                            : layerEvent.trigger === "percentage"
                              ? layerEvent.percentage * 100
                              : 100;
                        const targetName =
                          layers.find(
                            (candidate) =>
                              candidate.id === layerEvent.targetLayerId,
                          )?.name ?? "missing layer";
                        return (
                          <i
                            key={layerEvent.id}
                            className="timeline-event-pin"
                            style={{ left: `${position}%` }}
                            title={`${layerEvent.trigger === "percentage" ? `${Math.round(layerEvent.percentage * 100)}%` : layerEvent.trigger}: ${layerEvent.action} ${targetName}`}
                          />
                        );
                      })}
                  {layer.keyframes.enabled &&
                    layer.keyframes.frames.map((frame, index) => {
                      const previewTime =
                        keyframeDragPreview?.layerId === layer.id &&
                        keyframeDragPreview.index === index
                          ? keyframeDragPreview.time
                          : frame.time;
                      const fixed =
                        index === 0 ||
                        index === layer.keyframes.frames.length - 1;
                      const trackedValue = activePropertyTrack
                        ? ` · ${Math.round(
                            propertyTrackValue(frame, activePropertyTrack),
                          )}${propertyTrackUnit(activePropertyTrack)}`
                        : "";
                      return (
                        <button
                          type="button"
                          role="slider"
                          key={`${index}-${frame.time}`}
                          className={`timeline-keyframe ${fixed ? "is-fixed" : ""} ${selectedId === layer.id && selectedMomentIndex === index ? "is-selected" : ""}`}
                          style={{ left: `${previewTime * 100}%` }}
                          aria-label={`${fixed ? "Fixed" : "Move"} keyframe ${index + 1} for ${layer.name}`}
                          aria-valuemin={0}
                          aria-valuemax={layer.timing.duration}
                          aria-valuenow={Math.round(
                            previewTime * layer.timing.duration,
                          )}
                          title={`${Math.round(delay + previewTime * layer.timing.duration)} ms absolute · ${Math.round(previewTime * layer.timing.duration)} ms into layer${trackedValue}${fixed ? " (fixed)" : " — drag to move"}`}
                          tabIndex={fixed ? -1 : 0}
                          onPointerDown={(event) => {
                            if (selectedId === layer.id)
                              setSelectedMoment({ layerId: layer.id, index });
                            startKeyframeDrag(event, layer, index);
                          }}
                          onKeyDown={(event) =>
                            moveKeyframeWithKeyboard(event, layer, index)
                          }
                        />
                      );
                    })}
                  <i
                    className="timeline-handle end"
                    onPointerDown={(event) => startDrag(event, layer, "end")}
                  />
                </span>
              </div>
            );
          })}
          <span className="playhead" style={{ left: percent(time, duration) }}>
            <i />
          </span>
        </div>
      </div>
    </section>
  );
}
