/**
 * Import helpers for Excel-like paste and «دونگ تو.xlsx» master sheet (جدول عمومی).
 * Output is always {@link DailyLedgerImportRow} for the existing ledger import pipeline.
 */
import { isoFromJalali, type DailyLedgerImportRow } from "./daily-ledger.js";

export type DongToImportResult = {
  rows: DailyLedgerImportRow[];
  /** ISO dates marked تعطیل in the master sheet */
  holidays: string[];
  warnings: string[];
};

const EMPTY_MARKERS = new Set(["", "-", "–", "—", "null", "none"]);
const HOLIDAY_MARKERS = new Set(["تعطیل", "holiday", "off"]);
const SHARED_MARKERS = new Set([
  "shared",
  "شرکت",
  "مشترک",
  "هزینه مشترک",
  "هزینه شرکت",
  "عمومی",
  "ساختمان",
]);

function normalizeCell(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).trim();
  }
  return "";
}

function isEmptyCell(value: string): boolean {
  return EMPTY_MARKERS.has(value.toLowerCase()) || value === "";
}

function parseAmountToman(raw: string): number | null {
  const cleaned = raw
    .replace(/[,\u066C\u060C]/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Accepts 1405/06/12, 1405-06-12, or 2026-09-03. */
export function parseFlexibleLedgerDate(raw: string): string | null {
  const s = raw.trim().replaceAll(".", "/").replaceAll("-", "/");
  const parts = s.split("/").map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    // already ISO?
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
    return null;
  }
  const [a, b, c] = parts as [number, number, number];
  // Jalali years are typically 1300–1599
  if (a >= 1300 && a <= 1599 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
    return isoFromJalali(a, b, c);
  }
  // Gregorian y/m/d written with slashes
  if (a >= 1900 && a <= 2100 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
    return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
  }
  return null;
}

function splitTsvOrCsvLine(line: string, sep: "\t" | ","): string[] {
  if (sep === "\t") {
    return line.split("\t").map((c) => c.trim());
  }
  // reuse simple CSV split (quoted)
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
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Split pasted Excel clipboard / CSV text into a matrix. */
export function parseSpreadsheetMatrix(text: string): string[][] {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const tabCount = (lines[0]!.match(/\t/g) ?? []).length;
  const sep: "\t" | "," = tabCount >= 2 ? "\t" : ",";
  return lines.map((line) => splitTsvOrCsvLine(line, sep));
}

function isLongFormatHeader(header: string[]): boolean {
  const h0 = (header[0] ?? "").toLowerCase();
  return h0 === "date" || h0 === "date_iso" || h0.startsWith("date");
}

function isDongToMasterHeader(header: string[]): boolean {
  // Wide day×member master — not the per-member «نام کالا / برای شرکت» layout
  if (header.some((h) => /^نام\s*کالا/.test(h) || h === "قلم")) return false;
  return (
    header.some((h) => /تاریخ/.test(h)) &&
    (header.some((h) => /قیمت/.test(h)) || header.some((h) => /^شرکت$|^مشترک$/.test(h))) &&
    !isLongFormatHeader(header)
  );
}

/**
 * Parse «جدول عمومی» style matrix:
 * ردیف | روز | تاریخ | MemberA | قیمت | MemberB | قیمت2 | … | شرکت | قیمتN | جمع | توضیحات
 */
export function parseDongToMasterMatrix(matrix: string[][]): DongToImportResult {
  const warnings: string[] = [];
  if (matrix.length < 2) {
    return { rows: [], holidays: [], warnings: ["جدول خالی است"] };
  }

  const header = matrix[0]!.map(normalizeCell);
  const dateCol = header.findIndex((h) => h === "تاریخ" || /^date/i.test(h));
  if (dateCol < 0) {
    return { rows: [], holidays: [], warnings: ["ستون تاریخ پیدا نشد"] };
  }

  type Pair = { nameCol: number; priceCol: number; columnKey: string };
  const pairs: Pair[] = [];
  let i = dateCol + 1;
  // skip روز if it appears after تاریخ (unusual) — typically روز is before تاریخ
  while (i < header.length) {
    const name = header[i] ?? "";
    if (/^جمع/.test(name) || /توضیح/.test(name) || /^row$/i.test(name)) break;
    const priceHeader = header[i + 1] ?? "";
    if (/^قیمت/.test(priceHeader) || /^price/i.test(priceHeader) || priceHeader === "") {
      const key = SHARED_MARKERS.has(name.toLowerCase()) || /شرکت|مشترک|عمومی|ساختمان/.test(name)
        ? "shared"
        : name;
      if (!isEmptyCell(name) && !/^قیمت/.test(name)) {
        pairs.push({ nameCol: i, priceCol: i + 1, columnKey: key });
      }
      i += 2;
      continue;
    }
    // lone column without قیمت pair
    if (!isEmptyCell(name) && !/^قیمت/.test(name)) {
      const key = SHARED_MARKERS.has(name.toLowerCase()) || /شرکت|مشترک/.test(name)
        ? "shared"
        : name;
      pairs.push({ nameCol: i, priceCol: i, columnKey: key });
    }
    i += 1;
  }

  if (pairs.length === 0) {
    return { rows: [], holidays: [], warnings: ["هیچ ستون عضو/شرکت در هدر نبود"] };
  }

  const rows: DailyLedgerImportRow[] = [];
  const holidays: string[] = [];

  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] ?? [];
    const dateRaw = normalizeCell(line[dateCol]);
    if (isEmptyCell(dateRaw) || /^جمع/.test(dateRaw) || /قابل پرداخت/.test(dateRaw)) {
      continue;
    }
    const iso = parseFlexibleLedgerDate(dateRaw);
    if (!iso) {
      warnings.push(`ردیف ${r + 1}: تاریخ نامعتبر «${dateRaw}»`);
      continue;
    }

    // Holiday row: first item cell is تعطیل
    const sampleItem = normalizeCell(line[pairs[0]!.nameCol]);
    if (HOLIDAY_MARKERS.has(sampleItem.toLowerCase())) {
      holidays.push(iso);
      continue;
    }

    for (const pair of pairs) {
      const itemName = normalizeCell(line[pair.nameCol]);
      const priceRaw =
        pair.priceCol === pair.nameCol
          ? ""
          : normalizeCell(line[pair.priceCol]);
      if (isEmptyCell(itemName) || HOLIDAY_MARKERS.has(itemName.toLowerCase())) continue;
      // If name and price share a cell (unlikely), skip
      const amount = parseAmountToman(priceRaw || itemName);
      if (amount == null) {
        // item without price — skip
        if (!isEmptyCell(priceRaw)) {
          warnings.push(`ردیف ${r + 1} / ${pair.columnKey}: مبلغ نامعتبر`);
        }
        continue;
      }
      // When priceCol === nameCol we mis-parsed; require distinct price
      if (pair.priceCol === pair.nameCol) continue;
      rows.push({
        date: iso,
        column: pair.columnKey,
        itemName,
        amountToman: amount,
      });
    }
  }

  return { rows, holidays, warnings };
}

