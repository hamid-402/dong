import { describe, expect, it } from "vitest";
import { getMessages, listCatalogKeys, t } from "./i18n";

describe("i18n catalog (R10-12)", () => {
  it("fa and en share the same keys", () => {
    const fa = Object.keys(getMessages("fa")).sort();
    const en = Object.keys(getMessages("en")).sort();
    expect(en).toEqual(fa);
    expect(listCatalogKeys().length).toBeGreaterThanOrEqual(50);
  });

  it("returns fa auth strings by default", () => {
    expect(t("login.title")).toMatch(/ورود/);
    expect(t("login.submit")).toBe("ورود");
  });

  it("supports en locale and simple interpolation", () => {
    expect(t("login.title", "en")).toBe("Sign in");
    expect(t("login.title", "en", { unused: 1 })).toBe("Sign in");
  });

  it("keeps domain-nav and approval-badge keys in both catalogs", () => {
    const required = [
      "nav.sectionPeople",
      "nav.sectionOversight",
      "nav.sectionSettings",
      "nav.sectionFinance",
      "nav.sectionBuy",
      "nav.invoices",
      "nav.statements",
      "shell.approvalBadge",
      "shell.approvalBadgeTitle",
      "nav.financeEveryday",
      "nav.financeDocuments",
      "nav.financeSchedule",
      "nav.financeRecords",
      "shell.chooseSubgroup",
      "shell.homeUrgent",
      "shell.homeGetStarted",
      "shell.homeRootTitle",
      "shell.homeRootHint",
      "shell.homePageDesc",
      "shell.homeFinanceUrgencyHint",
      "shell.homeDrillExpenseCta",
      "shell.toolsAppDesc",
      "shell.tourSpacesTitle",
      "shell.spacesHubDesc",
      "shell.toolsAlsoOnHome",
    ];
    const fa = getMessages("fa");
    const en = getMessages("en");
    for (const key of required) {
      expect(fa[key]?.length).toBeGreaterThan(0);
      expect(en[key]?.length).toBeGreaterThan(0);
    }
    expect(fa["nav.invoices"]).toContain("کلی");
    expect(fa["nav.statements"]).toContain("ریز");
  });
});
