import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import type { IamStore } from "../iam/iam.types.js";
import type { ExpensesService } from "../expenses/expenses.service.js";
import type { BillingStore } from "../billing/billing.types.js";
import { MemorySettlementStore } from "../settlements/memory-settlement.store.js";
import {
  toSettlementSummary,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import type { SettlementsService } from "../settlements/settlements.service.js";
import { InvoiceEventsService } from "../billing/invoice-events.service.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { MemoryPaymentOpsStore } from "./memory-payment-ops.store.js";
import { WorkspacePaymentsService } from "./workspace-payments.service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const debtor = {
  userId: "22222222-2222-4222-8222-222222222222",
  externalSubject: "debtor",
  displayName: "Debtor",
  authMode: "password" as const,
};
const payer = {
  userId: "55555555-5555-4555-8555-555555555555",
  externalSubject: "payer",
  displayName: "Payer",
  authMode: "password" as const,
};
const finance = {
  userId: "33333333-3333-4333-8333-333333333333",
  externalSubject: "finance",
  displayName: "Finance",
  authMode: "password" as const,
};
const stranger = {
  userId: "66666666-6666-4666-8666-666666666666",
  externalSubject: "stranger",
  displayName: "Stranger",
  authMode: "password" as const,
};
const creditor = {
  userId: "44444444-4444-4444-8444-444444444444",
  externalSubject: "creditor",
  displayName: "Creditor",
  authMode: "password" as const,
};

function mockAccess(roleByUser: Record<string, string>): WorkspaceAccessService {
  return {
    requireMember: async () => undefined,
    requireMemberRole: async (_ws: string, userId: string) => {
      const role = roleByUser[userId];
      if (!role) {
        throw new ForbiddenException({ status: 403, title: "Not a member" });
      }
      return role as "member";
    },
    requireAnyRole: async (_ws: string, userId: string) =>
      (roleByUser[userId] ?? "member") as "member",
    requireFinanceManager: async (_ws: string, userId: string) => {
      const role = roleByUser[userId] ?? "member";
      if (role !== "finance" && role !== "owner" && role !== "admin") {
        throw new ForbiddenException({ status: 403, title: "Forbidden" });
      }
      return role as "finance";
    },
    assertNotReadOnly: () => undefined,
  } as unknown as WorkspaceAccessService;
}

function billingStub(): BillingStore {
  return {
    persistence: "memory",
    markInvoicePaid: async () => {
      throw new Error("INVOICE_STATUS");
    },
  } as unknown as BillingStore;
}

function buildService(settlements?: SettlementStore) {
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const outbox = new MemoryOutboxStore();
  const invalidated: Array<{ userIds: string[]; topics: string[] }> = [];
  const notified: Array<{ userId: string; title: string }> = [];
  const relay = new OutboxRelay(
    outbox,
    {
      notifyOnBehalfPaid: async (
        _workspaceId: string,
        _payerUserId: string,
        debtorUserId: string,
        amountMinor: string,
      ) => {
        notified.push({ userId: debtorUserId, title: amountMinor });
      },
    } as never,
    {
      publishInvalidate: (_w: string, userIds: string[], topics: string[]) => {
        invalidated.push({ userIds, topics });
      },
    } as never,
  );
  const settlementStore = settlements ?? new MemorySettlementStore();
  const access = mockAccess({
    [debtor.userId]: "member",
    [payer.userId]: "member",
    [finance.userId]: "finance",
    [stranger.userId]: "member",
    [creditor.userId]: "member",
  });
  const service = new WorkspacePaymentsService(
    ops,
    access,
    { listMembers: async () => [] } as unknown as IamStore,
    { createDraft: async () => {
      throw new Error("unused");
    } } as unknown as ExpensesService,
    settlementStore,
    {
      createClaim: async (
        actor: { userId: string },
        wsId: string,
        body: {
          fromUserId: string;
          toUserId: string;
          amount: { amountMinor: string; currency: "IRR" };
          note?: string;
          idempotencyKey: string;
        },
      ) =>
        toSettlementSummary(
          await settlementStore.createClaim(actor.userId, {
            workspaceId: wsId,
            ...body,
          }),
        ),
    } as unknown as SettlementsService,
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
    undefined,
    outbox,
    relay,
  );
  return { service, ops, ledger, settlementStore, outbox, invalidated, notified };
}

