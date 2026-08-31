import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  computeProvisionalBalances,
  isZeroSumBalances,
} from "../src/finance.js";

test("draft expenses do not affect balances", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b"]);
  const lines = computeProvisionalBalances(
    [
      {
        paidByUserId: "a",
        total,
        splits,
        status: "draft",
      },
    ],
    [],
  );
  assert.equal(lines.length, 0);
});

test("computeProvisionalBalances from posted equal expense", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b"]);
  const lines = computeProvisionalBalances(
    [
      {
        paidByUserId: "a",
        total,
        splits,
        status: "posted",
      },
    ],
    [],
  );
  assert.deepEqual(
    lines.map((line) => [line.userId, line.net.amountMinor]),
    [
      ["a", "50"],
      ["b", "-50"],
    ],
  );
  assert.equal(isZeroSumBalances(lines), true);
});

test("confirmed settlement reduces balance", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b"]);
  const lines = computeProvisionalBalances(
    [
      {
        paidByUserId: "a",
        total,
        splits,
        status: "posted",
      },
    ],
    [
      {
        fromUserId: "b",
        toUserId: "a",
        amount: { amountMinor: "50", currency: "IRR" },
        status: "confirmed",
      },
    ],
  );
  assert.equal(lines.length, 0);
});

test("claimed settlement does not affect balance", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b"]);
  const lines = computeProvisionalBalances(
    [
      {
        paidByUserId: "a",
        total,
        splits,
        status: "posted",
      },
    ],
    [
      {
        fromUserId: "b",
        toUserId: "a",
        amount: { amountMinor: "50", currency: "IRR" },
        status: "claimed",
      },
    ],
  );
  assert.equal(lines.find((line) => line.userId === "b")?.net.amountMinor, "-50");
});
