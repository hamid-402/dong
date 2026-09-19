import { describe, expect, it } from "vitest";
import {
  accountNav,
  bottomTabsV2,
  contextualMosaicSections,
  domainDrillMosaicSections,
  domainGroupedNav,
  expenseFabHref,
  financeSubgroupSections,
  homeDomainHref,
  isNavHrefActive,
  moreDomainHref,
  moreIntentHref,
  parseDomainGroup,
  spaceNav,
} from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  CLASSIC_PATH_TARGETS,
  CLASSIC_REDIRECT_PATHS,
  classicPathToWorkspacePage,
  wPath,
} from "@/lib/workspace-paths";

describe("navigation-v2", () => {
  it("keeps two primary tabs: home and spaces hub", () => {
    const group = bottomTabsV2("friends_family", "demo");
    expect(group.map((t) => t.key)).toEqual(["home", "spaces"]);
    expect(group.map((t) => t.label)).toEqual([
      NAV_LABELS.home,
      NAV_LABELS.spacesList,
    ]);
    expect(group.find((t) => t.key === "spaces")?.href).toBe("/spaces");
  });

  it("keeps app home at /home even when a workspace slug is known", () => {
    const tabs = bottomTabsV2("personal", "my-space");
    expect(tabs.find((t) => t.key === "home")?.href).toBe("/home");
    expect(tabs.find((t) => t.key === "spaces")?.href).toBe("/spaces");
    expect(expenseFabHref("personal", "my-space")).toBe("/w/my-space/record");
  });

  it("hides buy section for personal template", () => {
    const sections = spaceNav("personal", "p1");
    expect(sections.some((s) => s.key === "buy")).toBe(false);
    expect(sections.some((s) => s.key === "finance")).toBe(true);
  });

  it("includes catalog under buy when catalog_v1 capability is on", () => {
    const sections = spaceNav("friends_family", "demo", { catalogV1: true });
    const buy = sections.find((s) => s.key === "buy");
    expect(buy?.items.some((i) => i.key === "catalog")).toBe(true);
    expect(buy?.items.find((i) => i.key === "catalog")?.href).toBe("/w/demo/catalog");
  });

  it("hides catalog without catalog_v1 capability", () => {
    const sections = spaceNav("friends_family", "demo", {});
    const buy = sections.find((s) => s.key === "buy");
    expect(buy?.items.some((i) => i.key === "catalog")).toBe(false);
  });

  it("includes procurement for org templates that enable it", () => {
    const sections = spaceNav("small_team", "team");
    const buy = sections.find((s) => s.key === "buy");
    expect(buy?.items.some((i) => i.key === "procurement")).toBe(true);
    expect(buy?.items.find((i) => i.key === "procurement")?.href).toBe("/w/team/procurement");
  });

  it("exposes expense FAB only when expenses module exists", () => {
    expect(expenseFabHref("friends_family", "g1")).toBe("/w/g1/record");
  });

  it("includes metrics and audit in oversight nav for finance roles", () => {
    const sections = spaceNav("friends_family", "g1", undefined, "owner");
    const oversight = sections.find((s) => s.key === "oversight");
    expect(oversight?.items.map((i) => i.key)).toEqual(["audit", "metrics"]);
    expect(sections.find((s) => s.key === "people")?.items.map((i) => i.key)).toEqual([
      "members",
    ]);
    expect(sections.find((s) => s.key === "settings")?.items.map((i) => i.key)).toEqual([
      "settings",
    ]);
  });

  it("includes subunits under people for building spaces", () => {
    const people = spaceNav("residential_building", "b1", undefined, "owner").find(
      (s) => s.key === "people",
    );
    expect(people?.items.map((i) => i.key)).toEqual(
      expect.arrayContaining(["members", "subunits"]),
    );
  });

  it("includes members under people for group spaces", () => {
    const people = spaceNav("friends_family", "g1", undefined, "owner").find(
      (s) => s.key === "people",
    );
    expect(people?.items.some((i) => i.key === "members")).toBe(true);
  });

  it("shows permissions only when accessPolicyGrants is on", () => {
    const without = spaceNav("friends_family", "g1", undefined, "owner");
    expect(
      without.find((s) => s.key === "people")?.items.some((i) => i.key === "permissions"),
    ).toBe(false);
    const withGrants = spaceNav(
      "friends_family",
      "g1",
      { accessPolicyGrants: true },
      "owner",
    );
    expect(
      withGrants.find((s) => s.key === "people")?.items.some((i) => i.key === "permissions"),
    ).toBe(true);
  });

  it("hides metrics for guest role in oversight nav", () => {
    const oversight = spaceNav("friends_family", "g1", undefined, "guest").find(
      (s) => s.key === "oversight",
    );
    expect(oversight?.items.some((i) => i.key === "metrics")).toBe(false);
    expect(oversight?.items.some((i) => i.key === "audit")).toBe(true);
  });

  it("shows jobs for owner when inline_stub or redis_queue is live", () => {
    const without = spaceNav("friends_family", "g1", undefined, "owner");
    expect(
      without.find((s) => s.key === "oversight")?.items.some((i) => i.key === "jobs"),
    ).toBe(false);

    const withInline = spaceNav(
      "friends_family",
      "g1",
      { jobsAvailable: true },
      "owner",
    );
    expect(
      withInline.find((s) => s.key === "oversight")?.items.some((i) => i.key === "jobs"),
    ).toBe(true);

    const withRedis = spaceNav(
      "friends_family",
      "g1",
      { jobsRedisQueue: true },
      "owner",
    );
    expect(
      withRedis.find((s) => s.key === "oversight")?.items.some((i) => i.key === "jobs"),
    ).toBe(true);

    const member = spaceNav(
      "friends_family",
      "g1",
      { jobsAvailable: true },
      "member",
    );
    expect(
      member.find((s) => s.key === "oversight")?.items.some((i) => i.key === "jobs"),
    ).toBe(false);
  });

  it("omits daily ledger from personal template finance nav", () => {
    const finance = spaceNav("personal", "p1").find((s) => s.key === "finance");
    expect(finance?.items.some((i) => i.key === "ledger")).toBe(false);
  });

  it("lists account destinations without duplicating the account/spaces tabs", () => {
    expect(accountNav().map((i) => i.key)).toEqual([
      "friends",
      "privacy",
      "personal-finance",
      "security",
      "whats-new",
    ]);
  });

  it("includes platform admin in accountNav only for live console + platform role", () => {
    expect(
      accountNav({
        platformAdminLive: true,
        platformRole: "platform_owner",
      }).map((i) => i.key),
    ).toContain("admin");
    expect(
      accountNav({
        platformAdminLive: true,
        platformRole: "user",
      }).map((i) => i.key),
    ).not.toContain("admin");
  });

  it("lists «خرج‌ها» first inside finance folder (group/org)", () => {
    const finance = spaceNav("friends_family", "g1").find((s) => s.key === "finance");
    expect(finance?.items.some((i) => i.key === "expenses")).toBe(true);
    expect(finance?.items.map((i) => i.key)).toEqual([
      "expenses",
      "settlements",
      "recurring",
      "invoices",
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
      "expenses",
      "settlements",
      "addons",
      "recurring",
      "approvals",
      "invoices",
      "ledger",
      "org-finance",
    ]);
    expect(finance?.items.find((i) => i.key === "org-finance")?.href).toBe(
      "/w/org/org-finance",
    );
  });

  it("moves charts into finance when charts_v1 is on", () => {
    const sections = spaceNav("friends_family", "g1", { chartsV1: true }, "owner");
    expect(sections.find((s) => s.key === "finance")?.items.some((i) => i.key === "charts")).toBe(
      true,
    );
    expect(
      sections.find((s) => s.key === "oversight")?.items.some((i) => i.key === "charts"),
    ).toBe(false);
  });

  it("shows org-finance when fxRates flag alone is on", () => {
    const finance = spaceNav("small_team", "org", { fxRates: true }).find(
      (s) => s.key === "finance",
    );
    expect(finance?.items.some((i) => i.key === "org-finance")).toBe(true);
  });

  it("home mosaic matches domain-grouped tools tree (two-layer IA)", () => {
    const flags = { approvalQueue: true, costCenter: true };
    const home = contextualMosaicSections("small_team", "org", flags, "home");
    const tools = contextualMosaicSections("small_team", "org", flags, "all");
    expect(home.map((s) => s.key)).toEqual(tools.map((s) => s.key));
    const items = home.flatMap((section) => section.items);
    expect(items.some((item) => item.key === "settlements")).toBe(true);
    expect(items.some((item) => item.key === "expenses")).toBe(true);
    expect(items.every((item) => item.summary.length > 12)).toBe(true);
  });

  it("ignores urgency/empty signals for home layout (facts only in UI)", () => {
    const baseline = contextualMosaicSections(
      "friends_family",
      "g1",
      undefined,
      "home",
      "owner",
    );
    const urgent = contextualMosaicSections(
      "friends_family",
      "g1",
      undefined,
      "home",
      "owner",
      { openSettlements: 2, pendingApprovals: 3 },
    );
    const empty = contextualMosaicSections(
      "friends_family",
      "g1",
      undefined,
      "home",
      "owner",
      { isEmptyWorkspace: true },
    );
    expect(urgent).toEqual(baseline);
    expect(empty).toEqual(baseline);
    expect(baseline.some((s) => s.key === "finance")).toBe(true);
  });

  it("splits finance tools into professional subgroups", () => {
    const finance = domainGroupedNav("small_team", "org", {
      approvalQueue: true,
      chartsV1: true,
      costCenter: true,
    }).find((s) => s.key === "finance");
    expect(finance).toBeTruthy();
    const subgroups = financeSubgroupSections(finance!.items);
    expect(subgroups.map((s) => s.key)).toEqual([
      "finance-everyday",
      "finance-schedule",
      "finance-records",
      "finance-insights",
      "finance-organizational",
    ]);
    expect(subgroups[0]?.items.some((i) => i.key === "settlements")).toBe(true);
    expect(subgroups.find((s) => s.key === "finance-insights")?.items.some((i) => i.key === "charts")).toBe(
      true,
    );
    expect(
      subgroups.find((s) => s.key === "finance-organizational")?.items.some(
        (i) => i.key === "org-finance",
      ),
    ).toBe(true);
  });

  it("surfaces finance leaf tiles when no group is selected", () => {
    const finance = domainGroupedNav("friends_family", "g1", {
      chartsV1: true,
    }).find((s) => s.key === "finance");
    const drill = domainDrillMosaicSections("finance", finance!, {
      slug: "g1",
      folderBase: "home",
    });
    const leaves = drill.flatMap((s) => s.items);
    expect(leaves.some((i) => i.key === "expenses")).toBe(true);
    expect(leaves.some((i) => i.key === "settlements")).toBe(true);
    expect(leaves.some((i) => i.key === "ledger")).toBe(true);
    expect(leaves.some((i) => i.key === "everyday")).toBe(false);
  });

  it("filters finance leaves when group=everyday", () => {
    const finance = domainGroupedNav("friends_family", "g1").find((s) => s.key === "finance");
    const drill = domainDrillMosaicSections("finance", finance!, {
      slug: "g1",
      folderBase: "home",
      group: "everyday",
    });
    expect(drill).toHaveLength(1);
    expect(drill[0]?.items.some((i) => i.key === "expenses")).toBe(true);
    expect(drill[0]?.items.some((i) => i.key === "settlements")).toBe(true);
    expect(drill[0]?.items.some((i) => i.key === "ledger")).toBe(false);
  });

  it("exposes expenses and personal-finance for personal spaces", () => {
    const sections = contextualMosaicSections("personal", "me", undefined, "home");
    const items = sections.flatMap((section) => section.items);
    expect(sections.length).toBeGreaterThan(0);
    expect(items.some((item) => item.key === "expenses")).toBe(true);
    expect(items.some((item) => item.key === "personal-finance")).toBe(true);
    expect(items.some((item) => item.key === "ledger")).toBe(false);
    expect(items.some((item) => item.key === "org-finance")).toBe(false);
  });

  it("keeps building finance leaves aligned with group", () => {
    const group = contextualMosaicSections("friends_family", "g1", undefined, "home")
      .find((s) => s.key === "finance")
      ?.items.map((i) => i.key)
      .sort();
    const building = contextualMosaicSections(
      "residential_building",
      "tower",
      undefined,
      "home",
    )
      .find((s) => s.key === "finance")
      ?.items.map((i) => i.key)
      .sort();
    expect(building).toEqual(group);
  });

  it("puts expenses in the everyday finance subgroup", () => {
    const finance = contextualMosaicSections("friends_family", "g1", undefined, "home").find(
      (s) => s.key === "finance",
    );
    const subgroups = financeSubgroupSections(finance?.items ?? []);
    expect(subgroups[0]?.items.some((i) => i.key === "expenses")).toBe(true);
  });

  it("groups Tools/palette mosaic by domain (not intent)", () => {
    const sections = contextualMosaicSections(
      "small_team",
      "org",
      { approvalQueue: true, costCenter: true },
      "all",
    );
    expect(sections.map((s) => s.key)).toEqual([
      "finance",
      "buy",
      "people",
      "oversight",
      "settings",
    ]);
    const items = sections.flatMap((s) => s.items);
    expect(items.every((item) => Boolean(item.gemKey))).toBe(true);
    expect(items.find((item) => item.key === "approvals")?.gemKey).toBe("coral");
  });

  it("keeps domainGroupedNav aligned with spaceNav for the same flags", () => {
    const flags = { approvalQueue: true, chartsV1: true, catalogV1: true } as const;
    const nav = spaceNav("small_team", "org", flags, "owner");
    const mosaic = domainGroupedNav("small_team", "org", flags, "owner");
    expect(mosaic.map((s) => s.key)).toEqual(nav.map((s) => s.key));
    expect(mosaic.map((s) => s.items.map((i) => i.key))).toEqual(
      nav.map((s) => s.items.map((i) => i.key)),
    );
  });

  it("parses more domain query and maps legacy intent hrefs", () => {
    expect(parseDomainGroup("finance")).toBe("finance");
    expect(parseDomainGroup("nope")).toBeNull();
    expect(moreDomainHref("org")).toBe("/w/org/more");
    expect(moreDomainHref("org", "buy")).toBe("/w/org/more?folder=buy");
    expect(moreIntentHref("org", "record")).toBe("/w/org/more?folder=buy");
  });

  it("builds home folder hrefs on workspace root", () => {
    expect(homeDomainHref("org")).toBe("/w/org");
    expect(homeDomainHref("org", "finance")).toBe("/w/org?folder=finance");
  });

  it("keeps contextual mosaic feature gates honest", () => {
    const withoutFlags = contextualMosaicSections(
      "small_team",
      "org",
      undefined,
      "all",
    ).flatMap((section) => section.items);
    const withFlags = contextualMosaicSections(
      "small_team",
      "org",
      { addonAck: true, approvalQueue: true, fxRates: true },
      "all",
    ).flatMap((section) => section.items);

    expect(withoutFlags.some((item) => item.key === "approvals")).toBe(false);
    expect(withFlags.some((item) => item.key === "approvals")).toBe(true);
    expect(withFlags.some((item) => item.key === "org-finance")).toBe(true);
  });

  it("does not show org-finance for friends template even with Wave F flags", () => {
    const finance = spaceNav("friends_family", "g1", {
      costCenter: true,
      allowance: true,
    }).find((s) => s.key === "finance");
    expect(finance?.items.some((i) => i.key === "org-finance")).toBe(false);
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
    expect(wPath("acme", "audit")).toBe("/w/acme/audit");
  });

  it("maps classic paths to pages", () => {
    expect(classicPathToWorkspacePage("/workspaces")).toBe("expenses");
    expect(classicPathToWorkspacePage("/profile")).toBe("account");
    expect(classicPathToWorkspacePage("/invite")).toBe("invite");
    expect(classicPathToWorkspacePage("/me")).toBe("space");
  });

  it("maps finance panel hashes under /workspaces to the split sections", () => {
    expect(classicPathToWorkspacePage("/workspaces", "#settlement-panel")).toBe("settlements");
    expect(classicPathToWorkspacePage("/workspaces", "period-invoice-panel")).toBe("invoices");
    expect(classicPathToWorkspacePage("/workspaces", "#reports-panel")).toBe("recurring");
    expect(classicPathToWorkspacePage("/workspaces", "#quick-expense")).toBe("expenses");
  });

  it("keeps every classic redirect path in the compatibility inventory", () => {
    for (const path of CLASSIC_REDIRECT_PATHS) {
      expect(classicPathToWorkspacePage(path)).not.toBeNull();
      expect(CLASSIC_PATH_TARGETS[path] ?? classicPathToWorkspacePage(path)).toBeTruthy();
    }
  });
});
