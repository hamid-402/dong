/** Catalog of goods/services — any item, meal, snack, or service (S11-06). */

export type CatalogOwnerKind = "workspace" | "user";

export type CatalogUnitKind =
  | "count"
  | "weight"
  | "volume"
  | "length"
  | "time"
  | "service";

export type CatalogUnit = {
  code: string;
  labelFa: string;
  labelEn: string;
  kind: CatalogUnitKind;
  baseCode?: string;
  baseFactor?: string;
  isSystem: boolean;
  workspaceId?: string;
};

export type CatalogCategory = {
  id: string;
  workspaceId?: string;
  parentId?: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  children?: CatalogCategory[];
};

export type CatalogItem = {
  id: string;
  ownerKind: CatalogOwnerKind;
  workspaceId?: string;
  ownerUserId?: string;
  categoryId?: string;
  name: string;
  unitCode: string;
  referencePriceMinor: string;
  currency: "IRR";
  description?: string;
  sku?: string;
  barcode?: string;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type CatalogItemPrice = {
  id: string;
  itemId: string;
  priceMinor: string;
  currency: "IRR";
  effectiveFrom: string;
  createdByUserId: string;
  note?: string;
};

export type CatalogFrequentItem = CatalogItem & {
  useCount: number;
  lastUsedAt: string;
};

export type CatalogPin = {
  itemId: string;
  sortOrder: number;
  pinnedByUserId: string;
  pinnedAt: string;
  item?: CatalogItem;
};

export type CreateCatalogUnitRequest = {
  code: string;
  labelFa: string;
  labelEn: string;
  kind: CatalogUnitKind;
  baseCode?: string;
  baseFactor?: string;
};

export type CreateCatalogCategoryRequest = {
  name: string;
  parentId?: string;
  sortOrder?: number;
};

export type UpdateCatalogCategoryRequest = {
  name?: string;
  sortOrder?: number;
  active?: boolean;
};

export type CreateCatalogItemRequest = {
  name: string;
  unitCode: string;
  referencePriceMinor: string;
  description?: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
};

export type UpdateCatalogItemRequest = {
  name?: string;
  unitCode?: string;
  referencePriceMinor?: string;
  description?: string | null;
  categoryId?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

export type CatalogItemsPage = {
  items: CatalogItem[];
  nextCursor?: string;
};

export type ReplaceCatalogPinsRequest = {
  itemIds: string[];
};

export type ImportPersonalCatalogRequest = {
  itemIds?: string[];
};
