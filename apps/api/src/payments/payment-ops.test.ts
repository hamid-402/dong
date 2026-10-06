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
import {
  toSettlementSummary,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import type { SettlementsService } from "../settlements/settlements.service.js";
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
    requireMutableMember: async (_ws: string, userId: string) => {
      const role = roleByUser[userId] ?? "member";
      if (role === "auditor" || role === "guest") {
        throw new ForbiddenException({ status: 403, title: "Forbidden" });
      }
      return role as "member";
    },
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

function iamStub(template: string = "friends_family"): IamStore {
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
    getWorkspaceForUser: async () => ({
      id: workspaceId,
      name: "WS",
      slug: "ws",
      template,
      createdAt: new Date().toISOString(),
    }),
  } as unknown as IamStore;
}

function expensesStub(): ExpensesService {
  return {
    createDraft: async () => {
      throw new Error("expenses stub — use topup tests with real mock");
    },
  } as unknown as ExpensesService;
}

function settlementsServiceStub(store: SettlementStore): SettlementsService {
  return {
    createClaim: async (
      actor: { userId: string },
      workspaceId: string,
      body: {
        fromUserId: string;
        toUserId: string;
        amount: { amountMinor: string; currency: "IRR" };
        note?: string;
        idempotencyKey: string;
      },
    ) => {
      const created = await store.createClaim(actor.userId, {
        workspaceId,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount,
        note: body.note,
        idempotencyKey: body.idempotencyKey,
      });
      return toSettlementSummary(created);
    },
  } as unknown as SettlementsService;
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
    settlementsServiceStub(settlementStore),
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
    settlementsServiceStub(settlementStore),
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
    settlementsServiceStub(settlementStore),
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
    settlementsServiceStub(settlementStore),
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
    settlementsServiceStub(settlementStore),
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

test("ensure-default petty cash is idempotent and forbidden on personal", async () => {
  const { service } = buildService();
  const first = await service.ensureDefaultPettyCashFund(finance, workspaceId, {
    idempotencyKey: "ensure-1",
  });
  assert.equal(first.created, true);
  assert.ok(first.defaultFund);
  assert.match(first.defaultFund!.name, /تنخواه/);

  const second = await service.ensureDefaultPettyCashFund(finance, workspaceId, {
    idempotencyKey: "ensure-2",
  });
  assert.equal(second.created, false);
  assert.equal(second.defaultFund?.id, first.defaultFund?.id);

  const personalOps = new MemoryPaymentOpsStore();
  const personalAccess = mockAccess({ [finance.userId]: "finance" });
  const personalSettlements = new MemorySettlementStore();
  const personalService = new WorkspacePaymentsService(
    personalOps,
    personalAccess,
    iamStub("personal"),
    expensesStub(),
    personalSettlements,
    settlementsServiceStub(personalSettlements),
    new MemoryLedgerStore(),
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  await assert.rejects(
    () => personalService.ensureDefaultPettyCashFund(finance, workspaceId),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("funding spend debit and credit purchase link from posted expense", async () => {
  const { service, ops } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "اصلی",
    openingBalanceMinor: "500000",
    idempotencyKey: "fund-funding-1",
  });
  const expenseId = crypto.randomUUID();
  const spend = await service.applyFundingSpendForPostedExpense(
    finance,
    workspaceId,
    {
      id: expenseId,
      total: { amountMinor: "100000" },
      fundingSourceKind: "petty_cash",
      fundingRefId: fund.id,
      title: "نان",
    },
  );
  assert.ok(spend);
  assert.equal(spend!.kind, "spend");
  const again = await service.applyFundingSpendForPostedExpense(
    finance,
    workspaceId,
    {
      id: expenseId,
      total: { amountMinor: "100000" },
      fundingSourceKind: "petty_cash",
      fundingRefId: fund.id,
      title: "نان",
    },
  );
  assert.equal(again?.id, spend?.id);

  const creditExpenseId = crypto.randomUUID();
  const credit = await service.applyFundingCreditForPostedExpense(
    payer,
    workspaceId,
    {
      id: creditExpenseId,
      total: { amountMinor: "2500000" },
      fundingSourceKind: "credit",
      title: "لوازم اداری",
      occurredOn: "2026-09-20",
    },
  );
  assert.ok(credit);
  assert.equal(credit!.expenseId, creditExpenseId);
  assert.equal(credit!.status, "open");
  assert.equal(credit!.remainingMinor, "2500000");
  const listed = await ops.listCreditPurchases(workspaceId);
  assert.equal(listed.filter((p) => p.expenseId === creditExpenseId).length, 1);

  const idempotent = await service.applyFundingCreditForPostedExpense(
    payer,
    workspaceId,
    {
      id: creditExpenseId,
      total: { amountMinor: "2500000" },
      fundingSourceKind: "credit",
      title: "لوازم اداری",
      occurredOn: "2026-09-20",
    },
  );
  assert.equal(idempotent?.id, credit?.id);
});

test("petty cash ledger shows running balance and topup member shares", async () => {
  const ops = new MemoryPaymentOpsStore();
  const access = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
  });
  const expenseId = crypto.randomUUID();
  const expenses = {
    list: async () => [
      {
        id: expenseId,
        title: "شارژ تنخواه",
        paidByUserId: finance.userId,
        splits: [
          {
            userId: payer.userId,
            amount: { amountMinor: "300000", currency: "IRR" },
          },
          {
            userId: finance.userId,
            amount: { amountMinor: "200000", currency: "IRR" },
          },
        ],
      },
    ],
    createDraft: async () => {
      throw new Error("unused");
    },
  } as unknown as ExpensesService;
  const settlementStore = new MemorySettlementStore();
  const service = new WorkspacePaymentsService(
    ops,
    access,
    iamStub(),
    expenses,
    settlementStore,
    settlementsServiceStub(settlementStore),
    new MemoryLedgerStore(),
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "اصلی",
    openingBalanceMinor: "100000",
    idempotencyKey: "ledger-fund-1",
  });
  await service.createPettyCashMovement(finance, workspaceId, fund.id, {
    kind: "topup",
    amountMinor: "500000",
    expenseId,
    note: "شارژ از اعضا",
    occurredAt: "2026-09-20T10:00:00.000Z",
    idempotencyKey: "ledger-top-1",
  });
  await service.createPettyCashMovement(finance, workspaceId, fund.id, {
    kind: "spend",
    amountMinor: "150000",
    expenseId: crypto.randomUUID(),
    note: "خرید",
    occurredAt: "2026-09-21T12:00:00.000Z",
    idempotencyKey: "ledger-spend-1",
  });

  const ledger = await service.getPettyCashLedger(
    payer,
    workspaceId,
    fund.id,
  );
  assert.equal(ledger.openingBalanceMinor, "100000");
  assert.equal(ledger.closingBalanceMinor, "450000");
  assert.ok(ledger.fundCreatedAt);
  assert.equal(ledger.createdByDisplayName, "Finance");
  assert.equal(ledger.rows.length, 2);
  assert.equal(ledger.rows[0]?.kind, "topup");
  assert.equal(ledger.rows[0]?.cashInByDisplayName, "Finance");
  assert.equal(ledger.rows[0]?.memberContributions?.length, 2);
  assert.equal(ledger.rows[0]?.balanceAfterMinor, "600000");
  assert.equal(ledger.rows[1]?.kind, "spend");
  assert.equal(ledger.rows[1]?.balanceAfterMinor, "450000");
});

