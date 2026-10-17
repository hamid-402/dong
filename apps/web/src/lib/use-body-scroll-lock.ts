"use client";

import { useEffect } from "react";

/**
 * Lock document scroll while a modal sheet/dialog is open.
 * Relies on `scrollbar-gutter: stable` on html to avoid layout jump.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    root.classList.add("is-scroll-locked");
    return () => {
      root.classList.remove("is-scroll-locked");
    };
  }, [locked]);
}
