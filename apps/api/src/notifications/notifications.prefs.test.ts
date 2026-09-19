/**
 * Notification event prefs gate in-app delivery (Wave F prefs).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ModuleRef } from "@nestjs/core";
import { NotificationsService } from "./notifications.service.js";
import { MemoryNotificationStore } from "./notification.store.js";
import { RealtimeHub } from "./realtime-hub.js";
import type { IamStore } from "../iam/iam.types.js";
import type { WaveFSettingsService } from "../wave-f-settings/wave-f-settings.service.js";

function stubIam(): IamStore {
  return {
    listMembers: async () => [
      { userId: "owner-1", role: "owner", displayName: "Owner" },
      { userId: "admin-1", role: "admin", displayName: "Admin" },
      { userId: "member-1", role: "member", displayName: "Member" },
    ],
  } as unknown as IamStore;
}

function stubModuleRef(prefs: WaveFSettingsService | undefined): ModuleRef {
  return {
    get: () => prefs,
  } as unknown as ModuleRef;
}

function prefsFor(
  resolve: (userId: string) => {
    emailDigest: "off";
    expensePosted: boolean;
    settlementClaimed: boolean;
    inviteAccepted: boolean;
    securityAlert: boolean;
  },
): WaveFSettingsService {
  return {
    getPref: async (userId: string) => resolve(userId),
  } as unknown as WaveFSettingsService;
}

test("skips expense.posted when recipient disabled expensePosted", async () => {
  const store = new MemoryNotificationStore();
  const prefs = prefsFor((userId) => ({
    emailDigest: "off",
    expensePosted: userId !== "u2",
    settlementClaimed: true,
    inviteAccepted: true,
    securityAlert: true,
  }));
  const svc = new NotificationsService(
    store,
    stubIam(),
    new RealtimeHub(),
    stubModuleRef(prefs),
  );

  await svc.notifyExpensePosted("w1", "u1", "ناهار", ["u1", "u2", "u3"]);
  const forU2 = await store.listForUser("w1", "u2");
  const forU3 = await store.listForUser("w1", "u3");
  assert.equal(forU2.length, 0);
  assert.equal(forU3.length, 1);
  assert.equal(forU3[0]?.metadata?.event, "expense.posted");
});

test("skips settlement claim when counterpart disabled settlementClaimed", async () => {
  const store = new MemoryNotificationStore();
  const prefs = prefsFor(() => ({
    emailDigest: "off",
    expensePosted: true,
    settlementClaimed: false,
    inviteAccepted: true,
    securityAlert: true,
  }));
  const svc = new NotificationsService(
    store,
    stubIam(),
    new RealtimeHub(),
    stubModuleRef(prefs),
  );

  await svc.notifySettlementClaimed("w1", "u1", "u2", "1000");
  assert.equal((await store.listForUser("w1", "u2")).length, 0);
});

test("invite accepted notifies owners/admins only when preferred", async () => {
  const store = new MemoryNotificationStore();
  const prefs = prefsFor((userId) => ({
    emailDigest: "off",
    expensePosted: true,
    settlementClaimed: true,
    inviteAccepted: userId === "owner-1",
    securityAlert: true,
  }));
  const svc = new NotificationsService(
    store,
    stubIam(),
    new RealtimeHub(),
    stubModuleRef(prefs),
  );

  await svc.notifyInviteAccepted("w1", "member-1", "آکمه");
  assert.equal((await store.listForUser("w1", "owner-1")).length, 1);
  assert.equal((await store.listForUser("w1", "admin-1")).length, 0);
  assert.equal((await store.listForUser("w1", "member-1")).length, 0);
});