/** Long format: date,column,item,amount_toman (CSV or TSV). */
export function parseLongFormatMatrix(matrix: string[][]): DongToImportResult {
  const warnings: string[] = [];
  const rows: DailyLedgerImportRow[] = [];
  const start = isLongFormatHeader(matrix[0] ?? []) ? 1 : 0;
  for (let r = start; r < matrix.length; r += 1) {
    const line = matrix[r] ?? [];
    if (line.length < 4) continue;
    const dateRaw = normalizeCell(line[0]);
    const column = normalizeCell(line[1]);
    const itemName = normalizeCell(line[2]);
    const amountRaw = normalizeCell(line[3]);
    const iso = parseFlexibleLedgerDate(dateRaw);
    if (!iso) {
      warnings.push(`ردیف ${r + 1}: تاریخ نامعتبر`);
      continue;
    }
    const amount = parseAmountToman(amountRaw);
    if (amount == null || !itemName || !column) continue;
    const col =
      SHARED_MARKERS.has(column.toLowerCase()) || /شرکت|مشترک/.test(column)
        ? "shared"
        : column;
    rows.push({ date: iso, column: col, itemName, amountToman: amount });
  }
  return { rows, holidays: [], warnings };
}

/**
 * Detect Dong-To per-member sheet:
 * ردیف | روز | تاریخ | نام کالا | قیمت(ریال|تومان) | نام کالا برای شرکت | قیمت2…
 */
