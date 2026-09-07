import type {
  CreatePersonalCategoryRequest,
  CreatePersonalFinanceExportRequest,
  CreatePersonalMoneyAccountRequest,
  CreatePersonalMoneyTxnRequest,
  CreatePersonalTransferRequest,
  PersonalBudgetSummary,
  PersonalCategorySummary,
  PersonalDashboardResponse,
  PersonalFinanceExportSummary,
  PersonalFinanceOverviewResponse,
  PersonalFinanceTrendsResponse,
  PersonalMoneyAccountSummary,
  PersonalMoneyTxnSummary,
  PersonalResourcesSummary,
  UpdatePersonalCategoryRequest,
  UpdatePersonalMoneyAccountRequest,
  UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import { API_BASE, apiFetch } from "./client";

/** Personal (`/me/*`) finance endpoints — domain slice of the api.ts split (dong-50 #30). */
export const personalFinanceApi = {
  personalDashboard: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    return apiFetch<PersonalDashboardResponse>(`/me/dashboard${q ? `?${q}` : ""}`);
  },
  personalFinanceOverview: (query: { from: string; to: string }) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    return apiFetch<PersonalFinanceOverviewResponse>(
      `/me/finance/overview?${params.toString()}`,
    );
  },
  personalFinanceTrends: (query: {
    from: string;
    to: string;
    groupBy?: "day" | "week" | "month";
  }) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      groupBy: query.groupBy ?? "day",
    });
    return apiFetch<PersonalFinanceTrendsResponse>(
      `/me/finance/trends?${params.toString()}`,
    );
  },
  personalResourcesSummary: (query?: { yearMonth?: string }) => {
    const params = new URLSearchParams();
    if (query?.yearMonth) params.set("yearMonth", query.yearMonth);
    const q = params.toString();
    return apiFetch<PersonalResourcesSummary>(
      `/me/finance/resources${q ? `?${q}` : ""}`,
    );
  },
  listPersonalAccounts: (includeArchived?: boolean) => {
    const q = includeArchived ? "?includeArchived=1" : "";
    return apiFetch<PersonalMoneyAccountSummary[]>(`/me/finance/accounts${q}`);
  },
  createPersonalAccount: (body: CreatePersonalMoneyAccountRequest) =>
    apiFetch<PersonalMoneyAccountSummary>(
      "/me/finance/accounts",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  updatePersonalAccount: (accountId: string, body: UpdatePersonalMoneyAccountRequest) =>
    apiFetch<PersonalMoneyAccountSummary>(`/me/finance/accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listPersonalTransactions: (query?: {
    accountId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.accountId) params.set("accountId", query.accountId);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    if (query?.limit) params.set("limit", String(query.limit));
    const q = params.toString();
    return apiFetch<PersonalMoneyTxnSummary[]>(
      `/me/finance/transactions${q ? `?${q}` : ""}`,
    );
  },
  createPersonalTransaction: (body: CreatePersonalMoneyTxnRequest) =>
    apiFetch<PersonalMoneyTxnSummary>(
      "/me/finance/transactions",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  createPersonalTransfer: (body: CreatePersonalTransferRequest) =>
    apiFetch<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }>(
      "/me/finance/transfers",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPersonalBudgets: () => apiFetch<PersonalBudgetSummary[]>("/me/finance/budgets"),
  upsertPersonalBudget: (body: UpsertPersonalBudgetRequest) =>
    apiFetch<PersonalBudgetSummary>(
      "/me/finance/budgets",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPersonalCategories: () =>
    apiFetch<PersonalCategorySummary[]>("/me/finance/categories"),
  createPersonalCategory: (body: CreatePersonalCategoryRequest) =>
    apiFetch<PersonalCategorySummary>(
      "/me/finance/categories",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  updatePersonalCategory: (categoryId: string, body: UpdatePersonalCategoryRequest) =>
    apiFetch<PersonalCategorySummary>(`/me/finance/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePersonalCategory: (categoryId: string) =>
    apiFetch<{ ok: true }>(`/me/finance/categories/${categoryId}`, {
      method: "DELETE",
    }),
  listPersonalFinanceExports: (limit?: number) => {
    const q = limit ? `?limit=${limit}` : "";
    return apiFetch<PersonalFinanceExportSummary[]>(`/me/finance/exports${q}`);
  },
  createPersonalFinanceExport: (body: CreatePersonalFinanceExportRequest) =>
    apiFetch<PersonalFinanceExportSummary>(
      "/me/finance/exports",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  getPersonalFinanceExport: (exportId: string) =>
    apiFetch<PersonalFinanceExportSummary>(`/me/finance/exports/${exportId}`),
  downloadPersonalFinanceExportUrl: (exportId: string) =>
    `${API_BASE.replace(/\/$/, "")}/me/finance/exports/${exportId}/file`,
};
