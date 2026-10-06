import assert from "node:assert/strict";
import test from "node:test";
import { isoFromJalali } from "../src/daily-ledger.ts";
import {
  normalizeOcrReceiptDate,
  normalizeOcrReceiptLines,
  normalizeOcrReceiptTax,
  runStubOcr,
} from "../src/files.ts";

test("configured payload keeps titled lines and drops blank ones", () => {
  const lines = normalizeOcrReceiptLines([
    { title: "نان", quantity: 2, amountMinor: "40000" },
    { title: "  " },
    { title: "شیر", amountMinor: 25000 },
    "nope",
    { quantity: 1, amountMinor: "1000" },
  ]);
  assert.deepEqual(lines, [
    { title: "نان", quantity: "2", amountMinor: "40000" },
    { title: "شیر", amountMinor: "25000" },
  ]);
});

test("unlabeled text and a non-array payload produce no lines", () => {
  assert.equal(normalizeOcrReceiptLines(undefined), undefined);
  assert.equal(normalizeOcrReceiptLines("فروشگاه نمونه ۱۲٬۰۰۰"), undefined);
  assert.equal(normalizeOcrReceiptLines([]), undefined);
});

test("labeled tax and a real receipt date are kept; a bare sentence is not", () => {
  assert.equal(normalizeOcrReceiptTax({ amountMinor: "90000" }), "90000");
  assert.equal(normalizeOcrReceiptTax("۹۰٬۰۰۰"), "90000");
  assert.equal(normalizeOcrReceiptTax("مالیات ۱۲"), undefined);
  assert.equal(normalizeOcrReceiptTax(0), undefined);
  assert.equal(normalizeOcrReceiptDate("1404/08/15"), isoFromJalali(1404, 8, 15));
  assert.equal(normalizeOcrReceiptDate("2026-02-31"), undefined);
  assert.equal(normalizeOcrReceiptDate("فروشگاه 1404/08/15"), undefined);
});

test("stub OCR does not invent a merchant, amount, tax, date, or line items", () => {
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
});
