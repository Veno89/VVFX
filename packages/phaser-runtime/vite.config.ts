import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // The editor's public/ files (manifest, service worker) are not runtime files.
  publicDir: false,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "vvfx-phaser-runtime",
    },
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ["phaser"],
    },
  },
});
