/**
 * Live FX → IRR for expense drafts (Hercules deepen).
 * Rates are IRR (rial minor) per 1 major unit of the base currency.
 * originalAmountMinor uses ISO minor units of the source currency.
 */
import type { FxRateSummary } from "@dang/contracts";
import {
  buildFxConvertPreviewResult,
  pickFxRateForPreview,
} from "./fx-rates.module.js";

/** ISO-4217 minor units factor (JPY/KRW = 1; most others = 100). */
export function currencyMinorFactor(code: string): number {
  const upper = code.trim().toUpperCase();
  if (upper === "JPY" || upper === "KRW" || upper === "VND") return 1;
  return 100;
}

export function resolveConversionLive(env: {
  databaseUrl?: string | null;
} = {}): boolean {
  return Boolean(env.databaseUrl?.trim());
}

export function applyOriginalMoneyToIrr(input: {
  rows: FxRateSummary[];
  originalCurrency: string;
  originalAmountMinor: string;
  asOf?: string;
}): { irrMinor: string; fxRateId: string; rate: string; inverted: boolean } {
  const from = input.originalCurrency.trim().toUpperCase();
  if (from === "IRR") {
    return {
      irrMinor: input.originalAmountMinor,
      fxRateId: "",
      rate: "1",
      inverted: false,
    };
  }
  const factor = currencyMinorFactor(from);
  const major = Number(input.originalAmountMinor) / factor;
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error("FX_ORIGINAL_AMOUNT_INVALID");
  }
  const hit = pickFxRateForPreview(input.rows, from, "IRR", input.asOf);
  if (!hit) {
    throw new Error("FX_RATE_NOT_FOUND");
  }
  const preview = buildFxConvertPreviewResult(
    input.rows,
    {
      fromCurrency: from,
      toCurrency: "IRR",
      amount: String(major),
      asOf: input.asOf,
    },
    { live: true },
  );
  const irrMinor = String(Math.round(Number(preview.convertedAmount)));
  if (!/^[1-9]\d*$/.test(irrMinor)) {
    throw new Error("FX_IRR_MINOR_INVALID");
  }
  return {
    irrMinor,
    fxRateId: hit.row.id,
    rate: preview.rate,
    inverted: preview.inverted,
  };
}
