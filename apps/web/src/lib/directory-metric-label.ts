/**
 * Format optional directory metrics for switcher rows — omit when absent.
 */

import { formatMoneyFromIrrMinor, type DisplayUnit } from "@dang/ui";

export function formatDirectoryNetHint(
  myNetMinor: string | undefined,
  openSettlements: number | undefined,
  unit: DisplayUnit,
): string | null {
  const parts: string[] = [];
  if (myNetMinor != null && myNetMinor !== "") {
    const n = Number(myNetMinor);
    if (Number.isFinite(n)) {
      if (n > 0) parts.push(`${formatMoneyFromIrrMinor(n, unit)} طلب`);
      else if (n < 0) parts.push(`${formatMoneyFromIrrMinor(Math.abs(n), unit)} بدهی`);
      else parts.push("تسویه");
    }
  }
  if (typeof openSettlements === "number" && openSettlements > 0) {
    parts.push(`${openSettlements.toLocaleString("fa-IR")} تسویه باز`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
