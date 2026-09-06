import {
  and,
  createDatabase,
  eq,
  expense,
  expenseCategory,
  gte,
  lte,
  recurringRule,
  reportExport,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateExpenseCategoryRequest,
  CreateRecurringRuleRequest,
  CreateReportExportRequest,
  ExpenseCategorySummary,
  RecurringRuleSummary,
  ReportExportSummary,
  ReportGroupBy,
  WorkspaceReportResponse,
} from "@dang/contracts";

function formatDate(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export type ReportsStore = {
  readonly persistence: "memory" | "postgres";
  buildReport(
    workspaceId: string,
    actorUserId: string,
    from: string,
    to: string,
    groupBy: ReportGroupBy,
  ): Promise<WorkspaceReportResponse>;
  createExport(
    workspaceId: string,
    actorUserId: string,
    input: CreateReportExportRequest,
  ): Promise<ReportExportSummary & { csvBody?: string }>;
  getExport(
    workspaceId: string,
    exportId: string,
    actorUserId: string,
  ): Promise<(ReportExportSummary & { csvBody?: string }) | null>;
  listCategories(workspaceId: string, actorUserId: string): Promise<ExpenseCategorySummary[]>;
  createCategory(
    workspaceId: string,
    actorUserId: string,
    input: CreateExpenseCategoryRequest,
  ): Promise<ExpenseCategorySummary>;
  listRecurring(workspaceId: string, actorUserId: string): Promise<RecurringRuleSummary[]>;
  createRecurring(
    workspaceId: string,
    actorUserId: string,
    input: CreateRecurringRuleRequest,
  ): Promise<RecurringRuleSummary>;
  runRecurringDue(
    workspaceId: string,
    actorUserId: string,
    today: string,
  ): Promise<{
    due: Array<{
      id: string;
      title: string;
      amount: { amountMinor: string; currency: "IRR" };
      visibility: "shared" | "private" | "company";
      categoryId?: string;
    }>;
  }>;
};

export const REPORTS_STORE = Symbol("REPORTS_STORE");

type MemCat = ExpenseCategorySummary;
type MemRec = RecurringRuleSummary & { idempotencyKey: string };
type MemExp = ReportExportSummary & { csvBody?: string };

export class MemoryReportsStore implements ReportsStore {
  readonly persistence = "memory" as const;
  private readonly categories = new Map<string, MemCat[]>();
  private readonly recurring = new Map<string, MemRec[]>();
  private readonly exports = new Map<string, MemExp>();
  /** Injected expense reader for memory mode via closure set by module. */
  expenseReader?: (
    workspaceId: string,
    actorUserId: string,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      occurredOn: string;
      total: { amountMinor: string };
      visibility: string;
      categoryId?: string;
      status: string;
    }>
  >;

  async buildReport(
    workspaceId: string,
    actorUserId: string,
    from: string,
    to: string,
    groupBy: ReportGroupBy,
  ): Promise<WorkspaceReportResponse> {
    const expenses = (await this.expenseReader?.(workspaceId, actorUserId)) ?? [];
    return aggregateReport(workspaceId, expenses, from, to, groupBy, this.categories.get(workspaceId) ?? []);
  }

  async createExport(
    workspaceId: string,
    actorUserId: string,
    input: CreateReportExportRequest,
  ): Promise<ReportExportSummary & { csvBody?: string }> {
    const groupBy = input.groupBy ?? "day";
    const report = await this.buildReport(
      workspaceId,
      actorUserId,
      input.from,
      input.to,
      groupBy,
    );
    const expenses = (await this.expenseReader?.(workspaceId, actorUserId)) ?? [];
    const filtered = expenses.filter(
      (e) => e.occurredOn >= input.from && e.occurredOn <= input.to && e.status !== "reversed",
    );
    const header = "date,title,visibility,amount_toman,status";
    const lines = filtered.map(
      (e) =>
        `${e.occurredOn},${csvEscape(e.title)},${e.visibility},${Number(e.total.amountMinor) / 10},${e.status}`,
    );
    const csvBody = [header, ...lines].join("\n");
    const id = crypto.randomUUID();
    const summary: MemExp = {
      id,
      workspaceId,
      format: "csv",
      from: input.from,
      to: input.to,
      groupBy,
      status: "completed",
      rowCount: filtered.length,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      hasFile: true,
      csvBody,
    };
    this.exports.set(id, summary);
    void report;
    return summary;
  }

  async getExport(
    workspaceId: string,
    exportId: string,
    _actorUserId: string,
  ): Promise<(ReportExportSummary & { csvBody?: string }) | null> {
    const row = this.exports.get(exportId);
    if (!row || row.workspaceId !== workspaceId) return null;
    return row;
  }

  async listCategories(workspaceId: string): Promise<ExpenseCategorySummary[]> {
    return this.categories.get(workspaceId) ?? [];
  }

  async createCategory(
    workspaceId: string,
    _actorUserId: string,
    input: CreateExpenseCategoryRequest,
  ): Promise<ExpenseCategorySummary> {
    const slug =
      input.slug?.trim() ||
      input.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF]+/gi, "-")
        .replace(/^-|-$/g, "") ||
      `cat-${Date.now().toString(36)}`;
    const row: MemCat = {
      id: crypto.randomUUID(),
      workspaceId,
      name: input.name.trim(),
      slug,
      createdAt: new Date().toISOString(),
    };
    const list = this.categories.get(workspaceId) ?? [];
    list.push(row);
    this.categories.set(workspaceId, list);
    return row;
  }

  async listRecurring(workspaceId: string): Promise<RecurringRuleSummary[]> {
    return (this.recurring.get(workspaceId) ?? []).map(({ idempotencyKey: _, ...rest }) => rest);
  }

  async createRecurring(
    workspaceId: string,
    actorUserId: string,
    input: CreateRecurringRuleRequest,
  ): Promise<RecurringRuleSummary> {
    const list = this.recurring.get(workspaceId) ?? [];
    const existing = list.find((r) => r.idempotencyKey === input.idempotencyKey);
    if (existing) {
      const { idempotencyKey: _, ...rest } = existing;
      return rest;
    }
    const row: MemRec = {
      id: crypto.randomUUID(),
      workspaceId,
      title: input.title.trim(),
      amount: input.amount,
      cadence: input.cadence,
      nextRunOn: input.nextRunOn,
      visibility: input.visibility ?? "private",
      splitMethod: "equal",
      categoryId: input.categoryId,
      active: true,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    list.push(row);
    this.recurring.set(workspaceId, list);
    const { idempotencyKey: _, ...rest } = row;
    return rest;
  }

  async runRecurringDue(
    workspaceId: string,
    _actorUserId: string,
    today: string,
  ): Promise<{
    due: Array<{
      id: string;
      title: string;
      amount: { amountMinor: string; currency: "IRR" };
      visibility: "shared" | "private" | "company";
      categoryId?: string;
    }>;
  }> {
    const list = this.recurring.get(workspaceId) ?? [];
    const due: Array<{
      id: string;
      title: string;
      amount: { amountMinor: string; currency: "IRR" };
      visibility: "shared" | "private" | "company";
      categoryId?: string;
    }> = [];
    for (const rule of list) {
      if (!rule.active || rule.nextRunOn > today) continue;
      due.push({
        id: rule.id,
        title: rule.title,
        amount: { amountMinor: rule.amount.amountMinor, currency: "IRR" },
        visibility: rule.visibility,
        categoryId: rule.categoryId,
      });
      rule.nextRunOn = advanceDate(rule.nextRunOn, rule.cadence);
    }
    return { due };
  }
}

