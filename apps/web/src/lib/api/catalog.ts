import type {
  CatalogCategory,
  CatalogFrequentItem,
  CatalogItem,
  CatalogItemPrice,
  CatalogItemsPage,
  CatalogPin,
  CatalogUnit,
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  CreateCatalogUnitRequest,
  ImportPersonalCatalogRequest,
  ReplaceCatalogPinsRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const catalogApi = {
  listUnits: (workspaceId?: string) =>
    apiFetch<CatalogUnit[]>(`/units${qs({ workspaceId })}`),

  createUnit: (workspaceId: string, body: CreateCatalogUnitRequest) =>
    postWithOfflineQueue<CatalogUnit>({
      path: `/workspaces/${workspaceId}/units`,
      body: JSON.stringify(body),
      label: body.labelFa?.trim() || "ایجاد واحد",
    }),

  listCatalogCategories: (workspaceId: string) =>
    apiFetch<CatalogCategory[]>(`/workspaces/${workspaceId}/catalog/categories`),

  createCatalogCategory: (workspaceId: string, body: CreateCatalogCategoryRequest) =>
    postWithOfflineQueue<CatalogCategory>({
      path: `/workspaces/${workspaceId}/catalog/categories`,
      body: JSON.stringify(body),
      label: body.name?.trim() || "ایجاد دسته کاتالوگ",
    }),

  updateCatalogCategory: (
    workspaceId: string,
    categoryId: string,
    body: UpdateCatalogCategoryRequest,
  ) =>
    apiFetch<CatalogCategory>(
      `/workspaces/${workspaceId}/catalog/categories/${categoryId}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  listCatalogItems: (
    workspaceId: string,
    query?: {
      q?: string;
      categoryId?: string;
      activeOnly?: boolean;
      cursor?: string;
      limit?: number;
    },
  ) =>
    apiFetch<CatalogItemsPage>(
      `/workspaces/${workspaceId}/catalog/items${qs({
        q: query?.q,
        categoryId: query?.categoryId,
        activeOnly:
          query?.activeOnly === undefined ? undefined : query.activeOnly ? "true" : "false",
        cursor: query?.cursor,
        limit: query?.limit?.toString(),
      })}`,
    ),

  createCatalogItem: (workspaceId: string, body: CreateCatalogItemRequest) =>
    postWithOfflineQueue<CatalogItem>({
      path: `/workspaces/${workspaceId}/catalog/items`,
      body: JSON.stringify(body),
      label: body.name?.trim() || "ایجاد آیتم کاتالوگ",
    }),

  updateCatalogItem: (
    workspaceId: string,
    itemId: string,
    body: UpdateCatalogItemRequest,
  ) =>
    apiFetch<CatalogItem>(`/workspaces/${workspaceId}/catalog/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deactivateCatalogItem: (workspaceId: string, itemId: string) =>
    postWithOfflineQueue<CatalogItem>({
      path: `/workspaces/${workspaceId}/catalog/items/${itemId}/deactivate`,
      label: "غیرفعال‌سازی آیتم کاتالوگ",
    }),

  activateCatalogItem: (workspaceId: string, itemId: string) =>
    postWithOfflineQueue<CatalogItem>({
      path: `/workspaces/${workspaceId}/catalog/items/${itemId}/activate`,
      label: "فعال‌سازی آیتم کاتالوگ",
    }),

  listCatalogPrices: (workspaceId: string, itemId: string) =>
    apiFetch<CatalogItemPrice[]>(
      `/workspaces/${workspaceId}/catalog/items/${itemId}/prices`,
    ),

  listCatalogFrequent: (workspaceId: string, limit?: number) =>
    apiFetch<CatalogFrequentItem[]>(
      `/workspaces/${workspaceId}/catalog/frequent${qs({
        limit: limit?.toString(),
      })}`,
    ),

  listCatalogPins: (workspaceId: string) =>
    apiFetch<CatalogPin[]>(`/workspaces/${workspaceId}/catalog/pins`),

  replaceCatalogPins: (workspaceId: string, body: ReplaceCatalogPinsRequest) =>
    apiFetch<CatalogPin[]>(`/workspaces/${workspaceId}/catalog/pins`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  importPersonalCatalog: (workspaceId: string, body: ImportPersonalCatalogRequest = {}) =>
    postWithOfflineQueue<CatalogItem[]>({
      path: `/workspaces/${workspaceId}/catalog/import-personal`,
      body: JSON.stringify(body),
      label: "ورود کاتالوگ شخصی",
    }),
};
