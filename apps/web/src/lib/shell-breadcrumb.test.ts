import { describe, expect, it } from "vitest";
import { breadcrumbForPathname } from "@/lib/shell-breadcrumb";
import { NAV_LABELS } from "@/lib/nav-labels";

describe("shell-breadcrumb", () => {
  it("builds workspace crumbs", () => {
    const crumbs = breadcrumbForPathname("/w/acme/expenses", "آکمه");
    expect(crumbs[0]?.label).toBe("آکمه");
    expect(crumbs[0]?.href).toBe("/w/acme");
    expect(crumbs[1]?.label).toBe(NAV_LABELS.expenses);
  });

  it("builds account security crumbs", () => {
    const crumbs = breadcrumbForPathname("/account/security");
    expect(crumbs.map((c) => c.label)).toEqual([NAV_LABELS.account, NAV_LABELS.security]);
  });

  it("builds spaces/new crumbs", () => {
    const crumbs = breadcrumbForPathname("/spaces/new");
    expect(crumbs.map((c) => c.label)).toEqual([
      NAV_LABELS.spacesList,
      NAV_LABELS.createSpace,
    ]);
  });

  it("builds whats-new crumbs under account", () => {
    const crumbs = breadcrumbForPathname("/whats-new");
    expect(crumbs.map((c) => c.label)).toEqual([
      NAV_LABELS.account,
      NAV_LABELS.whatsNew,
    ]);
  });

  it("builds audit crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme/audit", "آکمه");
    expect(crumbs.map((c) => c.label)).toEqual(["آکمه", NAV_LABELS.audit]);
  });

  it("builds metrics crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme/metrics", "آکمه");
    expect(crumbs.map((c) => c.label)).toEqual(["آکمه", NAV_LABELS.metrics]);
  });

  it("builds more crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme/more", "آکمه");
    expect(crumbs.map((c) => c.label)).toEqual(["آکمه", NAV_LABELS.more]);
  });
});
