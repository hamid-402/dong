/**
 * Overpay credit must apply once under concurrent generateInvoices.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor } from "@dang/contracts";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { MemoryPaymentOpsStore } from "../payments/memory-payment-ops.store.js";
import { BillingService } from "./billing.service.js";
import { InvoiceEventsService } from "./invoice-events.service.js";
import { MemoryBillingStore } from "./memory-billing.store.js";

const WS = "ws-overpay-conc";
const SPENT_ON = "2026-04-05";
const finance: AuthActor = {
  userId: "alice",
  externalSubject: "alice",
  displayName: "آلیس",
  authMode: "dev",
};
const payerId = "bob";

test("run13b concurrent generateInvoices applies overpay credit once", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const ops = new MemoryPaymentOpsStore();
  const outbox = new MemoryOutboxStore();
  const access = {
    requireFinanceManager: async () => "finance",
    requireMemberRole: async () => "finance",
    requireMember: async () => undefined,
    assertNotReadOnly: () => undefined,
  };
  const service = new BillingService(
    billing,
    access as never,
    { append: async () => undefined } as never,
    {
      run: async (_a: string, _b: string, _c: string, fn: () => unknown) => fn(),
    } as never,
    { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
    { notify: async () => undefined } as never,
    new InvoiceEventsService(outbox),
    undefined,
    ops,
  );

  const period = await billing.ensureAutoPeriod(WS, finance.userId, SPENT_ON);
  const draft = await expenses.createDraft(finance.userId, {
    workspaceId: WS,
    title: "ناهار",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: finance.userId,
    splitMethod: "equal",
    participantUserIds: [finance.userId, payerId],
    occurredOn: SPENT_ON,
    periodId: period.id,
    idempotencyKey: "run13b-conc-expense",
  });
  await expenses.submit(WS, draft.id, finance.userId);
  await expenses.post(WS, draft.id, finance.userId);

  const receipt = await ops.createReceipt(WS, payerId, {
    payeeUserId: finance.userId,
    method: "cash",
    amountMinor: "20000",
    paidAt: new Date().toISOString(),
    idempotencyKey: "run13b-conc-rcpt",
  });
  await ops.reviewReceipt(WS, receipt.id, {
    status: "approved",
    reviewedByUserId: finance.userId,
    excessCreditMinor: "7500",
  });

  const [first, second] = await Promise.all([
    service.generateInvoices(finance, WS, period.id, {}),
    service.generateInvoices(finance, WS, period.id, {}),
  ]);
  assert.ok(first.length >= 1);
  assert.ok(second.length >= 1);

  const adjustments = await billing.listAdjustments(WS, period.id, finance.userId);
  const creditAdjs = adjustments.filter(
    (row) => row.id === `adj:credit:${receipt.id}`,
  );
  assert.equal(creditAdjs.length, 1, "credit adjustment must exist exactly once");
  assert.equal(creditAdjs[0]?.delta.amountMinor, "-7500");

  const stored = await ops.getReceipt(WS, receipt.id);
  assert.equal(stored?.appliedToInvoiceId, creditAdjs[0]?.invoiceId);
});
