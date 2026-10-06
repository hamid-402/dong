import assert from "node:assert/strict";
import test from "node:test";
import { parseExpenseCsv, planAllows } from "../src/index.js";

test("expense CSV parser handles quoted titles and validates headers", () => {
  assert.deepEqual(
    parseExpenseCsv('title,amount_toman,occurred_on,visibility\n"Taxi, airport",25000,2026-09-07,private'),
    [{ title: "Taxi, airport", amountToman: "25000", occurredOn: "2026-09-07", visibility: "private" }],
  );
  assert.throws(() => parseExpenseCsv("title,amount\nx,1"), /CSV_HEADER/);
});

test("planAllows unlocks every feature on every plan (no premium gate)", () => {
  assert.equal(planAllows("free", "expenses"), true);
  assert.equal(planAllows("free", "settlements"), true);
  assert.equal(planAllows("free", "reports"), true);
  assert.equal(planAllows("free", "biCompare"), true);
  assert.equal(planAllows("free", "analytics"), true);
  assert.equal(planAllows("free", "costCenter"), true);
  assert.equal(planAllows("free", "categoryBudget"), true);
  assert.equal(planAllows("pro", "biCompare"), true);
  assert.equal(planAllows("pro", "analytics"), true);
  assert.equal(planAllows("business", "costCenter"), true);
  assert.equal(planAllows("free", "anything-else"), true);
});
