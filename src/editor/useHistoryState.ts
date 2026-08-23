"use client";

import { useCallback, useState } from "react";

export interface HistoryState<T> {
  value: T;
  set: (next: T | ((current: T) => T)) => void;
  setTransient: (update: (current: T) => T) => void;
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
}

export function useHistoryState<T>(
  initialValue: T,
  limit = 80,
): HistoryState<T> {
  const [history, setHistory] = useState<HistorySnapshot<T>>({
    past: [],
    present: initialValue,
    future: [],
  });

  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      setHistory((current) => {
        const resolved =
          typeof next === "function"
            ? (next as (current: T) => T)(current.present)
            : next;
        if (Object.is(resolved, current.present)) return current;
        return {
          past: [...current.past.slice(-(limit - 1)), current.present],
          present: resolved,
          future: [],
        };
      });
    },
    [limit],
  );

  const replace = useCallback((next: T) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  const setTransient = useCallback((update: (current: T) => T) => {
    setHistory((current) => ({
      past: current.past.map(update),
      present: update(current.present),
      future: current.future.map(update),
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, limit),
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past.slice(-(limit - 1)), current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, [limit]);

  return {
    value: history.present,
    set,
    setTransient,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
