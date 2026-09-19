import {
  and,
  createDatabase,
  desc,
  eq,
  userReportView,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { CreateReportViewRequest, ReportViewSummary } from "@dang/contracts";
import type { ReportViewsStore } from "./report-views.types.js";

function toSummary(row: typeof userReportView.$inferSelect): ReportViewSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ReportViewSummary["kind"],
    months: row.months as ReportViewSummary["months"],
    sortKey: row.sortKey as ReportViewSummary["sortKey"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PostgresReportViewsStore implements ReportViewsStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresReportViewsStore {
    const { db } = createDatabase(connectionString);
    return new PostgresReportViewsStore(db);
  }

  list(userId: string): Promise<ReportViewSummary[]> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(userReportView)
        .where(eq(userReportView.userId, userId))
        .orderBy(desc(userReportView.updatedAt));
      return rows.map(toSummary);
    });
  }

  create(userId: string, input: CreateReportViewRequest): Promise<ReportViewSummary> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const inserted = await tx
        .insert(userReportView)
        .values({
          userId,
          name: input.name.trim(),
          kind: input.kind,
          months: input.months,
          sortKey: input.sortKey,
        })
        .returning();
      return toSummary(inserted[0]!);
    });
  }

  delete(userId: string, viewId: string): Promise<boolean> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const deleted = await tx
        .delete(userReportView)
        .where(and(eq(userReportView.id, viewId), eq(userReportView.userId, userId)))
        .returning({ id: userReportView.id });
      return deleted.length > 0;
    });
  }
}
