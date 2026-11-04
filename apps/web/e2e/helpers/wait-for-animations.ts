import type { Page } from "@playwright/test";

export type WaitForPageAnimationsOptions = {
  /** Overall budget so a hanging animation cannot wedge the suite. Default 3000ms. */
  timeoutMs?: number;
};

/**
 * Wait until finite in-flight CSS/WAAPI animations (and CSS transitions exposed
 * via getAnimations) settle before axe analyze().
 * Skips infinite iterations (spinners/shimmers) and already-finished entries so
 * they cannot burn the budget.
 * Also waits until enter-animated ancestors are fully opaque, and requires a
 * short quiet window so late React mounts cannot start enter fades after an
 * early idle reading.
 * Does not touch motion preferences, data-motion, or CSS.
 */
export async function waitForPageAnimations(
  page: Page,
  opts?: WaitForPageAnimationsOptions,
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  /** Consecutive idle samples required (hydration can mount .animated after first idle). */
  const idleNeeded = 2;
  let idleStreak = 0;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    // >=0 = pending finite motion count after wait; -1 = overall timeout
    const leftover = await Promise.race([
      page.evaluate(async () => {
        // Element.getAnimations({ subtree }) covers the document tree;
        // Document.getAnimations() takes no options in TS DOM libs.
        // Running CSS transitions also appear here in Chromium.
        // Keep only in-flight finite animations — finished fill-mode entries
        // stay listed and must not block leftover===0.
        const getFiniteAnims = (): Animation[] =>
          document.documentElement
            .getAnimations({ subtree: true })
            .filter((a) => {
              // Runtime may report "pending"; DOM lib union is finished|idle|paused|running.
              const state = a.playState as string;
              if (state !== "running" && state !== "pending") return false;
              const effect = a.effect;
              if (!effect || !("getComputedTiming" in effect)) return true;
              try {
                return effect.getComputedTiming().iterations !== Infinity;
              } catch {
                return true;
              }
            });

        const fadingEnterCount = (): number => {
          let count = 0;
          for (const el of document.querySelectorAll(
            ".animated, .workspacePageFrame, .enter",
          )) {
            const opacity = Number.parseFloat(getComputedStyle(el).opacity);
            if (Number.isFinite(opacity) && opacity < 0.999) count += 1;
          }
          return count;
        };

        const anims = getFiniteAnims();
        if (anims.length > 0) {
          await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
        }

        // Re-check: newly started finite anims + any enter opacity still < 1.
        return getFiniteAnims().length + fadingEnterCount();
      }),
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(-1), remaining);
      }),
    ]);

    if (leftover < 0) return;

    if (leftover === 0) {
      idleStreak += 1;
      if (idleStreak >= idleNeeded) return;
      // Quiet gap so a just-mounted .animated enter can register before axe.
      const gap = Math.min(120, Math.max(1, deadline - Date.now()));
      await new Promise<void>((resolve) => {
        setTimeout(resolve, gap);
      });
      continue;
    }

    idleStreak = 0;
    // Newly started finite animations / still-fading enter — loop under deadline.
  }
}
