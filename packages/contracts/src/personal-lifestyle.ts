/**
 * Personal lifestyle ledger — paycheck cycle, domain allocation, closed monthly balance.
 * Pure aggregates only; no decorative zeros.
 */
import type { Money } from "./money.js";
import { irrMoney, zeroIrr } from "./personal-finance.js";
import { jalaliYearMonthFromIsoDate } from "./daily-ledger.js";

type SpaceKindLike = "personal" | "group" | "building" | "org";

export type LifeDomain = "solo" | "group" | "building" | "org" | "savings";

export const LIFE_DOMAINS: readonly LifeDomain[] = [
  "solo",
  "group",
  "building",
  "org",
  "savings",
] as const;

export const LIFE_DOMAIN_LABEL_FA: Record<LifeDomain, string> = {
  solo: "شخصی (تنها)",
  group: "دوستان / خانواده",
  building: "ساختمان",
  org: "سازمان / همکاران",
  savings: "پس‌انداز",
};

/** Default plan: 30% save, rest spendable across domains. */
export const DEFAULT_ALLOCATION_PERCENTS: Record<LifeDomain, number> = {
  savings: 30,
  solo: 40,
  group: 15,
  building: 10,
  org: 5,
};

export type AllocationPlanSummary = {
  userId: string;
  /** Integer percent 0–100 per domain; must sum to 100. */
  percents: Record<LifeDomain, number>;
  updatedAt: string;
};

export type PutAllocationPlanRequest = {
  percents: Record<LifeDomain, number>;
};

export type PaycheckSummary = {
  id: string;
  userId: string;
  /** Jalali YYYY-MM (e.g. 1405-06). */
  yearMonth: string;
  amount: Money;
  occurredOn: string;
  incomeSourceId?: string;
  moneyTxnId?: string;
  note?: string;
  createdAt: string;
};

export type CreatePaycheckRequest = {
  amountMinor: string;
  occurredOn: string;
  incomeSourceId?: string;
  note?: string;
  /** When set, must match Jalali month of occurredOn. */
  yearMonth?: string;
  idempotencyKey: string;
};

export type LifestyleDomainLine = {
  domain: LifeDomain;
  labelFa: string;
  /** Allocated envelope from paycheck × percent (0 when no paycheck). */
  budget: Money;
  /** Actual spend or savings in range. */
  actual: Money;
  percent: number;
  /** 0–100+ floored when budget > 0. */
  usedPercent: number;
};

export type MonthLifestyleSnapshot = {
  yearMonth: string;
  from: string;
  to: string;
  currency: "IRR";
  incomeTotal: Money;
  savingsTotal: Money;
  lifestyleSpendTotal: Money;
  /** Cash paid in workspaces (informational; not in closed equation). */
  cashPaidTotal: Money;
  /** income − savings − lifestyleSpend (may be negative). */
  remainder: Money;
  /** |remainder| ≤ toleranceMinor. */
  balanced: boolean;
  toleranceMinor: string;
  byDomain: LifestyleDomainLine[];
  paycheckCount: number;
  emptyReason?: string;
  source: {
    paychecks: "memory" | "postgres";
    workspaces: "memory" | "postgres";
    personal: "memory" | "postgres";
    savings: "memory" | "postgres";
  };
};

export type BuildMonthLifestyleInput = {
  yearMonth: string;
  from: string;
  to: string;
  percents: Record<LifeDomain, number>;
  paycheckAmountsMinor: readonly bigint[];
  /** Share (consumption) by life domain — solo includes personal workspace share. */
  spendByDomain: Partial<Record<Exclude<LifeDomain, "savings">, bigint>>;
  /** Cash paid by domain (optional display). */
  paidByDomain?: Partial<Record<Exclude<LifeDomain, "savings">, bigint>>;
  savingsContributedMinor: bigint;
  persistence: MonthLifestyleSnapshot["source"];
  /** IRR minor units; default 10. */
  toleranceMinor?: bigint;
};

export function spaceKindToLifeDomain(kind: SpaceKindLike): Exclude<LifeDomain, "savings"> {
  if (kind === "personal") return "solo";
  if (kind === "building") return "building";
  if (kind === "org") return "org";
  return "group";
}

