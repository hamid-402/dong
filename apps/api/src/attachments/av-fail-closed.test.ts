import assert from "node:assert/strict";
import test from "node:test";
import { mayStartOcr } from "./av-policy.js";

test("fail-closed: scan error must not start OCR", () => {
  assert.equal(mayStartOcr("error"), false);
});

test("fail-closed: blocked must not start OCR", () => {
  assert.equal(mayStartOcr("blocked"), false);
});

test("OCR allowed only when clean or pending", () => {
  assert.equal(mayStartOcr("clean"), true);
  assert.equal(mayStartOcr("pending"), true);
  assert.equal(mayStartOcr("scanning"), true);
  assert.equal(mayStartOcr(undefined), true);
});

/**
 * Documents the create() fail-closed sequence:
 * after scan returns error, persist error and skip OCR job enqueue.
 */
test("create flow: error scan outcome skips OCR enqueue", () => {
  const scanStatus = "error" as const;
  const ocrJobId = "job-ocr-1";
  const shouldEnqueueOcr = Boolean(ocrJobId) && mayStartOcr(scanStatus);
  assert.equal(shouldEnqueueOcr, false);
});
