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
  type PersonalFinanceExportSummary,
  type PersonalMoneyAccountSummary,
  type PersonalMoneyTxnKind,
  type PersonalMoneyTxnSummary,
  type PersonalResourcesSummary,
  type UpdatePersonalCategoryRequest,
  type UpdatePersonalMoneyAccountRequest,
  type UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import type { PersonalResourcesStore } from "./personal-resources.types.js";

type MemAccount = {
  id: string;
  ownerUserId: string;
  name: string;
  kind: CreatePersonalMoneyAccountRequest["kind"];
  openingBalanceMinor: bigint;
  archivedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
};

type MemTxn = {
  id: string;
  ownerUserId: string;
  accountId: string;
  kind: PersonalMoneyTxnKind;
  amountMinor: bigint;
  occurredOn: string;
  note?: string;
  categoryId?: string;
  transferGroupId?: string;
  linkedWorkspaceId?: string;
  linkedExpenseId?: string;
  linkedSettlementId?: string;
  idempotencyKey: string;
  createdAt: string;
};

type MemBudget = {
  id: string;
  ownerUserId: string;
  yearMonth: string;
  limitMinor: bigint;
  alertPercent: number;
  note?: string;
  idempotencyKey: string;
  createdAt: string;
};

type MemCategory = {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  idempotencyKey: string;
  createdAt: string;
};

type MemExport = PersonalFinanceExportSummary & {
  ownerUserId: string;
  idempotencyKey: string;
  csvBody?: string;
};

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

export class MemoryPersonalResourcesStore implements PersonalResourcesStore {
  readonly persistence = "memory" as const;
  private readonly accounts = new Map<string, MemAccount>();
  private readonly txns = new Map<string, MemTxn>();
  private readonly budgets = new Map<string, MemBudget>();
  private readonly categories = new Map<string, MemCategory>();
  private readonly exports = new Map<string, MemExport>();

