import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAttachmentStore } from "./attachment.store.js";

test("G03 OCR result persists on attachment summary", async () => {
  const store = new MemoryAttachmentStore();
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "receipt.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 12,
    contentHash: "a".repeat(64),
    idempotencyKey: "ocr-1",
  });
  assert.ok(created.ocrJobId);
  const saved = await store.saveOcrResult("w1", created.id, {
    attachmentId: created.id,
    workspaceId: "w1",
    jobId: "job-1",
    status: "completed",
    merchantHint: "کافه نمونه",
    amountMinorHint: "150000",
    lineItems: [{ title: "چای", quantity: "2", amountMinor: "80000" }],
    taxMinor: "9000",
    occurredOn: "2026-10-06",
    rawTextPreview: "stub",
    completedAt: new Date().toISOString(),
  });
  assert.equal(saved.ocrResult?.merchantHint, "کافه نمونه");
  assert.equal(saved.ocrResult?.amountMinorHint, "150000");
  assert.equal(saved.ocrResult?.lineItems?.[0]?.title, "چای");
  assert.equal(saved.ocrResult?.taxMinor, "9000");
  assert.equal(saved.ocrResult?.occurredOn, "2026-10-06");
  const again = await store.getById("w1", created.id);
  assert.equal(again?.ocrResult?.merchantHint, "کافه نمونه");
});
