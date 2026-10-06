import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import type { IamStore } from "../iam/iam.types.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import { BalancesService } from "./balances.service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const finance: AuthActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  externalSubject: "fin",
  displayName: "Finance",
  authMode: "password",
};
const member: AuthActor = {
  userId: "33333333-3333-4333-8333-333333333333",
  externalSubject: "mem",
  displayName: "Member",
  authMode: "password",
};
const debtorId = "44444444-4444-4444-8444-444444444444";

function iamStub(): IamStore {
  return {
    getWorkspaceForUser: async (_ws: string, userId: string) =>
      userId === debtorId || userId === finance.userId || userId === member.userId
        ? ({ id: workspaceId, name: "WS", slug: "ws", template: "friends_family" } as never)
        : null,
  } as unknown as IamStore;
}

test("remindDebt requires finance manager", async () => {
  const access = {
    requireFinanceManager: async (_ws: string, userId: string) => {
      if (userId !== finance.userId) {
        throw new ForbiddenException({ status: 403, title: "Forbidden" });
      }
      return "finance";
    },
  } as unknown as WorkspaceAccessService;

  const ledger = new MemoryLedgerStore();
  await ledger.postExpense(finance.userId, {
    id: crypto.randomUUID(),
    workspaceId,
    title: "debt",
    status: "posted",
    visibility: "shared",
    total: { amountMinor: "100000", currency: "IRR" },
    paidByUserId: finance.userId,
    paymentLines: [],
    splitMethod: "equal",
    participantUserIds: [finance.userId, debtorId],
    splits: [
      { userId: finance.userId, amount: { amountMinor: "50000", currency: "IRR" } },
      { userId: debtorId, amount: { amountMinor: "50000", currency: "IRR" } },
    ],
    occurredOn: "2026-09-01",
    createdAt: new Date().toISOString(),
  });

  const notifications = {
    notifyDebtReminder: async () => ({ ok: true as const }),
  } as unknown as NotificationsService;

  const service = new BalancesService(ledger, iamStub(), access, notifications);

  await assert.rejects(
    () => service.remindDebt(member, workspaceId, debtorId),
    (err: unknown) => err instanceof ForbiddenException,
  );

  const ok = await service.remindDebt(finance, workspaceId, debtorId);
  assert.equal(ok.ok, true);
});
