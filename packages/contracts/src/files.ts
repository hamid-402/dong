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
  engine: "stub-av";
  scannedAt: string;
  /** Human-readable reason when blocked/error. */
  detail?: string;
  /** SHA-256 echoed for integrity check. */
  contentHash: string;
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
  rawTextPreview?: string;
  completedAt: string;
};

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
    merchantHint: "فروشگاه نمونه",
    amountMinorHint: undefined,
    rawTextPreview: `stub-ocr:${input.fileName}`,
    completedAt,
  };
}