export function assertAllocationPercents(
  percents: Record<LifeDomain, number>,
): void {
  let sum = 0;
  for (const domain of LIFE_DOMAINS) {
    const p = percents[domain];
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      throw new Error("ALLOCATION_PERCENT");
    }
    sum += p;
  }
  if (sum !== 100) throw new Error("ALLOCATION_SUM");
}

export function normalizeAllocationPercents(
  partial?: Partial<Record<LifeDomain, number>> | null,
): Record<LifeDomain, number> {
  const next = { ...DEFAULT_ALLOCATION_PERCENTS };
  if (partial) {
    for (const domain of LIFE_DOMAINS) {
      if (partial[domain] != null) next[domain] = Math.floor(partial[domain]);
    }
  }
  assertAllocationPercents(next);
  return next;
}

export function envelopeMinor(incomeMinor: bigint, percent: number): bigint {
  if (incomeMinor <= 0n || percent <= 0) return 0n;
  return (incomeMinor * BigInt(percent)) / 100n;
}

export function usedPercentOf(actual: bigint, budget: bigint): number {
  if (budget <= 0n) return actual > 0n ? 100 : 0;
  if (actual <= 0n) return 0;
  return Math.floor(Number((actual * 100n) / budget));
}

/**
 * Closed lifestyle balance for one Jalali month.
 * Equation: income ≈ savings + lifestyleSpend (within tolerance).
 */
export function buildMonthLifestyleSnapshot(
  input: BuildMonthLifestyleInput,
): MonthLifestyleSnapshot {
  const percents = normalizeAllocationPercents(input.percents);
  const incomeTotal = input.paycheckAmountsMinor.reduce(
    (a, b) => a + (b < 0n ? 0n : b),
    0n,
  );
  const savingsTotal =
    input.savingsContributedMinor < 0n ? 0n : input.savingsContributedMinor;

  const solo = input.spendByDomain.solo ?? 0n;
  const group = input.spendByDomain.group ?? 0n;
  const building = input.spendByDomain.building ?? 0n;
  const org = input.spendByDomain.org ?? 0n;
  const lifestyleSpendTotal =
    (solo < 0n ? 0n : solo) +
    (group < 0n ? 0n : group) +
    (building < 0n ? 0n : building) +
    (org < 0n ? 0n : org);

  const cashPaidTotal = (
    ["solo", "group", "building", "org"] as const
  ).reduce((a, d) => {
    const v = input.paidByDomain?.[d] ?? 0n;
    return a + (v < 0n ? 0n : v);
  }, 0n);

  const remainder = incomeTotal - savingsTotal - lifestyleSpendTotal;
  const tolerance = input.toleranceMinor ?? 10n;
  const balanced =
    incomeTotal > 0n &&
    (remainder >= 0n ? remainder : -remainder) <= tolerance;

  const actualByDomain: Record<LifeDomain, bigint> = {
    solo: solo < 0n ? 0n : solo,
    group: group < 0n ? 0n : group,
    building: building < 0n ? 0n : building,
    org: org < 0n ? 0n : org,
    savings: savingsTotal,
  };

  const byDomain: LifestyleDomainLine[] = LIFE_DOMAINS.map((domain) => {
    const budget = envelopeMinor(incomeTotal, percents[domain]);
    const actual = actualByDomain[domain];
    return {
      domain,
      labelFa: LIFE_DOMAIN_LABEL_FA[domain],
      budget: irrMoney(budget),
      actual: irrMoney(actual),
      percent: percents[domain],
      usedPercent: usedPercentOf(actual, budget),
    };
  });

  let emptyReason: string | undefined;
  if (input.paycheckAmountsMinor.length === 0 && incomeTotal === 0n) {
    emptyReason = "هنوز حقوقی برای این ماه شمسی ثبت نشده است";
  } else if (
    incomeTotal === 0n &&
    lifestyleSpendTotal === 0n &&
    savingsTotal === 0n
  ) {
    emptyReason = "فعالیت مالی در این بازه نیست";
  }

  return {
    yearMonth: input.yearMonth,
    from: input.from,
    to: input.to,
    currency: "IRR",
    incomeTotal: irrMoney(incomeTotal),
    savingsTotal: irrMoney(savingsTotal),
    lifestyleSpendTotal: irrMoney(lifestyleSpendTotal),
    cashPaidTotal: irrMoney(cashPaidTotal),
    remainder: irrMoney(remainder),
    balanced,
    toleranceMinor: tolerance.toString(),
    byDomain,
    paycheckCount: input.paycheckAmountsMinor.length,
    emptyReason,
    source: input.persistence,
  };
}

