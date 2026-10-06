/** Shared press/prefetch helpers for mosaic and folder tiles. */

export function prefetchRoute(
  router: { prefetch?: (href: string) => void },
  href: string,
): void {
  router.prefetch?.(href);
}

/** Short haptic for tile press; no-op when reduced motion or unsupported. */
export function softTileHaptic(reduceMotion = false): void {
  if (reduceMotion) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(8);
  } catch {
    /* ignore */
  }
}

/**
 * Soft page morph when the browser supports View Transitions.
 * Always falls back to an immediate navigate (Safari / reduce-motion / errors).
 */
export function navigateWithViewTransition(
  navigate: () => void,
  reduceMotion = false,
): void {
  if (
    reduceMotion ||
    typeof document === "undefined" ||
    !("startViewTransition" in document)
  ) {
    navigate();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  try {
    doc.startViewTransition?.(() => {
      navigate();
    });
  } catch {
    navigate();
  }
}
