/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { isAppTheme, migrateStoredTheme } from "@/lib/theme";
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
  it("keeps dark and maps every retired theme to light", () => {
    expect(isAppTheme("light")).toBe(true);
    expect(isAppTheme("dark")).toBe(true);
    expect(isAppTheme("dusk")).toBe(false);
    expect(isAppTheme("mist")).toBe(false);
    expect(isAppTheme("linear")).toBe(false);
    expect(isAppTheme("neon")).toBe(false);
    expect(migrateStoredTheme("dark")).toBe("dark");
    expect(migrateStoredTheme("light")).toBe("light");
    expect(migrateStoredTheme("linear")).toBe("light");
    expect(migrateStoredTheme("dusk")).toBe("light");
    expect(migrateStoredTheme("mist")).toBe("light");
    expect(migrateStoredTheme(null)).toBe("light");
    expect(migrateStoredTheme(undefined)).toBe("light");
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