export class PostgresReportsStore implements ReportsStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresReportsStore {
    const { db } = createDatabase(connectionString);
    return new PostgresReportsStore(db);
  }

  async buildReport(
    workspaceId: string,
    actorUserId: string,
    from: string,
    to: string,
    groupBy: ReportGroupBy,
  ): Promise<WorkspaceReportResponse> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(expense)
        .where(
          and(
            eq(expense.workspaceId, workspaceId),
            gte(expense.occurredOn, from),
            lte(expense.occurredOn, to),
          ),
        );
      const cats = await tx
        .select()
        .from(expenseCategory)
        .where(eq(expenseCategory.workspaceId, workspaceId));
      return aggregateReport(
        workspaceId,
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          occurredOn: formatDate(row.occurredOn),
          total: { amountMinor: row.totalMinor.toString() },
          visibility: row.visibility,
          categoryId: row.categoryId ?? undefined,
          status: row.status,
        })),
        from,
        to,
        groupBy,
        cats.map((c) => ({
          id: c.id,
          workspaceId: c.workspaceId,
          name: c.name,
          slug: c.slug,
          createdAt: c.createdAt.toISOString(),
        })),
      );
    });
  }

  async createExport(
    workspaceId: string,
    actorUserId: string,
    input: CreateReportExportRequest,
  ): Promise<ReportExportSummary & { csvBody?: string }> {
    const groupBy = input.groupBy ?? "day";
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(expense)
        .where(
          and(
            eq(expense.workspaceId, workspaceId),
            gte(expense.occurredOn, input.from),
            lte(expense.occurredOn, input.to),
          ),
        );
      const filtered = rows.filter((r) => r.status !== "reversed");
      const header = "date,title,visibility,amount_toman,status,category_id";
      const lines = filtered.map(
        (e) =>
          `${formatDate(e.occurredOn)},${csvEscape(e.title)},${e.visibility},${Number(e.totalMinor) / 10},${e.status},${e.categoryId ?? ""}`,
      );
      const csvBody = [header, ...lines].join("\n");
      const inserted = await tx
        .insert(reportExport)
        .values({
          workspaceId,
          createdByUserId: actorUserId,
          format: "csv",
          fromOn: input.from,
          toOn: input.to,
          groupBy,
          status: "completed",
          rowCount: filtered.length,
          csvBody,
          completedAt: new Date(),
        })
        .returning();
      const row = inserted[0]!;
      return {
        id: row.id,
        workspaceId,
        format: "csv",
        from: formatDate(row.fromOn),
        to: formatDate(row.toOn),
        groupBy: groupBy,
        status: "completed",
        rowCount: row.rowCount,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString(),
        hasFile: true,
        csvBody,
      };
    });
  }

  async getExport(
    workspaceId: string,
    exportId: string,
    actorUserId: string,
  ): Promise<(ReportExportSummary & { csvBody?: string }) | null> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(reportExport)
        .where(and(eq(reportExport.id, exportId), eq(reportExport.workspaceId, workspaceId)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        format: "csv",
        from: formatDate(row.fromOn),
        to: formatDate(row.toOn),
        groupBy: row.groupBy as ReportGroupBy,
        status: row.status === "failed" ? "failed" : "completed",
        rowCount: row.rowCount,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString(),
        errorDetail: row.errorDetail ?? undefined,
        hasFile: Boolean(row.csvBody),
        csvBody: row.csvBody ?? undefined,
      };
    });
  }

  async listCategories(workspaceId: string, actorUserId: string): Promise<ExpenseCategorySummary[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(expenseCategory)
        .where(eq(expenseCategory.workspaceId, workspaceId));
      return rows.map((c) => ({
        id: c.id,
        workspaceId: c.workspaceId,
        name: c.name,
        slug: c.slug,
        createdAt: c.createdAt.toISOString(),
      }));
    });
  }

  async createCategory(
    workspaceId: string,
    actorUserId: string,
    input: CreateExpenseCategoryRequest,
  ): Promise<ExpenseCategorySummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const slug =
        input.slug?.trim() ||
        input.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\u0600-\u06FF]+/gi, "-")
          .replace(/^-|-$/g, "") ||
        `cat-${Date.now().toString(36)}`;
      const inserted = await tx
        .insert(expenseCategory)
        .values({ workspaceId, name: input.name.trim(), slug })
        .returning();
      const c = inserted[0]!;
      return {
        id: c.id,
        workspaceId: c.workspaceId,
        name: c.name,
        slug: c.slug,
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  async listRecurring(workspaceId: string, actorUserId: string): Promise<RecurringRuleSummary[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(recurringRule)
        .where(eq(recurringRule.workspaceId, workspaceId));
      return rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        title: r.title,
        amount: { amountMinor: r.amountMinor.toString(), currency: "IRR" as const },
        cadence: r.cadence as RecurringRuleSummary["cadence"],
        nextRunOn: formatDate(r.nextRunOn),
        visibility: r.visibility,
        splitMethod: "equal" as const,
        categoryId: r.categoryId ?? undefined,
        active: r.active,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  async createRecurring(
    workspaceId: string,
    actorUserId: string,
    input: CreateRecurringRuleRequest,
  ): Promise<RecurringRuleSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(recurringRule)
        .where(
          and(
            eq(recurringRule.workspaceId, workspaceId),
            eq(recurringRule.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) {
        const r = existing[0];
        return {
          id: r.id,
          workspaceId: r.workspaceId,
          title: r.title,
          amount: { amountMinor: r.amountMinor.toString(), currency: "IRR" as const },
          cadence: r.cadence as RecurringRuleSummary["cadence"],
          nextRunOn: formatDate(r.nextRunOn),
          visibility: r.visibility,
          splitMethod: "equal" as const,
          categoryId: r.categoryId ?? undefined,
          active: r.active,
          createdByUserId: r.createdByUserId,
          createdAt: r.createdAt.toISOString(),
        };
      }
      const inserted = await tx
        .insert(recurringRule)
        .values({
          workspaceId,
          title: input.title.trim(),
          amountMinor: BigInt(input.amount.amountMinor),
          cadence: input.cadence,
          nextRunOn: input.nextRunOn,
          visibility: input.visibility ?? "private",
          categoryId: input.categoryId ?? null,
          createdByUserId: actorUserId,
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const r = inserted[0]!;
      return {
        id: r.id,
        workspaceId: r.workspaceId,
        title: r.title,
        amount: { amountMinor: r.amountMinor.toString(), currency: "IRR" as const },
        cadence: r.cadence as RecurringRuleSummary["cadence"],
        nextRunOn: formatDate(r.nextRunOn),
        visibility: r.visibility,
        splitMethod: "equal" as const,
        categoryId: r.categoryId ?? undefined,
        active: r.active,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async runRecurringDue(
    workspaceId: string,
    actorUserId: string,
    today: string,
  ): Promise<{
    due: Array<{
      id: string;
      title: string;
      amount: { amountMinor: string; currency: "IRR" };
      visibility: "shared" | "private" | "company";
      categoryId?: string;
    }>;
  }> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(recurringRule)
        .where(and(eq(recurringRule.workspaceId, workspaceId), eq(recurringRule.active, true)));
      const due: Array<{
        id: string;
        title: string;
        amount: { amountMinor: string; currency: "IRR" };
        visibility: "shared" | "private" | "company";
        categoryId?: string;
      }> = [];
      for (const rule of rows) {
        const next = formatDate(rule.nextRunOn);
        if (next > today) continue;
        due.push({
          id: rule.id,
          title: rule.title,
          amount: { amountMinor: rule.amountMinor.toString(), currency: "IRR" },
          visibility: rule.visibility,
          categoryId: rule.categoryId ?? undefined,
        });
        const advanced = advanceDate(next, rule.cadence as RecurringRuleSummary["cadence"]);
        await tx
          .update(recurringRule)
          .set({ nextRunOn: advanced })
          .where(eq(recurringRule.id, rule.id));
      }
      return { due };
    });
  }
}

function advanceDate(iso: string, cadence: RecurringRuleSummary["cadence"]): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (cadence === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function aggregateReport(
  workspaceId: string,
  expenses: Array<{
    id: string;
    title: string;
    occurredOn: string;
    total: { amountMinor: string };
    visibility: string;
    categoryId?: string;
    status: string;
  }>,
  from: string,
  to: string,
  groupBy: ReportGroupBy,
  categories: ExpenseCategorySummary[],
): WorkspaceReportResponse {
  const filtered = expenses.filter(
    (e) => e.occurredOn >= from && e.occurredOn <= to && e.status !== "reversed",
  );
  const buckets = new Map<string, { label: string; total: bigint; count: number }>();
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "بدون دسته";

  for (const e of filtered) {
    let key: string;
    let label: string;
    if (groupBy === "visibility") {
      key = e.visibility;
      label = e.visibility;
    } else if (groupBy === "category") {
      key = e.categoryId ?? "none";
      label = catName(e.categoryId);
    } else if (groupBy === "year") {
      key = e.occurredOn.slice(0, 4);
      label = key;
    } else if (groupBy === "month") {
      key = e.occurredOn.slice(0, 7);
      label = key;
    } else if (groupBy === "week") {
      key = isoWeekKey(e.occurredOn);
      label = key;
    } else {
      key = e.occurredOn;
      label = e.occurredOn;
    }
    const prev = buckets.get(key) ?? { label, total: 0n, count: 0 };
    prev.total += BigInt(e.total.amountMinor);
    prev.count += 1;
    buckets.set(key, prev);
  }

  let grand = 0n;
  const bucketList = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => {
      grand += value.total;
      return {
        key,
        label: value.label,
        total: { amountMinor: value.total.toString(), currency: "IRR" as const },
        count: value.count,
      };
    });

  return {
    workspaceId,
    from,
    to,
    groupBy,
    grandTotal: { amountMinor: grand.toString(), currency: "IRR" },
    expenseCount: filtered.length,
    buckets: bucketList,
  };
}

function isoWeekKey(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function createReportsStore(expenseReader?: MemoryReportsStore["expenseReader"]): ReportsStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      return PostgresReportsStore.fromConnectionString(databaseUrl);
    } catch {
      /* fall through */
    }
  }
  const mem = new MemoryReportsStore();
  mem.expenseReader = expenseReader;
  return mem;
}
