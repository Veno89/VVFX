import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  playerScript,
  phaserIntegrity,
  phaserVersion,
} from "virtual:vvfx-html-player";
import {
  buildHtmlPlayerPage,
  createHtmlPlayerPage,
  fetchVerifiedPhaser,
  phaserCdnUrl,
} from "../src/editor/htmlPlayerExport";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { createRuntimeDefinition } from "../src/vfx/exporters";

const integrityOf = (text: string) =>
  `sha384-${createHash("sha384").update(text).digest("base64")}`;

const pageInput = () => ({
  title: "Fire </title><b>impact</b>",
  definition: JSON.stringify({ name: "</script><script>alert(1)</script>" }),
  playerScript: "var VvfxHtmlPlayer = { mount() {} }; // </script>",
  phaser: { kind: "inline" as const, source: "window.Phaser = {};" },
  background: "checkerboard",
  loop: true,
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("web page export", () => {
  it("bundles a standalone player against the pinned Phaser build", () => {
    expect(phaserVersion).toBe("4.2.1");
    expect(phaserIntegrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    expect(playerScript).toContain("VvfxHtmlPlayer");
    // The player carries the runtime but never Phaser itself.
    expect(playerScript.length).toBeLessThan(250_000);
    expect(playerScript).not.toMatch(/^import /m);
  });

  it("explains a missing Phaser instead of failing silently", () => {
    document.body.innerHTML = '<main id="vvfx-stage"></main>';
    window.eval(playerScript);
    const player = (window as unknown as Record<string, unknown>)
      .VvfxHtmlPlayer as { mount: (config: unknown) => void };
    player.mount({ definition: {}, loop: true });
    expect(document.querySelector(".vvfx-message")?.textContent).toMatch(
      /Phaser could not be loaded/,
    );
  });

  it("writes a page whose scripts and data cannot break out of their elements", () => {
    const page = createHtmlPlayerPage(pageInput());
    expect(page).toContain(
      "<title>Fire &lt;/title&gt;&lt;b&gt;impact&lt;/b&gt;</title>",
    );
    expect(page.match(/<\/script>/g)).toHaveLength(4);
    expect(page).toContain("<\\/script>");
    expect(page).toContain("\\u003c/script>\\u003cscript>alert(1)");
    expect(page).toContain("loop: true");
    expect(page).toContain("repeating-conic-gradient");

    const parsed = new DOMParser().parseFromString(page, "text/html");
    const data = parsed.getElementById("vvfx-effect")?.textContent ?? "";
    expect(JSON.parse(data).name).toBe("</script><script>alert(1)</script>");
    expect(parsed.getElementById("vvfx-stage")).not.toBeNull();
  });

  it("links Phaser with an integrity hash when the page is not offline", () => {
    const page = createHtmlPlayerPage({
      ...pageInput(),
      loop: false,
      background: "#123456",
      phaser: {
        kind: "cdn",
        url: phaserCdnUrl("4.2.1"),
        integrity: "sha384-abc",
      },
    });
    expect(page).toContain(
      '<script src="https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js" integrity="sha384-abc" crossorigin="anonymous"></script>',
    );
    expect(page).toContain("background: #123456");
    expect(page).toContain("loop: false");
  });

  it("inlines Phaser only when its bytes match the pinned fingerprint", async () => {
    const source = "window.Phaser = { VERSION: '4.2.1' };";
    const okFetch = vi.fn(async () => new Response(source));
    await expect(
      fetchVerifiedPhaser("4.2.1", integrityOf(source), okFetch),
    ).resolves.toBe(source);
    expect(okFetch).toHaveBeenCalledWith(phaserCdnUrl("4.2.1"));

    await expect(
      fetchVerifiedPhaser("4.2.1", integrityOf("other"), okFetch),
    ).rejects.toThrow(/did not match/);
    await expect(
      fetchVerifiedPhaser(
        "4.2.1",
        integrityOf(source),
        vi.fn(async () => new Response("", { status: 404 })),
      ),
    ).rejects.toThrow(/HTTP 404/);
    await expect(
      fetchVerifiedPhaser(
        "4.2.1",
        integrityOf(source),
        vi.fn(async () => {
          throw new TypeError("offline");
        }),
      ),
    ).rejects.toThrow(/Check your connection/);
  });

  it("builds a linked page from a project with its runtime definition", async () => {
    const project = createEmptyProject("Spark burst");
    project.layers.push(createLayer("burst", "Sparks", "builtin-spark"));
    project.preview.background = "black";
    const page = await buildHtmlPlayerPage(project, {
      offline: false,
      loop: true,
    });
    const parsed = new DOMParser().parseFromString(page, "text/html");
    expect(parsed.title).toBe("Spark burst");
    expect(
      JSON.parse(parsed.getElementById("vvfx-effect")!.textContent!),
    ).toEqual(createRuntimeDefinition(project));
    expect(page).toContain(`integrity="${phaserIntegrity}"`);
    expect(page).toContain("background: #000000");
  });
});
