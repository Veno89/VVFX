import { expect, test, type Download, type Page } from "@playwright/test";
import { validPngBytes, validStoredPngBytes } from "../fixtures/portableImages";

async function openEditor(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
  });
  await page.goto("/");
  await expect(page.locator(".vvfx-app")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Asset library" }),
  ).toBeVisible();
  await expect(page.locator(".phaser-mount canvas")).toBeVisible();
}

function imagePayload(name: string, bytes: Uint8Array) {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(bytes),
  };
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

test("@cross-browser canceling the image chooser leaves the project unchanged", async ({
  page,
}) => {
  await openEditor(page);
  const assets = page.locator(".asset-card");
  const before = await assets.count();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload images" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([]);

  await expect(
    page.getByRole("complementary", { name: "Asset library" }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(assets).toHaveCount(before);
});

test("accepts the aggregate embedded-image byte boundary and rejects the crossing file atomically", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const upload = page.locator('input[type="file"][multiple]');
  const bytes = validStoredPngBytes(1280, 1024);
  expect(bytes.byteLength).toBeLessThan(8 * 1024 * 1024);
  expect(bytes.byteLength * 4).toBeLessThanOrEqual(24 * 1024 * 1024);
  expect(bytes.byteLength * 5).toBeGreaterThan(24 * 1024 * 1024);

  await upload.setInputFiles(
    Array.from({ length: 4 }, (_, index) =>
      imagePayload(`byte-budget-${index + 1}.png`, bytes),
    ),
  );
  await expect(
    page
      .locator(".asset-preparation-notice")
      .filter({ hasText: "4 images added" }),
  ).toBeVisible({
    timeout: 60_000,
  });
  for (let index = 1; index <= 4; index += 1)
    await expect(
      page.getByRole("button", { name: `Select byte-budget-${index}` }),
    ).toBeVisible();

  await upload.setInputFiles(imagePayload("byte-budget-crossing.png", bytes));
  await expect(page.locator(".asset-preparation-notice")).toContainText(
    "Embedded project images are limited to 24 MB in total.",
  );
  await expect(
    page.getByRole("button", { name: "Select byte-budget-crossing" }),
  ).toHaveCount(0);
  for (let index = 1; index <= 4; index += 1)
    await expect(
      page.getByRole("button", { name: `Select byte-budget-${index}` }),
    ).toBeVisible();
});

test("accepts the aggregate decoded-pixel boundary and rejects the crossing file atomically", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  const upload = page.locator('input[type="file"][multiple]');
  const maximumTexture = validPngBytes(4096, 4096);

  await upload.setInputFiles([
    imagePayload("pixel-budget-a.png", maximumTexture),
    imagePayload("pixel-budget-b.png", maximumTexture),
  ]);
  await expect(
    page
      .locator(".asset-preparation-notice")
      .filter({ hasText: "2 images added" }),
  ).toBeVisible({
    timeout: 120_000,
  });

  await upload.setInputFiles(
    imagePayload("pixel-budget-crossing.png", validPngBytes(1, 1)),
  );
  await expect(page.locator(".asset-preparation-notice")).toContainText(
    "exceed the project's decoded texture budget",
  );
  await expect(
    page.getByRole("button", { name: "Select pixel-budget-crossing" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select pixel-budget-a" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select pixel-budget-b" }),
  ).toBeVisible();
});

