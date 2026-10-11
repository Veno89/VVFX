import vinext from "vinext";
import { defineConfig } from "vite";
import { htmlPlayer } from "./build/html-player-vite-plugin.ts";
import { sites } from "./build/sites-vite-plugin.ts";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  plugins: [vinext(), htmlPlayer(), sites()],
});
