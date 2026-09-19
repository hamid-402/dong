/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { enrichOperationDestinations } from "./operations-nav";

describe("enrichOperationDestinations", () => {
  it("fills icon and hint from shared meta", () => {
    const [expenses] = enrichOperationDestinations([
      { key: "expenses", label: "خرج‌ها", href: "/w/x/expenses", active: true },
    ]);
    expect(expenses?.icon).toBe("receipt");
    expect(expenses?.hint).toBe("ثبت و پیگیری خرج");
  });

  it("keeps explicit icon and hint", () => {
    const [custom] = enrichOperationDestinations([
      {
        key: "expenses",
        label: "خرج‌ها",
        href: "/w/x/expenses",
        active: true,
        icon: "home",
        hint: "سفارشی",
      },
    ]);
    expect(custom?.icon).toBe("home");
    expect(custom?.hint).toBe("سفارشی");
  });

  it("passes through unknown keys unchanged", () => {
    const [unknown] = enrichOperationDestinations([
      { key: "custom-thing", label: "خاص", href: "#", active: false },
    ]);
    expect(unknown?.icon).toBeUndefined();
    expect(unknown?.hint).toBeUndefined();
  });
});
