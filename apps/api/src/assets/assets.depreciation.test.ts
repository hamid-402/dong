import assert from "node:assert/strict";
import test from "node:test";
import { MemoryProcurementStore } from "../procurement/procurement.store.js";
import { MemoryAssetsStore } from "./assets.store.js";

const ws = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const actor = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

async function assetWithDepreciation(procurement: MemoryProcurementStore, assets: MemoryAssetsStore) {
  const pr = await procurement.createPurchaseRequest(actor, {
    workspaceId: ws,
    title: "سرور",
    amount: { amountMinor: "120000000", currency: "IRR" },
    idempotencyKey: "pr-dep",
  });
  await procurement.submitPurchaseRequest(ws, pr.id);
  await procurement.decidePurchaseRequest(ws, pr.id, "approved");
  const vendor = await procurement.createVendor({
    workspaceId: ws,
    name: "HW",
    idempotencyKey: "v-dep",
  });
  const po = await procurement.createPurchaseOrder(actor, {
    workspaceId: ws,
    purchaseRequestId: pr.id,
    vendorId: vendor.id,
    idempotencyKey: "po-dep",
  });
  const delivery = await procurement.recordDelivery(actor, {
    workspaceId: ws,
    purchaseOrderId: po.id,
    expectedQuantity: 1,
    receivedQuantity: 1,
    idempotencyKey: "del-dep",
  });
  return assets.createFromDelivery(procurement, {
    workspaceId: ws,
    deliveryId: delivery.id,
    title: "سرور رACK",
    usefulLifeMonths: 12,
    salvageMinor: "0",
    acquisitionDate: "2026-01-15",
    idempotencyKey: "asset-dep",
  });
}

test("monthly depreciation job updates accumulated once per month", async () => {
  const procurement = new MemoryProcurementStore();
  const assets = new MemoryAssetsStore();
  const asset = await assetWithDepreciation(procurement, assets);

  const jan = await assets.runMonthlyDepreciation(ws, "2026-01-20T12:00:00.000Z");
  assert.equal(jan.updated, 1);
  const afterJan = (await assets.listAssets(ws)).find((a) => a.id === asset.id)!;
  assert.equal(afterJan.accumulatedDepreciationMinor, "10000000");

  const janAgain = await assets.runMonthlyDepreciation(ws, "2026-01-25T00:00:00.000Z");
  assert.equal(janAgain.updated, 0);

  const feb = await assets.runMonthlyDepreciation(ws, "2026-02-01T00:00:00.000Z");
  assert.equal(feb.updated, 1);
  const afterFeb = (await assets.listAssets(ws)).find((a) => a.id === asset.id)!;
  assert.equal(afterFeb.accumulatedDepreciationMinor, "20000000");

  const report = await assets.depreciationReport(ws);
  assert.equal(report.length, 1);
  assert.equal(report[0]?.bookValueMinor, "100000000");
});

test("in_repair skips depreciation then resumes", async () => {
  const procurement = new MemoryProcurementStore();
  const assets = new MemoryAssetsStore();
  const asset = await assetWithDepreciation(procurement, assets);
  await assets.markRepair(ws, { workspaceId: ws, assetId: asset.id });
  const skipped = await assets.runMonthlyDepreciation(ws, "2026-03-01T00:00:00.000Z");
  assert.equal(skipped.updated, 0);
  await assets.resumeActive(ws, { workspaceId: ws, assetId: asset.id });
  const mar = await assets.runMonthlyDepreciation(ws, "2026-03-01T00:00:00.000Z");
  assert.equal(mar.updated, 1);
});
