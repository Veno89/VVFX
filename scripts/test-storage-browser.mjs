import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const temporaryPrefix = "vvfx-storage-qualification-";
const projectName = "Persistent rollback sentinel";
const corruptProjectId = "corrupt-storage-qualification-record";

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} exited with code ${result.status ?? "unknown"}.`,
    );
}

async function ensurePortAvailable() {
  await new Promise((resolveAvailable, rejectUnavailable) => {
    const probe = createServer();
    probe.once("error", () =>
      rejectUnavailable(
        new Error(`Storage-test port ${port} is already in use.`),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolveAvailable));
  });
}

async function waitForPortAvailable() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await ensurePortAvailable();
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  throw new Error(`Owned storage-test server did not release port ${port}.`);
}

function startServer(root) {
  const vinextCli = join(root, "node_modules", "vinext", "dist", "cli.js");
  return spawn(
    process.execPath,
    [vinextCli, "start", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
}

async function waitForServer(server) {
  const deadline = Date.now() + 60_000;
  let output = "";
  server.stdout?.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-8_000);
  });
  server.stderr?.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-8_000);
  });
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(
        `Production server exited with code ${server.exitCode}.\n${output}`,
      );
    try {
      const response = await fetch(origin, { cache: "no-store" });
      if (response.ok) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        if (server.exitCode === null) return;
      }
    } catch {
      // The owned server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(
    `Production server did not become ready at ${origin}.\n${output}`,
  );
}

async function stopServer(server) {
  if (!server || !server.pid || server.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (server.exitCode === null)
      await Promise.race([
        new Promise((resolveExit) => server.once("exit", resolveExit)),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
      ]);
    return;
  }
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => server.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function openEditor(context) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem("vvfx-onboarding-complete-v1", "true");
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator(".vvfx-app").waitFor({ state: "visible" });
  await page.locator(".phaser-mount canvas").waitFor({ state: "visible" });
  return { page, cdp };
}

async function readProjectRecord(page, expectedName = projectName) {
  return page.evaluate(
    ({ name }) =>
      new Promise((resolveRecord, rejectRecord) => {
        const request = indexedDB.open("vvfx-local");
        request.onerror = () => rejectRecord(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const all = database
            .transaction("projects", "readonly")
            .objectStore("projects")
            .getAll();
          all.onerror = () => {
            database.close();
            rejectRecord(all.error);
          };
          all.onsuccess = () => {
            const project = all.result.find(
              (candidate) => candidate?.metadata?.name === name,
            );
            database.close();
            if (!project) {
              rejectRecord(new Error(`Could not find saved project ${name}.`));
              return;
            }
            resolveRecord({
              databaseVersion: database.version,
              id: project.metadata.id,
              serialized: JSON.stringify(project),
            });
          };
        };
      }),
    { name: expectedName },
  );
}

async function insertCorruptProject(page) {
  await page.evaluate(
    ({ id }) =>
      new Promise((resolveWrite, rejectWrite) => {
        const request = indexedDB.open("vvfx-local");
        request.onerror = () => rejectWrite(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("projects", "readwrite");
          transaction.objectStore("projects").put({ metadata: { id } });
          transaction.oncomplete = () => {
            database.close();
            resolveWrite();
          };
          transaction.onerror = () => {
            database.close();
            rejectWrite(transaction.error);
          };
        };
      }),
    { id: corruptProjectId },
  );
}

async function hasRawProject(page, id) {
  return page.evaluate(
    ({ projectId }) =>
      new Promise((resolveRecord, rejectRecord) => {
        const request = indexedDB.open("vvfx-local");
        request.onerror = () => rejectRecord(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const get = database
            .transaction("projects", "readonly")
            .objectStore("projects")
            .get(projectId);
          get.onsuccess = () => {
            database.close();
            resolveRecord(get.result !== undefined);
          };
          get.onerror = () => {
            database.close();
            rejectRecord(get.error);
          };
        };
      }),
    { projectId: id },
  );
}

async function assertRecordUnchanged(page, original) {
  const current = await readProjectRecord(page);
  if (current.id !== original.id || current.serialized !== original.serialized)
    throw new Error("The healthy saved-project record changed unexpectedly.");
}

async function buildHistoricalRevision(temporaryRoot) {
  const manifest = JSON.parse(
    await readFile(
      join(repositoryRoot, "release", "version-pairs.json"),
      "utf8",
    ),
  );
  const rollback = manifest.pairs.find(
    (pair) => pair.id === manifest.rollbackPair,
  );
  if (!rollback?.editorRevision)
    throw new Error(
      "The rollback editor revision is missing from the manifest.",
    );
  const historicalRoot = join(temporaryRoot, "historical");
  const archive = join(temporaryRoot, "historical.tar");
  await mkdir(historicalRoot);
  runChecked("git", [
    "archive",
    "--format=tar",
    `--output=${archive}`,
    rollback.editorRevision,
  ]);
  runChecked("tar", ["-xf", archive, "-C", historicalRoot], {
    cwd: temporaryRoot,
  });
  const historicalDatabaseSource = await readFile(
    join(historicalRoot, "src", "persistence", "database.ts"),
    "utf8",
  );
  if (!historicalDatabaseSource.includes("DB_VERSION = 3"))
    throw new Error(
      "The rollback revision no longer identifies browser DB v3.",
    );
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(historicalRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  runChecked(
    process.execPath,
    [join(historicalRoot, "node_modules", "vinext", "dist", "cli.js"), "build"],
    { cwd: historicalRoot },
  );
  return { historicalRoot, revision: rollback.editorRevision };
}

await ensurePortAvailable();
const temporaryRoot = await mkdtemp(join(tmpdir(), temporaryPrefix));
if (basename(temporaryRoot).startsWith(temporaryPrefix) === false)
  throw new Error("Refusing to use an unexpected temporary directory.");

let browserContext = null;
let activeServer = null;
let historical = null;
const profileRoot = join(temporaryRoot, "profile");
try {
  activeServer = startServer(repositoryRoot);
  await waitForServer(activeServer);
  browserContext = await chromium.launchPersistentContext(profileRoot, {
    headless: true,
  });

  let opened = await openEditor(browserContext);
  await opened.page
    .getByRole("textbox", { name: "Project name" })
    .fill(projectName);
  await opened.page.getByRole("button", { name: "Save", exact: true }).click();
  await opened.page
    .locator(".toast")
    .filter({ hasText: "Project saved in this browser." })
    .waitFor();
  const healthyRecord = await readProjectRecord(opened.page);
  if (healthyRecord.databaseVersion !== 4)
    throw new Error(
      `The current build opened DB v${healthyRecord.databaseVersion} instead of DB v4.`,
    );
  await opened.page.close();

  await stopServer(activeServer);
  await waitForPortAvailable();
  activeServer = startServer(repositoryRoot);
  await waitForServer(activeServer);
  opened = await openEditor(browserContext);
  await opened.page.getByRole("button", { name: "Load", exact: true }).click();
  let projectsDialog = opened.page.getByRole("dialog", {
    name: "Load a saved project",
  });
  await projectsDialog.getByText(projectName, { exact: true }).waitFor();
  await projectsDialog
    .getByRole("button", { name: new RegExp(`^${projectName}`) })
    .click();
  await opened.page
    .getByRole("textbox", { name: "Project name" })
    .waitFor({ state: "visible" });
  if (
    (await opened.page
      .getByRole("textbox", { name: "Project name" })
      .inputValue()) !== projectName
  )
    throw new Error("The restarted server could not load the saved project.");
  await assertRecordUnchanged(opened.page, healthyRecord);

  await insertCorruptProject(opened.page);
  opened.page.once("dialog", (dialog) => dialog.accept());
  await opened.page.getByRole("button", { name: "Load", exact: true }).click();
  projectsDialog = opened.page.getByRole("dialog", {
    name: "Load a saved project",
  });
  await projectsDialog.getByText("1 unreadable project save found").waitFor();
  await projectsDialog.getByText(projectName, { exact: true }).waitFor();
  await projectsDialog
    .getByRole("button", { name: "Remove unreadable" })
    .click();
  await projectsDialog
    .getByText("1 unreadable project save found")
    .waitFor({ state: "detached" });
  if (await hasRawProject(opened.page, corruptProjectId))
    throw new Error(
      "The explicitly removed corrupt project record still exists.",
    );
  await assertRecordUnchanged(opened.page, healthyRecord);
  await projectsDialog
    .getByRole("button", { name: "Close project list" })
    .click();

  await opened.page.close();
  await browserContext.close();
  browserContext = null;

  historical = await buildHistoricalRevision(temporaryRoot);
  await stopServer(activeServer);
  await waitForPortAvailable();
  activeServer = startServer(historical.historicalRoot);
  await waitForServer(activeServer);
  browserContext = await chromium.launchPersistentContext(profileRoot, {
    headless: true,
  });
  opened = await openEditor(browserContext);
  const downgradeError = await opened.page.evaluate(
    () =>
      new Promise((resolveDowngrade) => {
        const request = indexedDB.open("vvfx-local", 3);
        request.onerror = () =>
          resolveDowngrade(request.error?.name ?? "Error");
        request.onsuccess = () => {
          request.result.close();
          resolveDowngrade("unexpected-success");
        };
      }),
  );
  if (downgradeError !== "VersionError")
    throw new Error(
      `The rollback DB v3 open produced ${downgradeError} instead of VersionError.`,
    );
  await assertRecordUnchanged(opened.page, healthyRecord);
  await opened.page.close();
  await browserContext.close();
  browserContext = null;

  await stopServer(activeServer);
  await waitForPortAvailable();
  activeServer = startServer(repositoryRoot);
  await waitForServer(activeServer);
  browserContext = await chromium.launchPersistentContext(profileRoot, {
    headless: true,
  });
  opened = await openEditor(browserContext);
  await opened.page.getByRole("button", { name: "Load", exact: true }).click();
  projectsDialog = opened.page.getByRole("dialog", {
    name: "Load a saved project",
  });
  await projectsDialog.getByText(projectName, { exact: true }).waitFor();
  await projectsDialog
    .getByRole("button", { name: new RegExp(`^${projectName}`) })
    .click();
  await opened.page
    .getByRole("textbox", { name: "Project name" })
    .waitFor({ state: "visible" });
  if (
    (await opened.page
      .getByRole("textbox", { name: "Project name" })
      .inputValue()) !== projectName
  )
    throw new Error("The current build could not load the preserved project.");
  await assertRecordUnchanged(opened.page, healthyRecord);
  await opened.page.close();

  console.log(
    `Storage qualification passed: restart, corrupt-record isolation, and ${historical.revision} rollback preservation.`,
  );
} finally {
  await browserContext?.close().catch(() => undefined);
  await stopServer(activeServer).catch(() => undefined);
  if (basename(temporaryRoot).startsWith(temporaryPrefix))
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    });
}

// Playwright's persistent Chromium transport can retain an idle Windows pipe
// after every owned browser and server has closed. The qualification has no
// reusable process state, so terminate explicitly once teardown is complete.
process.exit(0);
