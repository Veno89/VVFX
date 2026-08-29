export const LOCAL_BROWSER_TEST_PORT = 4173;
export const LOCAL_BROWSER_TEST_BASE_URL = `http://127.0.0.1:${LOCAL_BROWSER_TEST_PORT}`;

/** @typedef {{ VVFX_BROWSER_BASE_URL?: string }} BrowserTestEnvironment */

/** @param {BrowserTestEnvironment} [environment] */
export function resolveBrowserTestTarget(environment = process.env) {
  const supplied = environment.VVFX_BROWSER_BASE_URL?.trim();
  if (!supplied)
    return { baseURL: LOCAL_BROWSER_TEST_BASE_URL, managedServer: true };

  let url;
  try {
    url = new URL(supplied);
  } catch {
    throw new Error("VVFX_BROWSER_BASE_URL must be a valid HTTP(S) origin.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("VVFX_BROWSER_BASE_URL must use HTTP or HTTPS.");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "VVFX_BROWSER_BASE_URL must not contain credentials, a query, or a fragment.",
    );
  if (url.pathname !== "/")
    throw new Error("VVFX_BROWSER_BASE_URL must be an origin without a path.");

  return { baseURL: url.origin, managedServer: false };
}

/**
 * @param {{
 *   environment?: BrowserTestEnvironment;
 *   ensureLocalPortAvailable: () => unknown | Promise<unknown>;
 *   startLocalServer: () => unknown;
 *   waitForServer: (baseURL: string, server: unknown | null) => unknown | Promise<unknown>;
 *   runPlaywright: (baseURL: string) => unknown | Promise<unknown>;
 *   stopLocalServer: (server: unknown) => unknown | Promise<unknown>;
 * }} options
 */
export async function runBrowserTestFlow({
  environment = process.env,
  ensureLocalPortAvailable,
  startLocalServer,
  waitForServer,
  runPlaywright,
  stopLocalServer,
}) {
  const target = resolveBrowserTestTarget(environment);
  let server = null;
  if (target.managedServer) {
    await ensureLocalPortAvailable();
    server = startLocalServer();
  }

  try {
    await waitForServer(target.baseURL, server);
    return await runPlaywright(target.baseURL);
  } finally {
    if (server) await stopLocalServer(server);
  }
}
