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

  it("metrics requires platformConsole; persona still blocks guest/member", () => {
    expect(
      workspacePageAccess({
        page: "metrics",
        template: "friends_family",
        role: "owner",
      }).allowed,
    ).toBe(false);
    for (const role of ["owner", "admin", "finance", "auditor"] as MembershipRole[]) {
      expect(
        workspacePageAccess({
          page: "metrics",
          template: "friends_family",
          role,
          flags: { platformConsole: true },
        }).allowed,
      ).toBe(true);
    }
    expect(
      workspacePageAccess({
        page: "metrics",
        template: "friends_family",
        role: "member",
        flags: { platformConsole: true },
      }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "metrics",
        template: "friends_family",
        role: "guest",
        flags: { platformConsole: true },
      }).allowed,
    ).toBe(false);
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
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "owner",
        flags: { jobsAvailable: true, platformConsole: true },
      }).allowed,
    ).toBe(true);
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "owner",
        flags: { jobsRedisQueue: true, platformConsole: true },
      }).allowed,
    ).toBe(true);
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "member",
        flags: { jobsRedisQueue: true, platformConsole: true },
      }).allowed,
    ).toBe(false);
  });

  it("spaceNav never lists metrics without platformConsole across templates", () => {
    for (const template of TEMPLATES) {
      const items = spaceNav(template, "slug", undefined, "owner").flatMap(
        (s) => s.items,
      );
      expect(items.some((i) => i.key === "metrics")).toBe(false);
      const ownerItems = spaceNav(
        template,
        "slug",
        { platformConsole: true },
        "owner",
      ).flatMap((s) => s.items);
      expect(ownerItems.some((i) => i.key === "metrics")).toBe(true);
    }
  });

  it("spaceNav lists jobs only with platformConsole when jobs provider is live", () => {
    expect(
      spaceNav("friends_family", "slug", { jobsAvailable: true }, "owner")
        .flatMap((s) => s.items)
        .some((i) => i.key === "jobs"),
    ).toBe(false);
    for (const role of ROLES) {
      const items = spaceNav(
        "friends_family",
        "slug",
        { jobsAvailable: true, platformConsole: true },
        role,
      ).flatMap((s) => s.items);
      const hasJobs = items.some((i) => i.key === "jobs");
      // owner/admin/finance have navKeys "all"; empty role stays discoverable.
      const expectJobs =
        role === "" ||
        role === "owner" ||
        role === "admin" ||
        role === "finance";
      expect(hasJobs).toBe(expectJobs);
    }
  });
});
