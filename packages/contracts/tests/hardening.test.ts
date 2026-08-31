import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertNoCustodyPayload,
  buildStubCheckoutUrl,
  forbiddenPaymentFields,
} from "../src/payments.js";
import {
  assertAllowedUploadMime,
  evaluateQuarantine,
  runStubOcr,
} from "../src/files.js";

test("forbidden payment fields include card material", () => {
  assert.ok(forbiddenPaymentFields.includes("pan"));
  assert.ok(forbiddenPaymentFields.includes("cvv"));
});

test("assertNoCustodyPayload rejects cardNumber", () => {
  assert.throws(
    () => assertNoCustodyPayload({ cardNumber: "4111111111111111" }),
    /PAYMENT_CUSTODY_FORBIDDEN/,
  );
});

test("assertNoCustodyPayload allows link fields", () => {
  assert.doesNotThrow(() =>
    assertNoCustodyPayload({
      amount: { amountMinor: "1000", currency: "IRR" },
      returnUrl: "https://app.example/return",
    }),
  );
});

test("stub checkout URL never hosts card form path on dang app", () => {
  const url = buildStubCheckoutUrl("abc", "https://app.example/r");
  assert.match(url, /^https:\/\/pay\.dang\.local\/stub\/checkout/);
  assert.match(url, /linkId=abc/);
});

test("quarantine blocks executable filenames", () => {
  const result = evaluateQuarantine({
    fileName: "invoice.pdf.exe",
    mimeType: "application/pdf",
    contentHash: "a".repeat(64),
  });
  assert.equal(result.status, "blocked");
});

test("quarantine cleans jpeg receipt", () => {
  const result = evaluateQuarantine({
    fileName: "receipt.jpg",
    mimeType: "image/jpeg",
    contentHash: "b".repeat(64),
  });
  assert.equal(result.status, "clean");
});

test("assertAllowedUploadMime rejects octet-stream", () => {
  assert.throws(() => assertAllowedUploadMime("application/octet-stream"), /ATTACHMENT_MIME/);
});

test("stub OCR completes for png", () => {
  const ocr = runStubOcr({
    attachmentId: "att-1",
    workspaceId: "ws-1",
    jobId: "job-1",
    fileName: "bill.png",
  });
  assert.equal(ocr.status, "completed");
  assert.ok(ocr.merchantHint);
});
