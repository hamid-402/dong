/**
 * Zarinpal callback invariants: authority binds only to its pending row,
 * and verification / mark-paid are idempotent (no double payment).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPaymentStore } from "./payment.store.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

test("authority binds only to its own pending row", async () => {
  const store = new MemoryPaymentStore();
  const linkA = await store.create(
    "zarinpal",
    {
      workspaceId,
      amount: { amountMinor: "1000", currency: "IRR" },
      description: "a",
      returnUrl: "https://dang.local/a",
      idempotencyKey: "idem-auth-a",
    },
    { providerRef: "AUTH-A", checkoutUrl: "https://zarinpal.test/A" },
  );
  const linkB = await store.create(
    "zarinpal",
    {
      workspaceId,
      amount: { amountMinor: "2000", currency: "IRR" },
      description: "b",
      returnUrl: "https://dang.local/b",
      idempotencyKey: "idem-auth-b",
    },
    { providerRef: "AUTH-B", checkoutUrl: "https://zarinpal.test/B" },
  );

  await store.savePendingZarinpal({
    authority: "AUTH-A",
    amountMinor: "1000",
    workspaceId,
    paymentLinkId: linkA.id,
    returnUrl: "https://dang.local/a",
  });
  await store.savePendingZarinpal({
    authority: "AUTH-B",
    amountMinor: "2000",
    workspaceId,
    paymentLinkId: linkB.id,
    returnUrl: "https://dang.local/b",
  });

  const pendingA = await store.findPendingZarinpal("AUTH-A");
  const pendingB = await store.findPendingZarinpal("AUTH-B");
  assert.equal(pendingA?.paymentLinkId, linkA.id);
  assert.equal(pendingA?.amountMinor, "1000");
  assert.equal(pendingB?.paymentLinkId, linkB.id);
  assert.equal(pendingB?.amountMinor, "2000");
  assert.notEqual(pendingA?.paymentLinkId, pendingB?.paymentLinkId);

  await store.markZarinpalVerified("AUTH-A", "ref-a");
  const afterB = await store.findPendingZarinpal("AUTH-B");
  assert.equal(afterB?.status, "pending");
  assert.equal(afterB?.refId, undefined);
  assert.equal((await store.getLink(workspaceId, linkB.id))?.status, "created");
});

test("callback verification is idempotent — payment recorded once", async () => {
  const store = new MemoryPaymentStore();
  const link = await store.create(
    "zarinpal",
    {
      workspaceId,
      amount: { amountMinor: "5000", currency: "IRR" },
      description: "once",
      returnUrl: "https://dang.local/r",
      idempotencyKey: "idem-once",
    },
    { providerRef: "AUTH-ONCE", checkoutUrl: "https://zarinpal.test/once" },
  );
  await store.savePendingZarinpal({
    authority: "AUTH-ONCE",
    amountMinor: "5000",
    workspaceId,
    paymentLinkId: link.id,
  });

  const first = await store.markZarinpalVerified("AUTH-ONCE", "ref-1");
  const paidFirst = await store.markLinkPaid(workspaceId, link.id);
  assert.equal(first.status, "verified");
  assert.equal(first.refId, "ref-1");
  assert.equal(paidFirst.status, "paid");

  const second = await store.markZarinpalVerified("AUTH-ONCE", "ref-other");
  const paidSecond = await store.markLinkPaid(workspaceId, link.id);
  assert.equal(second.status, "verified");
  assert.equal(second.refId, "ref-1", "second verify must keep original refId");
  assert.equal(paidSecond.status, "paid");

  const links = await store.list(workspaceId);
  const paidLinks = links.filter((l) => l.id === link.id && l.status === "paid");
  assert.equal(paidLinks.length, 1);
});
