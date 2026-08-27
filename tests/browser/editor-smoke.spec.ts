import { expect, test, type Page } from "@playwright/test";

const responsiveViewports = [
  { name: "small desktop", width: 1024, height: 720 },
  { name: "tablet", width: 768, height: 720 },
  { name: "phone", width: 390, height: 844 },
] as const;

async function openEditor(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
  });
  await page.goto("/");
  await expect(page.locator(".vvfx-app")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Asset library" }),
  ).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("vvfx-local", 3);
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

async function numericMetric(page: Page, testId: string) {
  return Number((await page.getByTestId(testId).textContent())?.trim() ?? NaN);
}

test("loads the editor, routes focus, and protects unsaved work", async ({
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

  await page.getByRole("textbox", { name: "Project name" }).fill("QA draft");
  await page.getByRole("button", { name: "New", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Start a new project?",
  });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  expect(pageErrors).toEqual([]);
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
  const footerBox = await footer.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(720);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
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

test("trail and 50× stress toggles return live objects to baseline without heap growth", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
  await cdp.send("HeapProfiler.collectGarbage");
  const heapBefore = (await cdp.send("Runtime.getHeapUsage")) as {
    usedSize: number;
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
  expect(heapAfter.usedSize - heapBefore.usedSize).toBeLessThan(
    8 * 1024 * 1024,
  );
  expect(pageErrors).toEqual([]);
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
  await page.keyboard.press("Escape");

  await addPreset(page, "Masked energy ring");
  const maskedPerformanceDialog = await openPerformanceInspector(page);
  await expect(
    maskedPerformanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Visual mask");
  await expect(
    maskedPerformanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Spatial gradient");
  await page.keyboard.press("Escape");

  await addPreset(page, "Dissolving spirit");
  const erosionPerformanceDialog = await openPerformanceInspector(page);
  await expect(
    erosionPerformanceDialog.getByTestId("performance-active-modifiers"),
  ).toContainText("Dissolve / erosion");
  await page.keyboard.press("Escape");

  for (let restart = 0; restart < 10; restart += 1)
    await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleProblems).toEqual([]);
});
