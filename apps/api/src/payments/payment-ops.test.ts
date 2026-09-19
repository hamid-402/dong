import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import type { IamStore } from "../iam/iam.types.js";
import type { ExpensesService } from "../expenses/expenses.service.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import type { BillingStore } from "../billing/billing.types.js";
import { MemorySettlementStore } from "../settlements/memory-settlement.store.js";
import type { SettlementStore } from "../settlements/settlement.types.js";
import { InvoiceEventsService } from "../billing/invoice-events.service.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { MemoryPaymentOpsStore } from "./memory-payment-ops.store.js";
import { WorkspacePaymentsService } from "./workspace-payments.service.js";
import { confirmSettlementFromGateway } from "./gateway-settlement-confirm.js";
import { MemoryPaymentStore } from "./payment.store.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const payer = {
  userId: "22222222-2222-4222-8222-222222222222",
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
const creditor = {
  userId: "44444444-4444-4444-8444-444444444444",
  externalSubject: "creditor",
  displayName: "Creditor",
  authMode: "password" as const,
};

function mockAccess(roleByUser: Record<string, string>): WorkspaceAccessService {
  return {
    requireMember: async () => undefined,
    requireMemberRole: async (_ws: string, userId: string) =>
      (roleByUser[userId] ?? "member") as "member",
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

function iamStub(): IamStore {
  return {
    listMembers: async () => [
      {
        userId: payer.userId,
        displayName: "Payer",
        role: "member",
        defaultShares: 1,
      },
      {
        userId: finance.userId,
        displayName: "Finance",
        role: "finance",
        defaultShares: 2,
      },
      {
        userId: creditor.userId,
        displayName: "Creditor",
        role: "member",
        defaultShares: 1,
      },
    ],
  } as unknown as IamStore;
}

function expensesStub(): ExpensesService {
  return {
    createDraft: async () => {
      throw new Error("expenses stub — use topup tests with real mock");
    },
  } as unknown as ExpensesService;
}

function buildService(settlements?: SettlementStore) {
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const settlementStore = settlements ?? new MemorySettlementStore();
  const access = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
    [creditor.userId]: "member",
  });
  const service = new WorkspacePaymentsService(
    ops,
    access,
    iamStub(),
    expensesStub(),
    settlementStore,
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  return { service, ops, ledger, settlementStore };
}

test("S11-09 unapproved receipt creates no journal", async () => {
  const { service, ledger, settlementStore } = buildService();
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: payer.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "100000", currency: "IRR" },
    idempotencyKey: "set-1",
  });
  const attachmentId = crypto.randomUUID();
  const receipt = await service.createReceipt(payer, workspaceId, {
    settlementId: claim.id,
    method: "card_to_card",
    amountMinor: "100000",
    paidAt: new Date().toISOString(),
    destHolderName: "Creditor",
    destLast4: "1234",
    referenceNo: "TRACK-100000",
    attachmentId,
    idempotencyKey: "rcpt-1",
  });
  assert.equal(receipt.status, "submitted");
  assert.equal(receipt.attachmentId, attachmentId);
  assert.equal(receipt.journalEntryId, undefined);
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 0);
});

test("S11-09 approve receipt creates journal and confirms settlement", async () => {
  const { service, ledger, settlementStore } = buildService();
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: payer.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "250000", currency: "IRR" },
    idempotencyKey: "set-2",
  });
  const receipt = await service.createReceipt(payer, workspaceId, {
    settlementId: claim.id,
    method: "card_to_card",
    amountMinor: "250000",
    paidAt: new Date().toISOString(),
    destLast4: "9876",
    referenceNo: "TRACK-250000",
    idempotencyKey: "rcpt-2",
  });
  const approved = await service.approveReceipt(finance, workspaceId, receipt.id);
  assert.equal(approved.status, "approved");
  assert.ok(approved.journalEntryId);
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.sourceType, "settlement");
  const settled = await settlementStore.get(workspaceId, claim.id, finance.userId);
  assert.equal(settled?.status, "confirmed");
});

