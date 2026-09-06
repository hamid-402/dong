import type {
  CreatePersonalCategoryRequest,
  CreatePersonalFinanceExportRequest,
  CreatePersonalMoneyAccountRequest,
  CreatePersonalMoneyTxnRequest,
  CreatePersonalTransferRequest,
  PersonalBudgetSummary,
  PersonalCategorySummary,
  PersonalFinanceExportSummary,
  PersonalMoneyAccountSummary,
  PersonalMoneyTxnSummary,
  PersonalResourcesSummary,
  UpdatePersonalCategoryRequest,
  UpdatePersonalMoneyAccountRequest,
  UpsertPersonalBudgetRequest,
} from "@dang/contracts";

export type PersonalResourcesStore = {
  readonly persistence: "memory" | "postgres";
  listAccounts(
    ownerUserId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<PersonalMoneyAccountSummary[]>;
  createAccount(
    ownerUserId: string,
    input: CreatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary>;
  updateAccount(
    ownerUserId: string,
    accountId: string,
    input: UpdatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary>;
  listTxns(
    ownerUserId: string,
    opts: { accountId?: string; from?: string; to?: string; limit?: number },
  ): Promise<PersonalMoneyTxnSummary[]>;
  createTxn(
    ownerUserId: string,
    input: CreatePersonalMoneyTxnRequest,
  ): Promise<PersonalMoneyTxnSummary>;
  createTransfer(
    ownerUserId: string,
    input: CreatePersonalTransferRequest,
  ): Promise<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }>;
  listBudgets(ownerUserId: string): Promise<PersonalBudgetSummary[]>;
  upsertBudget(
    ownerUserId: string,
    input: UpsertPersonalBudgetRequest,
  ): Promise<PersonalBudgetSummary>;
  resourcesSummary(ownerUserId: string, yearMonth: string): Promise<PersonalResourcesSummary>;
  listCategories(ownerUserId: string): Promise<PersonalCategorySummary[]>;
  createCategory(
    ownerUserId: string,
    input: CreatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary>;
  updateCategory(
    ownerUserId: string,
    categoryId: string,
    input: UpdatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary>;
  deleteCategory(ownerUserId: string, categoryId: string): Promise<void>;
  createExport(
    ownerUserId: string,
    input: CreatePersonalFinanceExportRequest,
    buildCsv: () => Promise<{ csvBody: string; rowCount: number }>,
  ): Promise<PersonalFinanceExportSummary & { csvBody?: string }>;
  getExport(
    ownerUserId: string,
    exportId: string,
  ): Promise<(PersonalFinanceExportSummary & { csvBody?: string }) | null>;
  listExports(
    ownerUserId: string,
    limit?: number,
  ): Promise<PersonalFinanceExportSummary[]>;
};

export const PERSONAL_RESOURCES_STORE = Symbol("PERSONAL_RESOURCES_STORE");