export type PersonalAnnualStatementMonth = {
  yearMonth: string;
  incomeMinor: string;
  savingsMinor: string;
  spendMinor: string;
  remainderMinor: string;
  balanced: boolean;
};

export type PersonalAnnualStatementPack = {
  jalaliYear: number;
  from: string;
  to: string;
  issuedAtIso: string;
  displayName: string;
  totals: {
    incomeMinor: string;
    savingsMinor: string;
    spendMinor: string;
    byDomain: Record<Exclude<LifeDomain, "savings">, string>;
  };
  months: PersonalAnnualStatementMonth[];
  goals: Array<{
    name: string;
    targetMinor: string;
    contributedMinor: string;
    progressPercent: number;
    reached: boolean;
  }>;
};

export function buildPersonalAnnualStatementPack(input: {
  jalaliYear: number;
  from: string;
  to: string;
  displayName: string;
  issuedAtIso: string;
  months: readonly MonthLifestyleSnapshot[];
  goals: readonly {
    name: string;
    target: Money;
    contributed: Money;
    progressPercent: number;
    status: string;
  }[];
}): PersonalAnnualStatementPack {
  let income = 0n;
  let savings = 0n;
  let spend = 0n;
  const byDomain: Record<Exclude<LifeDomain, "savings">, bigint> = {
    solo: 0n,
    group: 0n,
    building: 0n,
    org: 0n,
  };
  const months: PersonalAnnualStatementMonth[] = [];
  for (const snap of input.months) {
    income += BigInt(snap.incomeTotal.amountMinor);
    savings += BigInt(snap.savingsTotal.amountMinor);
    spend += BigInt(snap.lifestyleSpendTotal.amountMinor);
    for (const line of snap.byDomain) {
      if (line.domain === "savings") continue;
      byDomain[line.domain] += BigInt(line.actual.amountMinor);
    }
    months.push({
      yearMonth: snap.yearMonth,
      incomeMinor: snap.incomeTotal.amountMinor,
      savingsMinor: snap.savingsTotal.amountMinor,
      spendMinor: snap.lifestyleSpendTotal.amountMinor,
      remainderMinor: snap.remainder.amountMinor,
      balanced: snap.balanced,
    });
  }
  return {
    jalaliYear: input.jalaliYear,
    from: input.from,
    to: input.to,
    issuedAtIso: input.issuedAtIso,
    displayName: input.displayName,
    totals: {
      incomeMinor: income.toString(),
      savingsMinor: savings.toString(),
      spendMinor: spend.toString(),
      byDomain: {
        solo: byDomain.solo.toString(),
        group: byDomain.group.toString(),
        building: byDomain.building.toString(),
        org: byDomain.org.toString(),
      },
    },
    months,
    goals: input.goals.map((g) => ({
      name: g.name,
      targetMinor: g.target.amountMinor,
      contributedMinor: g.contributed.amountMinor,
      progressPercent: g.progressPercent,
      reached: g.status === "reached" || g.progressPercent >= 100,
    })),
  };
}

