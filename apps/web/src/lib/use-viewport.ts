"use client";

import { useSyncExternalStore } from "react";

export type ViewportMode = "mobile" | "tablet" | "desktop";

/** Match shell.css wide layout (`min-width: 1024px` + `.shell-v2--desktop`). */
export const VIEWPORT_DESKTOP_MIN = 1024;
export const VIEWPORT_TABLET_MIN = 768;

export function readViewportMode(width: number): ViewportMode {
  if (width >= VIEWPORT_DESKTOP_MIN) return "desktop";
  if (width >= VIEWPORT_TABLET_MIN) return "tablet";
  return "mobile";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function getClientSnapshot(): ViewportMode {
  return readViewportMode(window.innerWidth);
}

/** Mobile-first SSR/hydration — avoids hiding the dock on phones before measure. */
function getServerSnapshot(): ViewportMode {
  return "mobile";
}

/** Stable after hydrate; CSS media queries remain source of truth for shell sizing. */
export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

export function useIsNarrow(): boolean {
  const mode = useViewportMode();
  return mode === "mobile";
}
