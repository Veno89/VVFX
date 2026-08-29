export interface LatestOnlyAsyncQueue<T> {
  enqueue: (value: T) => void;
  clearPending: () => void;
  whenIdle: () => Promise<void>;
}

/**
 * Runs at most one async task at a time and retains only the newest pending
 * value. This is useful for snapshot work where intermediate states have no
 * value once a newer state exists.
 */
export function createLatestOnlyAsyncQueue<T>(
  run: (value: T) => Promise<void>,
  onError: (error: unknown, value: T) => void = () => undefined,
): LatestOnlyAsyncQueue<T> {
  let active = false;
  let pending: { value: T } | null = null;
  const idleWaiters = new Set<() => void>();

  const resolveIdle = () => {
    if (active || pending) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  };

  const drain = async () => {
    if (active) return;
    active = true;
    try {
      while (pending) {
        const next = pending.value;
        pending = null;
        try {
          await run(next);
        } catch (error) {
          onError(error, next);
        }
      }
    } finally {
      active = false;
      if (pending) void drain();
      else resolveIdle();
    }
  };

  return {
    enqueue: (value) => {
      pending = { value };
      void drain();
    },
    clearPending: () => {
      pending = null;
      resolveIdle();
    },
    whenIdle: () =>
      !active && !pending
        ? Promise.resolve()
        : new Promise<void>((resolve) => idleWaiters.add(resolve)),
  };
}
