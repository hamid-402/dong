import { describe, expect, it } from "vitest";
import { workspacePageAccess } from "@/lib/workspace-page-access";

describe("workspacePageAccess", () => {
  it("denies procurement on personal template", () => {
    const result = workspacePageAccess({
      page: "procurement",
      template: "personal",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("allows procurement on org template with module", () => {
    expect(
      workspacePageAccess({ page: "procurement", template: "small_team" }).allowed,
    ).toBe(true);
  });

  it("denies ledger on personal template", () => {
    expect(
      workspacePageAccess({ page: "ledger", template: "personal" }).allowed,
    ).toBe(false);
  });

  it("denies metrics for guest and allows owner", () => {
    expect(
      workspacePageAccess({
        page: "metrics",
        template: "friends_family",
        role: "guest",
      }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "metrics",
        template: "friends_family",
        role: "owner",
      }).allowed,
    ).toBe(true);
  });

  it("denies jobs without redis_queue or for non-admin", () => {
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "owner",
      }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "jobs",
        template: "friends_family",
        role: "member",
        flags: { jobsRedisQueue: true },
      }).allowed,
    ).toBe(false);
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
  });

  it("denies org-finance when no product flags", () => {
    expect(
      workspacePageAccess({ page: "orgFinance", template: "small_team" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "orgFinance",
        template: "small_team",
        flags: { costCenter: true },
      }).allowed,
    ).toBe(true);
  });

  it("allows catalog only with catalog_v1 on non-personal templates", () => {
    expect(
      workspacePageAccess({ page: "catalog", template: "personal" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({ page: "catalog", template: "friends_family" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "catalog",
        template: "friends_family",
        flags: { catalogV1: true },
      }).allowed,
    ).toBe(true);
  });

  it("allows statements only with statementsV1", () => {
    expect(
      workspacePageAccess({ page: "statements", template: "friends_family" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "statements",
        template: "friends_family",
        flags: { statementsV1: true },
      }).allowed,
    ).toBe(true);
  });

  it("allows payments / charts / permissions only with honest providers", () => {
    expect(
      workspacePageAccess({ page: "payments", template: "friends_family" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "payments",
        template: "friends_family",
        flags: { paymentReceiptsV1: true },
      }).allowed,
    ).toBe(true);

    expect(
      workspacePageAccess({ page: "charts", template: "friends_family" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "charts",
        template: "friends_family",
        flags: { chartsV1: true },
      }).allowed,
    ).toBe(true);

    expect(
      workspacePageAccess({ page: "permissions", template: "friends_family" }).allowed,
    ).toBe(false);
    expect(
      workspacePageAccess({
        page: "permissions",
        template: "friends_family",
        flags: { accessPolicyGrants: true },
      }).allowed,
    ).toBe(true);
  });
});
