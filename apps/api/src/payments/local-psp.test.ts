import assert from "node:assert/strict";
import test from "node:test";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import { MemorySettlementStore } from "../settlements/memory-settlement.store.js";
import { MemoryPaymentStore } from "./payment.store.js";
import { LocalPspAdapter } from "./local-psp.adapter.js";
import { confirmSettlementFromGateway } from "./gateway-settlement-confirm.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const payer = {
  userId: "22222222-2222-4222-8222-222222222222",
};
const creditor = {
  userId: "44444444-4444-4444-8444-444444444444",
};

test("LocalPSP createPaymentIntent returns checkout with intentId", async () => {
  const store = new MemoryPaymentStore();
  const adapter = new LocalPspAdapter(store);
  const { link, intent } = await adapter.createPaymentIntent({
    workspaceId,
    amount: { amountMinor: "250000", currency: "IRR" },
    description: "تست LocalPSP",
    returnUrl: "https://dang.local/return",
    idempotencyKey: "idem-local-1",
  });

  assert.equal(link.provider, "local_psp");
  assert.equal(link.providerRef, intent.intentId);
  assert.match(link.checkoutUrl, /\/payments\/local\/checkout\?intentId=/);
  assert.ok(link.checkoutUrl.includes(intent.intentId));
  assert.equal(intent.amountMinor, "250000");
  assert.equal(intent.status, "pending");
});

test("LocalPSP double verify is idempotent and amount stays server-owned", async () => {
  const store = new MemoryPaymentStore();
  const adapter = new LocalPspAdapter(store);
  const { intent } = await adapter.createPaymentIntent({
    workspaceId,
    amount: { amountMinor: "990000", currency: "IRR" },
    description: "amount ownership",
    returnUrl: "https://dang.local/return",
    idempotencyKey: "idem-local-2",
  });

  const first = await adapter.verify(intent.intentId);
  assert.equal(first.response.ok, true);
  assert.equal(first.response.status, "verified");
  assert.equal(first.response.amount.amountMinor, "990000");
  assert.equal(first.pending?.refId, first.response.refId);

  const second = await adapter.verify(intent.intentId);
  assert.equal(second.response.ok, true);
  assert.equal(second.response.status, "verified");
  assert.equal(second.response.refId, first.response.refId);
  assert.equal(second.response.amount.amountMinor, "990000");

  const stored = await store.findPendingLocalPsp(intent.intentId);
  assert.equal(stored?.amountMinor, "990000");
  assert.equal(stored?.status, "verified");
});

test("settlement confirmed only after LocalPSP verify (journal path)", async () => {
  const store = new MemoryPaymentStore();
  const settlements = new MemorySettlementStore();
  const ledger = new MemoryLedgerStore();
  const adapter = new LocalPspAdapter(store);

  const claim = await settlements.createClaim(creditor.userId, {
    workspaceId,
    fromUserId: payer.userId,
    toUserId: creditor.userId,
    amount: { amountMinor: "100000", currency: "IRR" },
    idempotencyKey: "set-local-1",
  });
  assert.equal(claim.status, "claimed");

  const { link, intent } = await adapter.createPaymentIntent({
    workspaceId,
    settlementId: claim.id,
    amount: { amountMinor: "100000", currency: "IRR" },
    description: "تسویه با LocalPSP",
    returnUrl: "https://dang.local/return",
    idempotencyKey: "plink-local-1",
  });
  assert.equal(link.provider, "local_psp");
  assert.equal(link.settlementId, claim.id);

  const before = await settlements.get(workspaceId, claim.id, payer.userId);
  assert.equal(before?.status, "claimed");

  // Verify alone does not confirm — follow-on (PaymentsService) does.
  const verified = await adapter.verify(intent.intentId);
  assert.equal(verified.response.ok, true);
  assert.equal(verified.response.amount.amountMinor, "100000");

  const mid = await settlements.get(workspaceId, claim.id, payer.userId);
  assert.equal(mid?.status, "claimed");

  // Same follow-on path PaymentsService.applyVerifiedPaymentFollowOn uses:
  await store.markLinkPaid(workspaceId, link.id);
  await confirmSettlementFromGateway({
    settlements,
    ledger,
    workspaceId,
    settlementId: claim.id,
  });

  const after = await settlements.get(workspaceId, claim.id, payer.userId);
  assert.equal(after?.status, "confirmed");

  const paidLink = await store.getLink(workspaceId, link.id);
  assert.equal(paidLink?.status, "paid");

  // Double verify remains idempotent; settlement stays confirmed
  const again = await adapter.verify(intent.intentId);
  assert.equal(again.response.ok, true);
  await confirmSettlementFromGateway({
    settlements,
    ledger,
    workspaceId,
    settlementId: claim.id,
  });
  const still = await settlements.get(workspaceId, claim.id, payer.userId);
  assert.equal(still?.status, "confirmed");
});

test("markLocalPspVerified is idempotent at store layer", async () => {
  const store = new MemoryPaymentStore();
  await store.savePendingLocalPsp({
    intentId: "intent-a",
    amountMinor: "5000",
    description: "x",
    returnUrl: "https://dang.local/r",
    workspaceId,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const a = await store.markLocalPspVerified("intent-a", "ref-1");
  const b = await store.markLocalPspVerified("intent-a", "ref-should-not-overwrite");
  assert.equal(a.refId, "ref-1");
  assert.equal(b.refId, "ref-1");
  assert.equal(b.amountMinor, "5000");
});

test("client-supplied amountMinor cannot change server-owned intent", async () => {
  const store = new MemoryPaymentStore();
  const adapter = new LocalPspAdapter(store);
  const { intent } = await adapter.createPaymentIntent({
    workspaceId,
    amount: { amountMinor: "777000", currency: "IRR" },
    description: "server amount",
    returnUrl: "https://dang.local/return",
    idempotencyKey: "idem-amt",
  });
  // Adapter.verify has no amount parameter — proves API body cannot mutate it.
  const result = await adapter.verify(intent.intentId);
  assert.equal(result.response.amount.amountMinor, "777000");
  const stored = await store.findPendingLocalPsp(intent.intentId);
  assert.equal(stored?.amountMinor, "777000");
});

test("expired LocalPSP intent surfaces expired on summary and verify", async () => {
  const store = new MemoryPaymentStore();
  await store.savePendingLocalPsp({
    intentId: "intent-expired",
    amountMinor: "12000",
    description: "expired",
    returnUrl: "https://dang.local/r",
    workspaceId,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const adapter = new LocalPspAdapter(store);
  const pending = await store.findPendingLocalPsp("intent-expired");
  assert.ok(pending);
  assert.equal(adapter.toPublicSummary(pending!).status, "expired");

  const verified = await adapter.verify("intent-expired");
  assert.equal(verified.response.ok, false);
  assert.equal(verified.response.status, "expired");
  assert.equal(verified.response.amount.amountMinor, "12000");
  const still = await store.findPendingLocalPsp("intent-expired");
  assert.equal(still?.status, "pending");
});

test("MemoryPaymentStore LocalPSP pending path matches interface", async () => {
  const store = new MemoryPaymentStore();
  assert.equal(store.persistence, "memory");
  await store.savePendingLocalPsp({
    intentId: "intent-mem",
    amountMinor: "100",
    description: "m",
    returnUrl: "https://dang.local/r",
    workspaceId,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const found = await store.findPendingLocalPsp("intent-mem");
  assert.equal(found?.amountMinor, "100");
  const marked = await store.markLocalPspVerified("intent-mem", "ref-m");
  assert.equal(marked.status, "verified");
  assert.equal(marked.refId, "ref-m");
});
