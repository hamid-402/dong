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

test("planAllows keeps core free and gates depth", () => {
  assert.equal(planAllows("free", "expenses"), true);
  assert.equal(planAllows("free", "biCompare"), false);
  assert.equal(planAllows("pro", "biCompare"), true);
});
