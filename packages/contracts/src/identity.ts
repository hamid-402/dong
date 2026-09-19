/**
 * Account identity helpers (S11-01): username + phone normalization.
 * Pure functions — shared by API validation and web forms.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

/** Reserved handles that must never belong to a person. */
export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "help",
  "api",
  "me",
  "dang",
  "owner",
  "finance",
  "auditor",
  "guest",
  "null",
  "undefined",
] as const;

export type UsernameProblem =
  | "USERNAME_EMPTY"
  | "USERNAME_TOO_SHORT"
  | "USERNAME_TOO_LONG"
  | "USERNAME_CHARSET"
  | "USERNAME_START"
  | "USERNAME_END"
  | "USERNAME_DOUBLE_SEPARATOR"
  | "USERNAME_RESERVED";

/**
 * Canonical form: lowercase, trimmed. Digits, letters, dot and underscore only.
 * Comparison and uniqueness always use this form.
 */
export function normalizeUsername(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function validateUsername(raw: string | null | undefined): UsernameProblem | null {
  const value = normalizeUsername(raw);
  if (!value) return "USERNAME_EMPTY";
  if (value.length < USERNAME_MIN_LENGTH) return "USERNAME_TOO_SHORT";
  if (value.length > USERNAME_MAX_LENGTH) return "USERNAME_TOO_LONG";
  if (!/^[a-z0-9._]+$/.test(value)) return "USERNAME_CHARSET";
  if (!/^[a-z]/.test(value)) return "USERNAME_START";
  if (/[._]$/.test(value)) return "USERNAME_END";
  if (/[._]{2}/.test(value)) return "USERNAME_DOUBLE_SEPARATOR";
  if ((RESERVED_USERNAMES as readonly string[]).includes(value)) {
    return "USERNAME_RESERVED";
  }
  return null;
}

export function isValidUsername(raw: string | null | undefined): boolean {
  return validateUsername(raw) === null;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Convert Persian/Arabic-Indic digits to ASCII so pasted numbers work. */
export function toAsciiDigits(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const fa = PERSIAN_DIGITS.indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = ARABIC_DIGITS.indexOf(ch);
    if (ar >= 0) {
      out += String(ar);
      continue;
    }
    out += ch;
  }
  return out;
}

export type PhoneProblem = "PHONE_EMPTY" | "PHONE_FORMAT";

/**
 * Normalize to E.164. Iranian mobile inputs (09xx…, 989xx…, 00989xx…, +989xx…)
 * all converge to +989xxxxxxxxx. Other countries must be written with a leading +.
 * Returns null when the input cannot be normalized.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const compact = toAsciiDigits((raw ?? "").trim()).replace(/[\s()\-.]/g, "");
  if (!compact) return null;

  const plus = compact.startsWith("+");
  const digits = (plus ? compact.slice(1) : compact).replace(/\D/g, "");
  if (!digits) return null;

  if (plus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // Local Iranian mobile: 09xxxxxxxxx
  if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`;
  // International without plus: 00989..., 989...
  if (/^00989\d{9}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^989\d{9}$/.test(digits)) return `+${digits}`;
  if (/^00\d{8,15}$/.test(digits)) return `+${digits.slice(2)}`;
  return null;
}

export function validatePhone(raw: string | null | undefined): PhoneProblem | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "PHONE_EMPTY";
  return normalizePhone(trimmed) ? null : "PHONE_FORMAT";
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return validatePhone(raw) === null;
}

/** Mask for display/logs — keeps country hint and last 4 digits only. */
export function maskPhone(normalized: string | null | undefined): string | undefined {
  if (!normalized) return undefined;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `+${digits.slice(0, 2)}***${digits.slice(-4)}`;
}

/** Login identifier can be an email, a username, or a phone number. */
export type LoginIdentifierKind = "email" | "phone" | "username";

export function classifyLoginIdentifier(raw: string): {
  kind: LoginIdentifierKind;
  value: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  const phone = normalizePhone(trimmed);
  if (phone) return { kind: "phone", value: phone };
  return { kind: "username", value: normalizeUsername(trimmed) };
}