export function isDongToMemberSheetHeader(header: string[]): boolean {
  const joined = header.join("|");
  return (
    header.some((h) => /تاریخ/.test(h)) &&
    header.some((h) => /نام\s*کالا|قلم/.test(h)) &&
    /قیمت/.test(joined) &&
    !isDongToMasterHeader(header)
  );
}

function priceUnitFromHeader(headerCell: string): "rial" | "toman" {
  if (/ریال|ريال/i.test(headerCell)) return "rial";
  return "toman";
}

function toAmountToman(raw: string, unit: "rial" | "toman"): number | null {
  const n = parseAmountToman(raw);
  if (n == null) return null;
  if (unit === "rial") {
    // ledger stores تومان; ریال ÷ ۱۰
    return Math.round(n / 10);
  }
  return n;
}

/**
 * Parse one member sheet. Personal lines → column=memberName; company lines → shared.
 * Skips holiday / جمع / قابل پرداخت / کارت rows. Shared rows dedupe key is left to caller.
 */
export function parseDongToMemberSheet(
  matrix: string[][],
  memberName: string,
): DongToImportResult {
  const warnings: string[] = [];
  if (matrix.length < 2) {
    return { rows: [], holidays: [], warnings: ["برگه عضو خالی است"] };
  }
  const header = matrix[0]!.map(normalizeCell);
  const dateCol = header.findIndex((h) => h === "تاریخ" || /^date/i.test(h));
  if (dateCol < 0) {
    return { rows: [], holidays: [], warnings: [`${memberName}: ستون تاریخ پیدا نشد`] };
  }
  const personalNameCol = header.findIndex((h) => /نام\s*کالا(?!\s*برای)/.test(h) || h === "قلم");
  const personalPriceCol = header.findIndex((h, i) => i > personalNameCol && /^قیمت/.test(h));
  const companyNameCol = header.findIndex((h) => /برای\s*شرکت|مشترک|شرکت/.test(h));
  const companyPriceCol =
    companyNameCol >= 0
      ? header.findIndex((h, i) => i > companyNameCol && /^قیمت/.test(h))
      : -1;

  if (personalNameCol < 0 || personalPriceCol < 0) {
    return {
      rows: [],
      holidays: [],
      warnings: [`${memberName}: ستون نام کالا / قیمت شخصی پیدا نشد`],
    };
  }

  const personalUnit = priceUnitFromHeader(header[personalPriceCol] ?? "");
  const companyUnit =
    companyPriceCol >= 0
      ? priceUnitFromHeader(header[companyPriceCol] ?? "")
      : personalUnit;

  const rows: DailyLedgerImportRow[] = [];
  const holidays: string[] = [];
  const colKey = memberName.trim() || "عضو";

  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] ?? [];
    const dateRaw = normalizeCell(line[dateCol]);
    const dayLabel = normalizeCell(line[dateCol - 1] ?? line[1] ?? "");
    if (
      isEmptyCell(dateRaw) &&
      (/^جمع/.test(dayLabel) || /قابل پرداخت|شماره کارت|شبا/.test(dayLabel))
    ) {
      continue;
    }
    if (/^جمع/.test(dateRaw) || /قابل پرداخت|شماره کارت/.test(dateRaw)) continue;
    if (isEmptyCell(dateRaw) || dateRaw === "-") continue;

    const iso = parseFlexibleLedgerDate(dateRaw);
    if (!iso) {
      // جمع row sometimes puts "-" in date
      if (/^جمع|قابل/.test(dayLabel)) continue;
      warnings.push(`${memberName} ردیف ${r + 1}: تاریخ نامعتبر «${dateRaw}»`);
      continue;
    }

    const personalItem = normalizeCell(line[personalNameCol]);
    if (HOLIDAY_MARKERS.has(personalItem.toLowerCase())) {
      holidays.push(iso);
      continue;
    }

    if (!isEmptyCell(personalItem)) {
      const amount = toAmountToman(
        normalizeCell(line[personalPriceCol]),
        personalUnit,
      );
      if (amount != null && amount > 0) {
        rows.push({
          date: iso,
          column: colKey,
          itemName: personalItem,
          amountToman: amount,
        });
      }
    }

    if (companyNameCol >= 0 && companyPriceCol >= 0) {
      const companyItem = normalizeCell(line[companyNameCol]);
      if (
        !isEmptyCell(companyItem) &&
        !HOLIDAY_MARKERS.has(companyItem.toLowerCase()) &&
        !/تقسیم بر|هزینه های شرکت تقسیم/.test(companyItem)
      ) {
        const amount = toAmountToman(
          normalizeCell(line[companyPriceCol]),
          companyUnit,
        );
        if (amount != null && amount > 0) {
          rows.push({
            date: iso,
            column: "shared",
            itemName: companyItem,
            amountToman: amount,
          });
        }
      }
    }
  }

  return { rows, holidays, warnings };
}