  private mapAccount(row: MemAccount): PersonalMoneyAccountSummary {
    const related = [...this.txns.values()].filter(
      (t) => t.accountId === row.id && t.ownerUserId === row.ownerUserId,
    );
    const balance = computePersonalAccountBalance(
      row.openingBalanceMinor,
      related.map((t) => ({ kind: t.kind, amountMinor: t.amountMinor })),
    );
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      currency: "IRR",
      openingBalance: irrMoney(row.openingBalanceMinor),
      balance: irrMoney(balance),
      archived: Boolean(row.archivedAt),
      createdAt: row.createdAt,
    };
  }

  private mapTxn(row: MemTxn): PersonalMoneyTxnSummary {
    const category = row.categoryId ? this.categories.get(row.categoryId) : undefined;
    return {
      id: row.id,
      accountId: row.accountId,
      kind: row.kind,
      amount: irrMoney(row.amountMinor),
      occurredOn: row.occurredOn,
      note: row.note,
      categoryId: row.categoryId,
      categoryName: category?.name,
      transferGroupId: row.transferGroupId,
      linkedWorkspaceId: row.linkedWorkspaceId,
      linkedExpenseId: row.linkedExpenseId,
      linkedSettlementId: row.linkedSettlementId,
      createdAt: row.createdAt,
    };
  }

  private mapBudget(row: MemBudget): PersonalBudgetSummary {
    const spent = sumPersonalExpenseInMonth(
      [...this.txns.values()]
        .filter((t) => t.ownerUserId === row.ownerUserId)
        .map((t) => ({
          kind: t.kind,
          amountMinor: t.amountMinor,
          occurredOn: t.occurredOn,
        })),
      row.yearMonth,
    );
    return enrichPersonalBudgetSummary({
      id: row.id,
      yearMonth: row.yearMonth,
      limitMinor: row.limitMinor,
      spentMinor: spent,
      alertPercent: row.alertPercent,
      note: row.note,
      createdAt: row.createdAt,
    });
  }

  private mapCategory(row: MemCategory): PersonalCategorySummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt,
    };
  }

  private mapExport(row: MemExport): PersonalFinanceExportSummary & { csvBody?: string } {
    const { ownerUserId: _, idempotencyKey: __, ...summary } = row;
    return summary;
  }

  async listAccounts(
    ownerUserId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<PersonalMoneyAccountSummary[]> {
    return [...this.accounts.values()]
      .filter((a) => a.ownerUserId === ownerUserId)
      .filter((a) => (opts?.includeArchived ? true : !a.archivedAt))
      .map((a) => this.mapAccount(a))
      .sort((a, b) => a.name.localeCompare(b.name, "fa"));
  }

  async createAccount(
    ownerUserId: string,
    input: CreatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const existing = [...this.accounts.values()].find(
      (a) => a.ownerUserId === ownerUserId && a.idempotencyKey === key,
    );
    if (existing) return this.mapAccount(existing);

    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("ACCOUNT_NAME");
    if (input.openingBalance.currency !== "IRR") throw new Error("CURRENCY");
    const opening = assertMoneyNonNegative(input.openingBalance.amountMinor);
    const now = new Date().toISOString();
    const row: MemAccount = {
      id: crypto.randomUUID(),
      ownerUserId,
      name,
      kind: input.kind,
      openingBalanceMinor: opening,
      archivedAt: null,
      idempotencyKey: key,
      createdAt: now,
    };
    this.accounts.set(row.id, row);
    return this.mapAccount(row);
  }

  async updateAccount(
    ownerUserId: string,
    accountId: string,
    input: UpdatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    const row = this.accounts.get(accountId);
    if (!row || row.ownerUserId !== ownerUserId) throw new Error("ACCOUNT_NOT_FOUND");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 80) throw new Error("ACCOUNT_NAME");
      row.name = name;
    }
    if (input.archived === true) row.archivedAt = new Date().toISOString();
    if (input.archived === false) row.archivedAt = null;
    return this.mapAccount(row);
  }

  async listTxns(
    ownerUserId: string,
    opts: { accountId?: string; from?: string; to?: string; limit?: number },
  ): Promise<PersonalMoneyTxnSummary[]> {
    let rows = [...this.txns.values()].filter((t) => t.ownerUserId === ownerUserId);
    if (opts.accountId) rows = rows.filter((t) => t.accountId === opts.accountId);
    if (opts.from) rows = rows.filter((t) => t.occurredOn >= opts.from!);
    if (opts.to) rows = rows.filter((t) => t.occurredOn <= opts.to!);
    rows.sort((a, b) => {
      if (a.occurredOn !== b.occurredOn) return b.occurredOn.localeCompare(a.occurredOn);
      return b.createdAt.localeCompare(a.createdAt);
    });
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 200) : 100;
    return rows.slice(0, limit).map((t) => this.mapTxn(t));
  }

  async createTxn(
    ownerUserId: string,
    input: CreatePersonalMoneyTxnRequest,
  ): Promise<PersonalMoneyTxnSummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const existing = [...this.txns.values()].find(
      (t) => t.ownerUserId === ownerUserId && t.idempotencyKey === key,
    );
    if (existing) return this.mapTxn(existing);

    const account = this.accounts.get(input.accountId);
    if (!account || account.ownerUserId !== ownerUserId) throw new Error("ACCOUNT_NOT_FOUND");
    if (account.archivedAt) throw new Error("ACCOUNT_ARCHIVED");
    if (input.amount.currency !== "IRR") throw new Error("CURRENCY");
    assertDate(input.occurredOn);
    const amount = assertMoneyPositive(input.amount.amountMinor);
    const categoryId = input.categoryId?.trim() || undefined;
    if (categoryId) {
      const cat = this.categories.get(categoryId);
      if (!cat || cat.ownerUserId !== ownerUserId) throw new Error("CATEGORY_NOT_FOUND");
    }
    const now = new Date().toISOString();
    const row: MemTxn = {
      id: crypto.randomUUID(),
      ownerUserId,
      accountId: input.accountId,
      kind: input.kind,
      amountMinor: amount,
      occurredOn: input.occurredOn,
      note: input.note?.trim() || undefined,
      categoryId,
      linkedWorkspaceId: input.linkedWorkspaceId,
      linkedExpenseId: input.linkedExpenseId,
      linkedSettlementId: input.linkedSettlementId,
      idempotencyKey: key,
      createdAt: now,
    };
    this.txns.set(row.id, row);
    return this.mapTxn(row);
  }

  async createTransfer(
    ownerUserId: string,
    input: CreatePersonalTransferRequest,
  ): Promise<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const existingOut = [...this.txns.values()].find(
      (t) => t.ownerUserId === ownerUserId && t.idempotencyKey === key,
    );
    if (existingOut?.transferGroupId) {
      const pair = [...this.txns.values()].find(
        (t) =>
          t.transferGroupId === existingOut.transferGroupId &&
          t.id !== existingOut.id &&
          t.ownerUserId === ownerUserId,
      );
      if (pair) {
        const out = existingOut.kind === "transfer_out" ? existingOut : pair;
        const inn = existingOut.kind === "transfer_in" ? existingOut : pair;
        return { out: this.mapTxn(out), in: this.mapTxn(inn) };
      }
    }

    if (input.fromAccountId === input.toAccountId) throw new Error("TRANSFER_SAME");
    const from = this.accounts.get(input.fromAccountId);
    const to = this.accounts.get(input.toAccountId);
    if (!from || from.ownerUserId !== ownerUserId) throw new Error("ACCOUNT_NOT_FOUND");
    if (!to || to.ownerUserId !== ownerUserId) throw new Error("ACCOUNT_NOT_FOUND");
    if (from.archivedAt || to.archivedAt) throw new Error("ACCOUNT_ARCHIVED");
    if (input.amount.currency !== "IRR") throw new Error("CURRENCY");
    assertDate(input.occurredOn);
    const amount = assertMoneyPositive(input.amount.amountMinor);
    const groupId = crypto.randomUUID();
    const now = new Date().toISOString();
    const out: MemTxn = {
      id: crypto.randomUUID(),
      ownerUserId,
      accountId: from.id,
      kind: "transfer_out",
      amountMinor: amount,
      occurredOn: input.occurredOn,
      note: input.note?.trim() || undefined,
      transferGroupId: groupId,
      idempotencyKey: key,
      createdAt: now,
    };
    const inn: MemTxn = {
      id: crypto.randomUUID(),
      ownerUserId,
      accountId: to.id,
      kind: "transfer_in",
      amountMinor: amount,
      occurredOn: input.occurredOn,
      note: input.note?.trim() || undefined,
      transferGroupId: groupId,
      idempotencyKey: `${key}:in`,
      createdAt: now,
    };
    this.txns.set(out.id, out);
    this.txns.set(inn.id, inn);
    return { out: this.mapTxn(out), in: this.mapTxn(inn) };
  }

  async listBudgets(ownerUserId: string): Promise<PersonalBudgetSummary[]> {
    return [...this.budgets.values()]
      .filter((b) => b.ownerUserId === ownerUserId)
      .map((b) => this.mapBudget(b))
      .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
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

    const byKey = [...this.budgets.values()].find(
      (b) => b.ownerUserId === ownerUserId && b.idempotencyKey === key,
    );
    if (byKey) return this.mapBudget(byKey);

    const existing = [...this.budgets.values()].find(
      (b) => b.ownerUserId === ownerUserId && b.yearMonth === input.yearMonth,
    );
    if (existing) {
      existing.limitMinor = limit;
      existing.alertPercent = alertPercent;
      existing.note = input.note?.trim() || undefined;
      return this.mapBudget(existing);
    }

    const row: MemBudget = {
      id: crypto.randomUUID(),
      ownerUserId,
      yearMonth: input.yearMonth,
      limitMinor: limit,
      alertPercent,
      note: input.note?.trim() || undefined,
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    this.budgets.set(row.id, row);
    return this.mapBudget(row);
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
    return [...this.categories.values()]
      .filter((c) => c.ownerUserId === ownerUserId)
      .map((c) => this.mapCategory(c))
      .sort((a, b) => a.name.localeCompare(b.name, "fa"));
  }

  async createCategory(
    ownerUserId: string,
    input: CreatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const byKey = [...this.categories.values()].find(
      (c) => c.ownerUserId === ownerUserId && c.idempotencyKey === key,
    );
    if (byKey) return this.mapCategory(byKey);
    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("CATEGORY_NAME");
    const slug = (input.slug?.trim() || slugifyPersonalCategory(name)).slice(0, 48);
    if (!slug) throw new Error("CATEGORY_NAME");
    const clash = [...this.categories.values()].find(
      (c) => c.ownerUserId === ownerUserId && c.slug === slug,
    );
    if (clash) throw new Error("CATEGORY_SLUG");
    const row: MemCategory = {
      id: crypto.randomUUID(),
      ownerUserId,
      name,
      slug,
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    this.categories.set(row.id, row);
    return this.mapCategory(row);
  }

  async updateCategory(
    ownerUserId: string,
    categoryId: string,
    input: UpdatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    const row = this.categories.get(categoryId);
    if (!row || row.ownerUserId !== ownerUserId) throw new Error("CATEGORY_NOT_FOUND");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 80) throw new Error("CATEGORY_NAME");
      row.name = name;
    }
    if (input.slug !== undefined) {
      const slug = input.slug.trim().slice(0, 48);
      if (!slug) throw new Error("CATEGORY_NAME");
      const clash = [...this.categories.values()].find(
        (c) => c.ownerUserId === ownerUserId && c.slug === slug && c.id !== categoryId,
      );
      if (clash) throw new Error("CATEGORY_SLUG");
      row.slug = slug;
    }
    return this.mapCategory(row);
  }

  async deleteCategory(ownerUserId: string, categoryId: string): Promise<void> {
    const row = this.categories.get(categoryId);
    if (!row || row.ownerUserId !== ownerUserId) throw new Error("CATEGORY_NOT_FOUND");
    for (const txn of this.txns.values()) {
      if (txn.categoryId === categoryId) txn.categoryId = undefined;
    }
    this.categories.delete(categoryId);
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
    const existing = [...this.exports.values()].find(
      (e) => e.ownerUserId === ownerUserId && e.idempotencyKey === key,
    );
    if (existing) return this.mapExport(existing);

    const now = new Date().toISOString();
    try {
      let csvBody: string;
      let rowCount: number;
      if (input.kind === "transactions") {
        const accounts = new Map(
          [...this.accounts.values()]
            .filter((a) => a.ownerUserId === ownerUserId)
            .map((a) => [a.id, a.name]),
        );
        const rows = [...this.txns.values()]
          .filter((t) => t.ownerUserId === ownerUserId)
          .filter((t) => t.occurredOn >= input.from && t.occurredOn <= input.to)
          .map((t) => ({
            occurredOn: t.occurredOn,
            kind: t.kind,
            accountName: accounts.get(t.accountId) ?? t.accountId,
            categoryName: t.categoryId
              ? this.categories.get(t.categoryId)?.name
              : undefined,
            amountMinor: t.amountMinor.toString(),
            note: t.note,
          }));
        csvBody = buildPersonalTransactionsCsv(rows);
        rowCount = rows.length;
      } else {
        const built = await buildCsv();
        csvBody = built.csvBody;
        rowCount = built.rowCount;
      }
      const row: MemExport = {
        id: crypto.randomUUID(),
        ownerUserId,
        kind: input.kind,
        from: input.from,
        to: input.to,
        status: "completed",
        rowCount,
        createdAt: now,
        completedAt: now,
        hasFile: true,
        idempotencyKey: key,
        csvBody,
      };
      this.exports.set(row.id, row);
      return this.mapExport(row);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "EXPORT_FAILED";
      const row: MemExport = {
        id: crypto.randomUUID(),
        ownerUserId,
        kind: input.kind,
        from: input.from,
        to: input.to,
        status: "failed",
        rowCount: 0,
        createdAt: now,
        completedAt: now,
        errorDetail: detail,
        hasFile: false,
        idempotencyKey: key,
      };
      this.exports.set(row.id, row);
      return this.mapExport(row);
    }
  }

  async getExport(
    ownerUserId: string,
    exportId: string,
  ): Promise<(PersonalFinanceExportSummary & { csvBody?: string }) | null> {
    const row = this.exports.get(exportId);
    if (!row || row.ownerUserId !== ownerUserId) return null;
    return this.mapExport(row);
  }

  async listExports(
    ownerUserId: string,
    limit?: number,
  ): Promise<PersonalFinanceExportSummary[]> {
    const rows = [...this.exports.values()]
      .filter((e) => e.ownerUserId === ownerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const n = limit && limit > 0 ? Math.min(limit, 50) : 20;
    return rows.slice(0, n).map((e) => {
      const { csvBody: _, ...summary } = this.mapExport(e);
      return summary;
    });
  }
}
