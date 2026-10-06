/**
 * Property-style ledger split invariants (Phase 5.7).
 * No external fast-check dep — seeded PRNG + many trials.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  allocatePercentSplit,
  allocateSharesSplit,
  buildExpenseJournalLines,
  computeBalancesFromJournal,
  isZeroSumBalances,
  normalizePaymentLines,
} from "../src/finance.js";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sumMinor(
  lines: readonly { amount: { amountMinor: string } }[],
): bigint {
  return lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
}

test("property: equal split is always zero-sum", () => {
  const rnd = mulberry32(20260921);
  for (let i = 0; i < 200; i++) {
    const n = 1 + Math.floor(rnd() * 8);
    const total = BigInt(1 + Math.floor(rnd() * 1_000_000));
    const ids = Array.from({ length: n }, (_, j) => `u${j}`);
    const lines = allocateEqualSplit(
      { amountMinor: total.toString(), currency: "IRR" },
      ids,
    );
    assert.equal(sumMinor(lines), total);
    assert.equal(lines.length, n);
  }
});

test("property: shares split is always zero-sum", () => {
  const rnd = mulberry32(42);
  for (let i = 0; i < 200; i++) {
    const n = 1 + Math.floor(rnd() * 6);
    const total = BigInt(1 + Math.floor(rnd() * 500_000));
    const splitLines = Array.from({ length: n }, (_, j) => ({
      userId: `u${j}`,
      shares: 1 + Math.floor(rnd() * 12),
    }));
    const lines = allocateSharesSplit(
      { amountMinor: total.toString(), currency: "IRR" },
      splitLines,
    );
    assert.equal(sumMinor(lines), total);
  }
});

test("property: percent split (exact 10000 bps) is always zero-sum", () => {
  const rnd = mulberry32(99);
  for (let i = 0; i < 150; i++) {
    const n = 2 + Math.floor(rnd() * 5);
    const total = BigInt(100 + Math.floor(rnd() * 900_000));
    const weights = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 50));
    const wSum = weights.reduce((a, b) => a + b, 0);
    let allocated = 0;
    const percentLines = weights.map((w, idx) => {
      if (idx === n - 1) {
        return { userId: `u${idx}`, percent: String(10000 - allocated) };
      }
      const bps = Math.floor((w * 10000) / wSum);
      allocated += bps;
      return { userId: `u${idx}`, percent: String(bps) };
    });
    const lines = allocatePercentSplit(
      { amountMinor: total.toString(), currency: "IRR" },
      percentLines,
    );
    assert.equal(sumMinor(lines), total);
  }
});

test("property: expense journal nets stay zero-sum", () => {
  const rnd = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    const n = 2 + Math.floor(rnd() * 5);
    const total = BigInt(10 + Math.floor(rnd() * 200_000));
    const ids = Array.from({ length: n }, (_, j) => `u${j}`);
    const money = { amountMinor: total.toString(), currency: "IRR" as const };
    const splits = allocateEqualSplit(money, ids);
    const payer = ids[0]!;
    const lines = buildExpenseJournalLines({
      paidByUserId: payer,
      paymentLines: [{ userId: payer, amount: money }],
      total: money,
      splits,
      status: "posted",
    });
    const nets = computeBalancesFromJournal([{ status: "posted", lines }]);
    assert.equal(isZeroSumBalances(nets), true);
  }
});

test("property: normalizePaymentLines rejects non-zero-sum (idempotent throw)", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  assert.throws(() =>
    normalizePaymentLines(total, "payer", [
      { userId: "a", amount: { amountMinor: "40", currency: "IRR" } },
      { userId: "b", amount: { amountMinor: "40", currency: "IRR" } },
    ]),
  );
  const ok = normalizePaymentLines(total, "payer", [
    { userId: "a", amount: { amountMinor: "60", currency: "IRR" } },
    { userId: "b", amount: { amountMinor: "40", currency: "IRR" } },
  ]);
  assert.equal(sumMinor(ok), 100n);
});
