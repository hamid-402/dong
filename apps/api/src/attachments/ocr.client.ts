import {
  isOcrLive,
  isOcrHttpConfigured,
} from "@dang/config";
import { runStubOcr, type OcrReceiptResult } from "@dang/contracts";

/**
 * OCR provider adapter: stub by default; HTTP JSON endpoint when OCR_ENABLED=1.
 * Expected response: { merchantHint?, amountMinorHint?, rawTextPreview?, status? }
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
    rawTextPreview?: string;
    status?: "completed" | "failed" | "skipped";
  };
  return {
    attachmentId: input.attachmentId,
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    status: body.status ?? "completed",
    merchantHint: body.merchantHint,
    amountMinorHint: body.amountMinorHint,
    rawTextPreview: body.rawTextPreview,
    completedAt: new Date().toISOString(),
  };
}

export function ocrProviderLabel(): "stub" | "configured" {
  return isOcrLive() || isOcrHttpConfigured() ? "configured" : "stub";
}
