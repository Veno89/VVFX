export type PlaybackTimeUpdate = number | ((current: number) => number);

export interface PlaybackClock {
  getSnapshot: () => number;
  set: (update: PlaybackTimeUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * A tiny external clock keeps 60 FPS playback updates out of the editor root.
 * Only the preview and timeline subscribe to it; authoring panels still render
 * when their actual inputs change.
 */
export function createPlaybackClock(initialTime = 0): PlaybackClock {
  let time = Number.isFinite(initialTime) ? initialTime : 0;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => time,
    set: (update) => {
      const next = typeof update === "function" ? update(time) : update;
      if (!Number.isFinite(next) || Object.is(next, time)) return;
      time = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
