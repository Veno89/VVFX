import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_NAME, DB_VERSION, openDatabase } from "../src/persistence/database";

describe("browser database connections", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("releases an idle connection when another tab requests a newer schema", async () => {
    const currentDatabase = await openDatabase();
    const upgradeRequest = indexedDB.open(DB_NAME, DB_VERSION + 1);
    const upgradeFinished = new Promise<IDBDatabase>((resolve, reject) => {
      upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
      upgradeRequest.onerror = () =>
        reject(upgradeRequest.error ?? new Error("Database upgrade failed."));
    });
    const upgradeOutcome = new Promise<"blocked" | "upgraded">((resolve) => {
      upgradeRequest.onblocked = () => resolve("blocked");
      upgradeRequest.onupgradeneeded = () => resolve("upgraded");
    });

    const outcome = await upgradeOutcome;
    currentDatabase.close();
    const upgradedDatabase = await upgradeFinished;
    upgradedDatabase.close();

    expect(outcome).toBe("upgraded");
  });

  it("reports a legacy tab that blocks an upgrade and closes the late handle", async () => {
    const legacyDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION - 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Legacy database setup failed."));
    });

    const blockedUpgrade = openDatabase();
    await expect(blockedUpgrade).rejects.toThrow(
      /open in another tab.*close other Vvfx tabs/i,
    );

    legacyDatabase.close();
    const retriedDatabase = await openDatabase();
    expect(retriedDatabase.version).toBe(DB_VERSION);
    retriedDatabase.close();
  });
});
