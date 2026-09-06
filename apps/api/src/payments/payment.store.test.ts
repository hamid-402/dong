import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPaymentStore } from "./payment.store.js";

test("pending zarinpal amount is server-owned and idempotent verify", async () => {
  const store = new MemoryPaymentStore();
  await store.savePendingZarinpal({
    authority: "A0001",
    amountMinor: "250000",
    workspaceId: "ws1",
    paymentLinkId: "pl1",
  });

  const pending = await store.findPendingZarinpal("A0001");
  assert.equal(pending?.amountMinor, "250000");
  assert.equal(pending?.status, "pending");

  const verified = await store.markZarinpalVerified("A0001", "ref-9");
  assert.equal(verified.status, "verified");
  assert.equal(verified.refId, "ref-9");

  const again = await store.findPendingZarinpal("A0001");
  assert.equal(again?.status, "verified");
  assert.equal(again?.amountMinor, "250000");
});

test("unknown zarinpal authority returns null", async () => {
  const store = new MemoryPaymentStore();
  assert.equal(await store.findPendingZarinpal("missing"), null);
});