test("petty cash soft-close blocks movements and reopen restores", async () => {
  const { service } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "بسته",
    openingBalanceMinor: "1000",
    idempotencyKey: "close-fund-1",
  });
  const closed = await service.closePettyCashFund(finance, workspaceId, fund.id);
  assert.equal(closed.active, false);

  await assert.rejects(
    () =>
      service.createPettyCashMovement(finance, workspaceId, fund.id, {
        kind: "topup",
        amountMinor: "100",
        idempotencyKey: "close-blocked-1",
      }),
    (err: unknown) =>
      err instanceof BadRequestException &&
      (err.getResponse() as { code?: string }).code === "PETTY_CASH_FUND_CLOSED",
  );

  const reopened = await service.reopenPettyCashFund(
    finance,
    workspaceId,
    fund.id,
  );
  assert.equal(reopened.active, true);
  const mov = await service.createPettyCashMovement(
    finance,
    workspaceId,
    fund.id,
    {
      kind: "topup",
      amountMinor: "100",
      idempotencyKey: "close-ok-1",
    },
  );
  assert.equal(mov.movement.kind, "topup");
});

test("S12 gift to petty cash does not create shared expense", async () => {
  const { service, ops } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "هدیه",
    openingBalanceMinor: "0",
    idempotencyKey: "gift-fund-1",
  });
  const gifted = await service.giftPettyCash(payer, workspaceId, fund.id, {
    amountMinor: "250000",
    note: "کمک داوطلبانه",
    idempotencyKey: "gift-1",
  });
  assert.equal(gifted.balanceMinor, "250000");
  assert.equal(gifted.movement.kind, "gift");
  assert.equal(gifted.movement.expenseId, undefined);
  const movements = await ops.listMovements(workspaceId, fund.id);
  assert.equal(movements.length, 1);
  assert.equal(movements[0]?.kind, "gift");
  assert.equal(movements[0]?.expenseId, undefined);
});

