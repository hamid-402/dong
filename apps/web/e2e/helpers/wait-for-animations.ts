import type { Page } from "@playwright/test";

export type WaitForPageAnimationsOptions = {
  /** Overall budget so a hanging animation cannot wedge the suite. Default 8000ms. */
  timeoutMs?: number;
};

/**
 * Wait until CSS/WAAPI animations on the document settle before axe analyze().
 * Does not touch motion preferences, data-motion, or CSS.
 */
export async function waitForPageAnimations(
  page: Page,
  opts?: WaitForPageAnimationsOptions,
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    // 0 = idle; >0 = new animations started after wait; -1 = overall timeout
    const leftover = await Promise.race([
      page.evaluate(async () => {
        // Element.getAnimations({ subtree }) covers the document tree;
        // Document.getAnimations() takes no options in TS DOM libs.
        const getAnims = (): Animation[] =>
          document.documentElement.getAnimations({ subtree: true });

        const anims = getAnims();
        if (anims.length === 0) return 0;
        await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
        return getAnims().length;
      }),
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(-1), remaining);
      }),
    ]);

    if (leftover === 0 || leftover < 0) return;
    // Newly started animations — loop under the same overall deadline.
  }
}
