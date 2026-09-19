import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLoginIdentifier,
  isValidUsername,
  maskPhone,
  normalizePhone,
  normalizeUsername,
  toAsciiDigits,
  validatePhone,
  validateUsername,
} from "../src/index.js";

test("username normalizes to lowercase trimmed form", () => {
  assert.equal(normalizeUsername("  Hamid.Kazemi "), "hamid.kazemi");
  assert.equal(normalizeUsername(undefined), "");
});

test("username validation enforces charset and shape", () => {
  assert.equal(validateUsername("hamid.kazemi"), null);
  assert.equal(validateUsername("hk1"), null);
  assert.equal(validateUsername(""), "USERNAME_EMPTY");
  assert.equal(validateUsername("ab"), "USERNAME_TOO_SHORT");
  assert.equal(validateUsername("a".repeat(33)), "USERNAME_TOO_LONG");
  assert.equal(validateUsername("hamid-kazemi"), "USERNAME_CHARSET");
  assert.equal(validateUsername("حمید"), "USERNAME_CHARSET");
  assert.equal(validateUsername("1hamid"), "USERNAME_START");
  assert.equal(validateUsername("hamid."), "USERNAME_END");
  assert.equal(validateUsername("hamid..kazemi"), "USERNAME_DOUBLE_SEPARATOR");
  assert.equal(validateUsername("admin"), "USERNAME_RESERVED");
  assert.equal(isValidUsername("finance"), false);
});

test("persian and arabic digits convert to ascii", () => {
  assert.equal(toAsciiDigits("۰۹۱۲۳۴۵۶۷۸۹"), "09123456789");
  assert.equal(toAsciiDigits("٠٩١٢"), "0912");
});

test("iranian mobile numbers normalize to E.164", () => {
  assert.equal(normalizePhone("09123456789"), "+989123456789");
  assert.equal(normalizePhone("0912 345 6789"), "+989123456789");
  assert.equal(normalizePhone("۰۹۱۲۳۴۵۶۷۸۹"), "+989123456789");
  assert.equal(normalizePhone("+989123456789"), "+989123456789");
  assert.equal(normalizePhone("00989123456789"), "+989123456789");
  assert.equal(normalizePhone("989123456789"), "+989123456789");
});

test("invalid phone inputs are rejected", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("0912345"), null);
  assert.equal(normalizePhone("abcd"), null);
  assert.equal(validatePhone(""), "PHONE_EMPTY");
  assert.equal(validatePhone("12"), "PHONE_FORMAT");
  assert.equal(validatePhone("09123456789"), null);
});

test("phone mask keeps only country hint and last four digits", () => {
  assert.equal(maskPhone("+989123456789"), "+98***6789");
  assert.equal(maskPhone(undefined), undefined);
});

test("login identifier classification covers email, phone, username", () => {
  assert.deepEqual(classifyLoginIdentifier(" Ali@Example.COM "), {
    kind: "email",
    value: "ali@example.com",
  });
  assert.deepEqual(classifyLoginIdentifier("09123456789"), {
    kind: "phone",
    value: "+989123456789",
  });
  assert.deepEqual(classifyLoginIdentifier("Hamid.Kazemi"), {
    kind: "username",
    value: "hamid.kazemi",
  });
});
