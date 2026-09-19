import assert from "node:assert/strict";
import test from "node:test";
import type { FxRateSummary } from "@dang/contracts";
import {
  applyOriginalMoneyToIrr,
  currencyMinorFactor,
  resolveConversionLive,
} from "./fx-convert-live.js";

test("resolveConversionLive tracks DATABASE_URL", () => {
  assert.equal(resolveConversionLive({ databaseUrl: undefined }), false);
  assert.equal(resolveConversionLive({ databaseUrl: "" }), false);
  assert.equal(
    resolveConversionLive({ databaseUrl: "postgresql://localhost/dang" }),
    true,
  );
});

test("currencyMinorFactor ISO defaults", () => {
  assert.equal(currencyMinorFactor("USD"), 100);
  assert.equal(currencyMinorFactor("JPY"), 1);
});

test("applyOriginalMoneyToIrr binds USD cents via rate table", () => {
  const rows: FxRateSummary[] = [
    {
      id: "rate-1",
      baseCurrency: "USD",
      quoteCurrency: "IRR",
      rate: "42000",
      asOf: "2026-09-01",
      source: "manual",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  // 200 cents = $2 → 2 * 42000 = 84000 IRR minor
  const applied = applyOriginalMoneyToIrr({
    rows,
    originalCurrency: "USD",
    originalAmountMinor: "200",
    asOf: "2026-09-01",
  });
  assert.equal(applied.irrMinor, "84000");
  assert.equal(applied.fxRateId, "rate-1");
});
