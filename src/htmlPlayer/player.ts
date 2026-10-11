import type Phaser from "phaser";
import {
  playVvfx,
  validateRuntimeDefinition,
  type VvfxEffect,
} from "../../packages/phaser-runtime/src";
import { runtimeDefinitionToProject } from "../../packages/phaser-runtime/src/definition";
import { fitPreviewZoom } from "../vfx/previewFit";

/**
 * Entry point of the standalone web-page export. It is bundled into one
 * script at build time and runs in the exported .html file next to a global
 * Phaser, so it must not depend on anything from the editor at runtime.
 */

export interface HtmlPlayerConfig {
  /** Runtime JSON definition. */
  definition: unknown;
  loop: boolean;
}

type PhaserGlobal = typeof Phaser;

function pixelRatio() {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

function cssSize(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(bounds.width)),
    height: Math.max(1, Math.floor(bounds.height)),
  };
}

function showMessage(stage: HTMLElement, text: string) {
  const message = document.createElement("p");
  message.className = "vvfx-message";
  message.textContent = text;
  stage.replaceChildren(message);
}

export function mount(config: HtmlPlayerConfig) {
  const stage = document.getElementById("vvfx-stage");
  const replay = document.getElementById("vvfx-replay");
  const pause = document.getElementById("vvfx-pause");
  if (!stage) return;
  const PhaserLib = (window as unknown as { Phaser?: PhaserGlobal }).Phaser;
  if (!PhaserLib) {
    showMessage(
      stage,
      "Phaser could not be loaded. Connect to the internet and reload this page.",
    );
    return;
  }
  const validation = validateRuntimeDefinition(config.definition);
  if (!validation.ok || !validation.definition) {
    showMessage(stage, validation.error ?? "This effect could not be read.");
    return;
  }
  const definition = validation.definition;
  const project = runtimeDefinitionToProject(definition);
  let effect: VvfxEffect | null = null;

  const effectScale = () => {
    const { width, height } = cssSize(stage);
    return fitPreviewZoom(project, width, height);
  };

  const layout = (game: Phaser.Game) => {
    const scene = game.scene.getScenes(true)[0] as Phaser.Scene | undefined;
    if (!scene) return;
    const ratio = pixelRatio();
    const { width, height } = cssSize(stage);
    // Backing store at device resolution; world units stay CSS pixels.
    if (game.scale.zoom !== 1 / ratio) game.scale.setZoom(1 / ratio);
    if (
      game.scale.width !== width * ratio ||
      game.scale.height !== height * ratio
    )
      game.scale.resize(width * ratio, height * ratio);
    scene.cameras.main.setSize(width * ratio, height * ratio);
    if (scene.cameras.main.zoom !== ratio) scene.cameras.main.setZoom(ratio);
    effect?.setPosition(width / 2, height / 2).setScale(effectScale());
  };

  const updatePauseLabel = () => {
    if (!pause) return;
    const playing = effect?.isPlaying ?? false;
    pause.textContent = playing ? "Pause" : "Play";
    pause.setAttribute("aria-pressed", String(!playing));
  };

  const restart = () => {
    effect?.restart();
    updatePauseLabel();
  };
  const togglePause = () => {
    if (!effect) return;
    if (effect.isPlaying) effect.pause();
    else if (effect.currentTime === 0) effect.restart();
    else effect.play();
    updatePauseLabel();
  };

  const ratio = pixelRatio();
  const initial = cssSize(stage);
  const game = new PhaserLib.Game({
    type: PhaserLib.AUTO,
    parent: stage,
    transparent: true,
    render: { antialias: true, pixelArt: false },
    scale: {
      mode: PhaserLib.Scale.NONE,
      width: initial.width * ratio,
      height: initial.height * ratio,
      zoom: 1 / ratio,
    },
    scene: {
      create(this: Phaser.Scene) {
        this.cameras.main.setOrigin(0, 0).setZoom(ratio);
        const { width, height } = cssSize(stage);
        playVvfx(this, definition, {
          originX: width / 2,
          originY: height / 2,
          scale: effectScale(),
          loop: config.loop,
          autoDestroy: false,
          onComplete: updatePauseLabel,
        })
          .then((created) => {
            effect = created;
            updatePauseLabel();
          })
          .catch((error: unknown) =>
            showMessage(
              stage,
              error instanceof Error
                ? error.message
                : "This effect could not be played.",
            ),
          );
      },
    },
  });

  new ResizeObserver(() => layout(game)).observe(stage);
  stage.addEventListener("click", restart);
  replay?.addEventListener("click", restart);
  pause?.addEventListener("click", togglePause);
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePause();
    } else if (event.key.toLowerCase() === "r") restart();
  });
}