test("card_to_card requires referenceNo", async () => {
  const { service, settlementStore } = buildService();
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: payer.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "10000", currency: "IRR" },
    idempotencyKey: "set-ref-req",
  });
  await assert.rejects(
    () =>
      service.createReceipt(payer, workspaceId, {
        settlementId: claim.id,
        method: "card_to_card",
        amountMinor: "10000",
        paidAt: new Date().toISOString(),
        destLast4: "1111",
        idempotencyKey: "rcpt-no-ref",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "CARD_TRANSFER_REF_REQUIRED");
      return true;
    },
  );
});

test("creditor can approve card_to_card receipt (two-sided)", async () => {
  const { service, ledger, settlementStore } = buildService();
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: payer.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "88000", currency: "IRR" },
    idempotencyKey: "set-two-sided",
  });
  const receipt = await service.createReceipt(payer, workspaceId, {
    settlementId: claim.id,
    method: "card_to_card",
    amountMinor: "88000",
    paidAt: new Date().toISOString(),
    destLast4: "4321",
    referenceNo: "IR-TRACK-88",
    idempotencyKey: "rcpt-two-sided",
  });
  const listed = await service.listReceipts(creditor, workspaceId);
  assert.ok(listed.some((r) => r.id === receipt.id));
  const approved = await service.approveReceipt(creditor, workspaceId, receipt.id);
  assert.equal(approved.status, "approved");
  assert.ok(approved.journalEntryId);
  const settled = await settlementStore.get(workspaceId, claim.id, creditor.userId);
  assert.equal(settled?.status, "confirmed");
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 1);
});

test("S11-09 self-review denied", async () => {
  const settlementStore = new MemorySettlementStore();
  const accessFinancePayer = mockAccess({
    [finance.userId]: "finance",
    [creditor.userId]: "member",
  });
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const svc = new WorkspacePaymentsService(
    ops,
    accessFinancePayer,
    iamStub(),
    expensesStub(),
    settlementStore,
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: finance.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "50000", currency: "IRR" },
    idempotencyKey: "set-3",
  });
  const receipt = await svc.createReceipt(finance, workspaceId, {
    settlementId: claim.id,
    method: "cash",
    amountMinor: "50000",
    paidAt: new Date().toISOString(),
    idempotencyKey: "rcpt-3",
  });
  await assert.rejects(
    () => svc.approveReceipt(finance, workspaceId, receipt.id),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "RECEIPT_SELF_REVIEW");
      return true;
    },
  );
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 0);
});

test("S11-09 petty cash spend without expense rejected", async () => {
  const { service } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "صندوق روز",
    openingBalanceMinor: "1000",
    idempotencyKey: "fund-1",
  });
  await assert.rejects(
    () =>
      service.createPettyCashMovement(finance, workspaceId, fund.id, {
        kind: "spend",
        amountMinor: "100",
        idempotencyKey: "mov-bare",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "PETTY_CASH_SPEND_NEEDS_EXPENSE");
      return true;
    },
  );
});

test("S11-09 petty cash spend insufficient rejected", async () => {
  const { service } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "صندوق روز",
    openingBalanceMinor: "1000",
    idempotencyKey: "fund-1",
  });
  await assert.rejects(
    () =>
      service.createPettyCashMovement(finance, workspaceId, fund.id, {
        kind: "spend",
        amountMinor: "1001",
        expenseId: crypto.randomUUID(),
        idempotencyKey: "mov-1",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "PETTY_CASH_INSUFFICIENT");
      return true;
    },
  );
  const funds = await service.listPettyCash(finance, workspaceId);
  assert.equal(funds[0]?.balanceMinor, "1000");
});