test("member credit deposit posts shared expense and topup", async () => {
  const ops = new MemoryPaymentOpsStore();
  const ledger = new MemoryLedgerStore();
  const settlementStore = new MemorySettlementStore();
  const access = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
    [creditor.userId]: "member",
  });
  const expenseId = "66666666-6666-4666-8666-666666666666";
  let capturedParticipants: string[] | undefined;
  const expenses = {
    createDraft: async (
      _actor: unknown,
      _ws: string,
      body: {
        paidByUserId?: string;
        total: { amountMinor: string };
        participantUserIds?: string[];
      },
    ) => {
      capturedParticipants = body.participantUserIds;
      return {
      id: expenseId,
      workspaceId,
      title: "واریز صندوق",
      status: "posted",
      visibility: "shared",
      total: body.total,
      paidByUserId: body.paidByUserId ?? payer.userId,
      paymentLines: [],
      splitMethod: "equal",
      participantUserIds: body.participantUserIds ?? [
        finance.userId,
        creditor.userId,
      ],
      splits: [
        {
          userId: finance.userId,
          amount: { amountMinor: "150000", currency: "IRR" },
        },
        {
          userId: creditor.userId,
          amount: { amountMinor: "150000", currency: "IRR" },
        },
      ],
      occurredOn: "2026-09-12",
      createdAt: new Date().toISOString(),
    };
    },
  } as unknown as ExpensesService;
  const service = new WorkspacePaymentsService(
    ops,
    access,
    iamStub(),
    expenses,
    settlementStore,
    settlementsServiceStub(settlementStore),
    ledger,
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "صندوق اعتبار",
    openingBalanceMinor: "0",
    idempotencyKey: "credit-fund-1",
  });
  const credited = await service.depositPettyCashMemberCredit(
    payer,
    workspaceId,
    fund.id,
    {
      amountMinor: "300000",
      cashInByUserId: payer.userId,
      idempotencyKey: "credit-dep-1",
      occurredOn: "2026-09-12",
    },
  );
  assert.equal(credited.balanceMinor, "300000");
  assert.equal(credited.movement.kind, "topup");
  assert.equal(credited.movement.expenseId, expenseId);
  assert.equal(credited.expense.status, "posted");
  assert.equal(credited.expense.paidByUserId, payer.userId);
  assert.deepEqual(capturedParticipants?.slice().sort(), [
    creditor.userId,
    finance.userId,
  ].sort());
  const movements = await ops.listMovements(workspaceId, fund.id);
  assert.equal(movements.length, 1);
  assert.equal(movements[0]?.kind, "topup");
});

