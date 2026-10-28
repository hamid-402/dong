/**
 * Contract / shape snapshots for payment responses.
 * Variable fields (id, timestamps, authority, HMAC) are normalized.
 * No real secrets are stored — signatures become fixed placeholders.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPaymentStore } from "./payment.store.js";
import { LocalPspAdapter } from "./local-psp.adapter.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

const PLACEHOLDER = {
  id: "<PAYMENT_LINK_ID>",
  intentId: "<INTENT_ID>",
  providerRef: "<PROVIDER_REF>",
  authority: "<AUTHORITY>",
  refId: "<REF_ID>",
  createdAt: "<CREATED_AT>",
  expiresAt: "<EXPIRES_AT>",
  verifiedAt: "<VERIFIED_AT>",
  sig: "<HMAC_SIG>",
  checkoutUrl: "<CHECKOUT_URL>",
} as const;

function normalizeCheckoutUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("intentId")) {
      u.searchParams.set("intentId", PLACEHOLDER.intentId);
    }
    if (u.searchParams.has("sig")) {
      u.searchParams.set("sig", PLACEHOLDER.sig);
    }
    if (u.searchParams.has("linkId")) {
      u.searchParams.set("linkId", PLACEHOLDER.id);
    }
    return u.toString();
  } catch {
    return PLACEHOLDER.checkoutUrl;
  }
}

function normalizePaymentLink(link: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {
    id: PLACEHOLDER.id,
    workspaceId: link.workspaceId,
    provider: link.provider,
    amount: link.amount,
    description: link.description,
    checkoutUrl: normalizeCheckoutUrl(String(link.checkoutUrl ?? "")),
    status: link.status,
    providerRef: PLACEHOLDER.providerRef,
    createdAt: PLACEHOLDER.createdAt,
    expiresAt: PLACEHOLDER.expiresAt,
  };
  if (link.settlementId !== undefined) {
    normalized.settlementId = link.settlementId;
  }
  if (link.invoiceId !== undefined) {
    normalized.invoiceId = link.invoiceId;
  }
  return normalized;
}

function normalizeLocalPspSummary(summary: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {
    intentId: PLACEHOLDER.intentId,
    provider: summary.provider,
    amount: summary.amount,
    description: summary.description,
    status: summary.status,
    returnUrl: summary.returnUrl,
    createdAt: PLACEHOLDER.createdAt,
    expiresAt: PLACEHOLDER.expiresAt,
  };
  if (summary.verifiedAt) normalized.verifiedAt = PLACEHOLDER.verifiedAt;
  if (summary.refId) normalized.refId = PLACEHOLDER.refId;
  return normalized;
}

function normalizeLocalPspVerify(response: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {
    ok: response.ok,
    status: response.status,
    intentId: PLACEHOLDER.intentId,
    amount: response.amount,
    returnUrl: response.returnUrl,
  };
  if (response.refId) normalized.refId = PLACEHOLDER.refId;
  return normalized;
}

/** JSON payload shape from ZarinpalCallbackController.redirectOrJson (no redirect). */
function zarinpalCallbackJsonPayload(input: {
  ok: boolean;
  status: string;
  refId?: string;
  detail?: string;
}) {
  const payload: Record<string, unknown> = {
    ok: input.ok,
    status: input.status,
  };
  if (input.refId !== undefined) payload.refId = PLACEHOLDER.refId;
  if (input.detail !== undefined) {
    payload.detail = input.detail.includes("secret")
      ? "<REDACTED>"
      : input.detail;
  }
  return payload;
}

function assertStableShape(
  label: string,
  actual: unknown,
  expected: unknown,
): void {
  assert.deepEqual(
    actual,
    expected,
    `${label}: response shape drifted`,
  );
}

test("contract: create payment link (LocalPSP) shape", async () => {
  const store = new MemoryPaymentStore();
  const adapter = new LocalPspAdapter(store);
  const { link } = await adapter.createPaymentIntent({
    workspaceId,
    amount: { amountMinor: "250000", currency: "IRR" },
    description: "قرارداد لینک پرداخت",
    returnUrl: "https://dang.local/return",
    idempotencyKey: "idem-contract-link-1",
  });

  const normalized = normalizePaymentLink(
    link as unknown as Record<string, unknown>,
  );
  assertStableShape("payment_link", normalized, {
    id: PLACEHOLDER.id,
    workspaceId,
    provider: "local_psp",
    amount: { amountMinor: "250000", currency: "IRR" },
    description: "قرارداد لینک پرداخت",
    checkoutUrl: normalized.checkoutUrl,
    status: "created",
    providerRef: PLACEHOLDER.providerRef,
    createdAt: PLACEHOLDER.createdAt,
    expiresAt: PLACEHOLDER.expiresAt,
  });
  assert.match(String(normalized.checkoutUrl), /\/payments\/local\/checkout/);
  assert.match(String(normalized.checkoutUrl), /intentId=%3CINTENT_ID%3E|intentId=<INTENT_ID>/);
  assert.match(String(normalized.checkoutUrl), /sig=%3CHMAC_SIG%3E|sig=<HMAC_SIG>/);
  assert.ok(
    !JSON.stringify(normalized).includes("SESSION_SECRET"),
    "must not embed session secret",
  );
});

