import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_MANAGER_ROLES,
  COMPANY_EXPENSE_POST_ROLES,
  EXPENSE_APPROVER_ROLES,
  INVITE_ADMIN_ROLES,
  JOBS_DLQ_ROLES,
  PARTNERSHIP_MANAGER_ROLES,
  PROCUREMENT_APPROVER_ROLES,
  PROCUREMENT_BUYER_ROLES,
  RANGE_LOCK_ROLES,
  WEBHOOK_MANAGER_ROLES,
  WORKSPACE_ADMIN_ROLES,
  canManageJobsDlq,
  isWorkspaceAdminRole,
  roleInSet,
} from "../src/access-policy.js";
import {
  GRANTABLE_ACCESS_ACTIONS,
  LOCKED_ACCESS_ACTIONS,
  isDeputyWindowActive,
  isLockedAccessAction,
  resolveGrantLayers,
} from "../src/access-grants.js";
import {
  assertNeedTransition,
  assertPoTransition,
  assertPrTransition,
  canTransitionNeedStatus,
  canTransitionPoStatus,
  canTransitionPrStatus,
} from "../src/procurement-transitions.js";
import {
  FREE_PLAN_FEATURES,
  UI_PINNED_WORKSPACE_CAP,
  mergePinnedWorkspaceIds,
  multiplyDecimalStrings,
  parseExpenseCsv,
  planAllows,
  updateNotificationPreferenceSchema,
  updateUiPreferenceSchema,
  updateWorkspacePlanSchema,
  expenseCsvImportSchema,
} from "../src/wave-f.js";
import { assertRejection } from "./assert-rejection.js";

test("role helpers accept only exact role strings", () => {
  assert.equal(roleInSet("owner", WORKSPACE_ADMIN_ROLES), true);
  assert.equal(roleInSet("member", WORKSPACE_ADMIN_ROLES), false);
  assert.equal(roleInSet(null, WORKSPACE_ADMIN_ROLES), false);
  assert.equal(roleInSet(undefined, WORKSPACE_ADMIN_ROLES), false);
  assert.equal(roleInSet("Owner", WORKSPACE_ADMIN_ROLES), false);
  assert.equal(isWorkspaceAdminRole("admin"), true);
  assert.equal(isWorkspaceAdminRole("finance"), false);
  assert.equal(isWorkspaceAdminRole(undefined), false);
  assert.equal(canManageJobsDlq("owner"), true);
  assert.equal(canManageJobsDlq("finance"), false);
  assert.equal(canManageJobsDlq(null), false);
});

test("named role sets compose as documented", () => {
  assert.deepEqual([...JOBS_DLQ_ROLES], ["owner", "admin"]);
  assert.deepEqual([...INVITE_ADMIN_ROLES], ["owner", "admin"]);
  assert.deepEqual([...RANGE_LOCK_ROLES], ["owner", "admin", "finance"]);
  assert.deepEqual([...PARTNERSHIP_MANAGER_ROLES], [...RANGE_LOCK_ROLES]);
  assert.deepEqual([...WEBHOOK_MANAGER_ROLES], [...RANGE_LOCK_ROLES]);
  assert.deepEqual([...COMPANY_EXPENSE_POST_ROLES], [...EXPENSE_APPROVER_ROLES]);
  assert.ok(EXPENSE_APPROVER_ROLES.includes("approver"));
  assert.ok(PROCUREMENT_BUYER_ROLES.includes("buyer"));
  assert.ok(!PROCUREMENT_BUYER_ROLES.includes("approver" as never));
  assert.ok(PROCUREMENT_APPROVER_ROLES.includes("approver"));
  assert.ok(ASSET_MANAGER_ROLES.includes("asset_custodian"));
});

test("grant layers: locked actions are never decided, member beats role", () => {
  for (const action of LOCKED_ACCESS_ACTIONS) {
    assert.equal(isLockedAccessAction(action), true);
    assert.equal(
      resolveGrantLayers({ action, memberOverrides: [{ action, effect: "allow" }] }),
      null,
    );
  }
  assert.equal(isLockedAccessAction("expense.approve"), false);

  const action = "expense.approve";
  assert.deepEqual(
    resolveGrantLayers({
      action,
      memberOverrides: [{ action, effect: "deny" }],
      roleGrants: [{ action, effect: "allow" }],
    }),
    { allowed: false, source: "member_override", effect: "deny" },
  );
  assert.deepEqual(
    resolveGrantLayers({ action, roleGrants: [{ action, effect: "allow" }] }),
    { allowed: true, source: "role_grant", effect: "allow" },
  );
  assert.deepEqual(
    resolveGrantLayers({ action, roleGrants: [{ action, effect: "deny" }] }),
    { allowed: false, source: "role_grant", effect: "deny" },
  );
  assert.equal(
    resolveGrantLayers({ action, memberOverrides: [{ action: "other", effect: "allow" }], roleGrants: [] }),
    null,
  );
  assert.equal(resolveGrantLayers({ action }), null);
});

