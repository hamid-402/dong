import { describe, expect, it } from "vitest";
import {
  accountNav,
  bottomTabsV2,
  expenseFabHref,
  isNavHrefActive,
  spaceNav,
} from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import { classicPathToWorkspacePage, wPath } from "@/lib/workspace-paths";

describe("navigation-v2", () => {
  it("keeps four primary tabs with kind-specific space labels", () => {
    const group = bottomTabsV2("friends_family", "demo");
    expect(group.map((t) => t.key)).toEqual(["home", "expenses", "space", "more"]);
    expect(group.map((t) => t.label)).toEqual([
      NAV_LABELS.home,
      NAV_LABELS.expenses,
      NAV_LABELS.spaceGroup,
      NAV_LABELS.more,
    ]);
    expect(bottomTabsV2("personal", "me").find((t) => t.key === "space")?.label).toBe(
      NAV_LABELS.spacePersonal,
    );
    expect(bottomTabsV2("small_team", "org").find((t) => t.key === "space")?.label).toBe(
      NAV_LABELS.spaceOrg,
    );
  });

  it("uses /w/[slug] paths when slug is known", () => {
    const tabs = bottomTabsV2("personal", "my-space");
    expect(tabs.find((t) => t.key === "home")?.href).toBe("/w/my-space");
    expect(tabs.find((t) => t.key === "expenses")?.href).toBe("/w/my-space/expenses");
    expect(tabs.find((t) => t.key === "space")?.href).toBe("/w/my-space/space");
    expect(tabs.find((t) => t.key === "more")?.href).toBe("/w/my-space/more");
  });

  it("hides buy section for personal template", () => {
    const sections = spaceNav("personal", "p1");
    expect(sections.some((s) => s.key === "buy")).toBe(false);
    expect(sections.some((s) => s.key === "finance")).toBe(true);
  });

  it("includes procurement for org templates that enable it", () => {
    const sections = spaceNav("small_team", "team");
    const buy = sections.find((s) => s.key === "buy");
    expect(buy?.items.some((i) => i.key === "procurement")).toBe(true);
    expect(buy?.items.find((i) => i.key === "procurement")?.href).toBe("/w/team/procurement");
  });

  it("exposes expense FAB only when expenses module exists", () => {
    expect(expenseFabHref("friends_family", "g1")).toBe("/w/g1/expenses#quick-expense");
  });

  it("does not put metrics in default spaceNav (role-gate deferred)", () => {
    const sections = spaceNav("friends_family", "g1");
    const space = sections.find((s) => s.key === "space");
    expect(space?.items.some((i) => i.key === "metrics")).toBe(false);
    expect(space?.items.map((i) => i.key)).toEqual(["invite", "settings"]);
  });

  it("lists account destinations without duplicating the account/spaces tabs", () => {
    expect(accountNav().map((i) => i.key)).toEqual(["security", "whats-new"]);
  });

  it("does not repeat tab destination «خرج‌ها» in spaceNav", () => {
    const finance = spaceNav("friends_family", "g1").find((s) => s.key === "finance");
    expect(finance?.items.some((i) => i.key === "expenses")).toBe(false);
    expect(finance?.items.map((i) => i.key)).toEqual([
      "settlements",
      "invoices",
      "recurring",
      "ledger",
    ]);
  });

  it("hides flag-gated finance tiles when product flags are off", () => {
    const finance = spaceNav("small_team", "org").find((s) => s.key === "finance");
    expect(finance?.items.some((i) => i.key === "addons")).toBe(false);
    expect(finance?.items.some((i) => i.key === "approvals")).toBe(false);
    expect(finance?.items.some((i) => i.key === "org-finance")).toBe(false);
  });

  it("shows addon, approval, and org-finance when flags are on", () => {
    const finance = spaceNav("small_team", "org", {
      addonAck: true,
      approvalQueue: true,
      costCenter: true,
    }).find((s) => s.key === "finance");
    expect(finance?.items.map((i) => i.key)).toEqual([
      "settlements",
      "invoices",
      "recurring",
      "addons",
      "approvals",
      "org-finance",
      "ledger",
    ]);
    expect(finance?.items.find((i) => i.key === "org-finance")?.href).toBe(
      "/w/org/org-finance",
    );
  });

  it("shows org-finance when fxRates flag alone is on", () => {
    const finance = spaceNav("small_team", "org", { fxRates: true }).find(
      (s) => s.key === "finance",
    );
    expect(finance?.items.some((i) => i.key === "org-finance")).toBe(true);
  });

  it("builds more path for workspace tools launcher", () => {
    expect(wPath("acme", "more")).toBe("/w/acme/more");
  });

  it("matches workspace home exactly for active state", () => {
    expect(isNavHrefActive("/w/demo", "/w/demo")).toBe(true);
    expect(isNavHrefActive("/w/demo/expenses", "/w/demo")).toBe(false);
    expect(isNavHrefActive("/account/security", "/account")).toBe(true);
  });
});

describe("workspace-paths", () => {
  it("builds readable workspace URLs", () => {
    expect(wPath("acme")).toBe("/w/acme");
    expect(wPath("acme", "expenses")).toBe("/w/acme/expenses");
  });

  it("maps classic paths to pages", () => {
    expect(classicPathToWorkspacePage("/workspaces")).toBe("expenses");
    expect(classicPathToWorkspacePage("/profile")).toBe("account");
    expect(classicPathToWorkspacePage("/invite")).toBe("invite");
    expect(classicPathToWorkspacePage("/me")).toBe("space");
  });
});
