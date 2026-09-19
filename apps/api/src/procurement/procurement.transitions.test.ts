import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAssetsStore } from "../assets/assets.store.js";
import { MemoryProcurementStore } from "./procurement.store.js";

const ws = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";

async function runHappyPath() {
  const procurement = new MemoryProcurementStore();
  const need = await procurement.createNeed(actor, {
    workspaceId: ws,
    title: "لپ‌تاپ",
    idempotencyKey: "need-1",
  });
  const pr = await procurement.createPurchaseRequest(actor, {
    workspaceId: ws,
    needId: need.id,
    title: "PR لپ‌تاپ",
    amount: { amountMinor: "50000000", currency: "IRR" },
    idempotencyKey: "pr-1",
  });
  assert.equal(pr.status, "draft");
  const submitted = await procurement.submitPurchaseRequest(ws, pr.id);
  assert.equal(submitted.status, "submitted");
  const approved = await procurement.decidePurchaseRequest(ws, pr.id, "approved");
  assert.equal(approved.status, "approved");
  const vendor = await procurement.createVendor({
    workspaceId: ws,
    name: "Vendor A",
    idempotencyKey: "v-1",
  });
  const po = await procurement.createPurchaseOrder(actor, {
    workspaceId: ws,
    purchaseRequestId: pr.id,
    vendorId: vendor.id,
    idempotencyKey: "po-1",
  });
  assert.equal(po.status, "open");
  assert.equal(po.amount.amountMinor, "50000000");
  const delivery = await procurement.recordDelivery(actor, {
    workspaceId: ws,
    purchaseOrderId: po.id,
    expectedQuantity: 1,
    receivedQuantity: 1,
    idempotencyKey: "del-1",
  });
  assert.equal(delivery.status, "complete");
  const poAfter = await procurement.getPurchaseOrder(ws, po.id);
  assert.equal(poAfter?.status, "delivered");
  return { procurement, po: poAfter!, delivery };
}

test("procurement vertical: need → PR → PO → delivery → asset inherits PO", async () => {
  const { procurement, po, delivery } = await runHappyPath();
  const assets = new MemoryAssetsStore();
  const asset = await assets.createFromDelivery(procurement, {
    workspaceId: ws,
    deliveryId: delivery.id,
    title: "لپ‌تاپ واحد IT",
    idempotencyKey: "asset-1",
  });
  assert.equal(asset.purchaseOrderId, po.id);
  assert.equal(asset.acquisitionCost?.amountMinor, po.amount.amountMinor);
});

test("illegal PO transition after delivered throws", async () => {
  const { procurement, po } = await runHappyPath();
  await assert.rejects(() => procurement.cancelPurchaseOrder(ws, po.id), /PO_STATUS/);
});

test("cancel open PO and block delivery", async () => {
  const procurement = new MemoryProcurementStore();
  const pr = await procurement.createPurchaseRequest(actor, {
    workspaceId: ws,
    title: "Cancel me",
    amount: { amountMinor: "1000", currency: "IRR" },
    idempotencyKey: "pr-cancel",
  });
  await procurement.submitPurchaseRequest(ws, pr.id);
  await procurement.decidePurchaseRequest(ws, pr.id, "approved");
  const vendor = await procurement.createVendor({
    workspaceId: ws,
    name: "V",
    idempotencyKey: "v-cancel",
  });
  const po = await procurement.createPurchaseOrder(actor, {
    workspaceId: ws,
    purchaseRequestId: pr.id,
    vendorId: vendor.id,
    idempotencyKey: "po-cancel",
  });
  const cancelled = await procurement.cancelPurchaseOrder(ws, po.id);
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(
    () =>
      procurement.recordDelivery(actor, {
        workspaceId: ws,
        purchaseOrderId: po.id,
        expectedQuantity: 1,
        receivedQuantity: 1,
        idempotencyKey: "del-cancel",
      }),
    /PO_CANCELLED/,
  );
});

test("link-expense idempotent on PO", async () => {
  const procurement = new MemoryProcurementStore();
  const pr = await procurement.createPurchaseRequest(actor, {
    workspaceId: ws,
    title: "Expense link",
    amount: { amountMinor: "9000", currency: "IRR" },
    idempotencyKey: "pr-exp",
  });
  await procurement.submitPurchaseRequest(ws, pr.id);
  await procurement.decidePurchaseRequest(ws, pr.id, "approved");
  const vendor = await procurement.createVendor({
    workspaceId: ws,
    name: "V2",
    idempotencyKey: "v-exp",
  });
  const po = await procurement.createPurchaseOrder(actor, {
    workspaceId: ws,
    purchaseRequestId: pr.id,
    vendorId: vendor.id,
    idempotencyKey: "po-exp",
  });
  const expenseId = "33333333-3333-4333-8333-333333333333";
  const linked = await procurement.linkPurchaseOrderExpense(ws, po.id, expenseId);
  assert.equal(linked.expenseId, expenseId);
  const again = await procurement.linkPurchaseOrderExpense(ws, po.id, "other-expense");
  assert.equal(again.expenseId, expenseId);
});

test("need fulfill and cancel transitions", async () => {
  const procurement = new MemoryProcurementStore();
  const need = await procurement.createNeed(actor, {
    workspaceId: ws,
    title: "Need",
    idempotencyKey: "need-f",
  });
  const fulfilled = await procurement.fulfillNeed(ws, need.id);
  assert.equal(fulfilled.status, "fulfilled");
  await assert.rejects(async () => procurement.cancelNeed(ws, need.id), /NEED_STATUS/);
});
