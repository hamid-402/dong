import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveZarinpalCallbackUrl,
  zarinpalCallbackMisconfig,
  isZarinpalLive,
  resolvePaymentProviderMode,
} from "@dang/config";

test("zarinpal stays dormant without enable flag", () => {
  assert.equal(isZarinpalLive("merchant-x", { ZARINPAL_ENABLED: "0" }), false);
  assert.equal(
    resolvePaymentProviderMode("merchant-x", { ZARINPAL_ENABLED: "0" }),
    "local_psp",
  );
  assert.equal(
    resolvePaymentProviderMode("merchant-x", { ZARINPAL_ENABLED: "1" }),
    "zarinpal",
  );
});

test("resolveZarinpalCallbackUrl prefers override", () => {
  assert.equal(
    resolveZarinpalCallbackUrl("http://localhost:3006/api/v1", {
      ZARINPAL_CALLBACK_URL: "https://pay.example.com/cb",
    }),
    "https://pay.example.com/cb",
  );
  assert.equal(
    resolveZarinpalCallbackUrl("http://localhost:3006/api/v1", {}),
    "http://localhost:3006/api/v1/payments/zarinpal/callback",
  );
});

test("zarinpalCallbackMisconfig blocks localhost in production mode", () => {
  assert.equal(
    zarinpalCallbackMisconfig("http://localhost:3006/api/v1/payments/zarinpal/callback", {
      ZARINPAL_PRODUCTION: "1",
    }),
    "ZARINPAL_CALLBACK_LOCALHOST",
  );
  assert.equal(
    zarinpalCallbackMisconfig("https://api.example.com/api/v1/payments/zarinpal/callback", {
      ZARINPAL_PRODUCTION: "1",
    }),
    null,
  );
  assert.equal(
    zarinpalCallbackMisconfig("http://localhost:3006/cb", { ZARINPAL_PRODUCTION: "0" }),
    null,
  );
});
