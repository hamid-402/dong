import {
  JALALI_MONTH_FA,
  formatJalaliIso,
  parseIsoToJalali,
  weekdayFaSatFirst,
} from "@dang/contracts";

/** Local calendar day as Gregorian ISO YYYY-MM-DD (storage), for Jalali pickers. */
export function todayIsoLocal(): string {
  return todayIsoFromDate(new Date());
}

function todayIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalIsoDate(value: string | Date): string | null {
  if (typeof value === "string") {
    const day = value.includes("T") ? value.slice(0, 10) : value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && !value.includes("T")) return day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && value.includes("T")) {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return day;
      return todayIsoFromDate(parsed);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return todayIsoFromDate(parsed);
  }
  if (Number.isNaN(value.getTime())) return null;
  return todayIsoFromDate(value);
}

/** Display a date-only or instant as Jalali YYYY/MM/DD. */
export function formatFaDate(
  value: string | Date | null | undefined,
  empty = "—",
): string {
  if (value == null || value === "") return empty;
  const iso = toLocalIsoDate(value);
  if (!iso) return empty;
  return formatJalaliIso(iso);
}

/** «شنبه ۱۴ شهریور ۱۴۰۵» — for headers / today labels. */
export function formatFaDateLong(
  value: string | Date | null | undefined = new Date(),
  empty = "—",
): string {
  if (value == null || value === "") return empty;
  const d = typeof value === "string" ? new Date(value.includes("T") ? value : `${value}T12:00:00`) : value;
  if (Number.isNaN(d.getTime())) return empty;
  const iso = toLocalIsoDate(d);
  if (!iso) return empty;
  const parts = parseIsoToJalali(iso);
  if (!parts) return empty;
  const weekday = weekdayFaSatFirst(d.getDay());
  return `${weekday} ${parts.jd} ${JALALI_MONTH_FA[parts.jm - 1]} ${parts.jy}`;
}

/** Jalali date + fa-IR clock (product UI — always شمسی). */
export function formatFaDateTime(
  value: string | Date | null | undefined,
  empty = "—",
): string {
  if (value == null || value === "") return empty;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return empty;
  const date = formatFaDate(d);
  const time = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date}، ${time}`;
}
