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
    rawTextPreview: "stub",
    completedAt: new Date().toISOString(),
  });
  assert.equal(saved.ocrResult?.merchantHint, "کافه نمونه");
  assert.equal(saved.ocrResult?.amountMinorHint, "150000");
  const again = await store.getById("w1", created.id);
  assert.equal(again?.ocrResult?.merchantHint, "کافه نمونه");
});
