import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";

test("guest cannot create a shared expense", async () => {
  const iam = {
    listMembers: async () => [
      {
        workspaceId: "workspace-1",
        userId: "guest-1",
        displayName: "Guest",
        role: "guest",
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      },
    ],
  } as unknown as IamStore;
  const access = new WorkspaceAccessService(iam);
  const service = new ExpensesService(
    new MemoryExpenseStore(),
    {} as never,
    {} as never,
    iam,
    access,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(
    () =>
      service.createDraft(
        {
          userId: "guest-1",
          externalSubject: "guest-1",
          displayName: "Guest",
          authMode: "dev",
        },
        "workspace-1",
        {
          workspaceId: "workspace-1",
          title: "Shared",
          total: { amountMinor: "1000", currency: "IRR" },
          paidByUserId: "guest-1",
          splitMethod: "equal",
          participantUserIds: ["guest-1"],
          occurredOn: "2026-09-07",
          visibility: "shared",
          idempotencyKey: "guest-shared-1",
        },
      ),
    (error: unknown) => error instanceof ForbiddenException,
  );
});
