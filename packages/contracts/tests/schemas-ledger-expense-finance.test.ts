import assert from "node:assert/strict";
import test from "node:test";
import {
  createDailyLedgerDepositRequestSchema,
  createDailyLedgerEntryRequestSchema,
  createWorkspaceRangeLockRequestSchema,
  importDailyLedgerCsvRequestSchema,
  postLedgerDayRequestSchema,
  updateDailyLedgerEntryRequestSchema,
  upsertWorkspaceDayRequestSchema,
} from "../src/schemas/daily-ledger.js";
import {
  createExpenseDraftSchema,
  expenseItemSchema,
  expenseListQuerySchema,
  previewExpenseSplitSchema,
  rebuildFundPartyJournalsRequestSchema,
  rebuildFundPartyJournalsResultSchema,
  reverseExpenseRequestSchema,
  reviseExpenseRequestSchema,
  restoreExpenseRequestSchema,
} from "../src/schemas/expense.js";
import {
  confirmSettlementRequestSchema,
  confirmSimplifySettlementClaimsRequestSchema,
  createMemberAllowanceRequestSchema,
  createOutingRequestSchema,
  previewSettlementEffectRequestSchema,
  updateWorkspaceExpensePolicyRequestSchema,
  createCostCenterRequestSchema,
  createSettlementClaimRequestSchema,
  remindDebtRequestSchema,
} from "../src/schemas/finance.js";

const irr = (amountMinor: string) => ({ amountMinor, currency: "IRR" as const });
const messages = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

test("daily-ledger entry: quantity x unit price must equal amount", () => {
  const base = { date: "2026-03-01", itemName: "Rice", idempotencyKey: "k" };
  const ok = createDailyLedgerEntryRequestSchema.safeParse({
    ...base,
    amount: irr("300"),
    quantity: 3,
    unitPriceMinor: "100",
  });
  assert.equal(ok.success, true);
  const bad = createDailyLedgerEntryRequestSchema.safeParse({
    ...base,
    amount: irr("301"),
    quantity: 3,
    unitPriceMinor: "100",
  });
  assert.equal(bad.success, false);
  assert.deepEqual(messages(bad), ["AMOUNT_MISMATCH"]);
  // Without both quantity and price there is nothing to cross-check.
  assert.equal(
    createDailyLedgerEntryRequestSchema.safeParse({ ...base, amount: irr("1"), quantity: 3 }).success,
    true,
  );
});

test("daily-ledger funding source rules apply to create, update and day lines", () => {
  const entry = { date: "2026-03-01", itemName: "Tea", amount: irr("10"), idempotencyKey: "k" };
  const noRef = { fundingSourceKind: "petty_cash" as const };
  const noKind = { fundingRefId: "f1" };

  const c1 = createDailyLedgerEntryRequestSchema.safeParse({ ...entry, ...noRef });
  assert.deepEqual(messages(c1), ["FUNDING_REF_REQUIRED"]);
  const c2 = createDailyLedgerEntryRequestSchema.safeParse({ ...entry, ...noKind });
  assert.deepEqual(messages(c2), ["FUNDING_KIND_REQUIRED"]);
  assert.equal(
    createDailyLedgerEntryRequestSchema.safeParse({
      ...entry,
      fundingSourceKind: "petty_cash",
      fundingRefId: "f1",
    }).success,
    true,
  );

  const upd = { itemName: "Tea", amount: irr("10"), idempotencyKey: "k" };
  assert.deepEqual(messages(updateDailyLedgerEntryRequestSchema.safeParse({ ...upd, ...noRef })), [
    "FUNDING_REF_REQUIRED",
  ]);
  assert.equal(
    updateDailyLedgerEntryRequestSchema.safeParse({ ...upd, amount: irr("5"), quantity: 1, unitPriceMinor: "9" }).success,
    false,
  );
  assert.equal(updateDailyLedgerEntryRequestSchema.safeParse({ ...upd, date: "2026-03-02" }).success, true);

  const day = {
    date: "2026-03-01",
    idempotencyKey: "k",
    lines: [{ itemName: "Tea", amount: irr("10"), fundingSourceKind: "personal" as const }],
  };
  assert.equal(postLedgerDayRequestSchema.safeParse(day).success, true);
  assert.deepEqual(
    messages(postLedgerDayRequestSchema.safeParse({ ...day, lines: [{ itemName: "Tea", amount: irr("10"), ...noKind }] })),
    ["FUNDING_KIND_REQUIRED"],
  );
  assert.deepEqual(
    messages(
      postLedgerDayRequestSchema.safeParse({
        ...day,
        lines: [{ itemName: "Tea", amount: irr("11"), quantity: 2, unitPriceMinor: "5" }],
      }),
    ),
    ["AMOUNT_MISMATCH"],
  );
  assert.equal(postLedgerDayRequestSchema.safeParse({ ...day, lines: [] }).success, false);
});

