import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_MANAGER_ROLES,
  COMPANY_EXPENSE_POST_ROLES,
  EXPENSE_APPROVER_ROLES,
  FINANCE_MANAGER_ROLES,
  INVITE_ADMIN_ROLES,
  JOBS_DLQ_ROLES,
  PARTNERSHIP_MANAGER_ROLES,
  PROCUREMENT_APPROVER_ROLES,
  PROCUREMENT_BUYER_ROLES,
  RANGE_LOCK_ROLES,
  WORKSPACE_ADMIN_ROLES,
  canManageJobsDlq,
  isFinanceManagerRole,
  roleInSet,
} from "../src/index.js";

test("jobs DLQ roles match workspace admin set", () => {
  assert.deepEqual([...JOBS_DLQ_ROLES], [...WORKSPACE_ADMIN_ROLES]);
  assert.deepEqual([...INVITE_ADMIN_ROLES], [...WORKSPACE_ADMIN_ROLES]);
  assert.equal(canManageJobsDlq("owner"), true);
  assert.equal(canManageJobsDlq("member"), false);
  assert.equal(canManageJobsDlq(""), false);
});

test("finance-adjacent sets stay aligned with FINANCE_MANAGER_ROLES", () => {
  assert.deepEqual([...RANGE_LOCK_ROLES], [...FINANCE_MANAGER_ROLES]);
  assert.deepEqual([...PARTNERSHIP_MANAGER_ROLES], [...FINANCE_MANAGER_ROLES]);
  assert.equal(isFinanceManagerRole("finance"), true);
  assert.equal(roleInSet("finance", RANGE_LOCK_ROLES), true);
});

test("approver/buyer/asset sets include expected roles", () => {
  assert.deepEqual([...COMPANY_EXPENSE_POST_ROLES], [...EXPENSE_APPROVER_ROLES]);
  assert.equal(roleInSet("approver", EXPENSE_APPROVER_ROLES), true);
  assert.equal(roleInSet("buyer", PROCUREMENT_BUYER_ROLES), true);
  assert.equal(roleInSet("approver", PROCUREMENT_APPROVER_ROLES), true);
  assert.equal(roleInSet("asset_custodian", ASSET_MANAGER_ROLES), true);
  assert.equal(roleInSet("guest", ASSET_MANAGER_ROLES), false);
});
