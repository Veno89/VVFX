import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { registerOfflineSupport } from "../src/editor/offline";

describe("offline support", () => {
  it("registers the service worker only on HTTPS", async () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    const navigatorLike = {
      serviceWorker: { register } as unknown as ServiceWorkerContainer,
    };
    await expect(
      registerOfflineSupport({ protocol: "http:" }, navigatorLike),
    ).resolves.toBe(false);
    expect(register).not.toHaveBeenCalled();
    await expect(
      registerOfflineSupport({ protocol: "https:" }, navigatorLike),
    ).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("treats a missing or failing service worker as no offline support", async () => {
    await expect(
      registerOfflineSupport({ protocol: "https:" }, {} as Navigator),
    ).resolves.toBe(false);
    const failing = {
      serviceWorker: {
        register: vi.fn(async () => {
          throw new Error("blocked");
        }),
      } as unknown as ServiceWorkerContainer,
    };
    await expect(
      registerOfflineSupport({ protocol: "https:" }, failing),
    ).resolves.toBe(false);
  });

  it("ships an installable manifest whose icon exists", () => {
    const manifest = JSON.parse(
      readFileSync("public/manifest.webmanifest", "utf8"),
    ) as { start_url: string; display: string; icons: { src: string }[] };
    expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
    for (const icon of manifest.icons)
      expect(readFileSync(`public${icon.src}`, "utf8")).toContain("<svg");
    const worker = readFileSync("public/sw.js", "utf8");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain("/_next/static/");
  });
});
