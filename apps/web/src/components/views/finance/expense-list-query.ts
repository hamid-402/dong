import type { ExpenseListQuery, ExpenseVisibility } from "@dang/contracts";

export type ExpenseFilter = "all" | ExpenseVisibility;

/** Build API query from expense list UI state (additive filters). */
export function expenseQueryFromState(input: {
  filter: ExpenseFilter;
  from: string;
  to: string;
  catalogItemId: string;
  q?: string;
  paidByUserId?: string;
  categoryId?: string;
  tagId?: string;
}): ExpenseListQuery {
  return {
    visibility: input.filter === "all" ? undefined : input.filter,
    from: input.from || undefined,
    to: input.to || undefined,
    catalogItemId: input.catalogItemId || undefined,
    q: input.q?.trim() || undefined,
    paidByUserId: input.paidByUserId || undefined,
    categoryId: input.categoryId || undefined,
    tagId: input.tagId || undefined,
  };
}

export function syncExpenseQueryUrl(
  pathname: string,
  state: {
    filter: ExpenseFilter;
    from: string;
    to: string;
    catalogItemId: string;
    q?: string;
    paidByUserId?: string;
    categoryId?: string;
    tagId?: string;
  },
  replace: (href: string) => void,
) {
  const params = new URLSearchParams();
  if (state.filter !== "all") params.set("visibility", state.filter);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.catalogItemId) params.set("catalogItemId", state.catalogItemId);
  if (state.q?.trim()) params.set("q", state.q.trim());
  if (state.paidByUserId) params.set("paidByUserId", state.paidByUserId);
  if (state.categoryId) params.set("categoryId", state.categoryId);
  if (state.tagId) params.set("tagId", state.tagId);
  const qs = params.toString();
  const next = qs ? `${pathname}?${qs}` : pathname;
  if (typeof window !== "undefined") {
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === next) return;
  }
  replace(next);
}

export function readExpenseSearchFromUrl(): {
  from: string;
  to: string;
  catalogItemId: string;
  q: string;
  paidByUserId: string;
  categoryId: string;
  tagId: string;
  filter: ExpenseFilter;
} {
  if (typeof window === "undefined") {
    return {
      from: "",
      to: "",
      catalogItemId: "",
      q: "",
      paidByUserId: "",
      categoryId: "",
      tagId: "",
      filter: "all",
    };
  }
  const sp = new URLSearchParams(window.location.search);
  const vis = sp.get("visibility");
  const filter: ExpenseFilter =
    vis === "shared" || vis === "private" || vis === "company" ? vis : "all";
  const date = (key: string) => {
    const v = sp.get(key) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  };
  return {
    from: date("from"),
    to: date("to"),
    catalogItemId: sp.get("catalogItemId")?.trim() ?? "",
    q: sp.get("q")?.trim() ?? "",
    paidByUserId: sp.get("paidByUserId")?.trim() ?? "",
    categoryId: sp.get("categoryId")?.trim() ?? "",
    tagId: sp.get("tagId")?.trim() ?? "",
    filter,
  };
}