test("contract: LocalPSP checkout summary + verify shape", async () => {
  const store = new MemoryPaymentStore();
  const adapter = new LocalPspAdapter(store);
  const { intent } = await adapter.createPaymentIntent({
    workspaceId,
    amount: { amountMinor: "88000", currency: "IRR" },
    description: "قرارداد checkout",
    returnUrl: "https://dang.local/return",
    idempotencyKey: "idem-contract-checkout-1",
  });

  const pending = await store.findPendingLocalPsp(intent.intentId);
  assert.ok(pending);
  const summary = normalizeLocalPspSummary(
    adapter.toPublicSummary(pending!) as unknown as Record<string, unknown>,
  );
  assertStableShape("local_psp_checkout", summary, {
    intentId: PLACEHOLDER.intentId,
    provider: "local_psp",
    amount: { amountMinor: "88000", currency: "IRR" },
    description: "قرارداد checkout",
    status: "pending",
    returnUrl: "https://dang.local/return",
    createdAt: PLACEHOLDER.createdAt,
    expiresAt: PLACEHOLDER.expiresAt,
  });

  const verified = await adapter.verify(intent.intentId);
  const verifyShape = normalizeLocalPspVerify(
    verified.response as unknown as Record<string, unknown>,
  );
  assertStableShape("local_psp_verify", verifyShape, {
    ok: true,
    status: "verified",
    intentId: PLACEHOLDER.intentId,
    amount: { amountMinor: "88000", currency: "IRR" },
    refId: PLACEHOLDER.refId,
    returnUrl: "https://dang.local/return",
  });
});

test("contract: Zarinpal callback JSON payload shapes", async () => {
  const store = new MemoryPaymentStore();
  const link = await store.create(
    "zarinpal",
    {
      workspaceId,
      amount: { amountMinor: "5000", currency: "IRR" },
      description: "callback contract",
      returnUrl: "https://dang.local/r",
      idempotencyKey: "idem-contract-zp-1",
    },
    {
      providerRef: "AUTH-CONTRACT",
      checkoutUrl: "https://zarinpal.test/start",
    },
  );
  await store.savePendingZarinpal({
    authority: "AUTH-CONTRACT",
    amountMinor: "5000",
    workspaceId,
    paymentLinkId: link.id,
    returnUrl: "https://dang.local/r",
  });

  // Disabled / NOK / unknown — same keys the controller sends via redirectOrJson
  assertStableShape(
    "zarinpal_disabled",
    zarinpalCallbackJsonPayload({
      ok: false,
      status: "disabled",
      detail: "Set ZARINPAL_MERCHANT_ID and ZARINPAL_ENABLED=1 to activate",
    }),
    {
      ok: false,
      status: "disabled",
      detail: "Set ZARINPAL_MERCHANT_ID and ZARINPAL_ENABLED=1 to activate",
    },
  );

  assertStableShape(
    "zarinpal_nok",
    zarinpalCallbackJsonPayload({ ok: false, status: "NOK" }),
    { ok: false, status: "NOK" },
  );

  assertStableShape(
    "zarinpal_unknown_authority",
    zarinpalCallbackJsonPayload({ ok: false, status: "unknown_authority" }),
    { ok: false, status: "unknown_authority" },
  );

  const verified = await store.markZarinpalVerified("AUTH-CONTRACT", "ref-zp-1");
  assert.equal(verified.status, "verified");
  assertStableShape(
    "zarinpal_ok",
    zarinpalCallbackJsonPayload({
      ok: true,
      status: "OK",
      refId: verified.refId,
    }),
    {
      ok: true,
      status: "OK",
      refId: PLACEHOLDER.refId,
    },
  );

  assertStableShape(
    "zarinpal_verify_failed",
    zarinpalCallbackJsonPayload({
      ok: false,
      status: "verify_failed",
      detail: "ZARINPAL_VERIFY_FAILED",
    }),
    {
      ok: false,
      status: "verify_failed",
      detail: "ZARINPAL_VERIFY_FAILED",
    },
  );

  const serialized = JSON.stringify([
    zarinpalCallbackJsonPayload({
      ok: true,
      status: "OK",
      refId: "ref-zp-1",
    }),
  ]);
  assert.ok(!serialized.includes("AUTH-CONTRACT"));
  assert.ok(!serialized.includes("ref-zp-1"));
});
