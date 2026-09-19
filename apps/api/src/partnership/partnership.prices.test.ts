import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPartnershipStore } from "./memory-partnership.store.js";
import { MemoryProcurementStore } from "../procurement/procurement.store.js";

const ws = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("agreed price versioning does not change frozen PO amount", async () => {
  const partnership = new MemoryPartnershipStore();
  const procurement = new MemoryProcurementStore();

  const agreement = await partnership.createAgreement(actor, {
    workspaceId: ws,
    title: "قرارداد خرید",
    effectiveFrom: "2026-01-01",
    idempotencyKey: "agr-1",
  });

  const priceV1 = await partnership.createAgreedPrice({
    workspaceId: ws,
    agreementId: agreement.id,
    title: "قیمت ثابت",
    amount: { amountMinor: "10000000", currency: "IRR" },
    effectiveFrom: "2026-01-01",
    idempotencyKey: "price-v1",
  });
  assert.equal(priceV1.version, 1);

  const pr = await procurement.createPurchaseRequest(actor, {
    workspaceId: ws,
    title: "خرید با قیمت توافقی",
    amount: { amountMinor: "99999999", currency: "IRR" },
    idempotencyKey: "pr-partner",
  });
  await procurement.submitPurchaseRequest(ws, pr.id);
  await procurement.decidePurchaseRequest(ws, pr.id, "approved");
  const vendor = await procurement.createVendor({
    workspaceId: ws,
    name: "Partner vendor",
    idempotencyKey: "v-partner",
  });

  const po = await procurement.createPurchaseOrder(
    actor,
    {
      workspaceId: ws,
      purchaseRequestId: pr.id,
      vendorId: vendor.id,
      partnerPriceId: priceV1.id,
      idempotencyKey: "po-partner",
    },
    {
      amount: priceV1.amount,
      partnerPriceId: priceV1.id,
    },
  );
  assert.equal(po.amount.amountMinor, "10000000");
  assert.equal(po.partnerPriceId, priceV1.id);

  const priceV2 = await partnership.createAgreedPrice({
    workspaceId: ws,
    agreementId: agreement.id,
    title: "قیمت ثابت",
    amount: { amountMinor: "20000000", currency: "IRR" },
    effectiveFrom: "2026-06-01",
    idempotencyKey: "price-v2",
  });
  assert.equal(priceV2.version, 2);

  const poReload = await procurement.getPurchaseOrder(ws, po.id);
  assert.equal(poReload?.amount.amountMinor, "10000000");
  assert.equal(poReload?.partnerPriceId, priceV1.id);
});
