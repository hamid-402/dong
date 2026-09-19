import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { multiplyDecimalStrings, type FxRateSummary } from "@dang/contracts";
import {
  buildFxConvertPreviewResult,
  pickFxRateForPreview,
} from "./fx-rates.module.js";

test("multiplyDecimalStrings preview math (G13)", () => {
  assert.equal(multiplyDecimalStrings("100", "42000"), "4200000");
  assert.equal(multiplyDecimalStrings("1.5", "2"), "3");
});

test("pickFxRateForPreview direct and inverted (G13)", () => {
  const rows: FxRateSummary[] = [
    {
      id: "1",
      baseCurrency: "USD",
      quoteCurrency: "IRR",
      rate: "42000",
      asOf: "2026-01-01",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "2",
      baseCurrency: "USD",
      quoteCurrency: "IRR",
      rate: "43000",
      asOf: "2026-06-01",
      source: "manual",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  const latest = pickFxRateForPreview(rows, "USD", "IRR");
  assert.equal(latest?.row.rate, "43000");
  assert.equal(latest?.inverted, false);

  const asOf = pickFxRateForPreview(rows, "USD", "IRR", "2026-03-01");
  assert.equal(asOf?.row.rate, "42000");

  const inv = pickFxRateForPreview(rows, "IRR", "USD");
  assert.equal(inv?.inverted, true);
  assert.equal(inv?.row.baseCurrency, "USD");

  assert.equal(pickFxRateForPreview(rows, "EUR", "IRR"), null);
});

test("buildFxConvertPreviewResult always live:false (depth)", () => {
  const rows: FxRateSummary[] = [
    {
      id: "1",
      baseCurrency: "USD",
      quoteCurrency: "IRR",
      rate: "42000",
      asOf: "2026-09-01",
      source: "manual",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const preview = buildFxConvertPreviewResult(rows, {
    fromCurrency: "USD",
    toCurrency: "IRR",
    amount: "2",
  });
  assert.equal(preview.live, false);
  assert.equal(preview.convertedAmount, "84000");
  assert.equal(preview.inverted, false);

  assert.throws(
    () =>
      buildFxConvertPreviewResult(rows, {
        fromCurrency: "USD",
        toCurrency: "USD",
        amount: "1",
      }),
    (err: unknown) => err instanceof ForbiddenException,
  );
  assert.throws(
    () =>
      buildFxConvertPreviewResult(rows, {
        fromCurrency: "EUR",
        toCurrency: "IRR",
        amount: "1",
      }),
    (err: unknown) => err instanceof NotFoundException,
  );
});
