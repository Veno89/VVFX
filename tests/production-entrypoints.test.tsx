import { describe, expect, it } from "vitest";
import Home, { metadata as pageMetadata } from "../app/page";
import RootLayout, { metadata as layoutMetadata } from "../app/layout";
import { sites } from "../build/sites-vite-plugin";
import nextConfig from "../next.config";
import runtimeViteConfig from "../packages/phaser-runtime/vite.config";
import viteConfig from "../vite.config";

describe("production entrypoints", () => {
  it("keeps the editor route and document shell importable", () => {
    expect(Home()).toMatchObject({ type: expect.any(Function) });
    expect(RootLayout({ children: "editor" })).toMatchObject({
      type: "html",
    });
    expect(pageMetadata.title).toContain("Vvfx");
    expect(layoutMetadata.description).toContain("Phaser");
  });

  it("keeps production build configuration executable", () => {
    expect(nextConfig).toEqual({});
    expect(viteConfig).toMatchObject({ plugins: expect.any(Array) });
    expect(runtimeViteConfig).toMatchObject({
      build: {
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: { external: ["phaser"] },
      },
    });
    expect(sites()).toMatchObject({ name: "sites", apply: "build" });
  });
});
