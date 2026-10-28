import { isoFromJalali } from "./daily-ledger.js";
import { foldPersianDigits } from "./iranian-bank.js";

export type QuarantineStatus =
  | "pending"
  | "scanning"
  | "clean"
  | "blocked"
  | "error";

export type QuarantineScanResult = {
  attachmentId: string;
  workspaceId: string;
  status: QuarantineStatus;
  engine: "stub-av" | "clamav";
  scannedAt: string;
  /** Human-readable reason when blocked/error. */
  detail?: string;
  /** SHA-256 echoed for integrity check. */
  contentHash: string;
};

/** One receipt row returned by a configured OCR provider. */
export type OcrReceiptLine = {
  title: string;
  /** Decimal quantity when the provider sent one. */
  quantity?: string;
  /** Line total in IRR minor units when the provider sent one. */
  amountMinor?: string;
};

export type OcrReceiptResult = {
  attachmentId: string;
  workspaceId: string;
  jobId: string;
  status: "completed" | "failed" | "skipped";
  /** Extracted merchant/title when available. */
  merchantHint?: string;
  /** Suggested IRR minor amount when OCR finds a total. */
  amountMinorHint?: string;
  /** Item rows. Present only when a configured provider returned them. */
  lineItems?: OcrReceiptLine[];
  /** Tax total in IRR minor units when the provider sent one. */
  taxMinor?: string;
  /** Receipt date as a Gregorian ISO day when the provider sent one. */
  occurredOn?: string;
  rawTextPreview?: string;
  completedAt: string;
};

const MAX_OCR_LINES = 40;
const MAX_OCR_LINE_TITLE = 120;

/**
 * Keep only titled rows from a provider payload.
 * Missing titles, extra rows, and unlabeled numbers are dropped.
 */
export function normalizeOcrReceiptLines(raw: unknown): OcrReceiptLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lines: OcrReceiptLine[] = [];
  for (const row of raw) {
    if (lines.length >= MAX_OCR_LINES) break;
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) continue;
    const line: OcrReceiptLine = { title: title.slice(0, MAX_OCR_LINE_TITLE) };
    if (typeof record.quantity === "string" && /^\d+(\.\d+)?$/.test(record.quantity.trim())) {
      line.quantity = record.quantity.trim();
    } else if (
      typeof record.quantity === "number" &&
      Number.isFinite(record.quantity) &&
      record.quantity > 0
    ) {
      line.quantity = String(record.quantity);
    }
    const amount = record.amountMinor;
    if (typeof amount === "string" && /^\d+$/.test(amount)) {
      line.amountMinor = amount;
    } else if (typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0) {
      line.amountMinor = String(amount);
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : undefined;
}

function minorDigits(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return String(raw);
  if (typeof raw !== "string") return undefined;
  const digits = foldPersianDigits(raw).replaceAll(",", "").replaceAll("٬", "").trim();
  if (!/^\d+$/.test(digits) || digits === "0") return undefined;
  return digits;
}

/** Tax from an explicit provider field. A bare number elsewhere is not tax. */
export function normalizeOcrReceiptTax(raw: unknown): string | undefined {
  if (typeof raw === "string" || typeof raw === "number") return minorDigits(raw);
  if (raw && typeof raw === "object" && "amountMinor" in raw) {
    return minorDigits((raw as { amountMinor?: unknown }).amountMinor);
  }
  return undefined;
}

/** Receipt date from an explicit provider field. Jalali years become Gregorian ISO. */
export function normalizeOcrReceiptDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = foldPersianDigits(raw).trim();
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  if (year >= 1300 && year <= 1500) return isoFromJalali(year, month, day);
  if (year >= 1900 && year <= 2100) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      return undefined;
    }
    return iso;
  }
  return undefined;
}

export const allowedUploadMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** Payment-receipt evidence: JPG/PNG/PDF only (no webp). */
export const paymentReceiptUploadMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export type AllowedUploadMimeType = (typeof allowedUploadMimeTypes)[number];
export type PaymentReceiptUploadMimeType =
  (typeof paymentReceiptUploadMimeTypes)[number];

export function assertAllowedUploadMime(mimeType: string): void {
  if (!(allowedUploadMimeTypes as readonly string[]).includes(mimeType.trim())) {
    throw new Error("ATTACHMENT_MIME");
  }
}