test("daily-ledger deposit, day, range-lock schemas", () => {
  const dep = { date: "2026-03-01", amountMinor: "100", fundId: "f1", idempotencyKey: "k" };
  assert.equal(createDailyLedgerDepositRequestSchema.safeParse(dep).success, true);
  assert.equal(createDailyLedgerDepositRequestSchema.safeParse({ ...dep, mode: "gift" }).success, true);
  assert.equal(createDailyLedgerDepositRequestSchema.safeParse({ ...dep, mode: "x" }).success, false);
  assert.equal(createDailyLedgerDepositRequestSchema.safeParse({ ...dep, amountMinor: "0" }).success, false);
  assert.equal(upsertWorkspaceDayRequestSchema.safeParse({ isHoliday: true, note: null }).success, true);
  assert.equal(upsertWorkspaceDayRequestSchema.safeParse({ holiday: true }).success, false);
  assert.equal(
    createWorkspaceRangeLockRequestSchema.safeParse({ from: "2026-03-01", to: "2026-03-31", idempotencyKey: "k" }).success,
    true,
  );
  assert.equal(
    createWorkspaceRangeLockRequestSchema.safeParse({ from: "03/01", to: "2026-03-31", idempotencyKey: "k" }).success,
    false,
  );
});

test("daily-ledger CSV import requires some source and bounds columnMap", () => {
  assert.equal(importDailyLedgerCsvRequestSchema.safeParse({}).success, false);
  const empty = importDailyLedgerCsvRequestSchema.safeParse({ csv: "   " });
  assert.equal(empty.success, false);
  assert.deepEqual(messages(empty), ["csv, paste, xlsxBase64, or rows required"]);
  assert.equal(importDailyLedgerCsvRequestSchema.safeParse({ csv: "a,b" }).success, true);
  assert.equal(importDailyLedgerCsvRequestSchema.safeParse({ paste: "a\tb" }).success, true);
  assert.equal(importDailyLedgerCsvRequestSchema.safeParse({ xlsxBase64: "AAAA" }).success, true);
  assert.equal(
    importDailyLedgerCsvRequestSchema.safeParse({
      rows: [{ date: "2026-03-01", column: "Ali", itemName: "Tea", amountToman: 100 }],
      sheetSource: "master",
    }).success,
    true,
  );
  const tooMany: Record<string, string> = {};
  for (let i = 0; i < 41; i += 1) tooMany[`c${i}`] = "shared";
  const mapped = importDailyLedgerCsvRequestSchema.safeParse({ csv: "x", columnMap: tooMany });
  assert.equal(mapped.success, false);
  assert.deepEqual(messages(mapped), ["columnMap max 40 keys"]);
  assert.equal(importDailyLedgerCsvRequestSchema.safeParse({ csv: "x", columnMap: { Ali: "shared" } }).success, true);
});

const draft = {
  title: "Dinner",
  total: irr("1000"),
  paidByUserId: "u1",
  splitMethod: "equal" as const,
  participantUserIds: ["u1", "u2"],
  occurredOn: "2026-03-01",
  idempotencyKey: "key-1",
};

