import { describe, expect, it } from "vitest";
import { compactTrailCrumbs, headerCrumbs, isSpaceCrumb, splitWayfinding } from "@/components/shell/shell-header-wayfinding";

describe("splitWayfinding", () => {
  it("splits title from ancestors", () => {
    const { title, ancestors } = splitWayfinding([
      { label: "آکمه", href: "/w/acme" },
      { label: "مالی", href: "/w/acme?folder=finance" },
      { label: "خرج تکراری" },
    ]);
    expect(title).toBe("خرج تکراری");
    expect(ancestors.map((a) => a.label)).toEqual(["آکمه", "مالی"]);
  });

  it("handles single crumb", () => {
    const { title, ancestors } = splitWayfinding([{ label: "حساب من" }]);
    expect(title).toBe("حساب من");
    expect(ancestors).toEqual([]);
  });

  it("prefixes خانه and keeps the parent on long trails", () => {
    const items = headerCrumbs(
      [
        { label: "آکمه", href: "/w/acme" },
        { label: "ابزارها", href: "/w/acme/more" },
        { label: "مالی", href: "/w/acme/more?folder=finance" },
        { label: "اسناد" },
      ],
      { root: { label: "خانه", href: "/home" }, compact: true },
    );
    expect(items.map((item) => item.label)).toEqual([
      "خانه",
      "…",
      "مالی",
      "اسناد",
    ]);
  });

  it("does not duplicate a root that is already first", () => {
    const items = headerCrumbs(
      [
        { label: "خانه", href: "/home" },
        { label: "ساخت فضا" },
      ],
      { root: { label: "خانه", href: "/home" } },
    );
    expect(items.map((item) => item.label)).toEqual(["خانه", "ساخت فضا"]);
  });

  it("drops the space name and kind the switcher already shows", () => {
    const items = compactTrailCrumbs(
      [
        { label: "خانه", href: "/home" },
        { label: "گروه", href: "/spaces?kind=group" },
        { label: "آکمه", href: "/w/acme" },
        { label: "مالی", href: "/w/acme?folder=finance" },
        { label: "…" },
        { label: "نمودارها" },
      ],
      ["آکمه", "گروه", ""],
    );
    expect(items.map((item) => item.label)).toEqual(["خانه", "مالی", "نمودارها"]);
  });

  it("filters ellipsis placeholders", () => {
    const { title, ancestors } = splitWayfinding([
      { label: "آکمه", href: "/w/acme" },
      { label: "…" },
      { label: "جزئیات" },
    ]);
    expect(title).toBe("جزئیات");
    expect(ancestors.map((a) => a.label)).toEqual(["آکمه"]);
  });

  it("recognises the space-home crumb so its name truncates last", () => {
    expect(isSpaceCrumb({ label: "آکمه", href: "/w/acme" })).toBe(true);
    expect(isSpaceCrumb({ label: "آکمه", href: "/w/acme/" })).toBe(true);
    expect(isSpaceCrumb({ label: "مالی", href: "/w/acme?folder=finance" })).toBe(false);
    expect(isSpaceCrumb({ label: "خرج", href: "/w/acme/expenses" })).toBe(false);
    expect(isSpaceCrumb({ label: "خانه", href: "/home" })).toBe(false);
    expect(isSpaceCrumb({ label: "بدون لینک" })).toBe(false);
  });
});
