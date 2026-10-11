import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { build, type Plugin, type Rollup } from "vite";

export const HTML_PLAYER_MODULE_ID = "virtual:vvfx-html-player";
const RESOLVED_ID = `\0${HTML_PLAYER_MODULE_ID}`;

/**
 * Bundles src/htmlPlayer/player.ts into one minified script for the web-page
 * export and exposes it as a string, together with the exact Phaser build the
 * page needs and its Subresource Integrity hash.
 */
export function htmlPlayer(): Plugin {
  let root = process.cwd();
  let cached: Promise<string> | null = null;

  const bundle = async () => {
    const result = await build({
      configFile: false,
      root,
      publicDir: false,
      logLevel: "silent",
      build: {
        write: false,
        emptyOutDir: false,
        minify: true,
        sourcemap: false,
        lib: {
          entry: resolve(root, "src/htmlPlayer/player.ts"),
          formats: ["iife"],
          name: "VvfxHtmlPlayer",
          fileName: "vvfx-html-player",
        },
        rollupOptions: { external: ["phaser"] },
      },
    });
    const outputs = (
      Array.isArray(result) ? result : [result]
    ) as Rollup.RollupOutput[];
    const chunk = outputs
      .flatMap((output) => output.output)
      .find((item): item is Rollup.OutputChunk => item.type === "chunk");
    if (!chunk) throw new Error("The HTML player bundle is empty.");
    return chunk.code;
  };

  return {
    name: "vvfx-html-player",
    configResolved(config) {
      root = config.root;
    },
    resolveId(source) {
      return source === HTML_PLAYER_MODULE_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      this.addWatchFile(resolve(root, "src/htmlPlayer/player.ts"));
      const require = createRequire(resolve(root, "package.json"));
      const phaserPackagePath = require.resolve("phaser/package.json");
      const phaserPackage = JSON.parse(
        await readFile(phaserPackagePath, "utf8"),
      ) as { version: string };
      const phaserMin = await readFile(
        resolve(dirname(phaserPackagePath), "dist", "phaser.min.js"),
      );
      const script = await (cached ??= bundle());
      return [
        `export const playerScript = ${JSON.stringify(script)};`,
        `export const phaserVersion = ${JSON.stringify(phaserPackage.version)};`,
        `export const phaserIntegrity = ${JSON.stringify(
          `sha384-${createHash("sha384").update(phaserMin).digest("base64")}`,
        )};`,
      ].join("\n");
    },
  };
}