export type DongToWorkbookSheet = { name: string; rows: string[][] };

/**
 * Parse a full Dong-To workbook: prefer جدول عمومی; otherwise merge member sheets.
 * When both exist, master wins for rows; member sheets only fill if `preferMembers`.
 */
export function parseDongToWorkbook(
  sheets: DongToWorkbookSheet[],
  options?: { source?: "auto" | "master" | "members" },
): DongToImportResult {
  const source = options?.source ?? "auto";
  const warnings: string[] = [];
  if (!sheets.length) {
    return { rows: [], holidays: [], warnings: ["هیچ برگی در فایل نبود"] };
  }

  const master =
    sheets.find((s) => /جدول|عمومی|master|general/i.test(s.name)) ??
    sheets.find((s) => isDongToMasterHeader(s.rows[0] ?? []));

  const memberSheets = sheets.filter((s) => {
    if (master && s.name === master.name) return false;
    return isDongToMemberSheetHeader(s.rows[0] ?? []);
  });

  const useMaster =
    source === "master" ||
    (source === "auto" && master && master.rows.length > 1);
  const useMembers =
    source === "members" ||
    (source === "auto" && !useMaster && memberSheets.length > 0);

  if (useMaster && master) {
    const parsed = parseDongToMasterMatrix(master.rows);
    if (memberSheets.length > 0 && source === "auto") {
      parsed.warnings.push(
        `برگه‌های عضو نادیده گرفته شد (جدول عمومی مبنا است) — برای ورود از برگه عضو source=members بفرستید`,
      );
    }
    return parsed;
  }

  if (useMembers) {
    const rows: DailyLedgerImportRow[] = [];
    const holidays: string[] = [];
    const seenShared = new Set<string>();
    for (const sheet of memberSheets) {
      const parsed = parseDongToMemberSheet(sheet.rows, sheet.name);
      warnings.push(...parsed.warnings);
      for (const h of parsed.holidays) {
        if (!holidays.includes(h)) holidays.push(h);
      }
      for (const row of parsed.rows) {
        if (row.column === "shared") {
          const key = `${row.date}|${row.itemName}|${row.amountToman}`;
          if (seenShared.has(key)) continue;
          seenShared.add(key);
        }
        rows.push(row);
      }
    }
    if (rows.length === 0 && holidays.length === 0) {
      warnings.push("از برگه‌های عضو ردیف معتبری استخراج نشد");
    }
    return { rows, holidays, warnings };
  }

  if (master) return parseDongToMasterMatrix(master.rows);
  return {
    rows: [],
    holidays: [],
    warnings: ["نه جدول عمومی و نه برگه عضو قابل تشخیص نبود"],
  };
}

