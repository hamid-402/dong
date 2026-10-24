import assert from "node:assert/strict";
import test from "node:test";
import {
  createStatementExportRequestSchema,
  createStatementPackExportRequestSchema,
  statementDetailQuerySchema,
  statementListQuerySchema,
  statementNotifyRequestSchema,
  upsertWorkspacePayoutInstructionsSchema,
} from "../src/schemas/statements.js";
import {
  createPaycheckRequestSchema,
  createPersonalAnnualStatementRequestSchema,
  lifestyleQuerySchema,
  putAllocationPlanRequestSchema,
} from "../src/schemas/personal-finance.js";
import { assertRejection } from "./assert-rejection.js";

const messages = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

test("statement query schemas enforce from <= to", () => {
  const ok = { from: "2026-03-01", to: "2026-03-31" };
  const bad = { from: "2026-04-01", to: "2026-03-31" };
  assert.equal(statementListQuerySchema.parse(ok).granularity, "period");
  assert.equal(statementListQuerySchema.parse({ ...ok, granularity: "day" }).granularity, "day");
  assert.deepEqual(messages(statementListQuerySchema.safeParse(bad)), ["from must be <= to"]);
  assert.equal(statementDetailQuerySchema.safeParse(ok).success, true);
  assertRejection(statementDetailQuerySchema.safeParse(bad), { message: "from must be <= to" });
  assert.equal(createStatementExportRequestSchema.safeParse({ ...ok, format: "xlsx" }).success, true);
  assertRejection(createStatementExportRequestSchema.safeParse({ ...ok, format: "pdf" }), {
    path: ["format"],
  });
  assertRejection(createStatementExportRequestSchema.safeParse({ ...bad, format: "csv" }), {
    message: "from must be <= to",
  });
  assert.equal(createStatementPackExportRequestSchema.safeParse({ ...ok, format: "pdf", documentNo: "D-1" }).success, true);
  assertRejection(createStatementPackExportRequestSchema.safeParse({ ...ok, format: "json" }), {
    path: ["format"],
  });
  assertRejection(createStatementPackExportRequestSchema.safeParse({ ...bad, format: "csv" }), {
    message: "from must be <= to",
  });
  assert.equal(statementNotifyRequestSchema.safeParse(ok).success, true);
  assertRejection(statementNotifyRequestSchema.safeParse(bad), { message: "from must be <= to" });
});

test("payout instructions normalise card numbers and name the bank from the BIN", () => {
  const r = upsertWorkspacePayoutInstructionsSchema.parse({
    holderName: "Ali Rezaei",
    destinationKind: "card",
    destinationValue: "6037-9971 8812 3450",
  });
  assert.deepEqual(r, {
    holderName: "Ali Rezaei",
    destinationKind: "card",
    destinationValue: "6037997188123450",
    bankName: "بانک ملی ایران",
  });
});

test("payout instructions prefer the typed bank name and accept valid IBANs", () => {
  const r = upsertWorkspacePayoutInstructionsSchema.parse({
    holderName: "Ali Rezaei",
    destinationKind: "iban",
    destinationValue: "ir27 0170 0000 0010 0324 2000 01",
    bankName: "  My Bank ",
  });
  assert.equal(r.destinationValue, "IR270170000000100324200001");
  assert.equal(r.bankName, "My Bank");

  const noBank = upsertWorkspacePayoutInstructionsSchema.parse({
    holderName: "Ali Rezaei",
    destinationKind: "iban",
    destinationValue: "IR270170000000100324200001",
  });
  assert.equal(noBank.destinationValue, "IR270170000000100324200001");
  assert.ok(noBank.bankName === undefined || typeof noBank.bankName === "string");
});

test("payout instructions explain format and check-digit failures per kind", () => {
  const base = { holderName: "Ali Rezaei" };
  assert.deepEqual(
    messages(upsertWorkspacePayoutInstructionsSchema.safeParse({ ...base, destinationKind: "card", destinationValue: "1234" })),
    ["destinationValue must be a 16-digit card number"],
  );
  assert.deepEqual(
    messages(upsertWorkspacePayoutInstructionsSchema.safeParse({ ...base, destinationKind: "iban", destinationValue: "IR12" })),
    ["destinationValue must be IR + 24 digits"],
  );
  assert.deepEqual(
    messages(
      upsertWorkspacePayoutInstructionsSchema.safeParse({
        ...base,
        destinationKind: "card",
        destinationValue: "6037997188123451",
      }),
    ),
    ["card check digit is invalid"],
  );
  assert.deepEqual(
    messages(
      upsertWorkspacePayoutInstructionsSchema.safeParse({
        ...base,
        destinationKind: "iban",
        destinationValue: "IR120170000000123456789001",
      }),
    ),
    ["iban check digits are invalid"],
  );
});

test("allocation plan percents must add up to 100", () => {
  const plan = { solo: 40, group: 20, building: 10, org: 10, savings: 20 };
  assert.equal(putAllocationPlanRequestSchema.safeParse({ percents: plan }).success, true);
  const bad = putAllocationPlanRequestSchema.safeParse({ percents: { ...plan, savings: 21 } });
  assert.deepEqual(messages(bad), ["ALLOCATION_SUM"]);
  assertRejection(
    putAllocationPlanRequestSchema.safeParse({ percents: { ...plan, solo: -1, savings: 61 } }),
    { path: ["percents", "solo"] },
  );
  assertRejection(putAllocationPlanRequestSchema.safeParse({ percents: { ...plan, extra: 0 } }), {
    path: ["percents"],
    code: "unrecognized_keys",
  });
});

test("paycheck, lifestyle query and annual statement schemas", () => {
  const pay = { amountMinor: "5000000", occurredOn: "2026-03-01", idempotencyKey: "k" };
  assert.equal(createPaycheckRequestSchema.safeParse(pay).success, true);
  assertRejection(createPaycheckRequestSchema.safeParse({ ...pay, amountMinor: "0" }), {
    path: ["amountMinor"],
    message: "amount_RANGE",
  });
  assertRejection(createPaycheckRequestSchema.safeParse({ ...pay, yearMonth: "2026-3" }), {
    path: ["yearMonth"],
    message: "yearMonth_FORMAT",
  });

  assert.equal(lifestyleQuerySchema.safeParse({}).success, true);
  assert.equal(lifestyleQuerySchema.safeParse({ yearMonth: "2026-03" }).success, true);
  assert.equal(lifestyleQuerySchema.safeParse({ from: "2026-03-01", to: "2026-03-31" }).success, true);
  assert.deepEqual(messages(lifestyleQuerySchema.safeParse({ from: "2026-04-01", to: "2026-03-01" })), ["FROM_AFTER_TO"]);
  assert.deepEqual(messages(lifestyleQuerySchema.safeParse({ from: "2026-04-01" })), ["FROM_AND_TO"]);
  assert.deepEqual(messages(lifestyleQuerySchema.safeParse({ to: "2026-04-01" })), ["FROM_AND_TO"]);

  assert.equal(createPersonalAnnualStatementRequestSchema.parse({ jalaliYear: 1405 }).format, "html_print");
  assertRejection(createPersonalAnnualStatementRequestSchema.safeParse({ jalaliYear: 1299 }), {
    path: ["jalaliYear"],
  });
  assertRejection(
    createPersonalAnnualStatementRequestSchema.safeParse({ jalaliYear: 1405, format: "pdf" }),
    { path: ["format"] },
  );
});
