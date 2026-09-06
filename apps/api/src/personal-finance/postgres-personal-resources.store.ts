import {
  and,
  createDatabase,
  eq,
  gte,
  lte,
  moneyAccount,
  moneyTxn,
  personalBudget,
  personalCategory,
  personalFinanceExport,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import {
  buildPersonalTransactionsCsv,
  computePersonalAccountBalance,
  enrichPersonalBudgetSummary,
  irrMoney,
  normalizePersonalBudgetAlertPercent,
  slugifyPersonalCategory,
  sumPersonalExpenseInMonth,
  type CreatePersonalCategoryRequest,
  type CreatePersonalFinanceExportRequest,
  type CreatePersonalMoneyAccountRequest,
  type CreatePersonalMoneyTxnRequest,
  type CreatePersonalTransferRequest,
  type PersonalBudgetSummary,
  type PersonalCategorySummary,
  type PersonalFinanceExportKind,
  type PersonalFinanceExportSummary,
  type PersonalMoneyAccountSummary,
  type PersonalMoneyTxnSummary,
  type PersonalResourcesSummary,
  type UpdatePersonalCategoryRequest,
  type UpdatePersonalMoneyAccountRequest,
  type UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import type { PersonalResourcesStore } from "./personal-resources.types.js";

function formatDate(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function assertMoneyPositive(amountMinor: string): bigint {
  if (!/^\d+$/.test(amountMinor)) throw new Error("MONEY_AMOUNT");
  const value = BigInt(amountMinor);
  if (value <= 0n) throw new Error("MONEY_AMOUNT");
  return value;
}

function assertMoneyNonNegative(amountMinor: string): bigint {
  if (!/^-?\d+$/.test(amountMinor)) throw new Error("MONEY_AMOUNT");
  const value = BigInt(amountMinor);
  if (value < 0n) throw new Error("MONEY_AMOUNT");
  return value;
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("DATE");
}

function assertYearMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("YEAR_MONTH");
}

export class PostgresPersonalResourcesStore implements PersonalResourcesStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresPersonalResourcesStore {
    const { db } = createDatabase(connectionString);
    return new PostgresPersonalResourcesStore(db);
  }

  private async mapAccount(
    tx: AppDatabase,
    row: typeof moneyAccount.$inferSelect,
  ): Promise<PersonalMoneyAccountSummary> {
    const txns = await tx.select().from(moneyTxn).where(eq(moneyTxn.accountId, row.id));
    const balance = computePersonalAccountBalance(
      row.openingBalanceMinor,
      txns.map((t) => ({
        kind: t.kind,
        amountMinor: t.amountMinor,
      })),
    );
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      currency: "IRR",
      openingBalance: irrMoney(row.openingBalanceMinor),
      balance: irrMoney(balance),
      archived: Boolean(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async mapTxn(
    tx: AppDatabase,
    row: typeof moneyTxn.$inferSelect,
  ): Promise<PersonalMoneyTxnSummary> {
    let categoryName: string | undefined;
    if (row.categoryId) {
      const cats = await tx
        .select()
        .from(personalCategory)
        .where(eq(personalCategory.id, row.categoryId))
        .limit(1);
      categoryName = cats[0]?.name;
    }
    return {
      id: row.id,
      accountId: row.accountId,
      kind: row.kind,
      amount: irrMoney(row.amountMinor),
      occurredOn: formatDate(row.occurredOn),
      note: row.note ?? undefined,
      categoryId: row.categoryId ?? undefined,
      categoryName,
      transferGroupId: row.transferGroupId ?? undefined,
      linkedWorkspaceId: row.linkedWorkspaceId ?? undefined,
      linkedExpenseId: row.linkedExpenseId ?? undefined,
      linkedSettlementId: row.linkedSettlementId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async mapBudget(
    tx: AppDatabase,
    row: typeof personalBudget.$inferSelect,
  ): Promise<PersonalBudgetSummary> {
    const txns = await tx
      .select()
      .from(moneyTxn)
      .where(eq(moneyTxn.ownerUserId, row.ownerUserId));
    const spent = sumPersonalExpenseInMonth(
      txns.map((t) => ({
        kind: t.kind,
        amountMinor: t.amountMinor,
        occurredOn: formatDate(t.occurredOn),
      })),
      row.yearMonth,
    );
    return enrichPersonalBudgetSummary({
      id: row.id,
      yearMonth: row.yearMonth,
      limitMinor: row.limitMinor,
      spentMinor: spent,
      alertPercent: row.alertPercent ?? 80,
      note: row.note ?? undefined,
      createdAt: row.createdAt.toISOString(),
    });
  }

  private mapCategory(row: typeof personalCategory.$inferSelect): PersonalCategorySummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapExport(
    row: typeof personalFinanceExport.$inferSelect,
  ): PersonalFinanceExportSummary & { csvBody?: string } {
    return {
      id: row.id,
      kind: row.kind as PersonalFinanceExportKind,
      from: formatDate(row.fromOn),
      to: formatDate(row.toOn),
      status: row.status as "completed" | "failed",
      rowCount: row.rowCount,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      errorDetail: row.errorDetail ?? undefined,
      hasFile: Boolean(row.csvBody) && row.status === "completed",
      csvBody: row.csvBody ?? undefined,
    };
  }

  async listAccounts(
    ownerUserId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<PersonalMoneyAccountSummary[]> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(moneyAccount)
        .where(eq(moneyAccount.ownerUserId, ownerUserId));
      const filtered = opts?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt == null);
      const mapped = await Promise.all(filtered.map((r) => this.mapAccount(tx, r)));
      return mapped.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    });
  }

  async createAccount(
    ownerUserId: string,
    input: CreatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("ACCOUNT_NAME");
    if (input.openingBalance.currency !== "IRR") throw new Error("CURRENCY");
    const opening = assertMoneyNonNegative(input.openingBalance.amountMinor);

    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(moneyAccount)
        .where(
          and(
            eq(moneyAccount.ownerUserId, ownerUserId),
            eq(moneyAccount.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (existing[0]) return this.mapAccount(tx, existing[0]);

      const inserted = await tx
        .insert(moneyAccount)
        .values({
          ownerUserId,
          name,
          kind: input.kind,
          currency: "IRR",
          openingBalanceMinor: opening,
          idempotencyKey: key,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("ACCOUNT_INSERT_FAILED");
      return this.mapAccount(tx, row);
    });
  }

  async updateAccount(
    ownerUserId: string,
    accountId: string,
    input: UpdatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(moneyAccount)
        .where(
          and(eq(moneyAccount.id, accountId), eq(moneyAccount.ownerUserId, ownerUserId)),
        )
        .limit(1);
      const row = existing[0];
      if (!row) throw new Error("ACCOUNT_NOT_FOUND");

      const name =
        input.name !== undefined
          ? (() => {
              const n = input.name.trim();
              if (!n || n.length > 80) throw new Error("ACCOUNT_NAME");
              return n;
            })()
          : row.name;
      const archivedAt =
        input.archived === true
          ? new Date()
          : input.archived === false
            ? null
            : row.archivedAt;

      const updated = await tx
        .update(moneyAccount)
        .set({ name, archivedAt, updatedAt: new Date() })
        .where(eq(moneyAccount.id, accountId))
        .returning();
      const next = updated[0];
      if (!next) throw new Error("ACCOUNT_UPDATE_FAILED");
      return this.mapAccount(tx, next);
    });
  }

  async listTxns(
    ownerUserId: string,
    opts: { accountId?: string; from?: string; to?: string; limit?: number },
  ): Promise<PersonalMoneyTxnSummary[]> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const conditions = [eq(moneyTxn.ownerUserId, ownerUserId)];
      if (opts.accountId) conditions.push(eq(moneyTxn.accountId, opts.accountId));
      if (opts.from) conditions.push(gte(moneyTxn.occurredOn, opts.from));
      if (opts.to) conditions.push(lte(moneyTxn.occurredOn, opts.to));
      const rows = await tx.select().from(moneyTxn).where(and(...conditions));
      rows.sort((a, b) => {
        const da = formatDate(a.occurredOn);
        const db = formatDate(b.occurredOn);
        if (da !== db) return db.localeCompare(da);
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 200) : 100;
      return Promise.all(rows.slice(0, limit).map((r) => this.mapTxn(tx, r)));
    });
  }

  async createTxn(
    ownerUserId: string,
    input: CreatePersonalMoneyTxnRequest,
  ): Promise<PersonalMoneyTxnSummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    if (input.amount.currency !== "IRR") throw new Error("CURRENCY");
    assertDate(input.occurredOn);
    const amount = assertMoneyPositive(input.amount.amountMinor);

    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(moneyTxn)
        .where(and(eq(moneyTxn.ownerUserId, ownerUserId), eq(moneyTxn.idempotencyKey, key)))
        .limit(1);
      if (existing[0]) return this.mapTxn(tx, existing[0]);

      const accounts = await tx
        .select()
        .from(moneyAccount)
        .where(
          and(
            eq(moneyAccount.id, input.accountId),
            eq(moneyAccount.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      const account = accounts[0];
      if (!account) throw new Error("ACCOUNT_NOT_FOUND");
      if (account.archivedAt) throw new Error("ACCOUNT_ARCHIVED");

      const categoryId = input.categoryId?.trim() || null;
      if (categoryId) {
        const cats = await tx
          .select()
          .from(personalCategory)
          .where(
            and(
              eq(personalCategory.id, categoryId),
              eq(personalCategory.ownerUserId, ownerUserId),
            ),
          )
          .limit(1);
        if (!cats[0]) throw new Error("CATEGORY_NOT_FOUND");
      }

      const inserted = await tx
        .insert(moneyTxn)
        .values({
          ownerUserId,
          accountId: input.accountId,
          kind: input.kind,
          amountMinor: amount,
          currency: "IRR",
          occurredOn: input.occurredOn,
          note: input.note?.trim() || null,
          categoryId,
          linkedWorkspaceId: input.linkedWorkspaceId || null,
          linkedExpenseId: input.linkedExpenseId || null,
          linkedSettlementId: input.linkedSettlementId || null,
          idempotencyKey: key,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("TXN_INSERT_FAILED");
      return this.mapTxn(tx, row);
    });
  }

  async createTransfer(
    ownerUserId: string,
    input: CreatePersonalTransferRequest,
  ): Promise<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    if (input.fromAccountId === input.toAccountId) throw new Error("TRANSFER_SAME");
    if (input.amount.currency !== "IRR") throw new Error("CURRENCY");
    assertDate(input.occurredOn);
    const amount = assertMoneyPositive(input.amount.amountMinor);

    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(moneyTxn)
        .where(and(eq(moneyTxn.ownerUserId, ownerUserId), eq(moneyTxn.idempotencyKey, key)))
        .limit(1);
      if (existing[0]?.transferGroupId) {
        const pair = await tx
          .select()
          .from(moneyTxn)
          .where(eq(moneyTxn.transferGroupId, existing[0].transferGroupId));
        const out = pair.find((p) => p.kind === "transfer_out");
        const inn = pair.find((p) => p.kind === "transfer_in");
        if (out && inn) {
          return {
            out: await this.mapTxn(tx, out),
            in: await this.mapTxn(tx, inn),
          };
        }
      }

      const fromRows = await tx
        .select()
        .from(moneyAccount)
        .where(
          and(
            eq(moneyAccount.id, input.fromAccountId),
            eq(moneyAccount.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      const toRows = await tx
        .select()
        .from(moneyAccount)
        .where(
          and(
            eq(moneyAccount.id, input.toAccountId),
            eq(moneyAccount.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      const from = fromRows[0];
      const to = toRows[0];
      if (!from || !to) throw new Error("ACCOUNT_NOT_FOUND");
      if (from.archivedAt || to.archivedAt) throw new Error("ACCOUNT_ARCHIVED");

      const groupId = crypto.randomUUID();
      const note = input.note?.trim() || null;
      const inserted = await tx
        .insert(moneyTxn)
        .values([
          {
            ownerUserId,
            accountId: from.id,
            kind: "transfer_out",
            amountMinor: amount,
            currency: "IRR",
            occurredOn: input.occurredOn,
            note,
            transferGroupId: groupId,
            idempotencyKey: key,
          },
          {
            ownerUserId,
            accountId: to.id,
            kind: "transfer_in",
            amountMinor: amount,
            currency: "IRR",
            occurredOn: input.occurredOn,
            note,
            transferGroupId: groupId,
            idempotencyKey: `${key}:in`,
          },
        ])
        .returning();
      const out = inserted.find((r) => r.kind === "transfer_out");
      const inn = inserted.find((r) => r.kind === "transfer_in");
      if (!out || !inn) throw new Error("TRANSFER_INSERT_FAILED");
      return {
        out: await this.mapTxn(tx, out),
        in: await this.mapTxn(tx, inn),
      };
    });
  }

  async listBudgets(ownerUserId: string): Promise<PersonalBudgetSummary[]> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(personalBudget)
        .where(eq(personalBudget.ownerUserId, ownerUserId));
      const mapped = await Promise.all(rows.map((r) => this.mapBudget(tx, r)));
      return mapped.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    });
  }

  async upsertBudget(
    ownerUserId: string,
    input: UpsertPersonalBudgetRequest,
  ): Promise<PersonalBudgetSummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    assertYearMonth(input.yearMonth);
    if (input.limit.currency !== "IRR") throw new Error("CURRENCY");
    const limit = assertMoneyPositive(input.limit.amountMinor);
    const alertPercent = normalizePersonalBudgetAlertPercent(input.alertPercent);
    const note = input.note?.trim() || null;

    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const byKey = await tx
        .select()
        .from(personalBudget)
        .where(
          and(
            eq(personalBudget.ownerUserId, ownerUserId),
            eq(personalBudget.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (byKey[0]) return this.mapBudget(tx, byKey[0]);

      const byMonth = await tx
        .select()
        .from(personalBudget)
        .where(
          and(
            eq(personalBudget.ownerUserId, ownerUserId),
            eq(personalBudget.yearMonth, input.yearMonth),
          ),
        )
        .limit(1);
      if (byMonth[0]) {
        const updated = await tx
          .update(personalBudget)
          .set({
            limitMinor: limit,
            alertPercent,
            note,
            updatedAt: new Date(),
          })
          .where(eq(personalBudget.id, byMonth[0].id))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("BUDGET_UPDATE_FAILED");
        return this.mapBudget(tx, row);
      }

      const inserted = await tx
        .insert(personalBudget)
        .values({
          ownerUserId,
          yearMonth: input.yearMonth,
          limitMinor: limit,
          currency: "IRR",
          alertPercent,
          note,
          idempotencyKey: key,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("BUDGET_INSERT_FAILED");
      return this.mapBudget(tx, row);
    });
  }

  async resourcesSummary(
    ownerUserId: string,
    yearMonth: string,
  ): Promise<PersonalResourcesSummary> {
    assertYearMonth(yearMonth);
    const accounts = await this.listAccounts(ownerUserId, { includeArchived: true });
    const active = accounts.filter((a) => !a.archived);
    let total = 0n;
    for (const account of active) {
      total += BigInt(account.balance.amountMinor);
    }
    const budgets = await this.listBudgets(ownerUserId);
    return {
      currency: "IRR",
      totalBalance: irrMoney(total),
      accountCount: accounts.length,
      activeAccountCount: active.length,
      currentMonthBudget: budgets.find((b) => b.yearMonth === yearMonth),
      persistence: this.persistence,
    };
  }

  async listCategories(ownerUserId: string): Promise<PersonalCategorySummary[]> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(personalCategory)
        .where(eq(personalCategory.ownerUserId, ownerUserId));
      return rows
        .map((r) => this.mapCategory(r))
        .sort((a, b) => a.name.localeCompare(b.name, "fa"));
    });
  }

  async createCategory(
    ownerUserId: string,
    input: CreatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("CATEGORY_NAME");
    const slug = (input.slug?.trim() || slugifyPersonalCategory(name)).slice(0, 48);
    if (!slug) throw new Error("CATEGORY_NAME");

    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const byKey = await tx
        .select()
        .from(personalCategory)
        .where(
          and(
            eq(personalCategory.ownerUserId, ownerUserId),
            eq(personalCategory.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (byKey[0]) return this.mapCategory(byKey[0]);

      const clash = await tx
        .select()
        .from(personalCategory)
        .where(
          and(
            eq(personalCategory.ownerUserId, ownerUserId),
            eq(personalCategory.slug, slug),
          ),
        )
        .limit(1);
      if (clash[0]) throw new Error("CATEGORY_SLUG");

      const inserted = await tx
        .insert(personalCategory)
        .values({
          ownerUserId,
          name,
          slug,
          idempotencyKey: key,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("CATEGORY_INSERT_FAILED");
      return this.mapCategory(row);
    });
  }

  async updateCategory(
    ownerUserId: string,
    categoryId: string,
    input: UpdatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(personalCategory)
        .where(
          and(
            eq(personalCategory.id, categoryId),
            eq(personalCategory.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      const row = existing[0];
      if (!row) throw new Error("CATEGORY_NOT_FOUND");

      const name =
        input.name !== undefined
          ? (() => {
              const n = input.name.trim();
              if (!n || n.length > 80) throw new Error("CATEGORY_NAME");
              return n;
            })()
          : row.name;
      const slug =
        input.slug !== undefined
          ? (() => {
              const s = input.slug.trim().slice(0, 48);
              if (!s) throw new Error("CATEGORY_NAME");
              return s;
            })()
          : row.slug;

      if (slug !== row.slug) {
        const clash = await tx
          .select()
          .from(personalCategory)
          .where(
            and(
              eq(personalCategory.ownerUserId, ownerUserId),
              eq(personalCategory.slug, slug),
            ),
          )
          .limit(1);
        if (clash[0] && clash[0].id !== categoryId) throw new Error("CATEGORY_SLUG");
      }

      const updated = await tx
        .update(personalCategory)
        .set({ name, slug })
        .where(eq(personalCategory.id, categoryId))
        .returning();
      const next = updated[0];
      if (!next) throw new Error("CATEGORY_UPDATE_FAILED");
      return this.mapCategory(next);
    });
  }

  async deleteCategory(ownerUserId: string, categoryId: string): Promise<void> {
    await withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(personalCategory)
        .where(
          and(
            eq(personalCategory.id, categoryId),
            eq(personalCategory.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!existing[0]) throw new Error("CATEGORY_NOT_FOUND");
      await tx
        .update(moneyTxn)
        .set({ categoryId: null })
        .where(eq(moneyTxn.categoryId, categoryId));
      await tx.delete(personalCategory).where(eq(personalCategory.id, categoryId));
    });
  }

  async createExport(
    ownerUserId: string,
    input: CreatePersonalFinanceExportRequest,
    buildCsv: () => Promise<{ csvBody: string; rowCount: number }>,
  ): Promise<PersonalFinanceExportSummary & { csvBody?: string }> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    assertDate(input.from);
    assertDate(input.to);
    if (input.from > input.to) throw new Error("DATE_RANGE");
    if (input.kind !== "transactions" && input.kind !== "overview") {
      throw new Error("EXPORT_KIND");
    }

    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(personalFinanceExport)
        .where(
          and(
            eq(personalFinanceExport.ownerUserId, ownerUserId),
            eq(personalFinanceExport.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (existing[0]) return this.mapExport(existing[0]);

      try {
        let csvBody: string;
        let rowCount: number;
        if (input.kind === "transactions") {
          const accounts = await tx
            .select()
            .from(moneyAccount)
            .where(eq(moneyAccount.ownerUserId, ownerUserId));
          const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
          const cats = await tx
            .select()
            .from(personalCategory)
            .where(eq(personalCategory.ownerUserId, ownerUserId));
          const catNames = new Map(cats.map((c) => [c.id, c.name]));
          const txns = await tx
            .select()
            .from(moneyTxn)
            .where(
              and(
                eq(moneyTxn.ownerUserId, ownerUserId),
                gte(moneyTxn.occurredOn, input.from),
                lte(moneyTxn.occurredOn, input.to),
              ),
            );
          const rows = txns.map((t) => ({
            occurredOn: formatDate(t.occurredOn),
            kind: t.kind,
            accountName: accountNames.get(t.accountId) ?? t.accountId,
            categoryName: t.categoryId ? catNames.get(t.categoryId) : undefined,
            amountMinor: t.amountMinor.toString(),
            note: t.note ?? undefined,
          }));
          csvBody = buildPersonalTransactionsCsv(rows);
          rowCount = rows.length;
        } else {
          const built = await buildCsv();
          csvBody = built.csvBody;
          rowCount = built.rowCount;
        }

        const inserted = await tx
          .insert(personalFinanceExport)
          .values({
            ownerUserId,
            kind: input.kind,
            fromOn: input.from,
            toOn: input.to,
            status: "completed",
            rowCount,
            csvBody,
            idempotencyKey: key,
            completedAt: new Date(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("EXPORT_INSERT_FAILED");
        return this.mapExport(row);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : "EXPORT_FAILED";
        const inserted = await tx
          .insert(personalFinanceExport)
          .values({
            ownerUserId,
            kind: input.kind,
            fromOn: input.from,
            toOn: input.to,
            status: "failed",
            rowCount: 0,
            errorDetail: detail,
            idempotencyKey: key,
            completedAt: new Date(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw error;
        return this.mapExport(row);
      }
    });
  }

  async getExport(
    ownerUserId: string,
    exportId: string,
  ): Promise<(PersonalFinanceExportSummary & { csvBody?: string }) | null> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(personalFinanceExport)
        .where(
          and(
            eq(personalFinanceExport.id, exportId),
            eq(personalFinanceExport.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      return rows[0] ? this.mapExport(rows[0]) : null;
    });
  }

  async listExports(
    ownerUserId: string,
    limit?: number,
  ): Promise<PersonalFinanceExportSummary[]> {
    return withTenantContext(this.db, { userId: ownerUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(personalFinanceExport)
        .where(eq(personalFinanceExport.ownerUserId, ownerUserId));
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const n = limit && limit > 0 ? Math.min(limit, 50) : 20;
      return rows.slice(0, n).map((r) => {
        const { csvBody: _, ...summary } = this.mapExport(r);
        return summary;
      });
    });
  }
}
