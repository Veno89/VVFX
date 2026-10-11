import { serializeRuntimeDefinition } from "../vfx/exporters";
import type { VfxProject } from "../vfx/types";
import { previewBackgroundHex } from "../preview/previewBackground";

/**
 * The "Web page" export: one .html file that plays the effect with the real
 * Phaser runtime. With offline on, Phaser is fetched from the CDN once at
 * export time, checked against its integrity hash, and inlined.
 */

export type HtmlPhaserSource =
  | { kind: "inline"; source: string }
  | { kind: "cdn"; url: string; integrity: string };

export interface HtmlPlayerPageInput {
  title: string;
  /** Runtime JSON text. */
  definition: string;
  playerScript: string;
  phaser: HtmlPhaserSource;
  /** "checkerboard" or a CSS hex color. */
  background: string;
  loop: boolean;
}

export const phaserCdnUrl = (version: string) =>
  `https://cdn.jsdelivr.net/npm/phaser@${version}/dist/phaser.min.js`;

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Keeps inline script text from closing its own <script> element. */
const inlineScript = (source: string) =>
  source.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** JSON is valid with every "<" escaped, so nothing can close the element. */
const inlineJson = (json: string) => json.replace(/</g, "\\u003c");

function stageBackground(background: string) {
  if (background !== "checkerboard")
    return /^#[0-9a-f]{6}$/i.test(background) ? background : "#141723";
  return `#171b24 repeating-conic-gradient(#202630 0 25%, transparent 0 50%) 0 0 / 24px 24px`;
}

export function createHtmlPlayerPage(input: HtmlPlayerPageInput): string {
  const title = escapeHtml(input.title.trim() || "Vvfx effect");
  const phaserTag =
    input.phaser.kind === "inline"
      ? `<script>${inlineScript(input.phaser.source)}</script>`
      : `<script src="${escapeHtml(input.phaser.url)}" integrity="${escapeHtml(input.phaser.integrity)}" crossorigin="anonymous"></script>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Vvfx">
<title>${title}</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; grid-template-rows: auto 1fr auto; background: #0d1017; color: #e8ecf4; }
  header, footer { display: flex; align-items: center; gap: 8px; padding: 10px 16px; }
  header h1 { margin: 0 auto 0 0; font-size: 1rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { min-height: 32px; padding: 0 14px; color: inherit; font: inherit; background: #1f2633; border: 1px solid #343e52; border-radius: 8px; cursor: pointer; }
  button:hover, button:focus-visible { background: #2a3345; }
  #vvfx-stage { position: relative; min-height: 0; overflow: hidden; cursor: pointer; background: ${stageBackground(input.background)}; }
  #vvfx-stage canvas { display: block; }
  .vvfx-message { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 24px; text-align: center; color: #ff9fb0; }
  footer { justify-content: space-between; font-size: 0.8125rem; color: #8e97a9; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <button type="button" id="vvfx-pause" aria-pressed="false">Pause</button>
  <button type="button" id="vvfx-replay">Replay</button>
</header>
<main id="vvfx-stage" aria-label="Effect preview. Click to replay."></main>
<footer><span>Space plays or pauses · R or a click replays</span><span>Made with Vvfx</span></footer>
${phaserTag}
<script>${inlineScript(input.playerScript)}</script>
<script type="application/json" id="vvfx-effect">${inlineJson(input.definition)}</script>
<script>
  VvfxHtmlPlayer.mount({
    definition: JSON.parse(document.getElementById("vvfx-effect").textContent),
    loop: ${input.loop ? "true" : "false"},
  });
</script>
</body>
</html>
`;
}

async function sha384Base64(data: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", data));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Downloads the exact Phaser build and refuses anything else. */
export async function fetchVerifiedPhaser(
  version: string,
  integrity: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(phaserCdnUrl(version));
  } catch {
    throw new Error(
      "Phaser could not be downloaded for offline use. Check your connection, or turn off Works offline.",
    );
  }
  if (!response.ok)
    throw new Error(
      `Phaser could not be downloaded for offline use (HTTP ${response.status}). Turn off Works offline to link it instead.`,
    );
  const data = await response.arrayBuffer();
  if (`sha384-${await sha384Base64(data)}` !== integrity)
    throw new Error(
      "The downloaded Phaser file did not match its expected fingerprint, so it was not included.",
    );
  return new TextDecoder().decode(data);
}

export async function buildHtmlPlayerPage(
  project: VfxProject,
  { offline, loop }: { offline: boolean; loop: boolean },
): Promise<string> {
  const { playerScript, phaserVersion, phaserIntegrity } =
    await import("virtual:vvfx-html-player");
  const phaser: HtmlPhaserSource = offline
    ? {
        kind: "inline",
        source: await fetchVerifiedPhaser(phaserVersion, phaserIntegrity),
      }
    : {
        kind: "cdn",
        url: phaserCdnUrl(phaserVersion),
        integrity: phaserIntegrity,
      };
  return createHtmlPlayerPage({
    title: project.metadata.name,
    definition: serializeRuntimeDefinition(project),
    playerScript,
    phaser,
    background:
      project.preview.background === "checkerboard"
        ? "checkerboard"
        : previewBackgroundHex(project),
    loop,
  });
}
