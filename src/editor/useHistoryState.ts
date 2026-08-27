"use client";

import { useCallback, useRef, useState } from "react";

export interface HistoryState<T> {
  value: T;
  set: (next: T | ((current: T) => T)) => void;
  setCoalesced: (next: T | ((current: T) => T)) => void;
  setTransient: (update: (current: T) => T) => void;
  beginInteraction: () => void;
  endInteraction: () => void;
  replace: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistorySnapshot<T> {
  past: T[];
  present: T;
  future: T[];
  lastInteractionId: number | null;
}

export function useHistoryState<T>(
  initialValue: T,
  limit = 80,
): HistoryState<T> {
  const activeInteractionId = useRef<number | null>(null);
  const nextInteractionId = useRef(1);
  const [history, setHistory] = useState<HistorySnapshot<T>>({
    past: [],
    present: initialValue,
    future: [],
    lastInteractionId: null,
  });

  const beginInteraction = useCallback(() => {
    activeInteractionId.current = nextInteractionId.current;
    nextInteractionId.current += 1;
  }, []);

  const endInteraction = useCallback(() => {
    activeInteractionId.current = null;
  }, []);

  const commit = useCallback(
    (next: T | ((current: T) => T), interactionId: number | null) => {
      setHistory((current) => {
        const resolved =
          typeof next === "function"
            ? (next as (current: T) => T)(current.present)
            : next;
        if (Object.is(resolved, current.present)) return current;
        const continuesInteraction =
          interactionId !== null && current.lastInteractionId === interactionId;
        return {
          past: continuesInteraction
            ? current.past
            : [...current.past.slice(-(limit - 1)), current.present],
          present: resolved,
          future: [],
          lastInteractionId: interactionId,
        };
      });
    },
    [limit],
  );

  const set = useCallback(
    (next: T | ((current: T) => T)) => commit(next, null),
    [commit],
  );

  const setCoalesced = useCallback(
    (next: T | ((current: T) => T)) =>
      commit(next, activeInteractionId.current),
    [commit],
  );

  const replace = useCallback((next: T) => {
    activeInteractionId.current = null;
    setHistory({
      past: [],
      present: next,
      future: [],
      lastInteractionId: null,
    });
  }, []);

  const setTransient = useCallback((update: (current: T) => T) => {
    setHistory((current) => ({
      past: current.past.map(update),
      present: update(current.present),
      future: current.future.map(update),
      lastInteractionId: current.lastInteractionId,
    }));
  }, []);

  const undo = useCallback(() => {
    activeInteractionId.current = null;
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, limit),
        lastInteractionId: null,
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    activeInteractionId.current = null;
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const next = current.future[0];
      return {
        past: [...current.past.slice(-(limit - 1)), current.present],
        present: next,
        future: current.future.slice(1),
        lastInteractionId: null,
      };
    });
  }, [limit]);

  return {
    value: history.present,
    set,
    setCoalesced,
    setTransient,
    beginInteraction,
    endInteraction,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
