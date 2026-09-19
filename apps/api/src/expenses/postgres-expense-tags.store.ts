import {
  and,
  createDatabase,
  eq,
  expenseTag,
  expenseTagLink,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateExpenseTagRequest,
  ExpenseTagSummary,
} from "@dang/contracts";
import type { ExpenseTagsStore } from "./expense-tags.store.js";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .slice(0, 48) || "tag";
}

function mapTag(row: typeof expenseTag.$inferSelect): ExpenseTagSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    color: row.color ?? undefined,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
  };
}

export class PostgresExpenseTagsStore implements ExpenseTagsStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresExpenseTagsStore {
    return new PostgresExpenseTagsStore(createDatabase(url).db);
  }

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateExpenseTagRequest,
  ): Promise<ExpenseTagSummary> {
    const name = input.name?.trim();
    if (!name || name.length > 64) {
      return Promise.reject(new Error("TAG_NAME"));
    }
    const slug = (input.slug?.trim() || slugify(name)).slice(0, 48);
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        try {
          const inserted = await tx
            .insert(expenseTag)
            .values({
              workspaceId,
              name,
              slug,
              color: input.color?.trim() || null,
              createdByUserId: actorUserId,
            })
            .returning();
          if (!inserted[0]) throw new Error("TAG_INSERT_FAILED");
          return mapTag(inserted[0]);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : "";
          if (msg.includes("expense_tag_workspace_slug_uq") || msg.includes("unique")) {
            throw new Error("TAG_SLUG_TAKEN");
          }
          throw error;
        }
      },
    );
  }

  list(workspaceId: string, actorUserId: string): Promise<ExpenseTagSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(expenseTag)
          .where(eq(expenseTag.workspaceId, workspaceId));
        return rows.map(mapTag).sort((a, b) => a.name.localeCompare(b.name, "fa"));
      },
    );
  }

  setExpenseTags(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    tagIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(tagIds.map((id) => id.trim()).filter(Boolean))];
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        if (unique.length > 0) {
          const found = await tx
            .select({ id: expenseTag.id })
            .from(expenseTag)
            .where(eq(expenseTag.workspaceId, workspaceId));
          const allowed = new Set(found.map((r) => r.id));
          for (const id of unique) {
            if (!allowed.has(id)) throw new Error("TAG_NOT_FOUND");
          }
        }
        await tx
          .delete(expenseTagLink)
          .where(
            and(
              eq(expenseTagLink.workspaceId, workspaceId),
              eq(expenseTagLink.expenseId, expenseId),
            ),
          );
        if (unique.length > 0) {
          await tx.insert(expenseTagLink).values(
            unique.map((tagId) => ({
              expenseId,
              tagId,
              workspaceId,
            })),
          );
        }
        return unique;
      },
    );
  }

  listTagIdsForExpense(
    workspaceId: string,
    expenseId: string,
  ): Promise<string[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select({ tagId: expenseTagLink.tagId })
        .from(expenseTagLink)
        .where(
          and(
            eq(expenseTagLink.workspaceId, workspaceId),
            eq(expenseTagLink.expenseId, expenseId),
          ),
        );
      return rows.map((r) => r.tagId);
    });
  }

  listExpenseIdsWithTag(
    workspaceId: string,
    tagId: string,
  ): Promise<string[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select({ expenseId: expenseTagLink.expenseId })
        .from(expenseTagLink)
        .where(
          and(
            eq(expenseTagLink.workspaceId, workspaceId),
            eq(expenseTagLink.tagId, tagId),
          ),
        );
      return rows.map((r) => r.expenseId);
    });
  }
}
