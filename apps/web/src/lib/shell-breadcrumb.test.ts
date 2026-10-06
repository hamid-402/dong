import { describe, expect, it } from "vitest";
import {
  breadcrumbForPathname,
  isShellPrimaryPath,
  domainKeyForPathname,
  insertDomainCrumb,
  trailParent,
  trailParentHref,
} from "@/lib/shell-breadcrumb";
import { NAV_LABELS } from "@/lib/nav-labels";

describe("shell-breadcrumb", () => {
  it("builds workspace crumbs", () => {
    const crumbs = breadcrumbForPathname("/w/acme/expenses", "آکمه");
    expect(crumbs[0]?.label).toBe("آکمه");
    expect(crumbs[0]?.href).toBe("/w/acme");
    expect(crumbs[1]?.label).toBe(NAV_LABELS.expenses);
  });

  it("marks primary tab paths without sub-trail chrome", () => {
    expect(isShellPrimaryPath("/w/acme")).toBe(true);
    expect(isShellPrimaryPath("/w/acme/expenses")).toBe(true);
    expect(isShellPrimaryPath("/w/acme/space")).toBe(true);
    expect(isShellPrimaryPath("/w/acme/more")).toBe(true);
    expect(isShellPrimaryPath("/w/acme/more", "?intent=decide")).toBe(false);
    expect(isShellPrimaryPath("/w/acme/more", "?folder=finance")).toBe(false);
    expect(isShellPrimaryPath("/w/acme", "?folder=finance")).toBe(false);
    expect(isShellPrimaryPath("/w/acme", "?folder=buy")).toBe(false);
    expect(isShellPrimaryPath("/w/acme/settlements")).toBe(false);
    expect(isShellPrimaryPath("/spaces")).toBe(true);
    expect(isShellPrimaryPath("/account")).toBe(true);
    expect(isShellPrimaryPath("/account/security")).toBe(false);
  });

  it("builds home domain folder crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme", "آکمه", "?folder=finance");
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]?.href).toBe("/w/acme");
    expect(crumbs[1]?.label).toBe(NAV_LABELS.home);
    expect(crumbs[1]?.href).toBe("/w/acme");
    expect(crumbs[2]?.label).toBe(NAV_LABELS.sectionFinance);
    expect(trailParentHref(crumbs)).toBe("/w/acme");
  });

  it("builds home domain subgroup crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname(
      "/w/acme",
      "آکمه",
      "?folder=finance&group=everyday",
    );
    expect(crumbs).toHaveLength(3);
    expect(crumbs[1]?.href).toBe("/w/acme?folder=finance");
    expect(crumbs[2]?.label).toBe("ثبت و تسویه");
    expect(trailParentHref(crumbs)).toBe("/w/acme?folder=finance");
  });

  it("builds more domain folder crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme/more", "آکمه", "?folder=people");
    expect(crumbs).toHaveLength(3);
    expect(crumbs.map((c) => c.label)).toEqual([
      "آکمه",
      NAV_LABELS.more,
      NAV_LABELS.sectionPeople,
    ]);
    expect(crumbs[1]?.href).toBe("/w/acme/more");
    expect(trailParentHref(crumbs)).toBe("/w/acme/more");
  });

  it("resolves trail parent href for back control", () => {
    const crumbs = breadcrumbForPathname("/w/acme/expenses", "آکمه");
    expect(trailParentHref(crumbs)).toBe("/w/acme");
    expect(trailParentHref([{ label: "خانه" }], "/spaces")).toBe("/spaces");
  });

  it("shows the domain in the path and skips it for back", () => {
    const crumbs = insertDomainCrumb(
      breadcrumbForPathname("/w/acme/charts", "آکمه"),
      "/w/acme/charts",
    );
    expect(crumbs.map((c) => c.label)).toEqual([
      "آکمه",
      NAV_LABELS.sectionFinance,
      NAV_LABELS.charts,
    ]);
    expect(crumbs[1]?.group).toBe(true);
    expect(trailParent(crumbs)).toEqual({ href: "/w/acme", label: "آکمه" });
    expect(domainKeyForPathname("/w/acme/charts")).toBe("finance");
    expect(domainKeyForPathname("/w/acme/catalog")).toBe("buy");
    expect(domainKeyForPathname("/w/acme/space")).toBeNull();
  });

  it("names the parent the back control returns to", () => {
    const crumbs = breadcrumbForPathname("/w/acme/settlements", "آکمه");
    expect(trailParent(crumbs)).toEqual({ href: "/w/acme", label: "آکمه" });
    const nested = breadcrumbForPathname(
      "/w/acme",
      "آکمه",
      "?folder=finance&group=everyday",
    );
    expect(trailParent(nested)).toEqual({
      href: "/w/acme?folder=finance",
      label: NAV_LABELS.sectionFinance,
    });
  });

  it("builds account security crumbs", () => {
    const crumbs = breadcrumbForPathname("/account/security");
    expect(crumbs.map((c) => c.label)).toEqual([NAV_LABELS.account, NAV_LABELS.security]);
  });

  it("builds spaces/new crumbs", () => {
    const crumbs = breadcrumbForPathname("/spaces/new");
    expect(crumbs.map((c) => c.label)).toEqual([
      NAV_LABELS.home,
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

  it("labels jobs segment", () => {
    const crumbs = breadcrumbForPathname("/w/akme/jobs", "آکمه");
    expect(crumbs.map((c) => c.label)).toEqual(["آکمه", NAV_LABELS.jobs]);
  });

  it("builds more crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme/more", "آکمه");
    expect(crumbs.map((c) => c.label)).toEqual(["آکمه", NAV_LABELS.more]);
  });

  it("builds more intent folder crumbs under workspace", () => {
    const crumbs = breadcrumbForPathname("/w/acme/more", "آکمه", "?intent=decide");
    expect(crumbs).toHaveLength(3);
    expect(crumbs.map((c) => c.label)).toEqual([
      "آکمه",
      NAV_LABELS.more,
      "نیازمند تصمیم",
    ]);
    expect(crumbs[1]?.href).toBe("/w/acme/more");
    expect(trailParentHref(crumbs)).toBe("/w/acme/more");
  });

  it("labels Stage 11 workspace segments", () => {
    expect(
      breadcrumbForPathname("/w/acme/permissions", "آکمه").map((c) => c.label),
    ).toEqual(["آکمه", NAV_LABELS.permissions]);
    expect(
      breadcrumbForPathname("/w/acme/catalog", "آکمه").map((c) => c.label),
    ).toEqual(["آکمه", NAV_LABELS.catalog]);
    expect(
      breadcrumbForPathname("/w/acme/statements", "آکمه").map((c) => c.label),
    ).toEqual(["آکمه", NAV_LABELS.statements]);
    expect(
      breadcrumbForPathname("/w/acme/payments", "آکمه").map((c) => c.label),
    ).toEqual(["آکمه", NAV_LABELS.payments]);
    expect(
      breadcrumbForPathname("/w/acme/charts", "آکمه").map((c) => c.label),
    ).toEqual(["آکمه", NAV_LABELS.charts]);
  });

  it("caps statement detail crumbs at 3 levels", () => {
    const member = breadcrumbForPathname("/w/acme/statements/user-1", "آکمه");
    expect(member).toHaveLength(3);
    expect(member.map((c) => c.label)).toEqual([
      "آکمه",
      NAV_LABELS.statements,
      "صورتحساب عضو",
    ]);
    expect(member[1]?.href).toMatch(/^\/w\/acme\/statements\?/);

    const withRange = breadcrumbForPathname(
      "/w/acme/statements/user-1",
      "آکمه",
      "?from=2026-01-01&to=2026-01-31&catalogItemId=cat-1",
    );
    expect(withRange[1]?.href).toContain("from=2026-01-01");
    expect(withRange[1]?.href).toContain("to=2026-01-31");
    expect(withRange[1]?.href).toContain("catalogItemId=cat-1");

    const print = breadcrumbForPathname(
      "/w/acme/statements/user-1/print",
      "آکمه",
    );
    expect(print).toHaveLength(3);
    expect(print.map((c) => c.label)).toEqual([
      "آکمه",
      NAV_LABELS.statements,
      "نسخه چاپی",
    ]);
  });

  it("builds admin and account friends crumbs", () => {
    expect(breadcrumbForPathname("/admin").map((c) => c.label)).toEqual([
      NAV_LABELS.account,
      NAV_LABELS.admin,
    ]);
    expect(breadcrumbForPathname("/admin")[0]?.href).toBe("/account");
    expect(trailParentHref(breadcrumbForPathname("/admin"))).toBe("/account");
    expect(breadcrumbForPathname("/platform").map((c) => c.label)).toEqual([
      NAV_LABELS.account,
      NAV_LABELS.admin,
    ]);
    expect(breadcrumbForPathname("/admin/vault").map((c) => c.label)).toEqual([
      NAV_LABELS.account,
      NAV_LABELS.admin,
      NAV_LABELS.adminVault,
    ]);
    expect(trailParentHref(breadcrumbForPathname("/admin/vault"))).toBe("/admin");
    expect(breadcrumbForPathname("/admin/slo").map((c) => c.label)).toEqual([
      NAV_LABELS.account,
      NAV_LABELS.admin,
      NAV_LABELS.adminSlo,
    ]);
    expect(
      breadcrumbForPathname("/account/friends").map((c) => c.label),
    ).toEqual([NAV_LABELS.account, NAV_LABELS.friends]);
    expect(
      breadcrumbForPathname("/account/privacy").map((c) => c.label),
    ).toEqual([NAV_LABELS.account, NAV_LABELS.privacy]);
    expect(
      breadcrumbForPathname("/me/finance").map((c) => c.label),
    ).toEqual([NAV_LABELS.account, NAV_LABELS.personalFinance]);
  });
});