test("S12 gift forbidden on personal workspace", async () => {
  const ops = new MemoryPaymentOpsStore();
  const settlementStore = new MemorySettlementStore();
  const personalAccess = mockAccess({
    [payer.userId]: "member",
    [finance.userId]: "finance",
  });
  const fund = await ops.createFund(workspaceId, finance.userId, {
    name: "نباید",
    custodianUserId: finance.userId,
    openingBalanceMinor: "0",
    idempotencyKey: "personal-gift-fund",
  });
  const service = new WorkspacePaymentsService(
    ops,
    personalAccess,
    iamStub("personal"),
    expensesStub(),
    settlementStore,
    settlementsServiceStub(settlementStore),
    new MemoryLedgerStore(),
    billingStub(),
    new InvoiceEventsService(new MemoryOutboxStore()),
  );
  await assert.rejects(
    () =>
      service.giftPettyCash(payer, workspaceId, fund.id, {
        amountMinor: "1000",
        idempotencyKey: "personal-gift-1",
      }),
    (err: unknown) =>
      err instanceof BadRequestException &&
      (err.getResponse() as { code?: string }).code ===
        "PETTY_CASH_PERSONAL_FORBIDDEN",
  );
});

test("S12 settle_only overpay creates full settlement claim", async () => {
  const { service, ledger } = buildService();
  await ledger.postExpense(creditor.userId, {
    id: crypto.randomUUID(),
    workspaceId,
    title: "seed",
    status: "posted",
    visibility: "shared",
    total: { amountMinor: "200000", currency: "IRR" },
    paidByUserId: creditor.userId,
    paymentLines: [],
    splitMethod: "equal",
    participantUserIds: [payer.userId, creditor.userId],
    splits: [
      { userId: payer.userId, amount: { amountMinor: "100000", currency: "IRR" } },
      { userId: creditor.userId, amount: { amountMinor: "100000", currency: "IRR" } },
    ],
    occurredOn: "2026-09-01",
    createdAt: new Date().toISOString(),
  });
  const applied = await service.settlePay(payer, workspaceId, {
    counterpartyUserId: creditor.userId,
    amountMinor: "150000",
    intent: "settle_only",
    idempotencyKey: "settle-only-1",
  });
  assert.equal(applied.plan.settlementAmountMinor, "150000");
  assert.equal(applied.plan.giftAmountMinor, "0");
  assert.ok(applied.settlement);
  assert.equal(applied.gift, undefined);
});

test("S12 fund_gift_only posts gift without settlement", async () => {
  const { service } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "هدیه فقط",
    openingBalanceMinor: "0",
    idempotencyKey: "gift-only-fund",
  });
  const applied = await service.settlePay(payer, workspaceId, {
    counterpartyUserId: creditor.userId,
    amountMinor: "80000",
    intent: "fund_gift_only",
    fundId: fund.id,
    idempotencyKey: "gift-only-1",
  });
  assert.equal(applied.plan.settlementAmountMinor, "0");
  assert.equal(applied.plan.giftAmountMinor, "80000");
  assert.equal(applied.settlement, undefined);
  assert.equal(applied.gift?.movement.kind, "gift");
  assert.equal(applied.gift?.balanceMinor, "80000");
});

