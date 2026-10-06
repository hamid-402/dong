import assert from "node:assert/strict";
import test from "node:test";
import {
  dangerZoneActions,
  slugConfirmState,
  leaveConsequences,
} from "./workspace-danger-zone-actions";

test("personal template hides all destructive actions", () => {
  const next = dangerZoneActions({
    template: "personal",
    role: "owner",
    archived: false,
  });
  assert.equal(next.personalProtected, true);
  assert.equal(next.showLeave, false);
  assert.equal(next.showOwnerLifecycle, false);
});

test("member sees leave; owner sees archive/delete", () => {
  assert.deepEqual(
    dangerZoneActions({ template: "friends_family", role: "member", archived: false }),
    {
      personalProtected: false,
      showLeave: true,
      showOwnerLifecycle: false,
      showUnarchive: false,
    },
  );
  assert.deepEqual(
    dangerZoneActions({ template: "small_team", role: "owner", archived: true }),
    {
      personalProtected: false,
      showLeave: false,
      showOwnerLifecycle: true,
      showUnarchive: true,
    },
  );
});

test("slug confirm states", () => {
  assert.equal(slugConfirmState("", "trip"), "empty");
  assert.equal(slugConfirmState("tri", "trip"), "mismatch");
  assert.equal(slugConfirmState("TRIP", "trip"), "match");
});

test("leave consequences are non-empty keep/lose", () => {
  const c = leaveConsequences();
  assert.ok(c.keep.length >= 1);
  assert.ok(c.lose.length >= 1);
});