test("S11-09 on-behalf: unapproved creates no journal", async () => {
  const { service, ledger } = buildService();
  const row = await service.createOnBehalf(debtor, workspaceId, {
    debtorUserId: debtor.userId,
    payerUserId: payer.userId,
    amountMinor: "100000",
    method: "bank_transfer",
    note: "پرداخت به‌جای بدهکار",
    idempotencyKey: "ob-1",
  });
  assert.equal(row.status, "pending");
  assert.equal(row.journalEntryId, undefined);
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 0);
});

test("S11-09 on-behalf: unauthorized approve denied", async () => {
  const { service, ledger } = buildService();
  const row = await service.createOnBehalf(debtor, workspaceId, {
    debtorUserId: debtor.userId,
    payerUserId: payer.userId,
    amountMinor: "80000",
    method: "cash",
    idempotencyKey: "ob-2",
  });
  await assert.rejects(
    () => service.approveOnBehalf(stranger, workspaceId, row.id),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "ON_BEHALF_UNAUTHORIZED");
      return true;
    },
  );
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 0);
});

test("an approved on-behalf payment tells both sides their balance moved", async () => {
  const { service, invalidated, notified } = buildService();
  const row = await service.createOnBehalf(debtor, workspaceId, {
    debtorUserId: debtor.userId,
    payerUserId: payer.userId,
    amountMinor: "90000",
    method: "cash",
    idempotencyKey: "ob-live",
  });
  await service.approveOnBehalf(finance, workspaceId, row.id);

  assert.equal(invalidated.length, 1, "a journal moved for two people in silence");
  assert.deepEqual(invalidated[0]?.userIds, [debtor.userId, payer.userId]);
  assert.deepEqual(invalidated[0]?.topics, ["settlements", "balances", "statements"]);
  assert.deepEqual(notified, [{ userId: debtor.userId, title: "90000" }]);
});

test("S11-09 on-behalf: approve creates journal", async () => {
  const { service, ledger } = buildService();
  const row = await service.createOnBehalf(debtor, workspaceId, {
    debtorUserId: debtor.userId,
    payerUserId: payer.userId,
    amountMinor: "120000",
    method: "card_to_card",
    idempotencyKey: "ob-3",
  });
  const approved = await service.approveOnBehalf(finance, workspaceId, row.id);
  assert.equal(approved.status, "approved");
  assert.ok(approved.journalEntryId);
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.sourceType, "payment_on_behalf");
  const creditDebtor = entries[0]?.lines.find(
    (l) => l.userId === debtor.userId && l.side === "credit",
  );
  const debitPayer = entries[0]?.lines.find(
    (l) => l.userId === payer.userId && l.side === "debit",
  );
  assert.ok(creditDebtor);
  assert.ok(debitPayer);
  assert.equal(creditDebtor?.amount.amountMinor, "120000");
});

test("S11-09 on-behalf: amount mismatch rejected", async () => {
  const { service, settlementStore, ledger } = buildService();
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: debtor.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "250000", currency: "IRR" },
    idempotencyKey: "ob-set-1",
  });
  await assert.rejects(
    () =>
      service.createOnBehalf(payer, workspaceId, {
        debtorUserId: debtor.userId,
        payerUserId: payer.userId,
        amountMinor: "249999",
        settlementId: claim.id,
        method: "bank_transfer",
        idempotencyKey: "ob-4",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "ON_BEHALF_AMOUNT_MISMATCH");
      return true;
    },
  );
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 0);
});

test("S11-09 on-behalf: payer may approve", async () => {
  const { service, ledger } = buildService();
  const row = await service.createOnBehalf(debtor, workspaceId, {
    debtorUserId: debtor.userId,
    payerUserId: payer.userId,
    amountMinor: "50000",
    method: "cash",
    idempotencyKey: "ob-5",
  });
  const approved = await service.approveOnBehalf(payer, workspaceId, row.id);
  assert.equal(approved.status, "approved");
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 1);
});
