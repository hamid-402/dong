import {
  JALALI_MONTH_FA,
  formatJalaliIso,
  parseIsoToJalali,
} from "@dang/contracts";
import type {
  DailyLedgerRangePreset,
  DailyLedgerResponse,
} from "@dang/contracts";
import { formatMoneyFromIrrMinor, type DisplayUnit } from "@dang/ui";

/** Shared pure helpers + types for the daily-ledger view and its extracted panels. */

/** @deprecated Prefer formatLedgerMoney with an explicit unit. */
export function formatTomanMinor(minor: string): string {
  return formatMoneyFromIrrMinor(minor, "toman");
}

export function formatLedgerMoney(minor: string, unit: DisplayUnit = "rial"): string {
  return formatMoneyFromIrrMinor(minor, unit);
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

/** Adjacent dates inside the loaded ledger range (for day-detail nav). */
export function adjacentLedgerDates(
  ledger: DailyLedgerResponse,
  date: string,
): { prev: string | null; next: string | null } {
  const dates = ledger.days.map((d) => d.date);
  const idx = dates.indexOf(date);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? (dates[idx - 1] ?? null) : null,
    next: idx < dates.length - 1 ? (dates[idx + 1] ?? null) : null,
  };
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

const LAST_INDIVIDUAL_PREFIX = "dang.daily-ledger.last-individual.";

export function lastIndividualMemberKey(workspaceId: string): string {
  return `${LAST_INDIVIDUAL_PREFIX}${workspaceId}`;
}

/** Prefer last-used member, then self, then first member — never invents users. */
export function preferIndividualMemberUserId(
  members: readonly { userId: string }[],
  options: { preferUserId?: string | null; lastUserId?: string | null },
): string | null {
  if (members.length === 0) return null;
  const ids = new Set(members.map((m) => m.userId));
  if (options.lastUserId && ids.has(options.lastUserId)) return options.lastUserId;
  if (options.preferUserId && ids.has(options.preferUserId)) return options.preferUserId;
  return members[0]?.userId ?? null;
}

/** Balance-mode deposit credits the cash-in member by deposit amount. Gift leaves nets unchanged. */
export function projectDepositNetMinor(
  currentNetMinor: string,
  depositAmountMinor: string,
  mode: "balance" | "gift",
): string {
  if (mode === "gift") return currentNetMinor;
  try {
    return (BigInt(currentNetMinor || "0") + BigInt(depositAmountMinor || "0")).toString();
  } catch {
    return currentNetMinor;
  }
}

export function projectFundBalanceAfterDeposit(
  currentBalanceMinor: string,
  depositAmountMinor: string,
): string {
  try {
    return (BigInt(currentBalanceMinor || "0") + BigInt(depositAmountMinor || "0")).toString();
  } catch {
    return currentBalanceMinor;
  }
}

const UNIT_CODE_FA: Record<string, string> = {
  piece: "عدد",
  pcs: "عدد",
  unit: "عدد",
  ea: "عدد",
  kg: "کیلو",
  g: "گرم",
  l: "لیتر",
  liter: "لیتر",
  ml: "میلی‌لیتر",
  pack: "بسته",
  box: "جعبه",
  bottle: "بطری",
};

/** Persian unit label — hides raw English codes like `piece`. */
export function ledgerUnitLabelFa(unitCode?: string | null): string | null {
  if (!unitCode) return null;
  const key = unitCode.trim().toLowerCase();
  if (!key) return null;
  if (UNIT_CODE_FA[key]) return UNIT_CODE_FA[key];
  // Keep non-Latin labels (already Persian); drop opaque English codes.
  if (/^[a-z0-9_\-]+$/i.test(key)) return null;
  return unitCode.trim();
}

/**
 * Unified quantity cell: always a Persian number (default ۱).
 * Never show «عدد» — only real units (کیلو، لیتر، …).
 */
export function formatLedgerQuantity(
  quantity?: number | null,
  unitCode?: string | null,
): { qty: string; unit: string | null } {
  const n =
    quantity != null && Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const unit = ledgerUnitLabelFa(unitCode);
  return {
    qty: new Intl.NumberFormat("fa-IR").format(n),
    unit: unit && unit !== "عدد" ? unit : null,
  };
}

/**
 * Personal column + equal share of shared − balance-mode fund deposits
 * by that member (gift does not change member net).
 */
export function memberDayShareMinor(
  personalMinor: string,
  sharedTotalMinor: string,
  memberCount: number,
  memberIndex: number,
  depositCreditMinor: string = "0",
): {
  personal: string;
  sharedShare: string;
  consumption: string;
  depositCredit: string;
  /** مصرف − واریز اعتبار */
  total: string;
} {
  const personal = safeBig(personalMinor);
  const shared = safeBig(sharedTotalMinor);
  const depositCredit = safeBig(depositCreditMinor);
  if (memberCount <= 0) {
    const consumption = personal;
    return {
      personal: personal.toString(),
      sharedShare: "0",
      consumption: consumption.toString(),
      depositCredit: depositCredit.toString(),
      total: (consumption - depositCredit).toString(),
    };
  }
  const n = BigInt(memberCount);
  const base = shared / n;
  const rem = shared % n;
  // Distribute remainder rial-minors to the first members for exact sum.
  const sharedShare = base + (BigInt(memberIndex) < rem ? 1n : 0n);
  const consumption = personal + sharedShare;
  return {
    personal: personal.toString(),
    sharedShare: sharedShare.toString(),
    consumption: consumption.toString(),
    depositCredit: depositCredit.toString(),
    total: (consumption - depositCredit).toString(),
  };
}

/** Sum topup/return deposits credited to a member on this day (not gift). */
export function memberDayDepositCreditMinor(
  deposits: readonly {
    kind: string;
    amountMinor: string;
    cashInByUserId?: string;
    actorUserId?: string;
  }[],
  userId: string,
): string {
  let total = 0n;
  for (const dep of deposits) {
    if (dep.kind !== "topup" && dep.kind !== "return") continue;
    const who = dep.cashInByUserId?.trim() || dep.actorUserId?.trim();
    if (who !== userId) continue;
    total += safeBig(dep.amountMinor);
  }
  return total.toString();
}

function safeBig(raw: string): bigint {
  try {
    return BigInt(raw || "0");
  } catch {
    return 0n;
  }
}

