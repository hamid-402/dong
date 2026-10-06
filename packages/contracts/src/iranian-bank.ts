/**
 * Iranian card and Sheba checks used by payout instructions.
 * Bank names come only from a known BIN or Sheba bank code — unknown numbers stay unnamed.
 */

export type IranianBank = {
  id: string;
  nameFa: string;
  /** Three-digit Sheba bank code (IBAN positions 5–7). */
  shebaCode: string;
  bins: readonly string[];
  /** Sheba cannot tell sibling products apart; only the primary name is used. */
  shebaPrimary: boolean;
};

export const IRANIAN_BANKS: readonly IranianBank[] = [
  { id: "bmi", nameFa: "بانک ملی ایران", shebaCode: "017", bins: ["603799"], shebaPrimary: true },
  { id: "mellat", nameFa: "بانک ملت", shebaCode: "012", bins: ["610433"], shebaPrimary: true },
  { id: "sepah", nameFa: "بانک سپه", shebaCode: "015", bins: ["589210"], shebaPrimary: true },
  { id: "saderat", nameFa: "بانک صادرات ایران", shebaCode: "019", bins: ["603769"], shebaPrimary: true },
  { id: "tejarat", nameFa: "بانک تجارت", shebaCode: "018", bins: ["627353", "585983"], shebaPrimary: true },
  { id: "pasargad", nameFa: "بانک پاسارگاد", shebaCode: "057", bins: ["502229", "639347"], shebaPrimary: true },
  { id: "parsian", nameFa: "بانک پارسیان", shebaCode: "054", bins: ["622106", "639194", "627884"], shebaPrimary: true },
  { id: "saman", nameFa: "بانک سامان", shebaCode: "056", bins: ["621986"], shebaPrimary: true },
  { id: "blubank", nameFa: "بلو", shebaCode: "056", bins: ["504706"], shebaPrimary: false },
  { id: "maskan", nameFa: "بانک مسکن", shebaCode: "014", bins: ["628023"], shebaPrimary: true },
  { id: "keshavarzi", nameFa: "بانک کشاورزی", shebaCode: "016", bins: ["603770", "639217"], shebaPrimary: true },
  { id: "resalat", nameFa: "بانک قرض‌الحسنه رسالت", shebaCode: "070", bins: ["504172"], shebaPrimary: true },
  { id: "mehr", nameFa: "بانک قرض‌الحسنه مهر ایران", shebaCode: "060", bins: ["606373"], shebaPrimary: true },
  { id: "shahr", nameFa: "بانک شهر", shebaCode: "061", bins: ["502806"], shebaPrimary: true },
  { id: "day", nameFa: "بانک دی", shebaCode: "066", bins: ["502938"], shebaPrimary: true },
  { id: "sina", nameFa: "بانک سینا", shebaCode: "059", bins: ["639346"], shebaPrimary: true },
  { id: "ayandeh", nameFa: "بانک آینده", shebaCode: "062", bins: ["636214"], shebaPrimary: true },
  { id: "postbank", nameFa: "پست بانک ایران", shebaCode: "021", bins: ["627760"], shebaPrimary: true },
  { id: "refah", nameFa: "بانک رفاه کارگران", shebaCode: "013", bins: ["589463"], shebaPrimary: true },
  { id: "karafarin", nameFa: "بانک کارآفرین", shebaCode: "053", bins: ["627488", "502910"], shebaPrimary: true },
  { id: "enbank", nameFa: "بانک اقتصاد نوین", shebaCode: "055", bins: ["627412"], shebaPrimary: true },
  { id: "gardeshgari", nameFa: "بانک گردشگری", shebaCode: "064", bins: ["505416"], shebaPrimary: true },
  { id: "khavarmianeh", nameFa: "بانک خاورمیانه", shebaCode: "078", bins: ["585947"], shebaPrimary: true },
] as const;

const DIGIT_FOLD: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function foldPersianDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => DIGIT_FOLD[ch] ?? ch);
}

/** ISO/IEC 7812 check digit. Even-length numbers double the leftmost digit. */
export function luhnOk(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = digits.charCodeAt(i) - 48;
    if ((digits.length - i) % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** ISO 13616 / ISO 7064 mod 97-10. A valid IBAN leaves remainder 1. */
export function ibanCheckOk(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    expanded += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  let remainder = 0;
  for (const ch of expanded) {
    remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

export function normalizePayoutDestination(
  kind: "card" | "iban",
  raw: string,
): string {
  const folded = foldPersianDigits(raw).replace(/[\s_-]/g, "");
  if (kind === "iban") return folded.toUpperCase();
  return folded.replace(/\D/g, "");
}

export function bankFromCardBin(digits: string): IranianBank | null {
  if (digits.length < 6) return null;
  const bin = digits.slice(0, 6);
  return IRANIAN_BANKS.find((bank) => bank.bins.includes(bin)) ?? null;
}

export function bankFromSheba(iban: string): IranianBank | null {
  if (!iban.startsWith("IR") || iban.length < 7) return null;
  const code = iban.slice(4, 7);
  return (
    IRANIAN_BANKS.find((bank) => bank.shebaPrimary && bank.shebaCode === code) ??
    null
  );
}

export type PayoutDestinationInspection = {
  normalized: string;
  formatOk: boolean;
  checkOk: boolean;
  bank: IranianBank | null;
};

export function inspectPayoutDestination(
  kind: "card" | "iban",
  raw: string,
): PayoutDestinationInspection {
  const normalized = normalizePayoutDestination(kind, raw);
  if (kind === "card") {
    const formatOk = /^\d{16}$/.test(normalized);
    const checkOk = formatOk && luhnOk(normalized);
    return {
      normalized,
      formatOk,
      checkOk,
      bank: checkOk ? bankFromCardBin(normalized) : null,
    };
  }
  const formatOk = /^IR\d{24}$/.test(normalized);
  const checkOk = formatOk && ibanCheckOk(normalized);
  return {
    normalized,
    formatOk,
    checkOk,
    bank: checkOk ? bankFromSheba(normalized) : null,
  };
}
