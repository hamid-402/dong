import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertNoCustodyPayload,
  buildLocalPspCheckoutUrl,
  buildStubCheckoutUrl,
  forbiddenPaymentFields,
  signLocalPspIntent,
  verifyLocalPspIntentSignature,
} from "../src/payments.js";
import {
  assertAllowedUploadMime,
  assertPaymentReceiptUploadMime,
  assertSafeAttachmentFileName,
  evaluateQuarantine,
  isPaymentEvidenceAttachment,
  paymentReceiptUploadMimeTypes,
  runStubOcr,
  sniffUploadMime,
  stripJpegExif,
} from "../src/files.js";
import { PAYMENT_RECEIPT_MAX_BYTES } from "../src/payment-ops.js";

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

test("local PSP checkout URL points at web checkout with intentId", () => {
  const url = buildLocalPspCheckoutUrl("intent-9", "http://localhost:3005");
  assert.match(url, /^http:\/\/localhost:3005\/payments\/local\/checkout/);
  assert.match(url, /intentId=intent-9/);
});

test("local PSP checkout URL includes HMAC sig when provided", () => {
  const url = buildLocalPspCheckoutUrl("intent-9", "http://localhost:3005", {
    sig: "abc123",
  });
  assert.match(url, /intentId=intent-9/);
  assert.match(url, /sig=abc123/);
});

test("LocalPSP intent HMAC is deterministic and rejects tampering", () => {
  const base = {
    secret: "test-session-secret-for-local-psp",
    intentId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    amountMinor: "250000",
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
  const sig = signLocalPspIntent(base);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(sig, signLocalPspIntent(base));
  assert.equal(verifyLocalPspIntentSignature({ ...base, signature: sig }), true);
  assert.equal(
    verifyLocalPspIntentSignature({ ...base, signature: `  ${sig}\n` }),
    true,
  );
  assert.equal(
    verifyLocalPspIntentSignature({ ...base, amountMinor: "1", signature: sig }),
    false,
  );
  assert.equal(
    verifyLocalPspIntentSignature({ ...base, signature: "0".repeat(64) }),
    false,
  );
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

test("sniffUploadMime detects jpeg/png/pdf magic bytes", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(sniffUploadMime(jpeg), "image/jpeg");

  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);
  assert.equal(sniffUploadMime(png), "image/png");

  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  assert.equal(sniffUploadMime(pdf), "application/pdf");
});

test("sniffUploadMime rejects random bytes", () => {
  assert.equal(sniffUploadMime(new Uint8Array([0x00, 0x01, 0x02, 0x03])), null);
  assert.equal(sniffUploadMime(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null);
  assert.equal(sniffUploadMime(new Uint8Array([])), null);
});

test("stub OCR completes for png", () => {
  const ocr = runStubOcr({
    attachmentId: "att-1",
    workspaceId: "ws-1",
    jobId: "job-1",
    fileName: "bill.png",
  });
  assert.equal(ocr.status, "completed");
  assert.equal(ocr.merchantHint, undefined);
  assert.equal(ocr.amountMinorHint, undefined);
  assert.equal(ocr.lineItems, undefined);
  assert.equal(ocr.taxMinor, undefined);
  assert.equal(ocr.occurredOn, undefined);
  assert.match(ocr.rawTextPreview ?? "", /^stub-ocr:/);
});

test("payment receipt mime helpers reject webp and spoofed types", () => {
  assert.deepEqual([...paymentReceiptUploadMimeTypes], [
    "image/jpeg",
    "image/png",
    "application/pdf",
  ]);
  assert.doesNotThrow(() => assertPaymentReceiptUploadMime("image/jpeg"));
  assert.throws(() => assertPaymentReceiptUploadMime("image/webp"), /ATTACHMENT_MIME/);
  assert.throws(
    () => assertPaymentReceiptUploadMime("application/octet-stream"),
    /ATTACHMENT_MIME/,
  );
  assert.equal(PAYMENT_RECEIPT_MAX_BYTES, 5 * 1024 * 1024);
});

test("isPaymentEvidenceAttachment distinguishes expense vs payment targets", () => {
  assert.equal(
    isPaymentEvidenceAttachment({ kind: "receipt", targetType: "payment_receipt" }),
    true,
  );
  assert.equal(
    isPaymentEvidenceAttachment({ kind: "receipt", targetType: "settlement" }),
    true,
  );
  assert.equal(
    isPaymentEvidenceAttachment({ kind: "receipt", targetType: "expense" }),
    false,
  );
});

test("assertSafeAttachmentFileName blocks path traversal", () => {
  assert.doesNotThrow(() => assertSafeAttachmentFileName("receipt-abc.jpg"));
  assert.throws(() => assertSafeAttachmentFileName("../etc/passwd"), /ATTACHMENT_PATH/);
  assert.throws(() => assertSafeAttachmentFileName("a/../../b.pdf"), /ATTACHMENT_PATH/);
  assert.throws(() => assertSafeAttachmentFileName("foo\\bar.png"), /ATTACHMENT_PATH/);
});

test("stripJpegExif removes APP1 and leaves PNG/PDF unchanged", () => {
  // Minimal JPEG: SOI + APP1(EXIF) + APP0 + SOS + EOI
  const app1 = new Uint8Array([
    0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  ]);
  const app0 = new Uint8Array([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sos = new Uint8Array([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
  const jpeg = new Uint8Array(2 + app1.length + app0.length + sos.length);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg.set(app1, 2);
  jpeg.set(app0, 2 + app1.length);
  jpeg.set(sos, 2 + app1.length + app0.length);
  const stripped = stripJpegExif(jpeg);
  assert.ok(stripped.byteLength < jpeg.byteLength);
  assert.equal(stripped[0], 0xff);
  assert.equal(stripped[1], 0xd8);
  // No APP1 marker after strip
  let foundApp1 = false;
  for (let i = 0; i < stripped.length - 1; i++) {
    if (stripped[i] === 0xff && stripped[i + 1] === 0xe1) foundApp1 = true;
  }
  assert.equal(foundApp1, false);

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(stripJpegExif(png), png);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  assert.equal(stripJpegExif(pdf), pdf);
});
