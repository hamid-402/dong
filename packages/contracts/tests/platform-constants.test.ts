import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_BREAK_GLASS_MAX_MINUTES } from "../src/platform.js";
import {
  VAULT_SECRET_JOB_HMAC,
  VAULT_SECRET_SESSION,
  VAULT_SECRET_TOTP_KEY,
} from "../src/key-vault.js";
import { REPORT_VIEWS_PROVIDER } from "../src/report-views.js";
import { resolvePenTestEngagementStatus } from "../src/pen-test-status.js";
import {
  SAAS_PLAN_PRICE_IRR_MINOR,
  createSubscriptionInvoiceSchema,
  currentUtcPeriodMonth,
  paySubscriptionInvoiceSchema,
  saasPlanPrice,
} from "../src/saas-billing.js";
import { signWebhookBody, verifyWebhookSignature } from "../src/webhooks.js";
import {
  pettyCashAllowedForKind,
  treasuryLabelsForKind,
  type TreasurySpaceKind,
} from "../src/treasury-labels.js";

test("platform break-glass window is capped at four hours", () => {
  assert.equal(PLATFORM_BREAK_GLASS_MAX_MINUTES, 240);
});

test("vault well-known secret names are distinct stable ids", () => {
  const names = [VAULT_SECRET_TOTP_KEY, VAULT_SECRET_SESSION, VAULT_SECRET_JOB_HMAC];
  assert.equal(new Set(names).size, 3);
  assert.deepEqual(names, ["totp_encryption_key", "session_secret", "internal_job_hmac"]);
});

test("report views provider id is versioned", () => {
  assert.equal(REPORT_VIEWS_PROVIDER, "report_views_v1");
});

test("resolvePenTestEngagementStatus reads PENTEST_STATUS and defaults to prep_ready", () => {
  const r = (v?: string) => resolvePenTestEngagementStatus(v === undefined ? {} : { PENTEST_STATUS: v });
  assert.equal(r(), "prep_ready");
  assert.equal(r(""), "prep_ready");
  assert.equal(r("garbage"), "prep_ready");
  assert.equal(r("engaged"), "engaged");
  assert.equal(r(" IN_PROGRESS "), "engaged");
  assert.equal(r("remediating"), "remediating");
  assert.equal(r("Remediation"), "remediating");
  assert.equal(r("closed"), "closed");
  assert.equal(r("closed_with_exceptions"), "closed");
});

test("saas plan prices come from the catalog table", () => {
  assert.deepEqual(saasPlanPrice("free"), { amountMinor: "0", currency: "IRR" });
  assert.deepEqual(saasPlanPrice("pro"), {
    amountMinor: SAAS_PLAN_PRICE_IRR_MINOR.pro,
    currency: "IRR",
  });
  assert.equal(saasPlanPrice("business").amountMinor, "14900000");
});

test("currentUtcPeriodMonth formats UTC YYYY-MM", () => {
  assert.equal(currentUtcPeriodMonth(new Date("2026-03-31T23:59:59Z")), "2026-03");
  assert.equal(currentUtcPeriodMonth(new Date("2026-12-01T00:00:00Z")), "2026-12");
  assert.match(currentUtcPeriodMonth(), /^\d{4}-\d{2}$/);
});

test("subscription invoice schemas are strict and validate input", () => {
  assert.ok(
    createSubscriptionInvoiceSchema.safeParse({
      targetPlan: "pro",
      periodMonth: "2026-03",
      idempotencyKey: "k1",
    }).success,
  );
  assert.equal(
    createSubscriptionInvoiceSchema.safeParse({
      targetPlan: "free",
      periodMonth: "2026-03",
      idempotencyKey: "k1",
    }).success,
    false,
  );
  assert.equal(
    createSubscriptionInvoiceSchema.safeParse({
      targetPlan: "pro",
      periodMonth: "2026-3",
      idempotencyKey: "k1",
    }).success,
    false,
  );
  assert.equal(
    createSubscriptionInvoiceSchema.safeParse({
      targetPlan: "pro",
      periodMonth: "2026-03",
      idempotencyKey: "k1",
      extra: 1,
    }).success,
    false,
  );
  assert.ok(
    paySubscriptionInvoiceSchema.safeParse({
      returnUrl: "https://example.com/back",
      idempotencyKey: "k",
    }).success,
  );
  assert.equal(
    paySubscriptionInvoiceSchema.safeParse({ returnUrl: "not a url", idempotencyKey: "k" }).success,
    false,
  );
});

test("webhook signatures are deterministic and verified timing-safely", () => {
  const sig = signWebhookBody("s3cret", "1700000000", '{"a":1}');
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(sig, signWebhookBody("s3cret", "1700000000", '{"a":1}'));
  assert.notEqual(sig, signWebhookBody("other", "1700000000", '{"a":1}'));
  assert.notEqual(sig, signWebhookBody("s3cret", "1700000001", '{"a":1}'));

  const base = { secret: "s3cret", timestamp: "1700000000", body: '{"a":1}' };
  assert.equal(verifyWebhookSignature({ ...base, signature: sig }), true);
  assert.equal(verifyWebhookSignature({ ...base, signature: `  ${sig}\n` }), true);
  assert.equal(verifyWebhookSignature({ ...base, signature: sig.slice(1) }), false);
  assert.equal(verifyWebhookSignature({ ...base, signature: "0".repeat(64) }), false);
  assert.equal(verifyWebhookSignature({ ...base, body: "tampered", signature: sig }), false);
});

test("treasury labels: personal has no shared petty cash, others do", () => {
  const kinds: TreasurySpaceKind[] = ["personal", "group", "building", "org"];
  assert.deepEqual(
    kinds.map((k) => pettyCashAllowedForKind(k)),
    [false, true, true, true],
  );
  const labels = kinds.map((k) => treasuryLabelsForKind(k));
  for (const l of labels) {
    for (const key of [
      "financeRole",
      "financeRoleShort",
      "pettyCash",
      "custodian",
      "deputy",
      "defaultFundName",
      "ensureFundCta",
      "balanceTitle",
    ] as const) {
      assert.equal(typeof l[key], "string");
      assert.ok(l[key].length > 0);
    }
  }
  assert.notEqual(labels[1]!.pettyCash, labels[2]!.pettyCash);
  assert.notEqual(labels[2]!.pettyCash, labels[3]!.pettyCash);
  assert.notEqual(labels[0]!.financeRole, labels[1]!.financeRole);
});