/** Strip آقای/خانم prefixes and normalize whitespace for fuzzy column match. */
export function bareMemberLabel(name: string): string {
  return name
    .replace(/^(آقای|خانم|آقا|خانوم)\s+/u, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** "shared" | "skip" | member user id */
export type LedgerColumnMapValue = "shared" | "skip" | (string & {});

export type LedgerColumnResolution =
  | { kind: "shared" }
  | { kind: "skip" }
  | { kind: "member"; userId: string }
  | { kind: "unmapped" };

/**
 * Resolve an Excel/paste column label to shared / member / skip / unmapped.
 * `columnMap` wins when present (keys matched case-insensitively after trim).
 */
export function resolveLedgerColumnTarget(
  column: string,
  members: Array<{ userId: string; displayName: string }>,
  columnMap?: Record<string, LedgerColumnMapValue>,
): LedgerColumnResolution {
  const raw = column.trim();
  if (!raw) return { kind: "unmapped" };
  const lower = raw.toLowerCase();

  if (columnMap) {
    const mapped =
      columnMap[raw] ??
      columnMap[lower] ??
      Object.entries(columnMap).find(([k]) => k.trim().toLowerCase() === lower)?.[1];
    if (mapped != null) {
      const v = String(mapped).trim();
      if (v === "shared") return { kind: "shared" };
      if (v === "skip") return { kind: "skip" };
      if (v) return { kind: "member", userId: v };
    }
  }

  if (SHARED_MARKERS.has(lower) || /شرکت|مشترک|عمومی|ساختمان/.test(raw)) {
    return { kind: "shared" };
  }

  const bare = bareMemberLabel(raw);
  for (const m of members) {
    const full = m.displayName.trim().toLowerCase();
    const mBare = bareMemberLabel(m.displayName);
    if (full === lower || mBare === bare) {
      return { kind: "member", userId: m.userId };
    }
  }
  // containment: «آقای ساریخانی» ↔ «ساریخانی کاظمی» when unique
  const containHits = members.filter((m) => {
    const mBare = bareMemberLabel(m.displayName);
    if (!mBare || !bare) return false;
    return mBare.includes(bare) || bare.includes(mBare);
  });
  if (containHits.length === 1) {
    return { kind: "member", userId: containHits[0]!.userId };
  }

  return { kind: "unmapped" };
}

/**
 * Auto-detect paste/CSV content: Dong-To wide master vs long import format.
 */
export function parseLedgerImportText(text: string): DongToImportResult {
  const matrix = parseSpreadsheetMatrix(text);
  if (matrix.length === 0) {
    return { rows: [], holidays: [], warnings: ["متن خالی است"] };
  }
  const header = matrix[0] ?? [];
  if (isDongToMasterHeader(header)) {
    return parseDongToMasterMatrix(matrix);
  }
  if (isLongFormatHeader(header) || header.length >= 4) {
    // Prefer long format when first col looks like date_iso/date
    if (isLongFormatHeader(header) || parseFlexibleLedgerDate(header[0] ?? "")) {
      // if header is a data row with a date, parse as long without skipping
      if (!isLongFormatHeader(header) && parseFlexibleLedgerDate(header[0] ?? "")) {
        return parseLongFormatMatrix(matrix);
      }
      return parseLongFormatMatrix(matrix);
    }
  }
  if (isDongToMasterHeader(header) || header.some((h) => /تاریخ|قیمت/.test(h))) {
    return parseDongToMasterMatrix(matrix);
  }
  return parseLongFormatMatrix(matrix);
}