test("S12 asOf suggestion uses occurredOn not createdAt wall-clock", async () => {
  const { service, ledger } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "asof",
    openingBalanceMinor: "0",
    idempotencyKey: "asof-fund",
  });
  await ledger.postExpense(creditor.userId, {
    id: crypto.randomUUID(),
    workspaceId,
    title: "old debt",
    status: "posted",
    visibility: "shared",
    total: { amountMinor: "200000", currency: "IRR" },
    paidByUserId: creditor.userId,
    paymentLines: [],
    splitMethod: "equal",
    participantUserIds: [payer.userId, creditor.userId],
    splits: [
      { userId: payer.userId, amount: { amountMinor: "100000", currency: "IRR" } },
      { userId: creditor.userId, amount: { amountMinor: "100000", currency: "IRR" } },
    ],
    occurredOn: "2026-08-01",
    createdAt: "2026-09-20T12:00:00.000Z",
  });
  await ledger.postExpense(creditor.userId, {
    id: crypto.randomUUID(),
    workspaceId,
    title: "new debt",
    status: "posted",
    visibility: "shared",
    total: { amountMinor: "100000", currency: "IRR" },
    paidByUserId: creditor.userId,
    paymentLines: [],
    splitMethod: "equal",
    participantUserIds: [payer.userId, creditor.userId],
    splits: [
      { userId: payer.userId, amount: { amountMinor: "50000", currency: "IRR" } },
      { userId: creditor.userId, amount: { amountMinor: "50000", currency: "IRR" } },
    ],
    occurredOn: "2026-09-15",
    createdAt: "2026-09-20T12:00:00.000Z",
  });

  const livePreview = await service.settlePay(payer, workspaceId, {
    counterpartyUserId: creditor.userId,
    amountMinor: "200000",
    intent: "settle_and_fund_gift",
    fundId: fund.id,
    previewOnly: true,
    idempotencyKey: "asof-live",
  });
  // live: payer owes 150k
  assert.equal(livePreview.plan.suggestedSettleMinor, "150000");

  const asOfPreview = await service.settlePay(payer, workspaceId, {
    counterpartyUserId: creditor.userId,
    amountMinor: "200000",
    intent: "settle_and_fund_gift",
    fundId: fund.id,
    asOf: "2026-08-31",
    previewOnly: true,
    idempotencyKey: "asof-cut",
  });
  // asOf Aug 31: only first expense → payer owes 100k
  assert.equal(asOfPreview.plan.suggestedSettleMinor, "100000");
  assert.equal(asOfPreview.plan.settlementAmountMinor, "100000");
  assert.equal(asOfPreview.plan.giftAmountMinor, "100000");
  // live nets still reported
  assert.equal(asOfPreview.payerNetBeforeMinor, "-150000");
});

test("S12 settlePay preview + settle_and_fund_gift splits overpay", async () => {
  const { service, ledger, settlementStore } = buildService();
  const fund = await service.createPettyCashFund(finance, workspaceId, {
    name: "صندوق",
    openingBalanceMinor: "0",
    idempotencyKey: "settle-gift-fund",
  });
  // creditor paid 200k shared equally with payer → payer net -100k, creditor +100k
  await ledger.postExpense(creditor.userId, {
    id: crypto.randomUUID(),
    workspaceId,
    title: "seed debt",
    status: "posted",
    visibility: "shared",
    total: { amountMinor: "200000", currency: "IRR" },
    paidByUserId: creditor.userId,
    paymentLines: [],
    splitMethod: "equal",
    participantUserIds: [payer.userId, creditor.userId],
    splits: [
      {
        userId: payer.userId,
        amount: { amountMinor: "100000", currency: "IRR" },
      },
      {
        userId: creditor.userId,
        amount: { amountMinor: "100000", currency: "IRR" },
      },
    ],
    occurredOn: "2026-09-01",
    createdAt: new Date().toISOString(),
  });

  const preview = await service.settlePay(payer, workspaceId, {
    counterpartyUserId: creditor.userId,
    amountMinor: "150000",
    intent: "settle_and_fund_gift",
    fundId: fund.id,
    previewOnly: true,
    idempotencyKey: "preview-settle-1",
  });
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.plan.settlementAmountMinor, "100000");
  assert.equal(preview.plan.giftAmountMinor, "50000");
  assert.equal((await settlementStore.listForWorkspace(workspaceId, payer.userId)).length, 0);

  const applied = await service.settlePay(payer, workspaceId, {
    counterpartyUserId: creditor.userId,
    amountMinor: "150000",
    intent: "settle_and_fund_gift",
    fundId: fund.id,
    idempotencyKey: "apply-settle-1",
  });
  assert.equal(applied.previewOnly, false);
  assert.equal(applied.plan.settlementAmountMinor, "100000");
  assert.equal(applied.plan.giftAmountMinor, "50000");
  assert.ok(applied.settlement);
  assert.equal(applied.settlement?.amount.amountMinor, "100000");
  assert.ok(applied.gift);
  assert.equal(applied.gift?.balanceMinor, "50000");
});
