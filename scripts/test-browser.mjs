import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
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

await new Promise((resolveAvailable, rejectUnavailable) => {
  const probe = createServer();
  probe.once("error", () =>
    rejectUnavailable(
      new Error(`Browser-test port ${port} is already in use.`),
    ),
  );
  probe.listen(port, "127.0.0.1", () => probe.close(resolveAvailable));
});

const server = spawn(
  process.execPath,
  [vinextCli, "start", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);

let stopped = false;

async function stopServer() {
  if (stopped || !server.pid) return;
  stopped = true;
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

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(
        `The production server exited with code ${server.exitCode}.`,
      );
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`The production server did not become ready at ${baseURL}.`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopServer().finally(() =>
      process.exit(signal === "SIGINT" ? 130 : 143),
    );
  });
}

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await new Promise((resolveExit, rejectExit) => {
    const tests = spawn(process.execPath, [playwrightCli, "test"], {
      cwd: repositoryRoot,
      env: { ...process.env, VVFX_BROWSER_BASE_URL: baseURL },
      stdio: "inherit",
      windowsHide: true,
    });
    tests.once("error", rejectExit);
    tests.once("exit", (code) => resolveExit(code ?? 1));
  });
} finally {
  await stopServer();
}

process.exit(exitCode);
