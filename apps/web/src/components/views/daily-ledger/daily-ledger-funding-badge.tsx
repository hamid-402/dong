"use client";

import type { DailyLedgerItem } from "@dang/contracts";

/** Compact funding chip for a consumption line (personal pocket vs petty cash). */
export function DailyLedgerFundingBadge({
  item,
  fundNameById,
}: {
  item: Pick<DailyLedgerItem, "fundingSourceKind" | "fundingRefId">;
  fundNameById?: Record<string, string>;
}) {
  if (item.fundingSourceKind === "petty_cash") {
    const fundLabel =
      (item.fundingRefId && fundNameById?.[item.fundingRefId]) || "تنخواه";
    return (
      <span className="dlFundingBadge isPetty" title={`خرج از صندوق · ${fundLabel}`}>
        صندوق · {fundLabel}
      </span>
    );
  }
  if (item.fundingSourceKind === "personal" || !item.fundingSourceKind) {
    return (
      <span className="dlFundingBadge isPersonal" title="خرج از حساب شخصی">
        شخصی
      </span>
    );
  }
  return null;
}
