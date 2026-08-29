import { describe, expect, it, vi } from "vitest";
import { createLatestOnlyAsyncQueue } from "../src/editor/latestOnlyAsyncQueue";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("latest-only async queue", () => {
  it("serializes work and skips superseded pending snapshots", async () => {
    const first = deferred();
    const latest = deferred();
    const activeCounts: number[] = [];
    const started: string[] = [];
    let active = 0;
    const run = vi.fn(async (value: string) => {
      started.push(value);
      active += 1;
      activeCounts.push(active);
      await (value === "first" ? first.promise : latest.promise);
      active -= 1;
    });
    const queue = createLatestOnlyAsyncQueue(run);

    queue.enqueue("first");
    queue.enqueue("superseded");
    queue.enqueue("latest");
    await Promise.resolve();
    expect(started).toEqual(["first"]);

    first.resolve();
    await vi.waitFor(() => expect(started).toEqual(["first", "latest"]));
    latest.resolve();
    await queue.whenIdle();

    expect(activeCounts).toEqual([1, 1]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("continues with the latest snapshot after an earlier write fails", async () => {
    const errors: Array<{ error: unknown; value: string }> = [];
    const run = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("storage busy"))
      .mockResolvedValue(undefined);
    const queue = createLatestOnlyAsyncQueue(run, (error, value) =>
      errors.push({ error, value }),
    );

    queue.enqueue("first");
    queue.enqueue("latest");
    await queue.whenIdle();

    expect(run.mock.calls).toEqual([["first"], ["latest"]]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.value).toBe("first");
  });
});
