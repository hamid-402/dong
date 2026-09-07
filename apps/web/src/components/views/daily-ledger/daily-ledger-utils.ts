import {
  JALALI_MONTH_FA,
  formatJalaliIso,
  parseIsoToJalali,
} from "@dang/contracts";
import type {
  DailyLedgerRangePreset,
  DailyLedgerResponse,
} from "@dang/contracts";

/** Shared pure helpers + types for the daily-ledger view and its extracted panels. */

export function formatTomanMinor(minor: string): string {
  const toman = Number(minor) / 10;
  if (!Number.isFinite(toman)) return "0";
  return new Intl.NumberFormat("fa-IR").format(toman);
}

export function todayIsoLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function rangeHeadline(
  from: string,
  to: string,
  preset: DailyLedgerRangePreset,
): string {
  if (from === to) return formatJalaliIso(from);
  if (preset === "month") {
    const j = parseIsoToJalali(from);
    if (j) return `${JALALI_MONTH_FA[j.jm - 1]} ${j.jy}`;
  }
  if (preset === "year") {
    const j = parseIsoToJalali(from);
    if (j) return `سال ${j.jy}`;
  }
  if (preset === "week") {
    return `هفته ${formatJalaliIso(from)} تا ${formatJalaliIso(to)}`;
  }
  return `${formatJalaliIso(from)} تا ${formatJalaliIso(to)}`;
}

export function dayItemCount(ledger: DailyLedgerResponse, date: string): number {
  const row = ledger.days.find((d) => d.date === date);
  if (!row) return 0;
  let n = row.shared.items.length;
  for (const m of ledger.members) {
    n += row.members[m.userId]?.items.length ?? 0;
  }
  return n;
}

export type DraftTarget =
  | {
      kind: "member";
      date: string;
      userId: string;
      displayName: string;
      expenseId?: string;
    }
  | { kind: "shared"; date: string; expenseId?: string };
