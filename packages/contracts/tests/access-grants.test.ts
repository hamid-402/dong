import assert from "node:assert/strict";
import test from "node:test";
import {
  GRANTABLE_ACCESS_ACTIONS,
  isDeputyWindowActive,
  isLockedAccessAction,
  resolveGrantLayers,
} from "../src/access-grants.js";

test("locked actions are detected", () => {
  assert.equal(isLockedAccessAction("permission.grant_edit"), true);
  assert.equal(isLockedAccessAction("invite.create"), false);
});

test("resolveGrantLayers prefers member override over role grant", () => {
  const decision = resolveGrantLayers({
    action: "invite.create",
    memberOverrides: [{ action: "invite.create", effect: "deny" }],
    roleGrants: [{ action: "invite.create", effect: "allow" }],
  });
  assert.equal(decision?.source, "member_override");
  assert.equal(decision?.allowed, false);
});

test("resolveGrantLayers returns null when no grant applies", () => {
  assert.equal(
    resolveGrantLayers({
      action: "invite.create",
      roleGrants: [],
      memberOverrides: [],
    }),
    null,
  );
});

test("deputy window active only inside range and not revoked", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  assert.equal(
    isDeputyWindowActive({
      startsAt: "2026-09-13T00:00:00Z",
      endsAt: "2026-09-14T00:00:00Z",
      nowMs: now,
    }),
    true,
  );
  assert.equal(
    isDeputyWindowActive({
      startsAt: "2026-09-13T00:00:00Z",
      endsAt: "2026-09-14T00:00:00Z",
      revokedAt: "2026-09-13T11:00:00Z",
      nowMs: now,
    }),
    false,
  );
  assert.ok(GRANTABLE_ACCESS_ACTIONS.includes("invite.create"));
});
