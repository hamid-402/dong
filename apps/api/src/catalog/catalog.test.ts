import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { MemoryCatalogStore } from "./memory-catalog.store.js";
import { CatalogService } from "./catalog.service.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  externalSubject: "sub-catalog",
  displayName: "Catalog Tester",
  authMode: "password" as const,
};

function mockAccess(): WorkspaceAccessService {
  return {
    requireMember: async () => undefined,
    requireMemberRole: async () => "owner" as const,
    requireAnyRole: async () => "owner" as const,
    requireFinanceManager: async () => "owner" as const,
  } as unknown as WorkspaceAccessService;
}

test("S11-06 create catalog item with name+unit+price", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  const item = await service.createItem(actor, workspaceId, {
    name: "نوشابه",
    unitCode: "piece",
    referencePriceMinor: "300000",
  });
  assert.equal(item.name, "نوشابه");
  assert.equal(item.unitCode, "piece");
  assert.equal(item.referencePriceMinor, "300000");
  assert.equal(item.ownerKind, "workspace");
  assert.equal(item.active, true);

  const page = await service.listItems(actor, workspaceId, { activeOnly: true });
  assert.equal(page.items.length, 1);
});

test("S11-06 duplicate name rejected with CATALOG_NAME_TAKEN", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  await service.createItem(actor, workspaceId, {
    name: "نان",
    unitCode: "piece",
    referencePriceMinor: "50000",
  });
  await assert.rejects(
    () =>
      service.createItem(actor, workspaceId, {
        name: "  نان  ",
        unitCode: "pack",
        referencePriceMinor: "60000",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConflictException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "CATALOG_NAME_TAKEN");
      return true;
    },
  );
});

test("S11-06 deactivate hides item from active list", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  const item = await service.createItem(actor, workspaceId, {
    name: "ماست",
    unitCode: "pack",
    referencePriceMinor: "200000",
  });
  await service.deactivateItem(actor, workspaceId, item.id);
  const active = await service.listItems(actor, workspaceId, { activeOnly: true });
  assert.equal(active.items.length, 0);
  const all = await service.listItems(actor, workspaceId, { activeOnly: false });
  assert.equal(all.items.length, 1);
  assert.equal(all.items[0]?.active, false);
});

test("S11-06 frequent empty when no usage recorded", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  await service.createItem(actor, workspaceId, {
    name: "نوشابه",
    unitCode: "piece",
    referencePriceMinor: "300000",
  });
  const frequent = await service.listFrequent(actor, workspaceId, 10);
  assert.equal(frequent.length, 0);
});

test("S11-06 frequent items ordered by real usage counts", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  const soda = await service.createItem(actor, workspaceId, {
    name: "نوشابه",
    unitCode: "piece",
    referencePriceMinor: "300000",
  });
  const yogurt = await service.createItem(actor, workspaceId, {
    name: "ماست",
    unitCode: "pack",
    referencePriceMinor: "200000",
  });
  await service.recordUsage(workspaceId, yogurt.id, 5);
  await service.recordUsage(workspaceId, soda.id, 2);
  const frequent = await service.listFrequent(actor, workspaceId, 10);
  assert.equal(frequent.length, 2);
  assert.equal(frequent[0]?.id, yogurt.id);
  assert.equal(frequent[0]?.useCount, 5);
  assert.equal(frequent[1]?.id, soda.id);
  assert.equal(frequent[1]?.useCount, 2);
});

test("S11-06 price change writes history without mutating past prices", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  const item = await service.createItem(actor, workspaceId, {
    name: "نان",
    unitCode: "piece",
    referencePriceMinor: "50000",
  });
  const before = await service.listPrices(actor, workspaceId, item.id);
  assert.equal(before.length, 1);
  assert.equal(before[0]?.priceMinor, "50000");

  const updated = await service.updateItem(actor, workspaceId, item.id, {
    referencePriceMinor: "75000",
  });
  assert.equal(updated.referencePriceMinor, "75000");

  const after = await service.listPrices(actor, workspaceId, item.id);
  assert.equal(after.length, 2);
  assert.equal(after[0]?.priceMinor, "75000");
  assert.equal(after[1]?.priceMinor, "50000");
});

test("S11-06 personal menu import into workspace catalog", async () => {
  const store = new MemoryCatalogStore();
  const service = new CatalogService(store, mockAccess());
  await service.createPersonalItem(actor, {
    name: "چای",
    unitCode: "service",
    referencePriceMinor: "100000",
  });
  const imported = await service.importPersonal(actor, workspaceId, {});
  assert.equal(imported.length, 1);
  assert.equal(imported[0]?.name, "چای");
  assert.equal(imported[0]?.ownerKind, "workspace");
});