export function personalAnnualStatementToCsv(
  pack: PersonalAnnualStatementPack,
): string {
  const lines: string[] = [];
  lines.push(`سال شمسی,${pack.jalaliYear}`);
  lines.push(`عضو,${csvEscape(pack.displayName)}`);
  lines.push(`بازه,${pack.from},${pack.to}`);
  lines.push("");
  lines.push("جمع درآمد,جمع پس‌انداز,جمع مصرف");
  lines.push(
    `${pack.totals.incomeMinor},${pack.totals.savingsMinor},${pack.totals.spendMinor}`,
  );
  lines.push("");
  lines.push("حوزه,مصرف (minor)");
  for (const d of ["solo", "group", "building", "org"] as const) {
    lines.push(`${LIFE_DOMAIN_LABEL_FA[d]},${pack.totals.byDomain[d]}`);
  }
  lines.push("");
  lines.push("ماه,درآمد,پس‌انداز,مصرف,مانده,تراز");
  for (const m of pack.months) {
    lines.push(
      `${m.yearMonth},${m.incomeMinor},${m.savingsMinor},${m.spendMinor},${m.remainderMinor},${m.balanced ? "بله" : "خیر"}`,
    );
  }
  lines.push("");
  lines.push("هدف,سقف,واریز,پیشرفت٪,رسیده");
  for (const g of pack.goals) {
    lines.push(
      `${csvEscape(g.name)},${g.targetMinor},${g.contributedMinor},${g.progressPercent},${g.reached ? "بله" : "خیر"}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildPersonalAnnualStatementPrintHtml(
  pack: PersonalAnnualStatementPack,
): string {
  const monthRows = pack.months
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.yearMonth)}</td><td>${escapeHtml(toman(m.incomeMinor))}</td><td>${escapeHtml(toman(m.savingsMinor))}</td><td>${escapeHtml(toman(m.spendMinor))}</td><td>${escapeHtml(toman(m.remainderMinor))}</td><td>${m.balanced ? "بله" : "خیر"}</td></tr>`,
    )
    .join("");
  const domainRows = (["solo", "group", "building", "org"] as const)
    .map(
      (d) =>
        `<tr><td>${escapeHtml(LIFE_DOMAIN_LABEL_FA[d])}</td><td>${escapeHtml(toman(pack.totals.byDomain[d]))}</td></tr>`,
    )
    .join("");
  const goalRows = pack.goals
    .map(
      (g) =>
        `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(toman(g.targetMinor))}</td><td>${escapeHtml(toman(g.contributedMinor))}</td><td>${g.progressPercent.toLocaleString("fa-IR")}</td><td>${g.reached ? "بله" : "خیر"}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>صورتحساب مالی شخصی ${pack.jalaliYear}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 8px}
  .meta{color:#475569;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
  th{background:#f1f5f9}
  .totals{font-weight:700;margin-top:12px}
  @media print{body{margin:12mm}}
</style>
</head>
<body>
  <h1>صورتحساب مالی شخصی — ${escapeHtml(String(pack.jalaliYear))}</h1>
  <div class="meta">
    <div>عضو: ${escapeHtml(pack.displayName)}</div>
    <div>بازه: ${escapeHtml(pack.from)} تا ${escapeHtml(pack.to)}</div>
    <div>صدور: ${escapeHtml(pack.issuedAtIso.slice(0, 10))}</div>
  </div>
  <div class="totals">
    درآمد: ${escapeHtml(toman(pack.totals.incomeMinor))} تومان ·
    پس‌انداز: ${escapeHtml(toman(pack.totals.savingsMinor))} تومان ·
    مصرف: ${escapeHtml(toman(pack.totals.spendMinor))} تومان
  </div>
  <h2>حوزه‌ها</h2>
  <table><thead><tr><th>حوزه</th><th>مصرف (تومان)</th></tr></thead><tbody>${domainRows || `<tr><td colspan="2">—</td></tr>`}</tbody></table>
  <h2>ماه به ماه</h2>
  <table><thead><tr><th>ماه</th><th>درآمد</th><th>پس‌انداز</th><th>مصرف</th><th>مانده</th><th>تراز</th></tr></thead><tbody>${monthRows || `<tr><td colspan="6">—</td></tr>`}</tbody></table>
  <h2>اهداف پس‌انداز</h2>
  <table><thead><tr><th>هدف</th><th>سقف</th><th>واریز</th><th>٪</th><th>رسیده</th></tr></thead><tbody>${goalRows || `<tr><td colspan="5">هدفی نیست</td></tr>`}</tbody></table>
</body>
</html>`;
}

/** Resolve Jalali year-month from ISO day; throws if invalid. */
export function requireJalaliYearMonthFromIso(isoDate: string): string {
  const key = jalaliYearMonthFromIsoDate(isoDate);
  if (!key) throw new Error("YEAR_MONTH");
  return key;
}

function toman(minor: string): string {
  try {
    return (BigInt(minor) / 10n).toLocaleString("fa-IR");
  } catch {
    return minor;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Re-export helper so callers do not need a dead import. */
export { zeroIrr };
