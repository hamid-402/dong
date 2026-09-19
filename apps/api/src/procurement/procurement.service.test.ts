import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryPartnershipStore } from "../partnership/memory-partnership.store.js";
import type { CatalogStore } from "../catalog/catalog.types.js";
import type { ExpensesService } from "../expenses/expenses.service.js";
import { MemoryProcurementStore } from "./procurement.store.js";
import { ProcurementService } from "./procurement.service.js";

async function seedBuyer() {
  const iam = new MemoryIamStore();
  const owner = await iam.upsertDevActor({
    externalSubject: `buyer-${crypto.randomUUID()}@test`,
    displayName: "Buyer",
  });
  const outsider = await iam.upsertDevActor({
    externalSubject: `out-${crypto.randomUUID()}@test`,
    displayName: "Outsider",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Proc",
    slug: `proc-${crypto.randomUUID().slice(0, 8)}`,
    template: "small_team",
  });
  return {
    iam,
    owner: {
      userId: owner.userId,
      externalSubject: owner.externalSubject,
      displayName: owner.displayName,
      authMode: "dev" as const,
    } satisfies AuthActor,
    outsider: {
      userId: outsider.userId,
      externalSubject: outsider.externalSubject,
      displayName: outsider.displayName,
      authMode: "dev" as const,
    } satisfies AuthActor,
    workspace,
  };
}

function emptyCatalog(): CatalogStore {
  return {
    persistence: () => "memory",
    getPriceById: async () => null,
  } as unknown as CatalogStore;
}

test("G15 ProcurementService freezes partner price on PO create", async () => {
  const { iam, owner, outsider, workspace } = await seedBuyer();
  const store = new MemoryProcurementStore();
  const partnership = new MemoryPartnershipStore();
  const draftCalls: unknown[] = [];
  const expenses = {
    createDraft: async (...args: unknown[]) => {
      draftCalls.push(args);
      return { id: "draft-1" };
    },
  } as unknown as ExpensesService;

  const service = new ProcurementService(
    store,
    iam,
    emptyCatalog(),
    partnership,
    expenses,
  );

  const agreement = await partnership.createAgreement(owner.userId, {
    workspaceId: workspace.id,
    title: "قرارداد",
    effectiveFrom: "2026-01-01",
    idempotencyKey: "agr-g15",
  });
  const price = await partnership.createAgreedPrice({
    workspaceId: workspace.id,
    agreementId: agreement.id,
    title: "ثابت",
    amount: { amountMinor: "10000000", currency: "IRR" },
    effectiveFrom: "2026-01-01",
    idempotencyKey: "price-g15",
  });

  const pr = await service.createPurchaseRequest(owner, workspace.id, {
    workspaceId: workspace.id,
    title: "نیاز",
    amount: { amountMinor: "99999999", currency: "IRR" },
    idempotencyKey: "pr-g15",
  });
  await service.submitPurchaseRequest(owner, workspace.id, pr.id);
  await service.decidePurchaseRequest(owner, workspace.id, {
    workspaceId: workspace.id,
    purchaseRequestId: pr.id,
    decision: "approved",
  });
  const vendor = await service.createVendor(owner, workspace.id, {
    workspaceId: workspace.id,
    name: "Vendor",
    idempotencyKey: "v-g15",
  });

  const po = await service.createPurchaseOrder(owner, workspace.id, {
    workspaceId: workspace.id,
    purchaseRequestId: pr.id,
    vendorId: vendor.id,
    partnerPriceId: price.id,
    idempotencyKey: "po-g15",
  });
  assert.equal(po.amount.amountMinor, "10000000");
  assert.equal(po.partnerPriceId, price.id);

  await assert.rejects(
    () =>
      service.createPurchaseOrder(owner, workspace.id, {
        workspaceId: workspace.id,
        purchaseRequestId: pr.id,
        vendorId: vendor.id,
        partnerPriceId: "00000000-0000-4000-8000-000000000099",
        idempotencyKey: "po-bad-price",
      }),
    (err: unknown) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      service.createPurchaseOrder(outsider, workspace.id, {
        workspaceId: workspace.id,
        purchaseRequestId: pr.id,
        vendorId: vendor.id,
        idempotencyKey: "po-forbidden",
      }),
    (err: unknown) => err instanceof ForbiddenException,
  );

  const linked = await service.linkPurchaseOrderExpense(owner, workspace.id, po.id, {
    workspaceId: workspace.id,
    idempotencyKey: "link-1",
  });
  assert.equal(linked.expenseId, "draft-1");
  assert.equal(draftCalls.length, 1);
  const again = await service.linkPurchaseOrderExpense(owner, workspace.id, po.id, {
    workspaceId: workspace.id,
    idempotencyKey: "link-2",
  });
  assert.equal(again.expenseId, "draft-1");
  assert.equal(draftCalls.length, 1, "idempotent short-circuit");
});
