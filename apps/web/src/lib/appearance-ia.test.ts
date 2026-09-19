/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { isAppAtmosphere, isAppTheme } from "@/lib/theme";
import {
  listRecentDestinations,
  rememberDestination,
} from "@/lib/recent-destinations";
import {
  filterLivePinned,
  listPinnedDestinations,
  togglePinnedDestination,
} from "@/lib/pinned-destinations";

describe("appearance helpers", () => {
  it("accepts product themes and atmospheres including linear + aurora", () => {
    expect(isAppTheme("dusk")).toBe(true);
    expect(isAppTheme("mist")).toBe(true);
    expect(isAppTheme("linear")).toBe(true);
    expect(isAppTheme("neon")).toBe(false);
    expect(isAppAtmosphere("forest")).toBe(true);
    expect(isAppAtmosphere("ember")).toBe(true);
    expect(isAppAtmosphere("galaxy")).toBe(false);
  });
});

describe("recent destinations", () => {
  it("stores visited mosaic targets without inventing extras", () => {
    localStorage.clear();
    rememberDestination({
      key: "expenses",
      label: "خرج‌ها",
      href: "/w/demo/expenses",
    });
    rememberDestination({
      key: "settlements",
      label: "تسویه‌ها",
      href: "/w/demo/settlements",
    });
    rememberDestination({
      key: "expenses",
      label: "خرج‌ها",
      href: "/w/demo/expenses",
    });
    const recent = listRecentDestinations();
    expect(recent.map((row) => row.key)).toEqual(["expenses", "settlements"]);
  });
});

describe("pinned destinations", () => {
  it("toggles pins and drops dead hrefs", () => {
    localStorage.clear();
    togglePinnedDestination({
      key: "expenses",
      label: "خرج‌ها",
      href: "/w/demo/expenses",
    });
    togglePinnedDestination({
      key: "ghost",
      label: "مرده",
      href: "/w/demo/gone",
    });
    expect(listPinnedDestinations().map((row) => row.key)).toEqual([
      "ghost",
      "expenses",
    ]);
    const live = filterLivePinned(listPinnedDestinations(), ["/w/demo/expenses"]);
    expect(live.map((row) => row.key)).toEqual(["expenses"]);
    togglePinnedDestination({
      key: "expenses",
      label: "خرج‌ها",
      href: "/w/demo/expenses",
    });
    expect(listPinnedDestinations().some((row) => row.key === "expenses")).toBe(
      false,
    );
  });
});
