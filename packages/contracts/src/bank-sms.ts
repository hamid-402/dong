import { isoFromJalali } from "./daily-ledger.js";
import { foldPersianDigits, IRANIAN_BANKS } from "./iranian-bank.js";

export type BankSmsDirection = "deposit" | "withdrawal" | "purchase" | "unknown";

export type ParsedBankSms = {
  /** A single transaction amount was found. Apply may fill the form. */
  recognized: boolean;
  /** More than one different labeled amount. Apply must not fill. */
  ambiguous: boolean;
  direction: BankSmsDirection;
  /** IRR minor (rial) when recognized. */
  amountMinor?: string;
  trackingCode?: string;
  /** Gregorian ISO date when the SMS date converts cleanly. */
  isoDate?: string;
  bankName?: string;
};

const AMOUNT_LABEL =
  /(?:مبلغ|واریز|برداشت|خرید)\s*[:：]?\s*(\d[\d,]*)\s*(ریال|تومان)?/g;

function bankNameFromText(text: string): string | undefined {
  const ranked = [...IRANIAN_BANKS].sort((a, b) => b.nameFa.length - a.nameFa.length);
  for (const bank of ranked) {
    const short = bank.nameFa.replace(/^بانک\s+/u, "");
    if (text.includes(bank.nameFa) || (short.length >= 2 && text.includes(short))) {
      return bank.nameFa;
    }
  }
  return undefined;
}

function directionFromText(text: string): BankSmsDirection {
  if (text.includes("خرید")) return "purchase";
  if (text.includes("برداشت") || text.includes("کسر")) return "withdrawal";
  if (text.includes("واریز")) return "deposit";
  return "unknown";
}

function isoFromSmsDate(text: string): string | undefined {
  const match = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  if (year >= 1300 && year <= 1500) return isoFromJalali(year, month, day);
  if (year >= 1900 && year <= 2100) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return undefined;
}

/**
 * Read one Iranian bank SMS into form fields.
 * A balance line is ignored. Two different labeled amounts stay ambiguous.
 * Text without a labeled amount is not recognized.
 */
export function parseBankSms(raw: string): ParsedBankSms {
  const text = foldPersianDigits(raw ?? "").trim();
  const empty: ParsedBankSms = {
    recognized: false,
    ambiguous: false,
    direction: "unknown",
  };
  if (!text) return empty;

  const bankName = bankNameFromText(text);
  const direction = directionFromText(text);
  const tracking = text.match(/(?:پیگیری|ارجاع|رسید)\s*[:：]?\s*(\d{4,})/u);
  const isoDate = isoFromSmsDate(text);
  const withoutBalance = text.replace(
    /(?:مانده|موجودی)\s*[:：]?\s*\d[\d,]*\s*(?:ریال|تومان)?/gu,
    " ",
  );

  const amounts: Array<{ minor: bigint; unit: "rial" | "toman" }> = [];
  for (const match of withoutBalance.matchAll(AMOUNT_LABEL)) {
    const digits = match[1]?.replace(/,/g, "");
    if (!digits || !/^\d+$/.test(digits)) continue;
    const value = BigInt(digits);
    if (value <= 0n) continue;
    const unit = match[2] === "تومان" ? "toman" : "rial";
    amounts.push({ minor: unit === "toman" ? value * 10n : value, unit });
  }

  const distinct = [...new Set(amounts.map((row) => row.minor.toString()))];
  const base = {
    direction,
    ...(tracking?.[1] ? { trackingCode: tracking[1] } : {}),
    ...(isoDate ? { isoDate } : {}),
    ...(bankName ? { bankName } : {}),
  };

  if (distinct.length > 1) {
    return { ...base, recognized: false, ambiguous: true };
  }
  if (distinct.length !== 1) {
    return { ...base, recognized: false, ambiguous: false };
  }
  return {
    ...base,
    recognized: true,
    ambiguous: false,
    amountMinor: distinct[0],
  };
}
