"use client";

import { useEffect, useRef, type RefObject } from "react";

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
}: FocusRegionOptions = {}): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);
  const escapeEnabledRef = useRef(escapeEnabled);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    escapeEnabledRef.current = escapeEnabled;
  }, [escapeEnabled]);

  useEffect(() => {
    if (!active) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const container = containerRef.current;
    if (!container) return;
    const regionToken = Symbol("focus-region");
    const focusFirst = () => {
      const preferred = initialFocusRef?.current;
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
        isTopRegion() &&
        trapFocus &&
        event.target instanceof Node &&
        !container.contains(event.target)
      )
        focusFirst();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
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
    initialFocusRef,
    restoreFocus,
    trapFocus,
  ]);

  return containerRef;
}
