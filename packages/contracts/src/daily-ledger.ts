import type { Money } from "./money.js";
import type { ExpenseSummary } from "./finance.js";
import { irrMoney, zeroIrr } from "./personal-finance.js";

export type DailyLedgerRangePreset =
  | "day"
  | "days"
  | "week"
  | "month"
  | "year"
  | "custom";

export type DailyLedgerItem = {
  expenseId: string;
  title: string;
  amount: Money;
  visibility: "shared" | "private" | "company";
  status: ExpenseSummary["status"];
};

export type DailyLedgerMemberColumn = {
  userId: string;
  displayName: string;
};

export type DailyLedgerCell = {
  items: DailyLedgerItem[];
  total: Money;
};

export type DailyLedgerDayRow = {
  date: string;
  /** ISO weekday 0=Sun … 6=Sat (UTC date). */
  weekday: number;
  isHoliday: boolean;
  /** True when an active range lock covers this date. */
  isRangeLocked: boolean;
  note?: string;
  /** Per member consumption cells. */
  members: Record<string, DailyLedgerCell>;
  /** Shared / company house column. */
  shared: DailyLedgerCell;
  dayTotal: Money;
};

export type DailyLedgerResponse = {
  workspaceId: string;
  from: string;
  to: string;
  members: DailyLedgerMemberColumn[];
  days: DailyLedgerDayRow[];
  totals: {
    members: Record<string, Money>;
    shared: Money;
    grand: Money;
  };
  rangeLocks: WorkspaceRangeLockSummary[];
  canManageLocks: boolean;
  source: {
    expense: "memory" | "postgres";
    dayMeta: "memory" | "postgres";
  };
};

export type UpsertWorkspaceDayRequest = {
  isHoliday?: boolean;
  note?: string | null;
};

export type WorkspaceDaySummary = {
  workspaceId: string;
  date: string;
  isHoliday: boolean;
  note?: string;
  /** Expense ids reversed when this day was marked holiday (for restore). */
  holidayReversedExpenseIds?: string[];
  updatedAt: string;
};

/** Additive restore stats when clearing a holiday. */
export type UpsertWorkspaceDayResponse = WorkspaceDaySummary & {
  restore?: { restored: number; failed: number };
};

export type CreateWorkspaceRangeLockRequest = {
  from: string;
  to: string;
  reason?: string;
  idempotencyKey: string;
};

export type WorkspaceRangeLockSummary = {
  id: string;
  workspaceId: string;
  from: string;
  to: string;
  reason?: string;
  lockedByUserId: string;
  lockedAt: string;
  unlockedByUserId?: string;
  unlockedAt?: string;
  active: boolean;
};

export type CreateDailyLedgerEntryRequest = {
  /** YYYY-MM-DD */
  date: string;
  /** Item name (separate from amount). */
  itemName: string;
  /** Amount in IRR minor. */
  amount: Money;
  /**
   * Member consumption column — omit (or null) for shared house column.
   */
  memberUserId?: string | null;
  idempotencyKey: string;
};

export type UpdateDailyLedgerEntryRequest = {
  itemName: string;
  amount: Money;
  idempotencyKey: string;
  /** Optional new date (YYYY-MM-DD); omit to keep current. */
  date?: string;
  /**
   * Optional column reassignment — member user id, or null for shared column.
   * Omit to keep current column.
   */
  memberUserId?: string | null;
};

/** Gregorian YYYY-MM-DD parts → Jalali parts (civil calendar). */
export function gregorianToJalali(
  gy: number,
  gm: number,
  gd: number,
): { jy: number; jm: number; jd: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gy - 1600;
  let days =
    365 * gy2 +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1]!;
  if (gm > 2 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) {
    days += 1;
  }
  let jy = 979;
  const cycles = Math.floor(days / 12053);
  days %= 12053;
  jy += 33 * cycles + 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

