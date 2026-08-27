"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// More than one overlay can briefly coexist while editor state settles (for
// example, recovery plus first-run onboarding). Only the visually top region
// may own focus or Escape; otherwise asynchronous dialogs can move focus behind
// a newer overlay or two focus traps can bounce focus indefinitely.
interface ActiveRegion {
  container: HTMLElement;
  exposed: boolean;
  focusInitial: () => void;
  modal: boolean;
  originalAriaHidden: string | null;
  originalInert: boolean;
  surface: HTMLElement;
  token: symbol;
}

const activeRegionStack: ActiveRegion[] = [];
const hiddenModalBackground = new Map<
  HTMLElement,
  { ariaHidden: string | null; inert: boolean }
>();

function restoreModalBackground() {
  hiddenModalBackground.forEach((original, element) => {
    if (original.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", original.ariaHidden);
    if (original.inert) element.setAttribute("inert", "");
    else element.removeAttribute("inert");
  });
  hiddenModalBackground.clear();
}

function hideModalBackground(surface: HTMLElement) {
  let branch: HTMLElement = surface;
  while (branch.parentElement) {
    const parent = branch.parentElement;
    Array.from(parent.children).forEach((sibling) => {
      if (!(sibling instanceof HTMLElement) || sibling === branch) return;
      if (sibling.hasAttribute("data-modal-live-region")) return;
      if (!hiddenModalBackground.has(sibling))
        hiddenModalBackground.set(sibling, {
          ariaHidden: sibling.getAttribute("aria-hidden"),
          inert: sibling.hasAttribute("inert"),
        });
      sibling.setAttribute("aria-hidden", "true");
      sibling.setAttribute("inert", "");
    });
    if (parent === document.body) break;
    branch = parent;
  }
}

function restoreRegionExposure(region: ActiveRegion) {
  if (region.originalAriaHidden === null)
    region.container.removeAttribute("aria-hidden");
  else region.container.setAttribute("aria-hidden", region.originalAriaHidden);

  if (region.originalInert) region.container.setAttribute("inert", "");
  else region.container.removeAttribute("inert");
}

function stackingLevel(region: ActiveRegion) {
  const parsed = Number.parseInt(
    window.getComputedStyle(region.surface).zIndex,
    10,
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function topModalRegion() {
  return activeRegionStack
    .filter((region) => region.modal)
    .reduce<ActiveRegion | undefined>((top, candidate) => {
      if (!top) return candidate;
      const topLevel = stackingLevel(top);
      const candidateLevel = stackingLevel(candidate);
      if (candidateLevel !== topLevel)
        return candidateLevel > topLevel ? candidate : top;

      const position = top.surface.compareDocumentPosition(candidate.surface);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return candidate;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return top;
      return candidate;
    }, undefined);
}

function topInteractiveRegion() {
  return topModalRegion() ?? activeRegionStack.at(-1);
}

function syncModalExposure() {
  restoreModalBackground();
  const topModal = topModalRegion();
  activeRegionStack.forEach((region) => {
    if (!region.modal) {
      const belongsToTopModal =
        topModal?.surface.contains(region.container) ?? false;
      if (!topModal || belongsToTopModal) {
        region.exposed = true;
        restoreRegionExposure(region);
        return;
      }
      region.exposed = false;
      region.container.setAttribute("aria-hidden", "true");
      region.container.setAttribute("inert", "");
      return;
    }
    if (region === topModal) {
      region.exposed = true;
      restoreRegionExposure(region);
      return;
    }
    region.exposed = false;
    region.container.setAttribute("aria-hidden", "true");
    region.container.setAttribute("inert", "");
  });
  if (topModal) hideModalBackground(topModal.surface);
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest("[hidden], [inert], [aria-hidden='true']"),
  );
}

function isFocusableWithin(container: HTMLElement, element: HTMLElement) {
  return (
    container.contains(element) &&
    element.matches(FOCUSABLE_SELECTOR) &&
    element.tabIndex >= 0 &&
    !element.closest("[hidden], [inert], [aria-hidden='true']")
  );
}

function focusWithoutScrolling(element: HTMLElement | null | undefined) {
  element?.focus({ preventScroll: true });
}

export interface FocusRegionOptions {
  /** Allows popups that stay mounted in their parent to activate the behavior. */
  active?: boolean;
  /** Restarts focus handling when one mounted popup is replaced by another. */
  activationKey?: unknown;
  /** Modal dialogs trap Tab; menus and drawers should leave this false. */
  trapFocus?: boolean;
  /** Popups may opt out when focus must remain in the surrounding workspace. */
  autoFocus?: boolean;
  /** Escape can be temporarily disabled while an irreversible task is running. */
  escapeEnabled?: boolean;
  onEscape?: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
  /** Close a nonmodal surface when pointer interaction moves elsewhere. */
  dismissOnPointerOutside?: boolean;
  /** Close a nonmodal surface when Tab or another action moves focus away. */
  dismissOnFocusOutside?: boolean;
  /** Treat an associated trigger as part of the popup for outside dismissal. */
  dismissBoundaryRef?: RefObject<HTMLElement | null>;
}

/**
 * Provides the shared keyboard contract for Vvfx dialogs, drawers, and menus.
 * It intentionally leaves ordinary Tab movement to the browser and only
 * intercepts the two modal boundaries.
 */
export function useFocusRegion<T extends HTMLElement>({
  active = true,
  activationKey,
  trapFocus = true,
  autoFocus = true,
  escapeEnabled = true,
  onEscape,
  initialFocusRef,
  restoreFocus = true,
  dismissOnPointerOutside = false,
  dismissOnFocusOutside = false,
  dismissBoundaryRef,
}: FocusRegionOptions = {}): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);
  const escapeEnabledRef = useRef(escapeEnabled);
  const skipRestoreRef = useRef(false);
  const boundaryPointerPendingRef = useRef(false);
  const boundaryPointerResetRef = useRef<number | null>(null);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    escapeEnabledRef.current = escapeEnabled;
  }, [escapeEnabled]);

  useLayoutEffect(() => {
    if (!active) return;
    skipRestoreRef.current = false;
    boundaryPointerPendingRef.current = false;
    if (boundaryPointerResetRef.current !== null) {
      window.clearTimeout(boundaryPointerResetRef.current);
      boundaryPointerResetRef.current = null;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const container = containerRef.current;
    if (!container) return;
    const regionToken = Symbol("focus-region");
    const focusFirst = () => {
      const preferredCandidate = initialFocusRef?.current;
      const preferred =
        preferredCandidate && isFocusableWithin(container, preferredCandidate)
          ? preferredCandidate
          : null;
      const first = focusableElements(container)[0];
      if (!preferred && !first && !container.hasAttribute("tabindex"))
        container.tabIndex = -1;
      focusWithoutScrolling(preferred ?? first ?? container);
    };
    const region: ActiveRegion = {
      container,
      exposed: true,
      focusInitial: focusFirst,
      modal: trapFocus,
      originalAriaHidden: container.getAttribute("aria-hidden"),
      originalInert: container.hasAttribute("inert"),
      surface:
        container.closest<HTMLElement>(
          ".dialog-backdrop, .onboarding-overlay",
        ) ?? container,
      token: regionToken,
    };
    activeRegionStack.push(region);
    const isTopRegion = () => topInteractiveRegion()?.token === regionToken;

    if (autoFocus && isTopRegion()) focusFirst();
    syncModalExposure();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopRegion()) return;
      if (
        event.key === "Escape" &&
        (event.defaultPrevented ||
          (event.target instanceof Element &&
            event.target.closest("[data-focus-region-escape-owner]")) ||
          container.querySelector("[data-focus-region-escape-owner]"))
      )
        return;
      if (
        event.key === "Escape" &&
        escapeEnabledRef.current &&
        onEscapeRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (!trapFocus || event.key !== "Tab") return;

      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        focusWithoutScrolling(container);
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      const current = document.activeElement;
      if (
        event.shiftKey &&
        (current === first || !container.contains(current))
      ) {
        event.preventDefault();
        focusWithoutScrolling(last);
      } else if (
        !event.shiftKey &&
        (current === last || !container.contains(current))
      ) {
        event.preventDefault();
        focusWithoutScrolling(first);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (
        !isTopRegion() ||
        !(event.target instanceof Node) ||
        container.contains(event.target)
      )
        return;
      if (
        dismissBoundaryRef?.current?.contains(event.target) &&
        boundaryPointerPendingRef.current
      ) {
        boundaryPointerPendingRef.current = false;
        if (boundaryPointerResetRef.current !== null) {
          window.clearTimeout(boundaryPointerResetRef.current);
          boundaryPointerResetRef.current = null;
        }
        return;
      }
      if (trapFocus) {
        focusFirst();
        return;
      }
      if (dismissOnFocusOutside && onEscapeRef.current) {
        skipRestoreRef.current = true;
        onEscapeRef.current();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !isTopRegion() ||
        !dismissOnPointerOutside ||
        !(event.target instanceof Node) ||
        container.contains(event.target)
      )
        return;
      if (dismissBoundaryRef?.current?.contains(event.target)) {
        boundaryPointerPendingRef.current = true;
        if (boundaryPointerResetRef.current !== null)
          window.clearTimeout(boundaryPointerResetRef.current);
        boundaryPointerResetRef.current = window.setTimeout(() => {
          boundaryPointerPendingRef.current = false;
          boundaryPointerResetRef.current = null;
        }, 0);
        return;
      }
      if (!onEscapeRef.current) return;
      skipRestoreRef.current = true;
      onEscapeRef.current();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      if (boundaryPointerResetRef.current !== null) {
        window.clearTimeout(boundaryPointerResetRef.current);
        boundaryPointerResetRef.current = null;
      }
      boundaryPointerPendingRef.current = false;
      const regionIndex = activeRegionStack.findIndex(
        (candidate) => candidate.token === regionToken,
      );
      const wasTopRegion = region.modal
        ? region.exposed
        : topInteractiveRegion()?.token === regionToken;
      if (regionIndex >= 0) activeRegionStack.splice(regionIndex, 1);
      restoreRegionExposure(region);
      syncModalExposure();
      const nextTopRegion = topInteractiveRegion();
      const currentFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const focusStillBelongsToRegion =
        currentFocus === null ||
        currentFocus === document.body ||
        container.contains(currentFocus);
      if (
        restoreFocus &&
        !skipRestoreRef.current &&
        wasTopRegion &&
        focusStillBelongsToRegion &&
        previouslyFocused?.isConnected
      )
        focusWithoutScrolling(previouslyFocused);
      const restoredFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        wasTopRegion &&
        focusStillBelongsToRegion &&
        nextTopRegion?.modal &&
        !nextTopRegion.container.contains(restoredFocus)
      )
        nextTopRegion.focusInitial();
    };
  }, [
    active,
    activationKey,
    autoFocus,
    dismissOnFocusOutside,
    dismissOnPointerOutside,
    dismissBoundaryRef,
    initialFocusRef,
    restoreFocus,
    trapFocus,
  ]);

  return containerRef;
}
