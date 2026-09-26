import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDITOR_NAV_KEYS,
  GUEST_NAV_KEYS,
  INVITE_ASSIGNABLE_ROLES,
  UI_ROLE_ADVANCED,
  UI_ROLE_CORE,
  isExpenseApproverRole,
  isMembershipManagerRole,
  resolveUiPersona,
  roleAllowsNavKey,
  roleBlocksWorkspacePage,
  roleNavProfile,
  uiInviteRoleOptions,
  uiRoleOptionsIncludingCurrent,
} from "../src/role-surface.js";

describe("role-surface — 6-role product model", () => {
  it("core is finance/admin/member/guest", () => {
    assert.deepEqual([...UI_ROLE_CORE], ["finance", "admin", "member", "guest"]);
  });

  it("advanced is approver/buyer", () => {
    assert.deepEqual([...UI_ROLE_ADVANCED], ["approver", "buyer"]);
  });

  it("invite assignable excludes owner, deputy, asset_custodian", () => {
    assert.ok(!INVITE_ASSIGNABLE_ROLES.includes("owner"));
    assert.ok(!INVITE_ASSIGNABLE_ROLES.includes("deputy_finance"));
    assert.ok(!INVITE_ASSIGNABLE_ROLES.includes("asset_custodian"));
    for (const r of ["admin", "finance", "member", "guest", "approver", "buyer", "auditor"]) {
      assert.ok(INVITE_ASSIGNABLE_ROLES.includes(r as never), `missing ${r}`);
    }
  });

  it("uiInviteRoleOptions: core only by default", () => {
    const opts = uiInviteRoleOptions();
    assert.equal(opts.length, 4);
    assert.deepEqual(
      opts.map((o) => o.value),
      ["finance", "admin", "member", "guest"],
    );
  });

  it("uiInviteRoleOptions: advanced flags append", () => {
    const opts = uiInviteRoleOptions({
      showApprover: true,
      showBuyer: true,
      showAuditor: true,
    });
    assert.equal(opts.length, 7);
    assert.ok(opts.some((o) => o.value === "approver" && o.tier === "advanced"));
    assert.ok(opts.some((o) => o.value === "buyer" && o.tier === "advanced"));
    assert.ok(opts.some((o) => o.value === "auditor" && o.tier === "advanced"));
  });

  it("isExpenseApproverRole matches EXPENSE_APPROVER set", () => {
    assert.equal(isExpenseApproverRole("owner"), true);
    assert.equal(isExpenseApproverRole("admin"), true);
    assert.equal(isExpenseApproverRole("finance"), true);
    assert.equal(isExpenseApproverRole("approver"), true);
    assert.equal(isExpenseApproverRole("member"), false);
    assert.equal(isExpenseApproverRole("buyer"), false);
    assert.equal(isExpenseApproverRole("guest"), false);
  });

  it("isMembershipManagerRole is owner/admin/finance", () => {
    assert.equal(isMembershipManagerRole("finance"), true);
    assert.equal(isMembershipManagerRole("approver"), false);
    assert.equal(isMembershipManagerRole("member"), false);
  });

  it("guest nav is tightly scoped", () => {
    assert.equal(roleAllowsNavKey("guest", "expenses"), true);
    assert.equal(roleAllowsNavKey("guest", "members"), true);
    assert.equal(roleAllowsNavKey("guest", "approvals"), false);
    assert.equal(roleAllowsNavKey("guest", "procurement"), false);
    assert.equal(roleAllowsNavKey("guest", "jobs"), false);
    assert.ok(GUEST_NAV_KEYS.has("settings"));
  });

  it("auditor gets report surfaces, not ops", () => {
    assert.equal(roleAllowsNavKey("auditor", "audit"), true);
    assert.equal(roleAllowsNavKey("auditor", "metrics"), true);
    assert.equal(roleAllowsNavKey("auditor", "approvals"), false);
    assert.ok(AUDITOR_NAV_KEYS.has("charts"));
    assert.ok(roleBlocksWorkspacePage("auditor", "approvals"));
    assert.equal(roleBlocksWorkspacePage("auditor", "audit"), null);
  });

  it("empty role stays discoverable in nav", () => {
    assert.equal(roleAllowsNavKey("", "jobs"), true);
    assert.equal(roleAllowsNavKey(null, "approvals"), true);
    assert.equal(roleBlocksWorkspacePage("", "jobs"), null);
  });

  it("guest deep-link blocks ops pages", () => {
    assert.ok(roleBlocksWorkspacePage("guest", "approvals"));
    assert.ok(roleBlocksWorkspacePage("guest", "procurement"));
    assert.equal(roleBlocksWorkspacePage("guest", "expenses"), null);
  });

  it("resolveUiPersona maps legacy roles onto 6 personas", () => {
    assert.equal(resolveUiPersona("admin"), "owner");
    assert.equal(resolveUiPersona("deputy_finance"), "finance");
    assert.equal(resolveUiPersona("asset_custodian"), "member");
    assert.equal(resolveUiPersona("approver"), "approver");
    assert.equal(resolveUiPersona(null), null);
  });

  it("roleNavProfile scopes member/approver/buyer", () => {
    const member = roleNavProfile("member");
    assert.ok(member && member.navKeys !== "all");
    assert.equal(roleAllowsNavKey("member", "expenses"), true);
    assert.equal(roleAllowsNavKey("member", "approvals"), false);
    assert.equal(roleAllowsNavKey("member", "jobs"), false);

    assert.equal(roleAllowsNavKey("approver", "approvals"), true);
    assert.equal(roleAllowsNavKey("approver", "procurement"), false);

    assert.equal(roleAllowsNavKey("buyer", "procurement"), true);
    assert.equal(roleAllowsNavKey("buyer", "approvals"), false);

    assert.equal(roleNavProfile("owner")?.navKeys, "all");
    assert.equal(roleNavProfile("finance")?.navKeys, "all");
  });

  it("uiRoleOptionsIncludingCurrent keeps legacy role visible", () => {
    const opts = uiRoleOptionsIncludingCurrent({}, "asset_custodian");
    assert.ok(opts.some((o) => o.value === "asset_custodian"));
  });
});
