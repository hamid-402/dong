import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { MemoryCatalogStore } from "../catalog/memory-catalog.store.js";
import { CatalogService } from "../catalog/catalog.service.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";
import { DailyLedgerService } from "./daily-ledger.service.js";
import { MemoryWorkspaceDayStore } from "./workspace-day.store.js";
import { MemoryWorkspaceRangeLockStore } from "./workspace-range-lock.store.js";
import type { IamStore } from "../iam/iam.types.js";
import type { ExpenseStore } from "./expense.types.js";
import type { CreateExpenseDraftRequest, ExpenseSummary } from "@dang/contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const alice = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const actor = {
  userId: alice,
  externalSubject: "sub-s11-07",
  displayName: "Alice",
  authMode: "password" as const,
};

function mockAccess(): WorkspaceAccessService {
  return {
    requireMember: async () => undefined,
    requireMemberRole: async () => "owner" as const,
    requireAnyRole: async () => "owner" as const,
    requireFinanceManager: async () => "owner" as const,
    assertNotReadOnly: () => undefined,
  } as unknown as WorkspaceAccessService;
}

function mockIam(): IamStore {
  return {
    listMembers: async () => [
      {
        workspaceId,
        userId: alice,
        displayName: "Alice",
        role: "owner",
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      },
      {
        workspaceId,
        userId: bob,
        displayName: "Bob",
        role: "member",
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      },
    ],
    getWorkspaceForUser: async () => ({
      id: workspaceId,
      slug: "demo",
      name: "Demo",
      template: "friends_family",
    }),
  } as unknown as IamStore;
}

function buildServices() {
  const expenseStore = new MemoryExpenseStore();
  const catalogStore = new MemoryCatalogStore();
  const access = mockAccess();
  const catalog = new CatalogService(catalogStore, access);

  const expenseService = {
    async createDraft(
      _actor: typeof actor,
      _ws: string,
      body: CreateExpenseDraftRequest,
    ): Promise<ExpenseSummary> {
      const created = await expenseStore.createDraft(actor.userId, body);
      if (created.catalogItemId) {
        await catalog.recordUsage(workspaceId, created.catalogItemId, 1);
      }
      for (const item of created.items ?? []) {
        if (item.catalogItemId) {
          await catalog.recordUsage(workspaceId, item.catalogItemId, 1);
        }
      }
      return created;
    },
    async post(_actor: typeof actor, ws: string, expenseId: string) {
      return expenseStore.post(ws, expenseId, actor.userId, { viewAllPrivate: true });
    },
  } as unknown as ExpensesService;

  const daily = new DailyLedgerService(
    mockIam(),
    access,
    expenseStore as ExpenseStore,
    new MemoryWorkspaceDayStore(),
    new MemoryWorkspaceRangeLockStore(),
    expenseService,
    catalog,
  );
  return { daily, catalog, expenseStore };
}

test("S11-07 AMOUNT_MISMATCH when quantity × unitPrice ≠ amount", async () => {
  const { daily } = buildServices();
  await assert.rejects(
    () =>
      daily.addEntry(actor, workspaceId, {
        date: "2026-09-12",
        itemName: "نوشابه",
        amount: { amountMinor: "100000", currency: "IRR" },
        quantity: 2,
        unitPriceMinor: "300000",
        catalogItemId: "item-x",
        unitCode: "piece",
        idempotencyKey: "mismatch-1",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, "AMOUNT_MISMATCH");
      return true;
    },
  );
});

test("S11-07 persists catalogItemId on daily ledger entry", async () => {
  const { daily, catalog, expenseStore } = buildServices();
  const item = await catalog.createItem(actor, workspaceId, {
    name: "نوشابه",
    unitCode: "piece",
    referencePriceMinor: "300000",
  });

  await daily.addEntry(actor, workspaceId, {
    date: "2026-09-12",
    itemName: item.name,
    amount: { amountMinor: "300000", currency: "IRR" },
    quantity: 1,
    unitPriceMinor: "300000",
    catalogItemId: item.id,
    unitCode: item.unitCode,
    memberUserId: bob,
    idempotencyKey: "persist-1",
  });

  const listed = await expenseStore.listForWorkspace(workspaceId, alice, {
    viewAllPrivate: true,
  });
  const withCatalog = listed.find((e) => e.catalogItemId === item.id);
  assert.ok(withCatalog);
  assert.equal(withCatalog!.unitCode, "piece");
  assert.equal(withCatalog!.quantity, 1);
  assert.equal(withCatalog!.unitPriceMinor, "300000");
  assert.equal(withCatalog!.status, "posted");
});

test("S11-07 expense itemized draft keeps catalogItemId", async () => {
  const store = new MemoryExpenseStore();
  const created = await store.createDraft(alice, {
    workspaceId,
    title: "ناهار",
    total: { amountMinor: "600000", currency: "IRR" },
    paidByUserId: alice,
    splitMethod: "itemized",
    participantUserIds: [],
    items: [
      {
        title: "نوشابه",
        amount: { amountMinor: "600000", currency: "IRR" },
        assigneeUserIds: [alice, bob],
        catalogItemId: "cat-soda",
        unitCode: "piece",
        quantity: 2,
        unitPriceMinor: "300000",
      },
    ],
    occurredOn: "2026-09-12",
    idempotencyKey: "itemized-cat-1",
  });
  assert.equal(created.items?.[0]?.catalogItemId, "cat-soda");
  assert.equal(created.items?.[0]?.quantity, 2);
});

test("S11-07 day template empty when no frequent usage", async () => {
  const { daily, catalog } = buildServices();
  await catalog.createItem(actor, workspaceId, {
    name: "نان",
    unitCode: "piece",
    referencePriceMinor: "50000",
  });
  const template = await daily.getDayTemplate(actor, workspaceId, "2026-09-13");
  assert.equal(template.frequentItems.length, 0);
  assert.equal(template.yesterdayLines.length, 0);
});

test("S11-07 postDay shared + personal in one request", async () => {
  const { daily, catalog, expenseStore } = buildServices();
  const bread = await catalog.createItem(actor, workspaceId, {
    name: "نان",
    unitCode: "piece",
    referencePriceMinor: "50000",
  });
  const soda = await catalog.createItem(actor, workspaceId, {
    name: "نوشابه",
    unitCode: "piece",
    referencePriceMinor: "300000",
  });

  await daily.postDay(actor, workspaceId, {
    date: "2026-09-12",
    idempotencyKey: "day-batch-1",
    lines: [
      {
        itemName: bread.name,
        amount: { amountMinor: "100000", currency: "IRR" },
        quantity: 2,
        unitPriceMinor: "50000",
        catalogItemId: bread.id,
        unitCode: "piece",
        memberUserId: null,
      },
      {
        itemName: soda.name,
        amount: { amountMinor: "300000", currency: "IRR" },
        quantity: 1,
        unitPriceMinor: "300000",
        catalogItemId: soda.id,
        unitCode: "piece",
        memberUserId: bob,
      },
    ],
  });

  const listed = await expenseStore.listForWorkspace(workspaceId, alice, {
    viewAllPrivate: true,
  });
  assert.ok(listed.some((e) => e.catalogItemId === bread.id && e.splitMethod === "equal"));
  assert.ok(
    listed.some(
      (e) =>
        e.catalogItemId === soda.id &&
        e.participantUserIds.length === 1 &&
        e.participantUserIds[0] === bob,
    ),
  );
});
