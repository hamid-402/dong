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

export type AllowedUploadMimeType = (typeof allowedUploadMimeTypes)[number];

export function assertAllowedUploadMime(mimeType: string): void {
  if (!(allowedUploadMimeTypes as readonly string[]).includes(mimeType.trim())) {
    throw new Error("ATTACHMENT_MIME");
  }
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
