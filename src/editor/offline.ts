/**
 * Registers the offline service worker on the hosted site. Plain-HTTP local
 * runs (development, tests, `vinext start`) skip it so they never serve a
 * cached build.
 */
export function registerOfflineSupport(
  location: Pick<Location, "protocol"> = window.location,
  navigatorLike: Pick<Navigator, "serviceWorker"> | undefined = navigator,
): Promise<boolean> {
  if (location.protocol !== "https:" || !navigatorLike?.serviceWorker)
    return Promise.resolve(false);
  return navigatorLike.serviceWorker
    .register("/sw.js")
    .then(() => true)
    .catch(() => false);
}
