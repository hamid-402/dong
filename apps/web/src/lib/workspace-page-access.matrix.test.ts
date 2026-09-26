/**
 * S10-18 — matrix of template × flag × role for honest page access.
 */
import { describe, expect, it } from "vitest";
import type { MembershipRole, WorkspaceTemplate } from "@dang/contracts";
import { spaceNav } from "@/lib/navigation-v2";
import { workspacePageAccess } from "@/lib/workspace-page-access";
import type { WorkspacePage } from "@/lib/workspace-paths";

const TEMPLATES: WorkspaceTemplate[] = [
  "personal",
  "friends_family",
  "household",
  "small_team",
];

const ROLES: Array<MembershipRole | ""> = [
  "",
  "owner",
  "admin",
  "finance",
  "member",
  "guest",
  "auditor",
];

describe("S10-18 page access matrix", () => {
  it("personal never allows procurement/partners/orgFinance/ledger", () => {
    for (const page of [
      "procurement",
      "partners",
      "orgFinance",
      "ledger",
    ] as WorkspacePage[]) {
      expect(
        workspacePageAccess({ page, template: "personal", role: "owner" }).allowed,
      ).toBe(false);
    }
  });

  it("org template allows procurement for operational roles; guest is blocked", () => {
    expect(
      workspacePageAccess({
        page: "procurement",
        template: "small_team",
        role: "member",
      }).allowed,
    ).toBe(true);
    expect(
      workspacePageAccess({
        page: "procurement",
        template: "small_team",
        role: "guest",
      }).allowed,
    ).toBe(false);
  });

  it("metrics denied for guest/member; allowed for owner/admin/finance/auditor", () => {
    const denied: MembershipRole[] = ["guest", "member"];
    const allowed: MembershipRole[] = ["owner", "admin", "finance", "auditor"];
    for (const role of denied) {
      expect(
        workspacePageAccess({
          page: "metrics",
          template: "friends_family",
          role,
        }).allowed,
      ).toBe(false);
    }
    for (const role of allowed) {
      expect(
        workspacePageAccess({
          page: "metrics",
          template: "friends_family",
          role,
        }).allowed,
      ).toBe(true);
    }
  });

  it("addons/approvals/orgFinance/jobs honor flags", () => {
    expect(
      workspacePageAccess({
        page: "addons",
        template: "friends_family",
        role: "owner",
      }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "addons",
        template: "friends_family",
        role: "owner",
        flags: { addonAck: true },
      }).allowed,
    ).toBe(true);

    expect(
      workspacePageAccess({
        page: "approvals",
        template: "small_team",
        role: "owner",
      }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "approvals",
        template: "small_team",
        role: "owner",
        flags: { approvalQueue: true },
      }).allowed,
    ).toBe(true);

    expect(
      workspacePageAccess({
        page: "orgFinance",
        template: "small_team",
        role: "owner",
      }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "orgFinance",
        template: "small_team",
        role: "owner",
        flags: { costCenter: true },
      }).allowed,
    ).toBe(true);

    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "owner",
        flags: { jobsAvailable: true },
      }).allowed,
    ).toBe(true);
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "owner",
        flags: { jobsRedisQueue: true },
      }).allowed,
    ).toBe(true);
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "member",
        flags: { jobsRedisQueue: true },
      }).allowed,
    ).toBe(false);
  });

  it("spaceNav never lists metrics for guest across templates", () => {
    for (const template of TEMPLATES) {
      const items = spaceNav(template, "slug", undefined, "guest").flatMap(
        (s) => s.items,
      );
      expect(items.some((i) => i.key === "metrics")).toBe(false);
    }
  });

  it("spaceNav lists jobs with jobsAvailable or redis for owner/admin", () => {
    for (const role of ROLES) {
      const items = spaceNav(
        "friends_family",
        "slug",
        { jobsAvailable: true },
        role,
      ).flatMap((s) => s.items);
      const hasJobs = items.some((i) => i.key === "jobs");
      const expectJobs = role === "" || role === "owner" || role === "admin";
      expect(hasJobs).toBe(expectJobs);
    }
  });
});