test("@cross-browser sprite-sheet and atlas geometry survives the Runtime JSON boundary", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles(imagePayload("mapped-source.png", validPngBytes(128, 64)));
  await expect(
    page
      .locator(".asset-preparation-notice")
      .filter({ hasText: "mapped-source added" }),
  ).toBeVisible();

  const assetDetails = page.locator(".asset-card__details");
  await assetDetails
    .getByRole("checkbox", { name: "Use as a flipbook sprite sheet" })
    .check();
  await assetDetails.getByRole("spinbutton", { name: "Columns" }).fill("4");
  await assetDetails.getByRole("spinbutton", { name: "Rows" }).fill("2");
  await assetDetails.getByRole("spinbutton", { name: "Frames used" }).fill("7");
  await page
    .getByRole("button", { name: "Create a layer with mapped-source" })
    .click();

  const inspector = page.getByRole("complementary", {
    name: "Settings for mapped-source",
  });
  await inspector.getByText("Sprite frames", { exact: true }).click();
  await expect(inspector).toContainText("Source: 128");
  await expect(inspector).toContainText("Each frame is 32");
  await inspector
    .getByRole("spinbutton", { name: "Frames per second" })
    .fill("18");

  await page.getByRole("button", { name: /^Export/ }).click();
  let dialog = page.getByRole("dialog", { name: "Export effect" });
  await dialog.getByRole("tab", { name: /Runtime JSON/ }).click();
  let downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download .vvfx-runtime.json" })
    .click();
  const spriteRuntime = JSON.parse(await downloadText(await downloadPromise));
  const spriteAsset = spriteRuntime.assets.find(
    (asset: { name: string }) => asset.name === "mapped-source",
  );
  const spriteLayer = spriteRuntime.layers.find(
    (layer: { name: string }) => layer.name === "mapped-source",
  );
  expect(spriteAsset.spriteSheet).toEqual({
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 7,
  });
  expect(spriteAsset.atlasFrame).toBeNull();
  expect(spriteLayer.frameAnimation.framesPerSecond).toBe(18);
  await dialog.getByRole("button", { name: "Close export" }).click();

  await inspector
    .getByRole("switch", { name: "Use as a sprite sheet" })
    .click();
  await inspector.getByText("Game texture atlas", { exact: true }).click();
  await inspector
    .getByRole("textbox", { name: "Atlas frame name" })
    .fill("vfx/mapped-source-01");
  await page.getByRole("button", { name: /^Export/ }).click();
  dialog = page.getByRole("dialog", { name: "Export effect" });
  await dialog.getByRole("tab", { name: /Runtime JSON/ }).click();
  downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download .vvfx-runtime.json" })
    .click();
  const atlasRuntime = JSON.parse(await downloadText(await downloadPromise));
  const atlasAsset = atlasRuntime.assets.find(
    (asset: { name: string }) => asset.name === "mapped-source",
  );
  expect(atlasAsset.spriteSheet).toBeNull();
  expect(atlasAsset.atlasFrame).toBe("vfx/mapped-source-01");
});

test("@cross-browser reduced-motion preference keeps the editing workflow usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openEditor(page);
  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("menu", { name: "Add layer" })
    .getByRole("menuitem", { name: /^Magic projectile/ })
    .click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: /^Export/ }).click();
  const dialog = page.getByRole("dialog", { name: "Export effect" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("forced-colors emulation preserves focus, dialogs, and horizontal fit", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1024, height: 720 });
  await openEditor(page);
  expect(
    await page.evaluate(
      () => window.matchMedia("(forced-colors: active)").matches,
    ),
  ).toBe(true);

  const exportButton = page.getByRole("button", { name: /^Export/ });
  await exportButton.focus();
  const focusStyle = await exportButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");
  await exportButton.click();
  const dialog = page.getByRole("dialog", { name: "Export effect" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(exportButton).toBeFocused();

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("high-DPI rendering keeps the preview backing store and controls aligned", async ({
  browser,
}) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await openEditor(page);
    const canvas = page.locator(".phaser-mount canvas");
    const geometry = await canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      const bounds = target.getBoundingClientRect();
      return {
        backingWidth: target.width,
        backingHeight: target.height,
        cssWidth: bounds.width,
        cssHeight: bounds.height,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    expect(geometry.devicePixelRatio).toBe(2);
    expect(geometry.backingWidth).toBeGreaterThanOrEqual(geometry.cssWidth);
    expect(geometry.backingHeight).toBeGreaterThanOrEqual(geometry.cssHeight);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Export/ })).toBeVisible();
  } finally {
    await context.close();
  }
});