test("petty cash topup-from-members posts expense and raises balance", async () => {
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const settlementStore = new MemorySettlementStore();
  const access = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
    [creditor.userId]: "member",
  });
  const expenseId = "55555555-5555-4555-8555-555555555555";
  const expenses = {
    createDraft: async () => ({
      id: expenseId,
      workspaceId,
      title: "شارژ تنخواه",
      status: "posted",
      visibility: "shared",
      total: { amountMinor: "4000", currency: "IRR" },
      paidByUserId: finance.userId,
      paymentLines: [],
      splitMethod: "equal",
      participantUserIds: [payer.userId, finance.userId, creditor.userId],
      splits: [
        {
          userId: payer.userId,
          amount: { amountMinor: "1334", currency: "IRR" },
        },
        {
          userId: finance.userId,
          amount: { amountMinor: "1333", currency: "IRR" },
        },
        {
          userId: creditor.userId,
          amount: { amountMinor: "1333", currency: "IRR" },
        },
      ],
      occurredOn: "2026-09-16",
      createdAt: new Date().toISOString(),
    }),
  } as unknown as ExpensesService;
  const service = new WorkspacePaymentsService(
    ops,
    access,
    iamStub(),
    expenses,
    settlementStore,
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "تنخواه تست",
    openingBalanceMinor: "1000",
    idempotencyKey: "fund-topup-1",
  });
  const result = await service.topupPettyCashFromMembers(
    finance,
    workspaceId,
    fund.id,
    {
      amountMinor: "4000",
      splitMethod: "equal",
      participantUserIds: [payer.userId, finance.userId, creditor.userId],
      idempotencyKey: "topup-members-1",
    },
  );
  assert.equal(result.expense.id, expenseId);
  assert.equal(result.movement.kind, "topup");
  assert.equal(result.movement.expenseId, expenseId);
  assert.equal(result.balanceMinor, "5000");
  assert.equal(result.splits.length, 3);
});

test("petty cash compensate on expense reverse restores balance after topup", async () => {
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const settlementStore = new MemorySettlementStore();
  const access = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
    [creditor.userId]: "member",
  });
  const expenseId = "66666666-6666-4666-8666-666666666666";
  const expenses = {
    createDraft: async () => ({
      id: expenseId,
      workspaceId,
      title: "شارژ تنخواه",
      status: "posted",
      visibility: "shared",
      total: { amountMinor: "2000", currency: "IRR" },
      paidByUserId: finance.userId,
      paymentLines: [],
      splitMethod: "equal",
      participantUserIds: [payer.userId, finance.userId],
      splits: [
        {
          userId: payer.userId,
          amount: { amountMinor: "1000", currency: "IRR" },
        },
        {
          userId: finance.userId,
          amount: { amountMinor: "1000", currency: "IRR" },
        },
      ],
      occurredOn: "2026-09-16",
      createdAt: new Date().toISOString(),
    }),
  } as unknown as ExpensesService;
  const service = new WorkspacePaymentsService(
    ops,
    access,
    iamStub(),
    expenses,
    settlementStore,
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "تنخواه جبران",
    openingBalanceMinor: "1000",
    idempotencyKey: "fund-comp-1",
  });
  await service.topupPettyCashFromMembers(finance, workspaceId, fund.id, {
    amountMinor: "2000",
    participantUserIds: [payer.userId, finance.userId],
    idempotencyKey: "topup-comp-1",
  });
  const before = await service.listPettyCash(finance, workspaceId);
  assert.equal(before[0]?.balanceMinor, "3000");

  await service.compensateMovementsForReversedExpense(
    finance,
    workspaceId,
    expenseId,
  );
  const after = await service.listPettyCash(finance, workspaceId);
  assert.equal(after[0]?.balanceMinor, "1000");
});

