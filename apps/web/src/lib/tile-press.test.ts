/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  navigateWithViewTransition,
  prefetchRoute,
  softTileHaptic,
} from "./tile-press";

describe("tile-press", () => {
  it("prefetchRoute calls router.prefetch when present", () => {
    const prefetch = vi.fn();
    prefetchRoute({ prefetch }, "/home");
    expect(prefetch).toHaveBeenCalledWith("/home");
  });

  it("prefetchRoute no-ops without prefetch", () => {
    expect(() => prefetchRoute({}, "/home")).not.toThrow();
  });

  it("softTileHaptic skips when reduceMotion", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    softTileHaptic(true);
    expect(vibrate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("softTileHaptic vibrates briefly when allowed", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    softTileHaptic(false);
    expect(vibrate).toHaveBeenCalledWith(8);
    vi.unstubAllGlobals();
  });

  it("navigateWithViewTransition falls back when reduceMotion", () => {
    const navigate = vi.fn();
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: start,
    });
    navigateWithViewTransition(navigate, true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "startViewTransition");
  });

  it("navigateWithViewTransition uses browser API when available", () => {
    const navigate = vi.fn();
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: start,
    });
    navigateWithViewTransition(navigate, false);
    expect(start).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
    Reflect.deleteProperty(document, "startViewTransition");
  });
});
