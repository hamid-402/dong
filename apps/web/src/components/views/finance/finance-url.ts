/** Finance page URL query helpers — keep out of finance-view.tsx. */

export function readSettleToFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("settleTo")?.trim() ?? "";
}

export function readSettleAmountFromUrl(): string {
  if (typeof window === "undefined") return "";
  const raw =
    new URLSearchParams(window.location.search).get("settleAmount")?.trim() ?? "";
  return /^\d+$/.test(raw) ? raw : "";
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