/** Format ISO date as Jalali YYYY/MM/DD (zero-padded). */
export function formatJalaliIso(isoDate: string): string {
  const [ys, ms, ds] = isoDate.split("-");
  const gy = Number(ys);
  const gm = Number(ms);
  const gd = Number(ds);
  if (!gy || !gm || !gd) return isoDate;
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

/** نام ماه‌های شمسی (۱=فروردین … ۱۲=اسفند) */
export const JALALI_MONTH_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/**
 * روزهای هفته با شروع شنبه (تقویم ایران).
 * index 0 = شنبه … 6 = جمعه
 */
export const WEEKDAY_FA_SAT_FIRST = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

/** تبدیل getDay/UTCDay جاوااسکریپت (۰=یکشنبه … ۶=شنبه) به ایندکس شنبه-اول */
export function weekdayIndexSatFirst(jsWeekday: number): number {
  return (jsWeekday + 1) % 7;
}

export function weekdayFaSatFirst(jsWeekday: number): string {
  return WEEKDAY_FA_SAT_FIRST[weekdayIndexSatFirst(jsWeekday)]!;
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalaliMonthLength(jy, 12) === 30;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // اسفند: اگر روز بعد از ۲۹ هنوز در همان اسفند باشد، سال کبیسه است
  const g29 = jalaliToGregorian(jy, 12, 29);
  const next = new Date(Date.UTC(g29.gy, g29.gm - 1, g29.gd + 1));
  const j = gregorianToJalali(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return j.jy === jy && j.jm === 12 ? 30 : 29;
}

/**
 * تبدیل تاریخ شمسی به میلادی.
 * با جستجوی دودویی روی همان الگوریتم gregorianToJalali تا round-trip دقیق بماند.
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  const dayMs = 86_400_000;
  let low = Date.UTC(jy + 621, 0, 1);
  let high = Date.UTC(jy + 622, 11, 31);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2 / dayMs) * dayMs;
    const dt = new Date(mid);
    const gy = dt.getUTCFullYear();
    const gm = dt.getUTCMonth() + 1;
    const gd = dt.getUTCDate();
    const j = gregorianToJalali(gy, gm, gd);
    const cmp = j.jy !== jy ? j.jy - jy : j.jm !== jm ? j.jm - jm : j.jd - jd;
    if (cmp === 0) return { gy, gm, gd };
    if (cmp < 0) low = mid + dayMs;
    else high = mid - dayMs;
  }
  const dt = new Date(low);
  return { gy: dt.getUTCFullYear(), gm: dt.getUTCMonth() + 1, gd: dt.getUTCDate() };
}

export function isoFromJalali(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function parseIsoToJalali(isoDate: string): { jy: number; jm: number; jd: number } | null {
  const [ys, ms, ds] = isoDate.split("-");
  const gy = Number(ys);
  const gm = Number(ms);
  const gd = Number(ds);
  if (!gy || !gm || !gd) return null;
  return gregorianToJalali(gy, gm, gd);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Parse import CSV rows: date_iso,column,item_name,amount_toman (column=shared or member display name). */
export type DailyLedgerImportRow = {
  date: string;
  column: string;
  itemName: string;
  amountToman: number;
};

export function parseDailyLedgerImportCsv(csv: string): DailyLedgerImportRow[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const start = /^date/i.test(lines[0]!) ? 1 : 0;
  const rows: DailyLedgerImportRow[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const parts = splitCsvLine(lines[i]!);
    if (parts.length < 4) continue;
    const [date, column, itemName, amountRaw] = parts;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amountToman = Number(String(amountRaw).replaceAll(",", "").trim());
    if (!Number.isFinite(amountToman) || amountToman <= 0) continue;
    if (!itemName?.trim() || !column?.trim()) continue;
    rows.push({
      date,
      column: column.trim(),
      itemName: itemName.trim(),
      amountToman,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Matrix CSV: one row per day; member columns show "item (toman); ..." */
export function buildDailyLedgerCsv(ledger: DailyLedgerResponse): string {
  const memberHeaders = ledger.members.map((m) => csvEscape(m.displayName));
  const header = [
    "row",
    "weekday",
    "date_iso",
    "date_jalali",
    ...memberHeaders,
    "shared",
    "day_total_toman",
    "note",
    "holiday",
  ].join(",");

  const weekdayFa = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lines = ledger.days.map((day, idx) => {
    const cellText = (cell: DailyLedgerCell) =>
      cell.items
        .map(
          (it) =>
            `${it.title} (${(Number(it.amount.amountMinor) / 10).toString()})`,
        )
        .join("; ");
    return [
      String(idx + 1),
      weekdayFa[day.weekday] ?? "",
      day.date,
      formatJalaliIso(day.date),
      ...ledger.members.map((m) => csvEscape(cellText(day.members[m.userId]!))),
      csvEscape(cellText(day.shared)),
      String(Number(day.dayTotal.amountMinor) / 10),
      csvEscape(day.note ?? ""),
      day.isHoliday ? "1" : "0",
    ].join(",");
  });

  const totalRow = [
    "",
    "",
    "",
    "TOTAL",
    ...ledger.members.map((m) =>
      String(Number(ledger.totals.members[m.userId]?.amountMinor ?? "0") / 10),
    ),
    String(Number(ledger.totals.shared.amountMinor) / 10),
    String(Number(ledger.totals.grand.amountMinor) / 10),
    "",
    "",
  ].join(",");

  return [header, ...lines, totalRow].join("\n");
}

export function eachDateInclusive(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("DATE_RANGE");
  }
  if (from > to) throw new Error("DATE_RANGE");
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function weekdayUtc(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function resolveDailyLedgerRange(
  preset: DailyLedgerRangePreset,
  anchor = new Date(),
  custom?: { from: string; to: string; days?: number },
): { from: string; to: string } {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();
  const today = new Date(Date.UTC(y, m, d));
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);

  if (preset === "custom" && custom?.from && custom?.to) {
    return { from: custom.from, to: custom.to };
  }
  if (preset === "day") {
    const t = iso(today);
    return { from: t, to: t };
  }
  if (preset === "days") {
    const n = Math.min(Math.max(custom?.days ?? 7, 1), 366);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (n - 1));
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "week") {
    // هفتهٔ شمسی: شنبه تا جمعه
    const sinceSat = weekdayIndexSatFirst(today.getUTCDay());
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - sinceSat);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from: iso(start), to: iso(end) };
  }
  if (preset === "month") {
    // ماه شمسی جاری
    const { jy, jm } = gregorianToJalali(y, m + 1, d);
    const last = jalaliMonthLength(jy, jm);
    return { from: isoFromJalali(jy, jm, 1), to: isoFromJalali(jy, jm, last) };
  }
  if (preset === "year") {
    // سال شمسی جاری
    const { jy } = gregorianToJalali(y, m + 1, d);
    const last = jalaliMonthLength(jy, 12);
    return { from: isoFromJalali(jy, 1, 1), to: isoFromJalali(jy, 12, last) };
  }
  const t = iso(today);
  return { from: t, to: t };
}

/** جابه‌جایی بازه نسبت به پیش‌فرض فعلی (هفته/ماه/سال/روز). */
export function shiftDailyLedgerRange(
  preset: DailyLedgerRangePreset,
  from: string,
  to: string,
  delta: number,
  daysCount = 7,
): { from: string; to: string } {
  const step = Math.trunc(delta) || 0;
  if (step === 0) return { from, to };

  if (preset === "month") {
    const j = parseIsoToJalali(from) ?? parseIsoToJalali(to);
    if (!j) return { from, to };
    let jm = j.jm + step;
    let jy = j.jy;
    while (jm < 1) {
      jm += 12;
      jy -= 1;
    }
    while (jm > 12) {
      jm -= 12;
      jy += 1;
    }
    const last = jalaliMonthLength(jy, jm);
    return { from: isoFromJalali(jy, jm, 1), to: isoFromJalali(jy, jm, last) };
  }

  if (preset === "year") {
    const j = parseIsoToJalali(from) ?? parseIsoToJalali(to);
    if (!j) return { from, to };
    const jy = j.jy + step;
    const last = jalaliMonthLength(jy, 12);
    return { from: isoFromJalali(jy, 1, 1), to: isoFromJalali(jy, 12, last) };
  }

  const daySpan =
    preset === "week" ? 7 : preset === "day" ? 1 : Math.max(1, Math.min(366, daysCount));
  const shiftDays = step * daySpan;
  const shiftIso = (isoDate: string) => {
    const dt = new Date(`${isoDate}T12:00:00.000Z`);
    dt.setUTCDate(dt.getUTCDate() + shiftDays);
    return dt.toISOString().slice(0, 10);
  };
  return { from: shiftIso(from), to: shiftIso(to) };
}

function emptyCell(): DailyLedgerCell {
  return { items: [], total: zeroIrr() };
}

function addToCell(cell: DailyLedgerCell, item: DailyLedgerItem): void {
  cell.items.push(item);
  cell.total = irrMoney(BigInt(cell.total.amountMinor) + BigInt(item.amount.amountMinor));
}

/**
 * Build day×member matrix from posted/draft expenses + day meta.
 * - Member column: amount-split solely to one member (shared visibility, single split)
 * - Shared column («هزینه مشترک»): multi-member shared or legacy company visibility
 */
export function buildDailyLedgerMatrix(input: {
  workspaceId: string;
  from: string;
  to: string;
  members: DailyLedgerMemberColumn[];
  expenses: readonly Pick<
    ExpenseSummary,
    | "id"
    | "title"
    | "status"
    | "visibility"
    | "occurredOn"
    | "total"
    | "splits"
    | "participantUserIds"
    | "source"
  >[];
  dayMeta: readonly { date: string; isHoliday: boolean; note?: string }[];
  /** Active locks overlapping the range (optional). */
  rangeLocks?: readonly WorkspaceRangeLockSummary[];
  canManageLocks?: boolean;
  expensePersistence: "memory" | "postgres";
  dayMetaPersistence: "memory" | "postgres";
}): DailyLedgerResponse {
  const dates = eachDateInclusive(input.from, input.to);
  const metaByDate = new Map(input.dayMeta.map((d) => [d.date, d]));
  const memberIds = input.members.map((m) => m.userId);
  const locks = (input.rangeLocks ?? []).filter((l) => l.active);

  const isLocked = (date: string) =>
    locks.some((l) => date >= l.from && date <= l.to);

  const days: DailyLedgerDayRow[] = dates.map((date) => {
    const meta = metaByDate.get(date);
    const members: Record<string, DailyLedgerCell> = {};
    for (const id of memberIds) members[id] = emptyCell();
    return {
      date,
      weekday: weekdayUtc(date),
      isHoliday: meta?.isHoliday ?? false,
      isRangeLocked: isLocked(date),
      note: meta?.note,
      members,
      shared: emptyCell(),
      dayTotal: zeroIrr(),
    };
  });
  const dayByDate = new Map(days.map((d) => [d.date, d]));

  for (const expense of input.expenses) {
    if (expense.status === "reversed") continue;
    // Prefer tagged daily-ledger rows; untagged legacy rows still appear until backfilled.
    if (expense.source != null && expense.source !== "daily_ledger") continue;
    if (expense.occurredOn < input.from || expense.occurredOn > input.to) continue;
    const target = dayByDate.get(expense.occurredOn);
    if (!target) continue;

    const item: DailyLedgerItem = {
      expenseId: expense.id,
      title: expense.title,
      amount: expense.total,
      visibility: expense.visibility,
      status: expense.status,
    };

    const isSharedBucket =
      expense.visibility === "company" ||
      (expense.visibility === "shared" &&
        expense.splits.length !== 1 &&
        expense.participantUserIds.length !== 1);

    if (expense.visibility === "company") {
      addToCell(target.shared, item);
    } else if (expense.visibility === "private") {
      const owner =
        expense.splits[0]?.userId ??
        expense.participantUserIds[0] ??
        null;
      if (owner && target.members[owner]) {
        addToCell(target.members[owner], {
          ...item,
          amount: expense.splits[0]?.amount ?? expense.total,
        });
      }
    } else if (expense.visibility === "shared" && expense.splits.length === 1) {
      const only = expense.splits[0]!;
      if (target.members[only.userId]) {
        addToCell(target.members[only.userId]!, {
          ...item,
          amount: only.amount,
        });
      } else {
        addToCell(target.shared, item);
      }
    } else if (isSharedBucket || expense.visibility === "shared") {
      addToCell(target.shared, item);
    }

    let daySum = 0n;
    for (const id of memberIds) {
      daySum += BigInt(target.members[id]!.total.amountMinor);
    }
    daySum += BigInt(target.shared.total.amountMinor);
    target.dayTotal = irrMoney(daySum);
  }

  // Recompute day totals after all items (in case holiday rows still have items)
  for (const row of days) {
    let daySum = 0n;
    for (const id of memberIds) {
      daySum += BigInt(row.members[id]!.total.amountMinor);
    }
    daySum += BigInt(row.shared.total.amountMinor);
    row.dayTotal = irrMoney(daySum);
  }

  const memberTotals: Record<string, Money> = {};
  for (const id of memberIds) memberTotals[id] = zeroIrr();
  let sharedTotal = 0n;
  let grand = 0n;
  for (const row of days) {
    for (const id of memberIds) {
      const add = BigInt(row.members[id]!.total.amountMinor);
      memberTotals[id] = irrMoney(BigInt(memberTotals[id]!.amountMinor) + add);
      grand += add;
    }
    const s = BigInt(row.shared.total.amountMinor);
    sharedTotal += s;
    grand += s;
  }

  return {
    workspaceId: input.workspaceId,
    from: input.from,
    to: input.to,
    members: input.members,
    days,
    totals: {
      members: memberTotals,
      shared: irrMoney(sharedTotal),
      grand: irrMoney(grand),
    },
    rangeLocks: [...(input.rangeLocks ?? [])],
    canManageLocks: input.canManageLocks ?? false,
    source: {
      expense: input.expensePersistence,
      dayMeta: input.dayMetaPersistence,
    },
  };
}
