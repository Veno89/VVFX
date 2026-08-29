import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_BROWSER_TEST_PORT,
  runBrowserTestFlow,
} from "./browser-test-runner.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vinextCli = resolve(
  repositoryRoot,
  "node_modules",
  "vinext",
  "dist",
  "cli.js",
);
const playwrightCli = resolve(
  repositoryRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

let activeServer = null;
let stoppedServer = false;

async function ensureLocalPortAvailable() {
  await new Promise((resolveAvailable, rejectUnavailable) => {
    const probe = createServer();
    probe.once("error", () =>
      rejectUnavailable(
        new Error(
          `Browser-test port ${LOCAL_BROWSER_TEST_PORT} is already in use.`,
        ),
      ),
    );
    probe.listen(LOCAL_BROWSER_TEST_PORT, "127.0.0.1", () =>
      probe.close(resolveAvailable),
    );
  });
}

function startLocalServer() {
  stoppedServer = false;
  activeServer = spawn(
    process.execPath,
    [
      vinextCli,
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(LOCAL_BROWSER_TEST_PORT),
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  return activeServer;
}

async function stopLocalServer(server) {
  if (stoppedServer || !server.pid) return;
  stoppedServer = true;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => server.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function waitForServer(baseURL, server) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined)
      throw new Error(
        `The production server exited with code ${server.exitCode}.`,
      );
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // The server is still starting or an external target is not ready yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`The production server did not become ready at ${baseURL}.`);
}

async function runPlaywright(baseURL) {
  return new Promise((resolveExit, rejectExit) => {
    const tests = spawn(process.execPath, [playwrightCli, "test"], {
      cwd: repositoryRoot,
      env: { ...process.env, VVFX_BROWSER_BASE_URL: baseURL },
      stdio: "inherit",
      windowsHide: true,
    });
    tests.once("error", rejectExit);
    tests.once("exit", (code) => resolveExit(code ?? 1));
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    const exitCode = signal === "SIGINT" ? 130 : 143;
    if (!activeServer) process.exit(exitCode);
    void stopLocalServer(activeServer).finally(() => process.exit(exitCode));
  });
}

const exitCode = await runBrowserTestFlow({
  environment: process.env,
  ensureLocalPortAvailable,
  startLocalServer,
  waitForServer,
  runPlaywright,
  stopLocalServer,
});

process.exit(exitCode);
