import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { createRuntimeDefinition } from "../src/vfx/exporters";

const runtime = vi.hoisted(() => ({
  playVvfx: vi.fn(),
}));
vi.mock("../packages/phaser-runtime/src", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../packages/phaser-runtime/src")>()),
  playVvfx: runtime.playVvfx,
}));

import { mount } from "../src/htmlPlayer/player";

function fakeEffect() {
  const effect = {
    isPlaying: true,
    currentTime: 120,
    restart: vi.fn(() => {
      effect.isPlaying = true;
      effect.currentTime = 0;
      return effect;
    }),
    pause: vi.fn(() => {
      effect.isPlaying = false;
      return effect;
    }),
    play: vi.fn(() => {
      effect.isPlaying = true;
      return effect;
    }),
    setPosition: vi.fn(() => effect),
    setScale: vi.fn(() => effect),
  };
  return effect;
}

function installFakePhaser() {
  const camera = {
    zoom: 1,
    setOrigin: vi.fn(() => camera),
    setZoom: vi.fn((zoom: number) => {
      camera.zoom = zoom;
      return camera;
    }),
    setSize: vi.fn(() => camera),
  };
  const scene = { cameras: { main: camera } };
  const games: { config: Record<string, unknown> }[] = [];
  class Game {
    scale = {
      zoom: 1,
      width: 0,
      height: 0,
      setZoom: vi.fn(),
      resize: vi.fn(),
    };
    scene = { getScenes: () => [scene] };
    constructor(public config: Record<string, unknown>) {
      games.push(this);
      (config.scene as { create: (this: unknown) => void }).create.call(scene);
    }
  }
  vi.stubGlobal("Phaser", { Game, AUTO: 0, Scale: { NONE: 0 } });
  return { games, camera };
}

let resize: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = `
    <button id="vvfx-pause">Pause</button>
    <button id="vvfx-replay">Replay</button>
    <main id="vvfx-stage"></main>`;
  resize = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  runtime.playVvfx.mockReset();
});

const definition = () => {
  const project = createEmptyProject("Player");
  project.layers.push(createLayer("animated", "Flash", "builtin-flash"));
  return createRuntimeDefinition(project);
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("HTML player", () => {
  it("explains invalid effect data", () => {
    installFakePhaser();
    mount({ definition: { format: "nope" }, loop: true });
    expect(document.querySelector(".vvfx-message")?.textContent).not.toBe("");
    expect(runtime.playVvfx).not.toHaveBeenCalled();
  });

  it("plays the effect centered and wires pause, replay, and keys", async () => {
    installFakePhaser();
    const effect = fakeEffect();
    runtime.playVvfx.mockResolvedValue(effect);
    mount({ definition: definition(), loop: false });
    await flush();

    const options = runtime.playVvfx.mock.calls[0][2];
    expect(options).toMatchObject({ loop: false, autoDestroy: false });
    expect(options.scale).toBeGreaterThan(0);
    const pause = document.getElementById("vvfx-pause")!;
    expect(pause.textContent).toBe("Pause");

    pause.click();
    expect(effect.pause).toHaveBeenCalled();
    expect(pause.textContent).toBe("Play");
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    pause.click();
    expect(effect.play).toHaveBeenCalled();

    document.getElementById("vvfx-replay")!.click();
    document.getElementById("vvfx-stage")!.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    expect(effect.restart).toHaveBeenCalledTimes(3);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(effect.isPlaying).toBe(false);
    // A finished one-shot starts over instead of resuming at its end.
    effect.currentTime = 0;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(effect.restart).toHaveBeenCalledTimes(4);

    resize?.();
    expect(effect.setPosition).toHaveBeenCalled();
    expect(effect.setScale).toHaveBeenCalled();
    options.onComplete();
  });

  it("shows playback errors on the stage", async () => {
    installFakePhaser();
    runtime.playVvfx.mockRejectedValue(new Error("Texture failed"));
    mount({ definition: definition(), loop: true });
    await flush();
    expect(document.querySelector(".vvfx-message")?.textContent).toBe(
      "Texture failed",
    );
  });
});
