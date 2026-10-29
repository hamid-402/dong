import assert from "node:assert/strict";
import test from "node:test";
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

const actor = {
  userId: alice,
  externalSubject: "sub-shared-solo",
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

function mockIamSolo(): IamStore {
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
    ],
    getWorkspaceForUser: async () => ({
      id: workspaceId,
      slug: "solo",
      name: "Solo",
      template: "friends_family",
    }),
  } as unknown as IamStore;
}

function buildSoloServices() {
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
      return expenseStore.createDraft(actor.userId, body);
    },
    async post(_actor: typeof actor, ws: string, expenseId: string) {
      return expenseStore.post(ws, expenseId, actor.userId, { viewAllPrivate: true });
    },
  } as unknown as ExpensesService;

  const daily = new DailyLedgerService(
    mockIamSolo(),
    access,
    expenseStore as ExpenseStore,
    new MemoryWorkspaceDayStore(),
    new MemoryWorkspaceRangeLockStore(),
    expenseService,
    catalog,
  );
  return { daily };
}

test("T1 addEntry + مشترک in 1-member workspace lands in shared.items not member column", async () => {
  const { daily } = buildSoloServices();
  const ledger = await daily.addEntry(actor, workspaceId, {
    date: "2026-10-29",
    itemName: "نان مشترک",
    amount: { amountMinor: "880000", currency: "IRR" },
    memberUserId: null,
    idempotencyKey: "shared-solo-1",
  });
  const day = ledger.days.find((d) => d.date === "2026-10-29");
  assert.ok(day);
  assert.equal(day!.shared.items.length, 1);
  assert.equal(day!.shared.items[0]?.title, "نان مشترک");
  assert.equal(day!.members[alice]?.items.length ?? 0, 0);
});