test("grantable actions never include locked actions", () => {
  for (const a of GRANTABLE_ACCESS_ACTIONS) assert.equal(isLockedAccessAction(a), false, a);
});

test("deputy window is inclusive, honours revocation and injected clock", () => {
  const startsAt = "2026-03-01T00:00:00Z";
  const endsAt = "2026-03-02T00:00:00Z";
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  assert.equal(isDeputyWindowActive({ startsAt, endsAt, nowMs: start }), true);
  assert.equal(isDeputyWindowActive({ startsAt, endsAt, nowMs: end }), true);
  assert.equal(isDeputyWindowActive({ startsAt, endsAt, nowMs: start - 1 }), false);
  assert.equal(isDeputyWindowActive({ startsAt, endsAt, nowMs: end + 1 }), false);
  assert.equal(isDeputyWindowActive({ startsAt, endsAt, nowMs: start + 1, revokedAt: "2026-03-01T01:00:00Z" }), false);
  assert.equal(isDeputyWindowActive({ startsAt, endsAt, nowMs: start + 1, revokedAt: null }), true);
  assert.equal(
    isDeputyWindowActive({ startsAt: new Date(start), endsAt: new Date(end), nowMs: start + 5 }),
    true,
  );
  assert.equal(
    isDeputyWindowActive({ startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) }),
    true,
  );
});

test("procurement transition tables allow only forward moves", () => {
  assert.equal(canTransitionPrStatus("draft", "submitted"), true);
  assert.equal(canTransitionPrStatus("draft", "cancelled"), true);
  assert.equal(canTransitionPrStatus("submitted", "approved"), true);
  assert.equal(canTransitionPrStatus("approved", "ordered"), true);
  assert.equal(canTransitionPrStatus("draft", "approved"), false);
  assert.equal(canTransitionPrStatus("ordered", "draft"), false);
  assert.equal(canTransitionPrStatus("rejected", "submitted"), false);

  assert.equal(canTransitionPoStatus("open", "partially_delivered"), true);
  assert.equal(canTransitionPoStatus("partially_delivered", "delivered"), true);
  assert.equal(canTransitionPoStatus("delivered", "open"), false);
  assert.equal(canTransitionPoStatus("cancelled", "open"), false);

  assert.equal(canTransitionNeedStatus("open", "fulfilled"), true);
  assert.equal(canTransitionNeedStatus("open", "cancelled"), true);
  assert.equal(canTransitionNeedStatus("fulfilled", "open"), false);
});

test("assert*Transition throws stable codes on illegal moves", () => {
  assert.doesNotThrow(() => assertPrTransition("draft", "submitted"));
  assert.throws(() => assertPrTransition("ordered", "draft"), /^Error: PR_STATUS$/);
  assert.doesNotThrow(() => assertPoTransition("open", "delivered"));
  assert.throws(() => assertPoTransition("delivered", "open"), /^Error: PO_STATUS$/);
  assert.doesNotThrow(() => assertNeedTransition("open", "fulfilled"));
  assert.throws(() => assertNeedTransition("cancelled", "open"), /^Error: NEED_STATUS$/);
});

test("multiplyDecimalStrings multiplies and trims trailing zeros", () => {
  assert.equal(multiplyDecimalStrings("2", "3"), "6");
  assert.equal(multiplyDecimalStrings("1.5", "2"), "3");
  assert.equal(multiplyDecimalStrings("0.1", "0.2"), "0.02");
  assert.equal(multiplyDecimalStrings("10", "0.000000001"), "0.00000001");
  assert.equal(multiplyDecimalStrings("1", "0.000000001"), "0");
  for (const [a, r] of [
    ["0", "1"],
    ["-1", "1"],
    ["x", "1"],
    ["1", "NaN"],
    ["1", "0"],
  ] as const) {
    assert.throws(() => multiplyDecimalStrings(a, r), /FX_PREVIEW_INVALID_NUMBER/, `${a}*${r}`);
  }
  assert.throws(() => multiplyDecimalStrings("1e308", "1e308"), /FX_PREVIEW_OVERFLOW/);
});

