import assert from "node:assert/strict";
import test from "node:test";
import { MemoryProcurementStore } from "../procurement/procurement.store.js";
import { MemoryAssetsStore } from "./assets.store.js";

const ws = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const actor = "ffffffff-ffff-4fff-8fff-ffffffffffff";

test("asset from delivery inherits purchaseOrderId and PO amount", async () => {
  const procurement = new MemoryProcurementStore();
  const assets = new MemoryAssetsStore();

  const pr = await procurement.createPurchaseRequest(actor, {
    workspaceId: ws,
    title: "میز",
    amount: { amountMinor: "7500000", currency: "IRR" },
    idempotencyKey: "pr-fd",
  });
  await procurement.submitPurchaseRequest(ws, pr.id);
  await procurement.decidePurchaseRequest(ws, pr.id, "approved");
  const vendor = await procurement.createVendor({
    workspaceId: ws,
    name: "Office",
    idempotencyKey: "v-fd",
  });
  const po = await procurement.createPurchaseOrder(actor, {
    workspaceId: ws,
    purchaseRequestId: pr.id,
    vendorId: vendor.id,
    idempotencyKey: "po-fd",
  });
  const delivery = await procurement.recordDelivery(actor, {
    workspaceId: ws,
    purchaseOrderId: po.id,
    expectedQuantity: 2,
    receivedQuantity: 2,
    idempotencyKey: "del-fd",
  });

  const asset = await assets.createFromDelivery(procurement, {
    workspaceId: ws,
    deliveryId: delivery.id,
    title: "میز کنفرانس",
    idempotencyKey: "asset-fd",
  });

  assert.equal(asset.purchaseOrderId, po.id);
  assert.equal(asset.deliveryId, delivery.id);
  assert.equal(asset.acquisitionCost?.amountMinor, "7500000");
  assert.equal(asset.status, "active");
});
