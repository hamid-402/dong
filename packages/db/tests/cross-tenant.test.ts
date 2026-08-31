/**
 * Cross-tenant RLS smoke test.
 *
 * Skips when DATABASE_URL is unset. After local migrate + grants, run:
 *   pnpm --filter @dang/db test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  and,
  createDatabase,
  eq,
  isNull,
  membership,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const databaseUrl = process.env.DATABASE_URL;

describe("cross-tenant RLS", () => {
  it("isolates workspace rows between tenants", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { db, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `cross-tenant-a-${userA}`,
        displayName: "Tenant A",
      },
      {
        id: userB,
        externalSubject: `cross-tenant-b-${userB}`,
        displayName: "Tenant B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `ws-a-${workspaceA.slice(0, 8)}`,
        name: "Workspace A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `ws-b-${workspaceB.slice(0, 8)}`,
        name: "Workspace B",
        template: "small_team",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
    });

    const seenByA = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceB)),
    );

    assert.equal(seenByA.length, 0, "tenant A must not read workspace B");

    const seenOwn = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceA)),
    );

    assert.equal(seenOwn.length, 1);
  });
});
