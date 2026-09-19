import type {
  CreateIncomeSourceRequest,
  CreatePersonalCategoryRequest,
  CreatePersonalFinanceExportRequest,
  CreatePersonalMoneyAccountRequest,
  CreatePersonalMoneyTxnRequest,
  CreatePersonalTransferRequest,
  CreateSavingsGoalContributionRequest,
  CreateSavingsGoalRequest,
  IncomeSourceSummary,
  MonthlyCloseSummary,
  PersonalBudgetSummary,
  PersonalCategorySummary,
  PersonalDashboardResponse,
  PersonalFinanceExportSummary,
  PersonalFinanceOverviewResponse,
  PersonalFinanceOverviewScope,
  PersonalFinanceTrendsResponse,
  PersonalMoneyAccountSummary,
  PersonalMoneyTxnSummary,
  PersonalResourcesSummary,
  PutSpendingAlertsRequest,
  SavingsGoalContributionSummary,
  SavingsGoalSummary,
  SpendingAlertSummary,
  UpdateIncomeSourceRequest,
  UpdatePersonalCategoryRequest,
  UpdatePersonalMoneyAccountRequest,
  UpdateSavingsGoalRequest,
  UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import { API_BASE, apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Personal (`/me/*`) finance endpoints — domain slice of the api.ts split (dong-50 #30). */
export const personalFinanceApi = {
  personalDashboard: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    return apiFetch<PersonalDashboardResponse>(`/me/dashboard${q ? `?${q}` : ""}`);
  },
  personalFinanceOverview: (query: {
    from: string;
    to: string;
    scope?: PersonalFinanceOverviewScope;
  }) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.scope) params.set("scope", query.scope);
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
  personalResourcesSummary: (opts?: { yearMonth?: string }) => {
    const q = opts?.yearMonth
      ? new URLSearchParams({ yearMonth: opts.yearMonth }).toString()
      : "";
    return apiFetch<PersonalResourcesSummary>(
      `/me/finance/resources${q ? `?${q}` : ""}`,
    );
  },
  listPersonalAccounts: (includeArchived?: boolean) => {
    const q = includeArchived ? "?includeArchived=1" : "";
    return apiFetch<PersonalMoneyAccountSummary[]>(`/me/finance/accounts${q}`);
  },
  createPersonalAccount: (body: CreatePersonalMoneyAccountRequest) =>
    postWithOfflineQueue<PersonalMoneyAccountSummary>({
      path: "/me/finance/accounts",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "ایجاد حساب شخصی",
    }),
  updatePersonalAccount: (accountId: string, body: UpdatePersonalMoneyAccountRequest) =>
    apiFetch<PersonalMoneyAccountSummary>(`/me/finance/accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listPersonalTransactions: (opts?: {
    accountId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.accountId) params.set("accountId", opts.accountId);
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const q = params.toString();
    return apiFetch<PersonalMoneyTxnSummary[]>(
      `/me/finance/transactions${q ? `?${q}` : ""}`,
    );
  },
  createPersonalTransaction: (body: CreatePersonalMoneyTxnRequest) =>
    postWithOfflineQueue<PersonalMoneyTxnSummary>({
      path: "/me/finance/transactions",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت تراکنش شخصی",
    }),
  createPersonalTransfer: (body: CreatePersonalTransferRequest) =>
    postWithOfflineQueue<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }>({
      path: "/me/finance/transfers",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "انتقال شخصی",
    }),
  listPersonalBudgets: () => apiFetch<PersonalBudgetSummary[]>("/me/finance/budgets"),
  upsertPersonalBudget: (body: UpsertPersonalBudgetRequest) =>
    postWithOfflineQueue<PersonalBudgetSummary>({
      path: "/me/finance/budgets",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت بودجه شخصی",
    }),
  listPersonalCategories: () =>
    apiFetch<PersonalCategorySummary[]>("/me/finance/categories"),
  createPersonalCategory: (body: CreatePersonalCategoryRequest) =>
    postWithOfflineQueue<PersonalCategorySummary>({
      path: "/me/finance/categories",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "ایجاد دسته شخصی",
    }),
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
    postWithOfflineQueue<PersonalFinanceExportSummary>({
      path: "/me/finance/exports",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "خروجی مالی شخصی",
    }),
  getPersonalFinanceExport: (exportId: string) =>
    apiFetch<PersonalFinanceExportSummary>(`/me/finance/exports/${exportId}`),
  downloadPersonalFinanceExportUrl: (exportId: string) =>
    `${API_BASE.replace(/\/$/, "")}/me/finance/exports/${exportId}/file`,

  listIncomeSources: () =>
    apiFetch<IncomeSourceSummary[]>("/me/finance/income-sources"),
  createIncomeSource: (body: CreateIncomeSourceRequest) =>
    postWithOfflineQueue<IncomeSourceSummary>({
      path: "/me/finance/income-sources",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "ایجاد منبع درآمد",
    }),
  updateIncomeSource: (sourceId: string, body: UpdateIncomeSourceRequest) =>
    apiFetch<IncomeSourceSummary>(`/me/finance/income-sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listSavingsGoals: () =>
    apiFetch<SavingsGoalSummary[]>("/me/finance/savings-goals"),
  createSavingsGoal: (body: CreateSavingsGoalRequest) =>
    postWithOfflineQueue<SavingsGoalSummary>({
      path: "/me/finance/savings-goals",
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "ایجاد هدف پس‌انداز",
    }),
  updateSavingsGoal: (goalId: string, body: UpdateSavingsGoalRequest) =>
    apiFetch<SavingsGoalSummary>(`/me/finance/savings-goals/${goalId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  addSavingsGoalContribution: (
    goalId: string,
    body: CreateSavingsGoalContributionRequest,
  ) =>
    postWithOfflineQueue<{
      goal: SavingsGoalSummary;
      contribution: SavingsGoalContributionSummary;
    }>({
      path: `/me/finance/savings-goals/${goalId}/contributions`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "واریز به هدف پس‌انداز",
    }),
  listSpendingAlerts: () => apiFetch<SpendingAlertSummary[]>("/me/finance/alerts"),
  putSpendingAlerts: (body: PutSpendingAlertsRequest) =>
    apiFetch<SpendingAlertSummary[]>("/me/finance/alerts", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getMonthlyClose: (yearMonth?: string) => {
    const q = yearMonth ? `?yearMonth=${encodeURIComponent(yearMonth)}` : "";
    return apiFetch<MonthlyCloseSummary>(`/me/finance/monthly-close${q}`);
  },
  recomputeMonthlyClose: (yearMonth: string) =>
    apiFetch<MonthlyCloseSummary>("/me/finance/monthly-close/recompute", {
      method: "POST",
      body: JSON.stringify({ yearMonth }),
    }),
};
