/** Finance page URL query helpers — keep out of finance-view.tsx. */

import type { DisplayUnit } from "@dang/contracts";
import { displayIntegerToIrrMinor } from "@dang/contracts";
import { latinDigits } from "@dang/ui";
import { irrMinorToDisplayInput } from "@/lib/irr-money";

const SETTLE_AMOUNT_UNITS = new Set<DisplayUnit>(["rial", "toman"]);

export function readSettleToFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("settleTo")?.trim() ?? "";
}

/**
 * Prefill settle form amount from the query string.
 *
 * - New links: `settleAmount=<irr-minor>&unit=rial` → converted to `displayUnit`.
 * - Explicit `unit=toman`: amount is toman display digits → converted to `displayUnit`.
 * - Legacy / unknown unit: `settleAmount=<digits>` → returned as-is (display digits).
 * - Rejects negative, decimal, or non-numeric amounts (Persian digits allowed).
 */
export function readSettleAmountFromUrl(displayUnit: DisplayUnit = "toman"): string {
  if (typeof window === "undefined") return "";
  const sp = new URLSearchParams(window.location.search);
  const raw = latinDigits(sp.get("settleAmount")?.trim() ?? "").trim();
  // Integer digits only — ignore negative, decimals, and non-numeric values.
  if (!/^\d+$/.test(raw)) return "";

  const unitRaw = sp.get("unit")?.trim() ?? "";
  if (!SETTLE_AMOUNT_UNITS.has(unitRaw as DisplayUnit)) {
    return raw;
  }
  try {
    const irrMinor = displayIntegerToIrrMinor(raw, unitRaw as DisplayUnit);
    return irrMinorToDisplayInput(irrMinor, displayUnit);
  } catch {
    return "";
  }
}

/**
 * Query fragment for settle deep-links: amount is always IRR (rial) minor.
 * Pair with `settleTo=…` on the sender; receivers use `readSettleAmountFromUrl`.
 */
export function settleLinkAmountParams(irrMinor: number | string | bigint): string {
  const abs =
    typeof irrMinor === "bigint"
      ? (irrMinor < 0n ? -irrMinor : irrMinor).toString()
      : String(Math.abs(Number(irrMinor)));
  return `settleAmount=${encodeURIComponent(abs)}&unit=rial`;
}

export function readExpenseIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("expense")?.trim() ?? "";
}

/** Dual-entry clarity: arrived from daily ledger chooser/link. */
export function readFromLedgerFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("from") === "ledger";
}

/** Friends-group outing → expense draft (R3). */
export function readOutingIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("outing")?.trim() ?? "";
}

export type PaymentReturnResult = {
  payment: "ok" | "failed";
  status: string | null;
  refId: string | null;
};

/** Zarinpal (and similar) return query — strip after consuming. */
export function readPaymentResultFromUrl(): PaymentReturnResult | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const payment = sp.get("payment");
  if (payment !== "ok" && payment !== "failed") return null;
  return {
    payment,
    status: sp.get("status"),
    refId: sp.get("refId"),
  };
}

/** Drop payment* query keys; keep hash and other params. */
export function stripPaymentResultFromUrl(): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.delete("payment");
  url.searchParams.delete("status");
  url.searchParams.delete("refId");
  return `${url.pathname}${url.search}${url.hash}`;
}