export function assertPaymentReceiptUploadMime(mimeType: string): void {
  if (
    !(paymentReceiptUploadMimeTypes as readonly string[]).includes(mimeType.trim())
  ) {
    throw new Error("ATTACHMENT_MIME");
  }
}

/** General attachment ingest cap (expense / documents). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Payment-receipt evidence targets (card_to_card / payments UI).
 * Expense receipts use targetType `expense` and keep the 10MB path.
 */
export function isPaymentEvidenceAttachment(input: {
  kind: string;
  targetType: string;
}): boolean {
  if (input.targetType === "payment_receipt") return true;
  return input.kind === "receipt" && input.targetType === "settlement";
}

/**
 * Strip JPEG APP1 (EXIF) segments with pure JS — no deps.
 * PNG/PDF returned unchanged. Invalid/non-JPEG input returned as-is.
 */
export function stripJpegExif(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    return input;
  }
  const chunks: Uint8Array[] = [input.subarray(0, 2)];
  let i = 2;
  let changed = false;
  while (i < input.length) {
    if (input[i] !== 0xff) {
      chunks.push(input.subarray(i));
      break;
    }
    while (i < input.length && input[i] === 0xff) i += 1;
    if (i >= input.length) break;
    const marker = input[i]!;
    i += 1;
    if (marker === 0xd9) {
      chunks.push(new Uint8Array([0xff, 0xd9]));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(new Uint8Array([0xff, marker]));
      continue;
    }
    if (i + 1 >= input.length) {
      chunks.push(input.subarray(i - 2));
      break;
    }
    const len = (input[i]! << 8) | input[i + 1]!;
    if (len < 2 || i + len > input.length) {
      chunks.push(input.subarray(i - 2));
      break;
    }
    if (marker === 0xda) {
      chunks.push(new Uint8Array([0xff, marker]));
      chunks.push(input.subarray(i));
      break;
    }
    if (marker === 0xe1) {
      changed = true;
      i += len;
      continue;
    }
    chunks.push(new Uint8Array([0xff, marker]));
    chunks.push(input.subarray(i, i + len));
    i += len;
  }
  if (!changed) return input;
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Reject path-traversal / separator patterns in uploaded file names. */
export function assertSafeAttachmentFileName(fileName: string): void {
  const name = fileName.trim();
  if (
    !name ||
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error("ATTACHMENT_PATH");
  }
}

/**
 * Detect MIME from file content (magic bytes). Returns null when unrecognized.
 * Used so clients cannot spoof type via Content-Type / extension alone.
 */
export function sniffUploadMime(
  bytes: Uint8Array | ArrayBuffer,
): AllowedUploadMimeType | null {
  const buf =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return "application/pdf";
  }
  return null;
}

/** Stub AV: block double-extension and executable mime masquerades. */
export function evaluateQuarantine(input: {
  fileName: string;
  mimeType: string;
  contentHash: string;
}): Omit<QuarantineScanResult, "attachmentId" | "workspaceId" | "scannedAt"> {
  const name = input.fileName.toLowerCase();
  if (/\.(exe|bat|cmd|ps1|js|msi|scr)(\.|$)/i.test(name) || name.includes("..")) {
    return {
      status: "blocked",
      engine: "stub-av",
      detail: "Executable or path-traversal pattern blocked",
      contentHash: input.contentHash,
    };
  }
  if (!(allowedUploadMimeTypes as readonly string[]).includes(input.mimeType)) {
    return {
      status: "blocked",
      engine: "stub-av",
      detail: "MIME type not on allow-list",
      contentHash: input.contentHash,
    };
  }
  return {
    status: "clean",
    engine: "stub-av",
    contentHash: input.contentHash,
  };
}

/** Deterministic stub OCR for receipts — no real vision model. */
export function runStubOcr(input: {
  attachmentId: string;
  workspaceId: string;
  jobId: string;
  fileName: string;
}): OcrReceiptResult {
  const completedAt = new Date().toISOString();
  if (!/\.(jpe?g|png|webp|pdf)$/i.test(input.fileName)) {
    return {
      attachmentId: input.attachmentId,
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      status: "skipped",
      completedAt,
    };
  }
  return {
    attachmentId: input.attachmentId,
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    status: "completed",
    rawTextPreview: `stub-ocr:${input.fileName}`,
    completedAt,
  };
}