test("createExpenseDraftSchema funding, original money and split-specific rules", () => {
  assert.equal(createExpenseDraftSchema.safeParse(draft).success, true);
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, fundingSourceKind: "petty_cash" })),
    ["FUNDING_REF_REQUIRED"],
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, fundingSourceKind: "member" })),
    ["FUNDING_REF_REQUIRED"],
  );
  assert.equal(
    createExpenseDraftSchema.safeParse({ ...draft, fundingSourceKind: "credit" }).success,
    true,
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, fundingRefId: "x" })),
    ["FUNDING_KIND_REQUIRED"],
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, originalCurrency: "USD" })),
    ["ORIGINAL_MONEY_PAIR"],
  );
  assert.equal(
    createExpenseDraftSchema.safeParse({ ...draft, originalCurrency: "USD", originalAmountMinor: "10" }).success,
    true,
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, participantUserIds: [] })),
    ["EXPENSE_PARTICIPANTS"],
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, splitMethod: "itemized", participantUserIds: [] })),
    ["SPLIT_ITEMS"],
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, splitMethod: "formula" })),
    ["FORMULA_BASIS_REQUIRED"],
  );
  assert.equal(
    createExpenseDraftSchema.safeParse({ ...draft, splitMethod: "formula", formulaBasis: "area" }).success,
    true,
  );
  assert.deepEqual(
    messages(createExpenseDraftSchema.safeParse({ ...draft, quantity: 3, unitPriceMinor: "300" })),
    ["AMOUNT_MISMATCH"],
  );
  assert.equal(
    createExpenseDraftSchema.safeParse({ ...draft, total: irr("900"), quantity: 3, unitPriceMinor: "300" }).success,
    true,
  );
});

test("expense item schema checks quantity x price", () => {
  const item = { title: "Pizza", amount: irr("600"), assigneeUserIds: ["u1"], quantity: 2, unitPriceMinor: "300" };
  assert.equal(expenseItemSchema.safeParse(item).success, true);
  assert.deepEqual(messages(expenseItemSchema.safeParse({ ...item, amount: irr("599") })), ["AMOUNT_MISMATCH"]);
  assert.equal(expenseItemSchema.safeParse({ ...item, assigneeUserIds: [] }).success, false);
});

test("previewExpenseSplitSchema mirrors draft split rules", () => {
  const base = { total: irr("100"), splitMethod: "equal" as const, participantUserIds: ["u1"] };
  assert.equal(previewExpenseSplitSchema.safeParse(base).success, true);
  assert.deepEqual(messages(previewExpenseSplitSchema.safeParse({ ...base, splitMethod: "itemized" })), ["SPLIT_ITEMS"]);
  assert.deepEqual(messages(previewExpenseSplitSchema.safeParse({ ...base, splitMethod: "formula" })), [
    "FORMULA_BASIS_REQUIRED",
  ]);
});

test("expense list query rejects inverted date ranges", () => {
  assert.equal(expenseListQuerySchema.safeParse({ from: "2026-01-01", to: "2026-02-01" }).success, true);
  const bad = expenseListQuerySchema.safeParse({ from: "2026-03-01", to: "2026-02-01" });
  assert.deepEqual(messages(bad), ["FROM_AFTER_TO"]);
  assert.equal(expenseListQuerySchema.safeParse({ status: "bogus" }).success, false);
});

test("reverse/restore/revise expense schemas and fund-party rebuild helpers", () => {
  assert.equal(reverseExpenseRequestSchema.safeParse({}).success, true);
  assert.equal(reverseExpenseRequestSchema.safeParse({ idempotencyKey: "short" }).success, false);
  assert.equal(restoreExpenseRequestSchema.safeParse({ idempotencyKey: "12345678" }).success, true);
  assert.equal(restoreExpenseRequestSchema.safeParse({}).success, false);
  assert.equal(reviseExpenseRequestSchema.safeParse({ ...draft, reverseReason: "typo" }).success, true);

  assert.deepEqual(rebuildFundPartyJournalsRequestSchema.parse(undefined), { force: false });
  assert.deepEqual(rebuildFundPartyJournalsRequestSchema.parse(""), { force: false });
  assert.deepEqual(rebuildFundPartyJournalsRequestSchema.parse({ force: true }), { force: true });
  assert.equal(rebuildFundPartyJournalsRequestSchema.safeParse({ force: "yes" }).success, false);
  assert.equal(
    rebuildFundPartyJournalsResultSchema.safeParse({
      rebuilt: 1,
      created: 1,
      skipped: 0,
      totalPosted: 2,
      skippedAlreadyFund: 0,
      skippedNoFund: 0,
      forced: false,
    }).success,
    true,
  );
  assert.equal(
    rebuildFundPartyJournalsResultSchema.safeParse({
      rebuilt: -1,
      created: 1,
      skipped: 0,
      totalPosted: 2,
      skippedAlreadyFund: 0,
      skippedNoFund: 0,
      forced: false,
    }).success,
    false,
  );
});

