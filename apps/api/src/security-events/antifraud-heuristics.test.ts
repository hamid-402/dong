import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInviteAnomaly,
  evaluateSettlementAnomaly,
} from "@dang/contracts";
import { MemorySecurityEventsStore } from "./memory-security-events.store.js";
import { SecurityEventsService } from "./security-events.service.js";

/**
 * Antifraud heuristics (R10-17) must emit fraud.* security events when callers
 * mirror settlements/invites services — wire-level contract for heuristics_v1.
 */
test("settlement anomaly reasons map to fraud.settlement_anomaly emit", async () => {
  const store = new MemorySecurityEventsStore();
  const events = new SecurityEventsService(store);
  const anomaly = evaluateSettlementAnomaly({
    amountMinor: "100",
    fromUserId: "u1",
    toUserId: "u1",
  });
  assert.equal(anomaly.ok, false);
  events.emit("fraud.settlement_anomaly", {
    workspaceId: "w1",
    actorUserId: "u1",
    reason: anomaly.reasons.join(","),
  });
  await Promise.resolve();
  const page = await events.listRecent({ limit: 5 });
  assert.equal(page.items[0]?.event, "fraud.settlement_anomaly");
  assert.equal(page.items[0]?.category, "fraud");
  assert.match(page.items[0]?.reason ?? "", /SELF_TRANSFER/);
});

test("invite anomaly reasons map to fraud.invite_anomaly emit", async () => {
  const store = new MemorySecurityEventsStore();
  const events = new SecurityEventsService(store);
  const anomaly = evaluateInviteAnomaly({
    role: "admin",
    invitedSubject: null,
    pendingOpenCount: 0,
    pendingElevatedCount: 0,
  });
  assert.equal(anomaly.ok, false);
  events.emit("fraud.invite_anomaly", {
    workspaceId: "w1",
    actorUserId: "u1",
    reason: anomaly.reasons.join(","),
  });
  await Promise.resolve();
  const page = await events.listRecent({ limit: 5 });
  assert.equal(page.items[0]?.event, "fraud.invite_anomaly");
  assert.match(page.items[0]?.reason ?? "", /ROLE_SENSITIVE_NO_SUBJECT/);
});
