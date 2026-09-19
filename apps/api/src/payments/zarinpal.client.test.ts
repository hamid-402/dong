import assert from "node:assert/strict";
import test from "node:test";
import { zarinpalRequestPayment, zarinpalVerifyPayment } from "./zarinpal.client.js";

test("zarinpal client rejects when not enabled", async () => {
  const prevMerchant = process.env.ZARINPAL_MERCHANT_ID;
  const prevEnabled = process.env.ZARINPAL_ENABLED;
  delete process.env.ZARINPAL_MERCHANT_ID;
  process.env.ZARINPAL_ENABLED = "0";
  await assert.rejects(
    () =>
      zarinpalRequestPayment({
        amountMinor: "10000",
        description: "t",
        callbackUrl: "https://example.com/cb",
      }),
    (err: unknown) => err instanceof Error && err.message === "ZARINPAL_NOT_ENABLED",
  );
  await assert.rejects(
    () => zarinpalVerifyPayment({ amountMinor: "10000", authority: "A" }),
    (err: unknown) => err instanceof Error && err.message === "ZARINPAL_NOT_ENABLED",
  );
  if (prevMerchant === undefined) delete process.env.ZARINPAL_MERCHANT_ID;
  else process.env.ZARINPAL_MERCHANT_ID = prevMerchant;
  if (prevEnabled === undefined) delete process.env.ZARINPAL_ENABLED;
  else process.env.ZARINPAL_ENABLED = prevEnabled;
});

test("zarinpal request/verify honor data.code 100/101 with mocked fetch", async () => {
  const prevMerchant = process.env.ZARINPAL_MERCHANT_ID;
  const prevEnabled = process.env.ZARINPAL_ENABLED;
  const prevProd = process.env.ZARINPAL_PRODUCTION;
  process.env.ZARINPAL_MERCHANT_ID = "test-merchant";
  process.env.ZARINPAL_ENABLED = "1";
  process.env.ZARINPAL_PRODUCTION = "0";

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { authority?: string };
    if (calls === 1) {
      return new Response(JSON.stringify({ data: { code: 100, authority: "AUTH99" }, errors: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    assert.equal(body.authority, "AUTH99");
    return new Response(
      JSON.stringify({ data: { code: 101, ref_id: 4242, card_pan: "1234" }, errors: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const req = await zarinpalRequestPayment({
      amountMinor: "10000",
      description: "test",
      callbackUrl: "https://example.com/cb",
    });
    assert.equal(req.authority, "AUTH99");
    assert.match(req.checkoutUrl, /StartPay\/AUTH99/);
    assert.equal(req.code, 100);

    const ver = await zarinpalVerifyPayment({
      amountMinor: "10000",
      authority: "AUTH99",
    });
    assert.equal(ver.refId, "4242");
    assert.equal(ver.code, 101);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevMerchant === undefined) delete process.env.ZARINPAL_MERCHANT_ID;
    else process.env.ZARINPAL_MERCHANT_ID = prevMerchant;
    if (prevEnabled === undefined) delete process.env.ZARINPAL_ENABLED;
    else process.env.ZARINPAL_ENABLED = prevEnabled;
    if (prevProd === undefined) delete process.env.ZARINPAL_PRODUCTION;
    else process.env.ZARINPAL_PRODUCTION = prevProd;
  }
});
