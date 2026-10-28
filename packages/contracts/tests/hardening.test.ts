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
  evaluateQuarantine,
  runStubOcr,
  sniffUploadMime,
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
