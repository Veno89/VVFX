import { expect, test, type Locator, type Page } from "@playwright/test";

const responsiveViewports = [
  { name: "small desktop", width: 1024, height: 720 },
  { name: "tablet", width: 768, height: 720 },
  { name: "phone", width: 390, height: 844 },
] as const;

async function openEditor(page: Page, path = "/") {
  await page.addInitScript(() => {
    window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
  });
  await page.goto(path);
  await expect(page.locator(".vvfx-app")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Asset library" }),
  ).toBeVisible();
  await expect(page.locator(".phaser-mount canvas")).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("vvfx-local", 4);
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

async function addPreset(page: Page, name: string) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("menu", { name: "Add layer" })
    .getByRole("menuitem", { name: new RegExp(`^${name}`) })
    .click();
}

async function openPerformanceInspector(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Effect performance and stress test",
  });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Effect performance" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closePerformanceInspector(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Reset measured peak" }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function numericMetric(page: Page, testId: string) {
  return Number((await page.getByTestId(testId).textContent())?.trim() ?? NaN);
}

test("@cross-browser loads the editor, routes focus, and protects unsaved work", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openEditor(page);
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe("BODY");

  const newButton = page.getByRole("button", { name: "New", exact: true });
  await newButton.focus();
  await page.keyboard.press("Tab");
  await expect(newButton).not.toBeFocused();

  await page.getByRole("textbox", { name: "Project name" }).fill("QA draft");
  await newButton.click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Start a new project?",
  });
  await expect(confirmation).toBeVisible();
  const keepEditing = confirmation.getByRole("button", {
    name: "Keep editing",
    exact: true,
  });
  const discardChanges = confirmation.getByRole("button", {
    name: "Discard changes and start new",
  });
  await expect(keepEditing).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(discardChanges).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(keepEditing).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("two editor tabs preserve concurrent project saves", async ({
  context,
  page,
}) => {
  const secondPage = await context.newPage();
  try {
    await Promise.all([openEditor(page), openEditor(secondPage)]);
    await Promise.all([
      page
        .getByRole("textbox", { name: "Project name" })
        .fill("Concurrent tab A"),
      secondPage
        .getByRole("textbox", { name: "Project name" })
        .fill("Concurrent tab B"),
    ]);
    await Promise.all([
      page.getByRole("button", { name: "Save", exact: true }).click(),
      secondPage.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    await Promise.all(
      [page, secondPage].map((editorPage) =>
        expect(
          editorPage.getByRole("status").filter({
            hasText: "Project saved in this browser.",
          }),
        ).toBeAttached(),
      ),
    );

    for (const editorPage of [page, secondPage]) {
      await editorPage
        .getByRole("button", { name: "Load", exact: true })
        .click();
      const projectsDialog = editorPage.getByRole("dialog", {
        name: "Load a saved project",
      });
      await expect(
        projectsDialog.getByText("Concurrent tab A", { exact: true }),
      ).toBeVisible();
      await expect(
        projectsDialog.getByText("Concurrent tab B", { exact: true }),
      ).toBeVisible();
    }
  } finally {
    await secondPage.close();
  }
});

for (const viewport of responsiveViewports) {
  test(`${viewport.name} keeps project actions reachable without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openEditor(page);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(
      dimensions.clientWidth + 1,
    );
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Export/ })).toBeVisible();

    await page.getByRole("button", { name: "Actions", exact: true }).click();
    const menu = page.getByRole("menu", { name: "More project actions" });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Templates", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
}

test("layer actions escape clipping and provide accessible reordering", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await addPreset(page, "Magic projectile");

  const layerNames = page.locator(".layer-name-button strong");
  await expect.poll(() => layerNames.count()).toBeGreaterThanOrEqual(2);
  const orderBefore = await layerNames.allTextContents();
  const movingLayerName = orderBefore[1];
  await page
    .locator(".layer-name-button")
    .filter({ hasText: movingLayerName })
    .click();

  const solo = page.getByRole("button", { name: `Solo ${movingLayerName}` });
  await expect(solo).toHaveAttribute("aria-pressed", "false");
  await solo.click();
  await expect(solo).toHaveAttribute("aria-pressed", "true");

  const actionsTrigger = page.getByRole("button", {
    name: `Actions for ${movingLayerName}`,
  });
  await actionsTrigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", {
    name: `Actions for ${movingLayerName}`,
  });
  await expect(menu).toBeVisible();
  const rename = menu.getByRole("menuitem", { name: "Rename", exact: true });
  const duplicate = menu.getByRole("menuitem", {
    name: "Duplicate",
    exact: true,
  });
  const deleteLayer = menu.getByRole("menuitem", {
    name: "Delete",
    exact: true,
  });
  await expect(rename).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(duplicate).toBeFocused();
  await page.keyboard.press("End");
  await expect(deleteLayer).toBeFocused();
  await page.keyboard.press("Home");
  await expect(rename).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(actionsTrigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(rename).toBeFocused();
  await expect(menu).toHaveCSS("position", "fixed");
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.y).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1280);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(720);

  await menu
    .getByRole("menuitem", {
      name: new RegExp(
        `^Bring ${movingLayerName} forward, currently position 2 of ${orderBefore.length}`,
      ),
    })
    .click();
  await expect(menu).toBeHidden();
  await expect
    .poll(() => page.locator(".layer-name-button strong").allTextContents())
    .toEqual([movingLayerName, orderBefore[0], ...orderBefore.slice(2)]);
  await expect(
    page.getByRole("status").filter({
      hasText: `${movingLayerName} moved forward to position 1 of ${orderBefore.length}.`,
    }),
  ).toBeAttached();
});

test("the template library footer remains reachable at 720px height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await page.getByRole("button", { name: "Templates", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Effect templates" });
  const footer = dialog.locator(":scope > footer");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(footer).toBeVisible();
  const builtInInsertNames = await dialog
    .locator(".template-list--built-in .primary-action")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
  expect(builtInInsertNames).toHaveLength(7);
  expect(new Set(builtInInsertNames).size).toBe(7);
  expect(builtInInsertNames).toContain("Insert Magic impact copy");
  const footerBox = await footer.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(720);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("@cross-browser feature removal starts cleanly and remains reversible", async ({
  page,
}) => {
  await openEditor(page);
  await addPreset(page, "Neon projectile");

  await page.getByText("Motion trail", { exact: true }).click();
  const removeTrail = page.getByRole("button", {
    name: "Remove motion trail",
  });
  await expect(removeTrail).toBeVisible();
  await removeTrail.click();
  await expect(removeTrail).toBeHidden();

  const glowChip = page.getByRole("button", { name: "Outer glow" });
  await glowChip.click();
  await expect(
    page.getByRole("heading", { name: "Outer glow", exact: true }),
  ).toBeFocused();
  const removeGlow = page.getByRole("button", { name: "Remove effect" });
  await expect(removeGlow).toBeVisible();
  await removeGlow.click();
  await expect(glowChip).toBeHidden();

  let performanceDialog = await openPerformanceInspector(page);
  await performanceDialog.getByText("Lifecycle diagnostic").click();
  const activeModifiers = performanceDialog.getByTestId(
    "performance-active-modifiers",
  );
  await expect(activeModifiers).not.toContainText("Motion trail");
  await expect(activeModifiers).not.toContainText("Outer glow");
  await expect
    .poll(() => numericMetric(page, "performance-trail-sprites"))
    .toBe(0);
  await closePerformanceInspector(page, performanceDialog);

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByText("Motion trail", { exact: true }).click();
  await expect(removeTrail).toBeVisible();
  await expect(glowChip).toBeVisible();
  await glowChip.click();
  await expect(removeGlow).toBeVisible();
  performanceDialog = await openPerformanceInspector(page);
  await performanceDialog.getByText("Lifecycle diagnostic").click();
  await expect(
    performanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Motion trail");
  await expect(
    performanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Outer glow");
  await closePerformanceInspector(page, performanceDialog);

  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByText("Motion trail", { exact: true }).click();
  await expect(removeTrail).toBeHidden();
  await expect(glowChip).toBeHidden();
});

test("professional workspace settings persist and export preflight follows its target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);

  const leftResize = page.getByRole("separator", {
    name: "Resize left workspace rail",
  });
  await leftResize.focus();
  await page.keyboard.press("End");
  await expect(leftResize).toHaveAttribute("aria-valuenow", "420");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = window.localStorage.getItem("vvfx-workspace-v1");
        return stored ? JSON.parse(stored).leftWidth : null;
      }),
    )
    .toBe(420);

  await page.reload();
  await expect(page.locator(".vvfx-app")).toBeVisible();
  await expect(
    page.getByRole("separator", { name: "Resize left workspace rail" }),
  ).toHaveAttribute("aria-valuenow", "420");

  await addPreset(page, "Magic projectile");
  const search = page.getByRole("searchbox", { name: "Search layers" });
  await search.fill("missing layer query");
  await expect(
    page.getByText("No matching layers", { exact: true }),
  ).toBeVisible();
  await search.fill("");
  await page.getByRole("button", { name: "Folder", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: /^Rename folder/ }),
  ).toBeVisible();

  await page.locator(".timeline-property-details > summary").click();
  await page
    .getByRole("combobox", { name: "Timeline property track" })
    .selectOption("opacity");
  await expect(
    page.getByRole("combobox", { name: "Timeline property track" }),
  ).toHaveValue("opacity");

  await page.getByRole("button", { name: /^Export/ }).click();
  const preflight = page.getByRole("region", { name: "Export preflight" });
  await expect(preflight).toBeVisible();
  await preflight
    .getByRole("combobox", { name: "Profile" })
    .selectOption("mobile");
  await expect(preflight).toContainText(
    "Conservative budget for several effects on modest devices.",
  );
  await expect(preflight).toContainText("Visible content");
});

test("GIF export completes in its worker and pointer-down or Escape cancels later exports", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const downloads: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Target.setDiscoverTargets", { discover: true });
  const activeWorkerCount = async () => {
    const targets = (await cdp.send("Target.getTargets")) as {
      targetInfos: Array<{ type: string }>;
    };
    return targets.targetInfos.filter((target) => target.type === "worker")
      .length;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await addPreset(page, "Magic projectile");
  await page.getByRole("button", { name: /^Export/ }).click();
  const dialog = page.getByRole("dialog", { name: "Export effect" });
  await dialog.getByRole("combobox", { name: "Format" }).selectOption("gif");
  await dialog
    .getByRole("combobox", { name: "Size and aspect ratio" })
    .selectOption("game");

  const firstDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export & download .gif" }).click();
  const downloaded = await firstDownload;
  expect(downloaded.suggestedFilename()).toMatch(/\.gif$/);
  await expect(dialog.getByRole("status")).toContainText("Downloaded");
  await expect.poll(activeWorkerCount).toBe(0);

  await dialog
    .getByRole("combobox", { name: "Size and aspect ratio" })
    .selectOption("hd");
  await dialog.getByRole("button", { name: "Export & download .gif" }).click();
  await expect(
    dialog.getByRole("button", { name: "Cancel export" }),
  ).toBeFocused();
  const cancel = dialog.getByRole("button", { name: "Cancel export" });
  const cancelBounds = await cancel.boundingBox();
  expect(cancelBounds).not.toBeNull();
  await page.mouse.move(
    cancelBounds!.x + cancelBounds!.width / 2,
    cancelBounds!.y + cancelBounds!.height / 2,
  );
  await page.mouse.down();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Preview export canceled.",
  );
  await page.mouse.up();
  await expect(
    dialog.getByRole("button", { name: "Export & download .gif" }),
  ).toBeVisible();
  await page.waitForTimeout(300);

  expect(downloads).toHaveLength(1);
  await expect.poll(activeWorkerCount).toBe(0);

  await dialog.getByRole("button", { name: "Export & download .gif" }).click();
  await expect(
    dialog.getByRole("button", { name: "Cancel export" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("alert")).toHaveText(
    "Preview export canceled.",
  );
  await expect(
    dialog.getByRole("button", { name: "Export & download .gif" }),
  ).toBeFocused();
  await page.waitForTimeout(300);

  expect(downloads).toHaveLength(1);
  await expect.poll(activeWorkerCount).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("effect lanes stay compact and expose per-copy timing controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await addPreset(page, "Neon projectile");
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  if (await pause.isVisible()) await pause.click();

  const expand = page.getByRole("button", {
    name: /^Expand \d+ effects? for Neon projectile$/,
  });
  await expect(expand).toHaveAttribute("title", /inside each copy/i);
  await expand.click();

  const lanes = page.getByRole("group", {
    name: "Effects inside each copy of Neon projectile",
  });
  await expect(lanes).toBeVisible();
  const glow = lanes.getByRole("button", {
    name: "Select Outer glow effect on Neon projectile",
  });
  const playheadBefore = await page
    .locator(".timeline-time-readout strong")
    .textContent();
  await glow.click();
  await expect(glow).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".timeline-time-readout strong")).toHaveText(
    playheadBefore ?? "",
  );

  await expect(
    page.getByRole("slider", {
      name: "Move Outer glow effect inside each copy of Neon projectile",
    }),
  ).toBeVisible();
  const endHandle = page.getByRole("slider", {
    name: "Resize end of Outer glow effect inside each copy of Neon projectile",
  });
  const endBefore = Number(await endHandle.getAttribute("aria-valuenow"));
  await endHandle.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect
    .poll(async () => Number(await endHandle.getAttribute("aria-valuenow")))
    .toBeLessThan(endBefore);
});

test("effect authoring restores focus and stays reversible", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("menu", { name: "Add layer" })
    .getByRole("menuitem", { name: /^Still image/ })
    .click();

  const addEffect = page.getByRole("button", {
    name: "Add effect",
    exact: true,
  });
  await expect(addEffect).toBeVisible();
  await addEffect.click();
  const palette = page.getByRole("dialog", {
    name: "Add an effect to Unnamed",
  });
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(addEffect).toBeFocused();

  await addEffect.click();
  await palette
    .getByRole("button", {
      name: /Add Outer glow: Add a soft colored halo/,
    })
    .click();

  const heading = page.getByRole("heading", {
    name: "Outer glow",
    exact: true,
  });
  await expect(heading).toBeFocused();
  await expect(
    page.getByRole("group", {
      name: "Effects inside each copy of Unnamed",
    }),
  ).toBeVisible();

  const back = page.getByRole("button", {
    name: "Back to Unnamed settings",
  });
  await back.click();
  let glowChip = page.getByRole("button", {
    name: "Outer glow",
    exact: true,
  });
  await expect(glowChip).toBeFocused();

  await glowChip.click();
  const glowEnabled = page.getByRole("switch", { name: "Soft outer glow" });
  await expect(glowEnabled).toHaveAttribute("aria-checked", "true");
  await glowEnabled.click();
  await expect(glowEnabled).toHaveAttribute("aria-checked", "false");
  await back.click();
  glowChip = page.getByRole("button", {
    name: "Outer glow, Off",
    exact: true,
  });
  await expect(glowChip).toBeVisible();

  await glowChip.click();
  await page.getByRole("button", { name: "Remove effect" }).click();
  await expect(addEffect).toBeFocused();
  await expect(glowChip).toBeHidden();

  await page.getByRole("button", { name: "Undo" }).click();
  glowChip = page.getByRole("button", {
    name: "Outer glow, Off",
    exact: true,
  });
  await expect(glowChip).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(glowChip).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("trail and 50× stress toggles return live objects to baseline without heap growth", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page);
  await addPreset(page, "Magic projectile");
  await page.getByText("Motion trail", { exact: true }).click();

  const trailToggle = page.getByRole("switch", {
    name: "Leave a motion trail",
  });
  await expect(trailToggle).toHaveAttribute("aria-checked", "true");
  let performanceDialog = await openPerformanceInspector(page);
  await performanceDialog.getByText("Lifecycle diagnostic").click();
  await expect(
    performanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Motion trail");
  await expect
    .poll(() => numericMetric(page, "performance-trail-sprites"), {
      timeout: 8_000,
    })
    .toBeGreaterThan(0);

  await performanceDialog.getByRole("button", { name: "50×" }).click();
  await expect
    .poll(() => numericMetric(page, "performance-live-sprites"))
    .toBeGreaterThan(0);
  expect(
    await numericMetric(page, "performance-live-sprites"),
  ).toBeLessThanOrEqual(2_000);

  for (let cycle = 0; cycle < 10; cycle += 1) {
    await performanceDialog.getByRole("button", { name: "1×" }).click();
    await performanceDialog.getByRole("button", { name: "50×" }).click();
  }
  await performanceDialog.getByRole("button", { name: "1×" }).click();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const heapBefore = (await cdp.send("Runtime.getHeapUsage")) as {
    usedSize: number;
  };
  const performanceBefore = (await cdp.send("Performance.getMetrics")) as {
    metrics: Array<{ name: string; value: number }>;
  };

  for (let cycle = 0; cycle < 50; cycle += 1) {
    await trailToggle.click();
    await trailToggle.click();
  }
  await trailToggle.click();
  await expect(trailToggle).toHaveAttribute("aria-checked", "false");
  performanceDialog = await openPerformanceInspector(page);
  await expect
    .poll(() => numericMetric(page, "performance-trail-sprites"))
    .toBe(0);
  await trailToggle.click();
  await expect(trailToggle).toHaveAttribute("aria-checked", "true");
  performanceDialog = await openPerformanceInspector(page);
  await expect
    .poll(() => numericMetric(page, "performance-trail-sprites"), {
      timeout: 8_000,
    })
    .toBeGreaterThan(0);

  await cdp.send("HeapProfiler.collectGarbage");
  const heapAfter = (await cdp.send("Runtime.getHeapUsage")) as {
    usedSize: number;
  };
  const performanceAfter = (await cdp.send("Performance.getMetrics")) as {
    metrics: Array<{ name: string; value: number }>;
  };
  const beforeMetrics = new Map(
    performanceBefore.metrics.map((metric) => [metric.name, metric.value]),
  );
  const afterMetrics = new Map(
    performanceAfter.metrics.map((metric) => [metric.name, metric.value]),
  );
  expect(heapAfter.usedSize - heapBefore.usedSize).toBeLessThan(
    8 * 1024 * 1024,
  );
  expect(afterMetrics.get("Documents")).toBe(beforeMetrics.get("Documents"));
  expect(
    (afterMetrics.get("JSEventListeners") ?? 0) -
      (beforeMetrics.get("JSEventListeners") ?? 0),
  ).toBeLessThanOrEqual(4);
  expect(
    (afterMetrics.get("Nodes") ?? 0) - (beforeMetrics.get("Nodes") ?? 0),
  ).toBeLessThanOrEqual(200);
  expect(pageErrors).toEqual([]);
});

test("@cross-browser Canvas fallback keeps ordinary sprites and warns once", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const canvasWarnings: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.text().includes("need Phaser WebGL"))
      canvasWarnings.push(message.text());
  });

  await openEditor(page, "/?renderer=canvas");
  await addPreset(page, "Heat shimmer ring");
  await expect.poll(() => canvasWarnings.length).toBe(1);

  const canvasState = await page
    .locator(".phaser-mount canvas")
    .evaluate((canvas) => {
      const target = canvas as HTMLCanvasElement;
      const context = target.getContext("2d");
      if (!context) return null;
      const pixels = context.getImageData(
        0,
        0,
        target.width,
        target.height,
      ).data;
      let nonTransparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) nonTransparentPixels += 1;
      }
      return { nonTransparentPixels };
    });
  expect(canvasState?.nonTransparentPixels).toBeGreaterThan(0);

  for (let restart = 0; restart < 3; restart += 1)
    await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.locator(".phaser-mount canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("experimental effects run in WebGL and repeated restart keeps one canvas", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleProblems: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      message
        .text()
        .includes("Vvfx could not start its Phaser 4 rendering filters")
    )
      consoleProblems.push(message.text());
  });
  await openEditor(page);
  await addPreset(page, "Heat shimmer ring");

  const webgl = await page.locator("canvas").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("webgl2") ?? target.getContext("webgl");
    if (!context) return null;
    const extension = context.getExtension("WEBGL_debug_renderer_info");
    return {
      version: context.getParameter(context.VERSION) as string,
      renderer: extension
        ? (context.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string)
        : "WebGL renderer details unavailable",
    };
  });
  expect(webgl?.version).toMatch(/WebGL/i);

  const performanceDialog = await openPerformanceInspector(page);
  await performanceDialog.getByText("Lifecycle diagnostic").click();
  await expect(
    performanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Sprite warp");
  await closePerformanceInspector(page, performanceDialog);

  await addPreset(page, "Masked energy ring");
  const maskedPerformanceDialog = await openPerformanceInspector(page);
  await expect(
    maskedPerformanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Visual mask");
  await expect(
    maskedPerformanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Spatial gradient");
  await closePerformanceInspector(page, maskedPerformanceDialog);

  await addPreset(page, "Dissolving spirit");
  const erosionPerformanceDialog = await openPerformanceInspector(page);
  await expect(
    erosionPerformanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Dissolve / erosion");
  await closePerformanceInspector(page, erosionPerformanceDialog);

  for (let restart = 0; restart < 10; restart += 1)
    await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleProblems).toEqual([]);
});
