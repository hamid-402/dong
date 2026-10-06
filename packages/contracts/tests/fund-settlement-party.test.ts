import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpenseJournalLines,
  computeBalancesFromJournal,
  explainExpenseFundingSettlement,
  formatFundPartyRebuildSummaryFa,
  fundingSourceKindLabelFa,
  fundPartyId,
  isZeroSumBalances,
  settlementEdgeLabelFa,
  statementFundingNoteFa,
  suggestMinimalSettlements,
  type ExpenseSummary,
  type JournalEntrySummary,
} from "../src/finance.js";

function money(minor: string) {
  return { amountMinor: minor, currency: "IRR" as const };
}

function baseExpense(
  overrides: Partial<ExpenseSummary> &
    Pick<ExpenseSummary, "paidByUserId" | "total" | "splits">,
): Pick<
  ExpenseSummary,
  | "paidByUserId"
  | "total"
  | "splits"
  | "paymentLines"
  | "fundingSourceKind"
  | "fundingRefId"
> {
  return {
    paymentLines: [],
    fundingSourceKind: overrides.fundingSourceKind,
    fundingRefId: overrides.fundingRefId,
    paidByUserId: overrides.paidByUserId,
    total: overrides.total,
    splits: overrides.splits,
  };
}

test("petty_cash fund party: members owe fund; payer not credited", () => {
  const fundId = "fund-main";
  const expense = baseExpense({
    paidByUserId: "hamid",
    fundingSourceKind: "petty_cash",
    fundingRefId: fundId,
    total: money("300"),
    splits: [
      { userId: "hamid", amount: money("100") },
      { userId: "ali", amount: money("100") },
      { userId: "sara", amount: money("100") },
    ],
  });
  const lines = buildExpenseJournalLines(expense, {
    fundAsSettlementParty: true,
  });
  const entry: Pick<JournalEntrySummary, "lines" | "status"> = {
    status: "posted",
    lines,
  };
  const balances = computeBalancesFromJournal([entry]);
  assert.equal(isZeroSumBalances(balances), true);
  const byId = Object.fromEntries(balances.map((b) => [b.userId, b.net.amountMinor]));
  assert.equal(byId.hamid, "-100");
  assert.equal(byId.ali, "-100");
  assert.equal(byId.sara, "-100");
  assert.equal(byId[fundPartyId(fundId)], "300");

  const suggestions = suggestMinimalSettlements(balances);
  assert.ok(
    suggestions.every(
      (s) => s.toUserId === fundPartyId(fundId) && !s.fromUserId.startsWith("fund:"),
    ),
  );
  assert.match(
    settlementEdgeLabelFa({
      fromPartyId: "ali",
      toPartyId: fundPartyId(fundId),
      memberLabel: (id) => id,
    }),
    /واریز به/,
  );
});

test("personal advance: payer reimbursable = paid − own share", () => {
  const fundId = "fund-main";
  const expense = baseExpense({
    paidByUserId: "hamid",
    fundingSourceKind: "personal",
    fundingRefId: fundId,
    total: money("300"),
    splits: [
      { userId: "hamid", amount: money("100") },
      { userId: "ali", amount: money("100") },
      { userId: "sara", amount: money("100") },
    ],
  });
  const lines = buildExpenseJournalLines(expense, {
    fundAsSettlementParty: true,
  });
  const balances = computeBalancesFromJournal([{ status: "posted", lines }]);
  assert.equal(isZeroSumBalances(balances), true);
  const byId = Object.fromEntries(balances.map((b) => [b.userId, b.net.amountMinor]));
  assert.equal(byId.hamid, "200");
  assert.equal(byId.ali, "-100");
  assert.equal(byId.sara, "-100");
  assert.equal(byId[fundPartyId(fundId)], undefined);

  const explain = explainExpenseFundingSettlement(expense, {
    fundAsSettlementParty: true,
  });
  assert.equal(explain.mode, "personal_advance");
  assert.equal(explain.payerGrossReimbursableMinor, "200");
  assert.ok(explain.notesFa.length > 1);
});

test("classic path unchanged when flag off", () => {
  const fundId = "fund-main";
  const expense = baseExpense({
    paidByUserId: "hamid",
    fundingSourceKind: "petty_cash",
    fundingRefId: fundId,
    total: money("200"),
    splits: [
      { userId: "hamid", amount: money("100") },
      { userId: "ali", amount: money("100") },
    ],
  });
  const lines = buildExpenseJournalLines(expense, {
    fundAsSettlementParty: false,
  });
  const balances = computeBalancesFromJournal([{ status: "posted", lines }]);
  const byId = Object.fromEntries(balances.map((b) => [b.userId, b.net.amountMinor]));
  assert.equal(byId.hamid, "100");
  assert.equal(byId.ali, "-100");
  assert.equal(byId[fundPartyId(fundId)], undefined);
});

test("funding labels and rebuild summary are stable Persian copy", () => {
  assert.equal(fundingSourceKindLabelFa("petty_cash"), "صندوق تنخواه");
  assert.equal(fundingSourceKindLabelFa("personal"), "حساب شخصی");
  assert.match(
    statementFundingNoteFa(
      { fundingSourceKind: "petty_cash", paidByUserId: "hamid" },
      "ali",
    ) ?? "",
    /صندوق تنخواه/,
  );
  assert.match(
    formatFundPartyRebuildSummaryFa({
      rebuilt: 2,
      created: 1,
      skipped: 3,
      totalPosted: 6,
      skippedAlreadyFund: 2,
      skippedNoFund: 1,
      forced: false,
    }),
    /از 6 خرج ثبت‌شده/,
  );
});