test("petty cash spend-as-expense debits fund and posts expense", async () => {
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const settlementStore = new MemorySettlementStore();
  const access = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
    [creditor.userId]: "member",
  });
  const expenseId = "77777777-7777-4777-8777-777777777777";
  const expenses = {
    createDraft: async (
      _actor: unknown,
      _ws: string,
      body: { fundingSourceKind?: string; fundingRefId?: string },
    ) => ({
      id: expenseId,
      workspaceId,
      title: "برداشت تنخواه",
      status: "posted",
      visibility: "shared",
      total: { amountMinor: "500", currency: "IRR" },
      paidByUserId: finance.userId,
      paymentLines: [],
      splitMethod: "equal",
      participantUserIds: [payer.userId, finance.userId],
      splits: [
        {
          userId: payer.userId,
          amount: { amountMinor: "250", currency: "IRR" },
        },
        {
          userId: finance.userId,
          amount: { amountMinor: "250", currency: "IRR" },
        },
      ],
      fundingSourceKind: body.fundingSourceKind,
      fundingRefId: body.fundingRefId,
      occurredOn: "2026-09-16",
      createdAt: new Date().toISOString(),
    }),
  } as unknown as ExpensesService;
  const service = new WorkspacePaymentsService(
    ops,
    access,
    iamStub(),
    expenses,
    settlementStore,
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "تنخواه خرج",
    openingBalanceMinor: "2000",
    idempotencyKey: "fund-spend-1",
  });
  const result = await service.spendPettyCashAsExpense(
    finance,
    workspaceId,
    fund.id,
    {
      amountMinor: "500",
      participantUserIds: [payer.userId, finance.userId],
      idempotencyKey: "spend-exp-1",
    },
  );
  assert.equal(result.expense.id, expenseId);
  assert.equal(result.movement.kind, "spend");
  assert.equal(result.balanceMinor, "1500");
});

test("petty cash health reports live balances", async () => {
  const { service } = buildService();
  await service.createPettyCashFund(finance, workspaceId, {
    name: "سلامت",
    openingBalanceMinor: "2500",
    idempotencyKey: "fund-health-1",
  });
  const health = await service.pettyCashHealth(finance, workspaceId);
  assert.equal(health.fundCount, 1);
  assert.equal(health.totalBalanceMinor, "2500");
  assert.equal(health.funds[0]?.status, "ok");
});

test("S11-09 credit purchase stays open until paid", async () => {
  const { service } = buildService();
  const purchase = await service.createCreditPurchase(finance, workspaceId, {
    supplierRef: "نانوایی محلی",
    amountMinor: "1000000",
    purchasedAt: new Date().toISOString(),
    dueDate: "2026-10-01",
    idempotencyKey: "cred-1",
  });
  assert.equal(purchase.status, "open");
  assert.equal(purchase.remainingMinor, "1000000");
  const partial = await service.createCreditPurchasePayment(
    finance,
    workspaceId,
    purchase.id,
    {
      amountMinor: "400000",
      sourceKind: "bank_transfer",
      idempotencyKey: "cred-pay-1",
    },
  );
  assert.equal(partial.status, "partially_paid");
  assert.equal(partial.remainingMinor, "600000");
});

test("S11-09 gateway verify confirms linked settlement", async () => {
  const settlementStore = new MemorySettlementStore();
  const claim = await settlementStore.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: payer.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "75000", currency: "IRR" },
    idempotencyKey: "set-gw",
  });
  const paymentStore = new MemoryPaymentStore();
  const ledger = new MemoryLedgerStore();
  const link = await paymentStore.create(
    "zarinpal",
    {
      workspaceId,
      settlementId: claim.id,
      amount: { amountMinor: "75000", currency: "IRR" },
      description: "تسویه",
      returnUrl: "https://dang.local/return",
      idempotencyKey: "plink-gw",
    },
    { checkoutUrl: "https://zarinpal.test/pay", providerRef: "A-GW-1" },
  );
  assert.equal(link.settlementId, claim.id);

  await confirmSettlementFromGateway({
    settlements: settlementStore,
    ledger,
    workspaceId,
    settlementId: claim.id,
  });

  const settled = await settlementStore.get(workspaceId, claim.id, finance.userId);
  assert.equal(settled?.status, "confirmed");
  const entries = await ledger.listForWorkspace(workspaceId, finance.userId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.sourceType, "settlement");
});
