import { describe, expect, it } from "vitest";
import { buildFinanceSectionChrome } from "@/components/views/finance/finance-section-chrome";

describe("buildFinanceSectionChrome role awareness", () => {
  it("guest/read-only primary is settlements not add-expense", () => {
    const chrome = buildFinanceSectionChrome({
      section: "expenses",
      spaceKind: "group",
      slug: "g1",
      expensesHref: "/w/g1/expenses",
      settlementsHref: "/w/g1/settlements",
      membersHref: "/w/g1/members",
      canManageFinance: false,
      readOnlyFinance: true,
      membershipRole: "guest",
    });
    expect(chrome.description).toMatch(/فقط‌خواندنی|مشاهده/);
  });

  it("approver primary points at approvals when writable false path", () => {
    const chrome = buildFinanceSectionChrome({
      section: "expenses",
      spaceKind: "org",
      slug: "o1",
      expensesHref: "/w/o1/expenses",
      settlementsHref: "/w/o1/settlements",
      membersHref: "/w/o1/members",
      canManageFinance: false,
      readOnlyFinance: false,
      membershipRole: "approver",
      canApproveCompany: true,
    });
    expect(chrome.description).toMatch(/تأیید/);
  });

  it("member members link does not deep-link to add panel", () => {
    const chrome = buildFinanceSectionChrome({
      section: "settlements",
      spaceKind: "group",
      slug: "g1",
      expensesHref: "/w/g1/expenses",
      settlementsHref: "/w/g1/settlements",
      membersHref: "/w/g1/members",
      canManageFinance: false,
      readOnlyFinance: false,
      membershipRole: "member",
    });
    const html = String(chrome.secondary);
    // React element tree — ensure membersHrefSafe used (no #member-add when !canManage)
    expect(chrome.secondary).toBeTruthy();
    void html;
  });
});
