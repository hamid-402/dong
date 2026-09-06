/**
 * Rejects unbalanced journal_line inserts at COMMIT (migration 0031).
 * Skips when DATABASE_URL is unset.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  createDatabase,
  eq,
  journalEntry,
  journalLine,
  membership,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

function loadRepoEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../.env"),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadRepoEnv();
const databaseUrl = process.env.DATABASE_URL;

async function seedWorkspace(db: ReturnType<typeof createDatabase>["db"], prefix: string) {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  await db.insert(userAccount).values({
    id: userId,
    externalSubject: `${prefix}-${userId}`,
    displayName: prefix,
  });
  await withTenantContext(db, { workspaceId, userId }, async (tx) => {
    await tx.insert(workspace).values({
      id: workspaceId,
      slug: `${prefix}-${workspaceId.slice(0, 8)}`,
      name: `${prefix} WS`,
      template: "friends_family",
      createdBy: userId,
    });
    await tx.insert(membership).values({
      workspaceId,
      userId,
      role: "owner",
    });
  });
  return { userId, workspaceId };
}

describe("journal balance constraint", () => {
  it("rejects unbalanced journal lines at commit", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { db, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const { userId, workspaceId } = await seedWorkspace(db, "journal-balance");
    const entryId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await withTenantContext(db, { workspaceId, userId }, async (tx) => {
          await tx.insert(journalEntry).values({
            id: entryId,
            workspaceId,
            sourceType: "expense",
            sourceId,
            status: "posted",
            currency: "IRR",
            idempotencyKey: `unbalanced:${entryId}`,
            actorUserId: userId,
          });
          await tx.insert(journalLine).values({
            entryId,
            workspaceId,
            accountCode: "member.receivable",
            userId,
            side: "debit",
            amountMinor: 1000n,
            currency: "IRR",
            lineNo: 1,
          });
        });
      },
      (err: unknown) => {
        let current: unknown = err;
        for (let i = 0; i < 5 && current; i += 1) {
          const message =
            current instanceof Error ? current.message : String(current);
          if (/JOURNAL_ENTRY_NOT_BALANCED/i.test(message)) return true;
          current =
            current && typeof current === "object" && "cause" in current
              ? (current).cause
              : undefined;
        }
        return false;
      },
    );
  });

  it("accepts balanced debit/credit pair", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { db, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const { userId, workspaceId } = await seedWorkspace(db, "journal-ok");
    const entryId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();

    await withTenantContext(db, { workspaceId, userId }, async (tx) => {
      await tx.insert(journalEntry).values({
        id: entryId,
        workspaceId,
        sourceType: "expense",
        sourceId,
        status: "posted",
        currency: "IRR",
        idempotencyKey: `balanced:${entryId}`,
        actorUserId: userId,
      });
      await tx.insert(journalLine).values([
        {
          entryId,
          workspaceId,
          accountCode: "member.receivable",
          userId,
          side: "debit",
          amountMinor: 1000n,
          currency: "IRR",
          lineNo: 1,
        },
        {
          entryId,
          workspaceId,
          accountCode: "member.payable",
          userId,
          side: "credit",
          amountMinor: 1000n,
          currency: "IRR",
          lineNo: 2,
        },
      ]);
    });

    const lines = await withTenantContext(db, { workspaceId, userId }, async (tx) =>
      tx.select().from(journalLine).where(eq(journalLine.entryId, entryId)),
    );
    assert.equal(lines.length, 2);
  });
});