test("finance schemas: allowance, policy, outing, settlement evidence", () => {
  const allowance = {
    memberUserId: "u1",
    periodKind: "week" as const,
    limit: irr("500"),
    idempotencyKey: "k",
  };
  const parsed = createMemberAllowanceRequestSchema.parse(allowance);
  assert.equal(parsed.alertPct, 80);
  assert.equal(createMemberAllowanceRequestSchema.safeParse({ ...allowance, alertPct: 101 }).success, false);
  assert.equal(
    createMemberAllowanceRequestSchema.safeParse({ ...allowance, limit: irr("0") }).success,
    false,
  );

  assert.equal(
    updateWorkspaceExpensePolicyRequestSchema.safeParse({
      approvalThresholdMinor: "1000",
      requireReceiptAboveMinor: null,
      perDiemDailyMinor: "50",
      approvalTiers: [{ minAmountMinor: "100", requiredApprovals: 2, requiredRoles: ["owner"] }],
    }).success,
    true,
  );
  assert.equal(
    updateWorkspaceExpensePolicyRequestSchema.safeParse({
      approvalThresholdMinor: "0",
      requireReceiptAboveMinor: null,
    }).success,
    false,
  );
  assert.equal(
    updateWorkspaceExpensePolicyRequestSchema.safeParse({
      approvalThresholdMinor: null,
      requireReceiptAboveMinor: null,
      approvalTiers: [{ minAmountMinor: "100", requiredApprovals: 0 }],
    }).success,
    false,
  );

  const outing = { title: "Trip", occurredOn: "2026-03-01", idempotencyKey: "k" };
  assert.equal(createOutingRequestSchema.safeParse({ ...outing, startsOn: "2026-03-01", endsOn: "2026-03-05" }).success, true);
  assert.deepEqual(
    messages(createOutingRequestSchema.safeParse({ ...outing, startsOn: "2026-03-05", endsOn: "2026-03-01" })),
    ["ENDS_BEFORE_STARTS"],
  );
  assert.equal(createOutingRequestSchema.safeParse({ ...outing, budgetCapMinor: "0" }).success, false);
  assert.equal(createOutingRequestSchema.safeParse({ ...outing, budgetCapMinor: "500" }).success, true);

  assert.deepEqual(confirmSettlementRequestSchema.parse(null), {});
  assert.deepEqual(confirmSettlementRequestSchema.parse(undefined), {});
  assert.deepEqual(
    messages(confirmSettlementRequestSchema.safeParse({ evidenceKind: "receipt" })),
    ["RECEIPT_ID_REQUIRED"],
  );
  assert.deepEqual(
    messages(confirmSettlementRequestSchema.safeParse({ evidenceKind: "cash_ack" })),
    ["CASH_ACK_REQUIRED"],
  );
  assert.equal(
    confirmSettlementRequestSchema.safeParse({ evidenceKind: "cash_ack", cashAckNote: "paid cash" }).success,
    true,
  );
  assert.equal(confirmSettlementRequestSchema.safeParse({ evidenceKind: "gateway" }).success, true);
});

test("finance schemas: transfers, claims, cost centers, reminders", () => {
  assert.equal(
    previewSettlementEffectRequestSchema.safeParse({
      transfers: [{ fromUserId: "a", toUserId: "b", amount: irr("5") }],
    }).success,
    true,
  );
  assert.equal(previewSettlementEffectRequestSchema.safeParse({ transfers: [] }).success, false);
  assert.equal(createCostCenterRequestSchema.safeParse({ name: "HQ", code: "" }).success, false);
  assert.equal(
    createSettlementClaimRequestSchema.safeParse({
      workspaceId: "w",
      fromUserId: "a",
      toUserId: "b",
      amount: irr("5"),
      paymentLinkUrl: "https://pay.example/x",
      idempotencyKey: "k",
    }).success,
    true,
  );
  assert.equal(
    createSettlementClaimRequestSchema.safeParse({
      workspaceId: "w",
      fromUserId: "a",
      toUserId: "b",
      amount: irr("5"),
      paymentLinkUrl: "not-url",
      idempotencyKey: "k",
    }).success,
    false,
  );
  assert.equal(confirmSimplifySettlementClaimsRequestSchema.safeParse({ idempotencyKey: "k", settlementIds: ["s1"] }).success, true);
  assert.equal(remindDebtRequestSchema.safeParse({ targetUserId: "u2" }).success, true);
  assert.equal(remindDebtRequestSchema.safeParse({}).success, false);
});
