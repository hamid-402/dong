import assert from "node:assert/strict";
import test from "node:test";
import { resolveSmsProvider, TransactionalSmsService } from "./transactional-sms.service.js";

test("sms: defaults to stub without API key", () => {
  assert.equal(resolveSmsProvider({}), "stub");
});

test("sms: rejects otp_auth on transactional path", async () => {
  const sms = new TransactionalSmsService({});
  const result = await sms.send({
    toE164: "+989121234567",
    body: "code",
    purpose: "otp_auth",
  });
  assert.equal(result.ok, false);
  assert.match(result.detail, /TOTP/);
});

test("sms: stub transactional send without verifying phone", async () => {
  const sms = new TransactionalSmsService({ SMS_PROVIDER: "stub" });
  const result = await sms.sendTransactional({
    toE164: "+989121234567",
    body: "یادآوری تسویه",
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "stub");
});
