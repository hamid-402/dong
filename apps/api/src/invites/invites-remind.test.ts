import assert from "node:assert/strict";
import test from "node:test";
import type { InviteSummary } from "@dang/contracts";
import { filterInvitesDueForRemind } from "./invites.service.js";

test("filterInvitesDueForRemind selects pending invites expiring within 48h", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  const invites: InviteSummary[] = [
    {
      id: "i1",
      workspaceId: "w1",
      role: "member",
      invitedByUserId: "owner",
      createdAt: "2026-09-01T00:00:00.000Z",
      expiresAt: new Date(now + 24 * 3_600_000).toISOString(),
    },
    {
      id: "i2",
      workspaceId: "w1",
      role: "member",
      invitedByUserId: "owner",
      createdAt: "2026-09-01T00:00:00.000Z",
      expiresAt: new Date(now + 96 * 3_600_000).toISOString(),
    },
    {
      id: "i3",
      workspaceId: "w1",
      role: "member",
      invitedByUserId: "owner",
      createdAt: "2026-09-01T00:00:00.000Z",
      expiresAt: new Date(now - 1000).toISOString(),
      acceptedAt: undefined,
    },
  ];
  const due = filterInvitesDueForRemind(invites, now, 48);
  assert.deepEqual(due.map((i) => i.id), ["i1"]);
});
