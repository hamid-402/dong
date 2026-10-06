import {
  isOcrLive,
  isOcrHttpConfigured,
} from "@dang/config";
import {
  normalizeOcrReceiptDate,
  normalizeOcrReceiptLines,
  normalizeOcrReceiptTax,
  runStubOcr,
  type OcrReceiptResult,
} from "@dang/contracts";

/**
 * OCR provider adapter: stub by default; HTTP JSON endpoint when OCR_ENABLED=1.
 * Expected response: merchantHint, amountMinorHint, lineItems, taxMinor, occurredOn, rawTextPreview, status.
 */
export async function runReceiptOcr(input: {
  attachmentId: string;
  workspaceId: string;
  jobId: string;
  fileName: string;
  mimeType?: string;
  bytes?: Uint8Array;
}): Promise<OcrReceiptResult> {
  if (!isOcrLive() || !input.bytes?.byteLength) {
    return runStubOcr(input);
  }

  const url = process.env.OCR_HTTP_URL!.trim();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      attachmentId: input.attachmentId,
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      contentBase64: Buffer.from(input.bytes).toString("base64"),
    }),
  });
  if (!response.ok) {
    return {
      attachmentId: input.attachmentId,
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      status: "failed",
      completedAt: new Date().toISOString(),
      rawTextPreview: `ocr-http:${response.status}`,
    };
  }
  const body = (await response.json()) as {
    merchantHint?: string;
    amountMinorHint?: string;
    lineItems?: unknown;
    taxMinor?: unknown;
    tax?: unknown;
    occurredOn?: unknown;
    isoDate?: unknown;
    date?: unknown;
    rawTextPreview?: string;
    status?: "completed" | "failed" | "skipped";
  };
  const status = body.status ?? "completed";
  const completed = status === "completed";
  return {
    attachmentId: input.attachmentId,
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    status,
    merchantHint: completed ? body.merchantHint : undefined,
    amountMinorHint: completed ? body.amountMinorHint : undefined,
    lineItems: completed ? normalizeOcrReceiptLines(body.lineItems) : undefined,
    taxMinor: completed
      ? (normalizeOcrReceiptTax(body.taxMinor) ?? normalizeOcrReceiptTax(body.tax))
      : undefined,
    occurredOn: completed
      ? (normalizeOcrReceiptDate(body.occurredOn) ??
        normalizeOcrReceiptDate(body.isoDate) ??
        normalizeOcrReceiptDate(body.date))
      : undefined,
    rawTextPreview: body.rawTextPreview,
    completedAt: new Date().toISOString(),
  };
}

export function ocrProviderLabel(): "stub" | "configured" {
  return isOcrLive() || isOcrHttpConfigured() ? "configured" : "stub";
}