test("parseExpenseCsv rejects malformed files with stable codes", () => {
  const header = "title,amount_toman,occurred_on,visibility";
  assert.throws(() => parseExpenseCsv(""), /CSV_EMPTY/);
  assert.throws(() => parseExpenseCsv(header), /CSV_EMPTY/);
  assert.throws(() => parseExpenseCsv("a,b,c,d\nx,1,2026-03-01,shared"), /CSV_HEADER/);
  assert.throws(() => parseExpenseCsv(`${header}\n"unclosed,1,2026-03-01,shared`), /CSV_UNCLOSED_QUOTE/);
  assert.throws(() => parseExpenseCsv(`${header}\n,100,2026-03-01,shared`), /CSV_ROW/);
  assert.throws(() => parseExpenseCsv(`${header}\nx,0,2026-03-01,shared`), /CSV_ROW/);
  assert.throws(() => parseExpenseCsv(`${header}\nx,100,03/01/2026,shared`), /CSV_ROW/);
  assert.throws(() => parseExpenseCsv(`${header}\nx,100,2026-03-01,public`), /CSV_VISIBILITY/);
});

test("parseExpenseCsv handles BOM, CRLF, quoted commas and escaped quotes", () => {
  const csv = `\uFEFFTitle,Amount_Toman,Occurred_On,Visibility\r\n"Lunch, ""big""",1500,2026-03-01,private\r\nTaxi,200,2026-03-02,company\r\n`;
  assert.deepEqual(parseExpenseCsv(csv), [
    { title: 'Lunch, "big"', amountToman: "1500", occurredOn: "2026-03-01", visibility: "private" },
    { title: "Taxi", amountToman: "200", occurredOn: "2026-03-02", visibility: "company" },
  ]);
});

test("wave-f request schemas", () => {
  assert.equal(expenseCsvImportSchema.safeParse({ csvText: "x", idempotencyKey: "k" }).success, true);
  assertRejection(expenseCsvImportSchema.safeParse({ csvText: "", idempotencyKey: "k" }), {
    path: ["csvText"],
  });

  assert.equal(updateNotificationPreferenceSchema.safeParse({ emailDigest: "weekly", securityAlert: true }).success, true);
  assertRejection(updateNotificationPreferenceSchema.safeParse({ emailDigest: "daily" }), {
    path: ["emailDigest"],
  });
  assertRejection(updateNotificationPreferenceSchema.safeParse({ emailDigest: "off", surprise: 1 }), {
    code: "unrecognized_keys",
  });

  assert.equal(updateWorkspacePlanSchema.safeParse({ plan: "pro", seatsLimit: null }).success, true);
  assertRejection(updateWorkspacePlanSchema.safeParse({ plan: "pro", seatsLimit: 0 }), {
    path: ["seatsLimit"],
  });
  assertRejection(updateWorkspacePlanSchema.safeParse({ plan: "enterprise" }), {
    path: ["plan"],
  });

  assertRejection(updateUiPreferenceSchema.safeParse({}), {
    message: "at_least_one_pref",
  });
  assert.equal(updateUiPreferenceSchema.safeParse({ dismissShellTour: false }).success, true);
});

test("planAllows is unconditional and free features are documented", () => {
  for (const plan of ["free", "pro", "business"] as const) {
    assert.equal(planAllows(plan, "anything"), true);
  }
  assert.ok(FREE_PLAN_FEATURES.includes("core"));
});

test("mergePinnedWorkspaceIds dedupes, keeps local first, drops blanks and honours the cap", () => {
  assert.deepEqual(mergePinnedWorkspaceIds(["b", "a"], ["a", "c"]), ["b", "a", "c"]);
  assert.deepEqual(mergePinnedWorkspaceIds(["", "a", "a"], ["", "b"]), ["a", "b"]);
  assert.deepEqual(mergePinnedWorkspaceIds([], []), []);
  assert.deepEqual(mergePinnedWorkspaceIds(["a", "b", "c"], ["d"], 2), ["a", "b"]);
  const many = Array.from({ length: 20 }, (_, i) => `w${i}`);
  assert.equal(mergePinnedWorkspaceIds(many, []).length, UI_PINNED_WORKSPACE_CAP);
});
