/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { APP_THEMES, isAppTheme, migrateStoredTheme, schemeForTheme } from "@/lib/theme";
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
  it("maps light to paper, dark to midnight, and legacy ids to paper", () => {
    expect(APP_THEMES.map((item) => item.label)).toEqual([
      "سفید",
      "مشکی",
      "کاغذی",
      "سرمه‌ای",
    ]);
    expect(isAppTheme("white")).toBe(true);
    expect(isAppTheme("black")).toBe(true);
    expect(isAppTheme("paper")).toBe(true);
    expect(isAppTheme("midnight")).toBe(true);
    expect(isAppTheme("light")).toBe(false);
    expect(isAppTheme("dark")).toBe(false);
    expect(isAppTheme("dusk")).toBe(false);
    expect(isAppTheme("mist")).toBe(false);
    expect(isAppTheme("linear")).toBe(false);
    expect(isAppTheme("neon")).toBe(false);
    expect(migrateStoredTheme("light")).toBe("paper");
    expect(migrateStoredTheme("dark")).toBe("midnight");
    expect(migrateStoredTheme("white")).toBe("white");
    expect(migrateStoredTheme("black")).toBe("black");
    expect(migrateStoredTheme("paper")).toBe("paper");
    expect(migrateStoredTheme("midnight")).toBe("midnight");
    expect(migrateStoredTheme("linear")).toBe("paper");
    expect(migrateStoredTheme("dusk")).toBe("paper");
    expect(migrateStoredTheme("mist")).toBe("paper");
    expect(migrateStoredTheme(null)).toBe("paper");
    expect(migrateStoredTheme(undefined)).toBe("paper");
    expect(schemeForTheme("white")).toBe("light");
    expect(schemeForTheme("paper")).toBe("light");
    expect(schemeForTheme("black")).toBe("dark");
    expect(schemeForTheme("midnight")).toBe("dark");
  });

  it("keeps the boot script on the same migration", () => {
    const layoutPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../app/layout.tsx",
    );
    const source = readFileSync(layoutPath, "utf8");
    const script = source.match(/const themeBootScript = `([\s\S]*?)`;/)?.[1];
    expect(script).toBeTruthy();

    const run = (stored: string | null) => {
      const bag = new Map<string, string>();
      if (stored !== null) bag.set("dang-theme", stored);
      const attrs = new Map<string, string>();
      const localStorage = {
        getItem: (key: string) => bag.get(key) ?? null,
        setItem: (key: string, value: string) => {
          bag.set(key, value);
        },
        removeItem: (key: string) => {
          bag.delete(key);
        },
      };
      const document = {
        documentElement: {
          setAttribute: (key: string, value: string) => {
            attrs.set(key, value);
          },
          removeAttribute: (key: string) => {
            attrs.delete(key);
          },
        },
      };
      const window = { matchMedia: () => ({ matches: false }) };
      runInNewContext(script!, { localStorage, document, window });
      return {
        theme: attrs.get("data-theme"),
        scheme: attrs.get("data-scheme"),
        stored: bag.get("dang-theme") ?? null,
      };
    };

    expect(run("light")).toEqual({ theme: "paper", scheme: "light", stored: "paper" });
    expect(run("dark")).toEqual({ theme: "midnight", scheme: "dark", stored: "midnight" });
    expect(run("dusk")).toEqual({ theme: "paper", scheme: "light", stored: "paper" });
    expect(run("white")).toEqual({ theme: "white", scheme: "light", stored: "white" });
    expect(run("black")).toEqual({ theme: "black", scheme: "dark", stored: "black" });
    expect(run(null)).toEqual({ theme: "paper", scheme: "light", stored: null });
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
