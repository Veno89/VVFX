import type Phaser from "phaser";
import type { VvfxRuntimeAsset, VvfxRuntimeDefinition } from "./types";
import { applySpriteSheetFrames } from "../../../src/vfx/phaserFrames";

type BuiltInKind = NonNullable<VvfxRuntimeAsset["builtIn"]>;

function generateTexture(
  scene: Phaser.Scene,
  key: string,
  draw: (graphics: Phaser.GameObjects.Graphics) => void,
) {
  if (scene.textures.exists(key)) return;
  const graphics = scene.add.graphics().setVisible(false);
  draw(graphics);
  graphics.generateTexture(key, 128, 128);
  graphics.destroy();
}

export function createBuiltInTexture(
  scene: Phaser.Scene,
  key: string,
  kind: BuiltInKind,
) {
  generateTexture(scene, key, (graphics) => {
    if (kind === "flash") {
      graphics.fillStyle(0xffffff, 0.08).fillCircle(64, 64, 60);
      graphics.fillStyle(0xffffff, 0.16).fillCircle(64, 64, 46);
      graphics.fillStyle(0xffffff, 0.35).fillCircle(64, 64, 30);
      graphics.fillStyle(0xffffff, 0.95).fillCircle(64, 64, 13);
    } else if (kind === "ring") {
      graphics.lineStyle(9, 0xffffff, 0.17).strokeCircle(64, 64, 46);
      graphics.lineStyle(3, 0xffffff, 0.95).strokeCircle(64, 64, 46);
    } else if (kind === "spark") {
      graphics.fillStyle(0xffffff, 0.16).fillRoundedRect(9, 51, 110, 26, 13);
      graphics.fillStyle(0xffffff, 0.95).fillRoundedRect(17, 59, 94, 10, 5);
    } else {
      graphics
        .fillStyle(0xffffff, 0.18)
        .fillCircle(44, 68, 34)
        .fillCircle(76, 54, 38)
        .fillCircle(92, 76, 28);
      graphics
        .fillStyle(0xffffff, 0.34)
        .fillCircle(61, 69, 29)
        .fillCircle(79, 70, 24);
    }
  });
}

export function createMissingTexture(scene: Phaser.Scene) {
  generateTexture(scene, "vvfx-missing", (graphics) => {
    graphics.fillStyle(0x211f30, 1).fillRoundedRect(20, 20, 88, 88, 16);
    graphics.lineStyle(5, 0xff6d8d, 0.9).strokeRoundedRect(20, 20, 88, 88, 16);
    graphics.lineBetween(40, 40, 88, 88).lineBetween(88, 40, 40, 88);
  });
}

async function loadBase64Texture(
  scene: Phaser.Scene,
  key: string,
  source: string,
) {
  if (scene.textures.exists(key)) return;
  await new Promise<void>((resolve, reject) => {
    const loaded = (loadedKey: string) => {
      if (loadedKey !== key) return;
      cleanup();
      resolve();
    };
    const failed = (failedKey: string) => {
      if (failedKey !== key) return;
      cleanup();
      reject(new Error(`Vvfx could not load the image “${key}”.`));
    };
    const cleanup = () => {
      scene.textures.off("onload", loaded);
      scene.textures.off("onerror", failed);
    };
    scene.textures.on("onload", loaded);
    scene.textures.on("onerror", failed);
    scene.textures.addBase64(key, source);
  });
}

export async function loadVvfxAssets(
  scene: Phaser.Scene,
  definition: VvfxRuntimeDefinition,
  assetKeys: Record<string, string> = {},
): Promise<void> {
  createMissingTexture(scene);
  for (const asset of definition.assets) {
    const textureKey = assetKeys[asset.id] ?? asset.id;
    if (scene.textures.exists(textureKey)) {
      applySpriteSheetFrames(scene.textures.get(textureKey), asset);
      continue;
    }
    if (assetKeys[asset.id])
      throw new Error(
        `The mapped Phaser texture “${textureKey}” for “${asset.name}” is not loaded.`,
      );
    if (asset.builtIn) {
      createBuiltInTexture(scene, textureKey, asset.builtIn);
      continue;
    }
    if (!asset.source.startsWith("data:image/"))
      throw new Error(
        `The image “${asset.name}” needs an embedded data URL or an assetKeys mapping.`,
      );
    await loadBase64Texture(scene, textureKey, asset.source);
    applySpriteSheetFrames(scene.textures.get(textureKey), asset);
  }
}
