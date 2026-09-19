import type {
  CatalogCategory,
  CatalogItem,
  CatalogItemPrice,
  CatalogOwnerKind,
  CatalogPin,
  CatalogUnit,
  CatalogUnitKind,
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  CreateCatalogUnitRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest,
} from "@dang/contracts";

export type UnitRecord = {
  code: string;
  labelFa: string;
  labelEn: string;
  kind: CatalogUnitKind;
  baseCode: string | null;
  baseFactor: string | null;
  isSystem: boolean;
  workspaceId: string | null;
};

export type CategoryRecord = {
  id: string;
  workspaceId: string | null;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  createdByUserId: string | null;
  createdAt: Date;
};

export type ItemRecord = {
  id: string;
  ownerKind: CatalogOwnerKind;
  workspaceId: string | null;
  ownerUserId: string | null;
  categoryId: string | null;
  name: string;
  nameNormalized: string;
  unitCode: string;
  referencePriceMinor: bigint;
  currency: "IRR";
  description: string | null;
  sku: string | null;
  barcode: string | null;
  active: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type PriceRecord = {
  id: string;
  itemId: string;
  priceMinor: bigint;
  currency: "IRR";
  effectiveFrom: Date;
  createdByUserId: string;
  note: string | null;
};

export type UsageRecord = {
  workspaceId: string;
  itemId: string;
  useCount: number;
  lastUsedAt: Date;
};

export type PinRecord = {
  workspaceId: string;
  itemId: string;
  pinnedByUserId: string;
  pinnedAt: Date;
  sortOrder: number;
};

export type ListItemsFilter = {
  q?: string;
  categoryId?: string;
  activeOnly?: boolean;
  cursor?: string;
  limit?: number;
};

export type CatalogStore = {
  readonly persistence: "memory" | "postgres";
  listUnits(workspaceId?: string | null): Promise<UnitRecord[]>;
  createWorkspaceUnit(
    workspaceId: string,
    input: CreateCatalogUnitRequest,
  ): Promise<UnitRecord>;
  getUnit(code: string): Promise<UnitRecord | null>;
  listCategories(workspaceId: string): Promise<CategoryRecord[]>;
  createCategory(
    workspaceId: string,
    createdByUserId: string,
    input: CreateCatalogCategoryRequest,
  ): Promise<CategoryRecord>;
  updateCategory(
    workspaceId: string,
    categoryId: string,
    patch: UpdateCatalogCategoryRequest,
  ): Promise<CategoryRecord>;
  listItems(
    scope: { ownerKind: "workspace"; workspaceId: string } | { ownerKind: "user"; ownerUserId: string },
    filter?: ListItemsFilter,
  ): Promise<{ items: ItemRecord[]; nextCursor?: string }>;
  getItem(itemId: string): Promise<ItemRecord | null>;
  createItem(input: {
    ownerKind: CatalogOwnerKind;
    workspaceId?: string | null;
    ownerUserId?: string | null;
    createdByUserId: string;
    body: CreateCatalogItemRequest;
  }): Promise<ItemRecord>;
  updateItem(
    itemId: string,
    actorUserId: string,
    patch: UpdateCatalogItemRequest,
  ): Promise<ItemRecord>;
  setItemActive(itemId: string, active: boolean): Promise<ItemRecord>;
  listPrices(itemId: string): Promise<PriceRecord[]>;
  getPriceById(priceId: string): Promise<(PriceRecord & { itemId: string }) | null>;
  listFrequent(workspaceId: string, limit?: number): Promise<Array<ItemRecord & UsageRecord>>;
  recordUsage(workspaceId: string, itemId: string, delta?: number): Promise<UsageRecord>;
  listPins(workspaceId: string): Promise<PinRecord[]>;
  replacePins(
    workspaceId: string,
    pinnedByUserId: string,
    itemIds: string[],
  ): Promise<PinRecord[]>;
};

export const CATALOG_STORE = Symbol("CATALOG_STORE");

/** Normalize for uniqueness + substring search (Persian-friendly trim/collapse). */
export function normalizeCatalogName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fa");
}

export function slugifyCategoryName(name: string): string {
  const base = name
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `cat-${crypto.randomUUID().slice(0, 8)}`;
}

export function toUnitDto(row: UnitRecord): CatalogUnit {
  return {
    code: row.code,
    labelFa: row.labelFa,
    labelEn: row.labelEn,
    kind: row.kind,
    baseCode: row.baseCode ?? undefined,
    baseFactor: row.baseFactor ?? undefined,
    isSystem: row.isSystem,
    workspaceId: row.workspaceId ?? undefined,
  };
}

export function toCategoryDto(row: CategoryRecord, children?: CatalogCategory[]): CatalogCategory {
  return {
    id: row.id,
    workspaceId: row.workspaceId ?? undefined,
    parentId: row.parentId ?? undefined,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    children,
  };
}

export function toItemDto(row: ItemRecord): CatalogItem {
  return {
    id: row.id,
    ownerKind: row.ownerKind,
    workspaceId: row.workspaceId ?? undefined,
    ownerUserId: row.ownerUserId ?? undefined,
    categoryId: row.categoryId ?? undefined,
    name: row.name,
    unitCode: row.unitCode,
    referencePriceMinor: row.referencePriceMinor.toString(),
    currency: "IRR",
    description: row.description ?? undefined,
    sku: row.sku ?? undefined,
    barcode: row.barcode ?? undefined,
    active: row.active,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString(),
  };
}

export function toPriceDto(row: PriceRecord): CatalogItemPrice {
  return {
    id: row.id,
    itemId: row.itemId,
    priceMinor: row.priceMinor.toString(),
    currency: "IRR",
    effectiveFrom: row.effectiveFrom.toISOString(),
    createdByUserId: row.createdByUserId,
    note: row.note ?? undefined,
  };
}

export function toPinDto(row: PinRecord, item?: CatalogItem): CatalogPin {
  return {
    itemId: row.itemId,
    sortOrder: row.sortOrder,
    pinnedByUserId: row.pinnedByUserId,
    pinnedAt: row.pinnedAt.toISOString(),
    item,
  };
}

export const SYSTEM_UNITS: UnitRecord[] = [
  {
    code: "piece",
    labelFa: "عدد",
    labelEn: "piece",
    kind: "count",
    baseCode: null,
    baseFactor: null,
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "pack",
    labelFa: "بسته",
    labelEn: "pack",
    kind: "count",
    baseCode: null,
    baseFactor: null,
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "kg",
    labelFa: "کیلوگرم",
    labelEn: "kilogram",
    kind: "weight",
    baseCode: "g",
    baseFactor: "1000",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "g",
    labelFa: "گرم",
    labelEn: "gram",
    kind: "weight",
    baseCode: "g",
    baseFactor: "1",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "l",
    labelFa: "لیتر",
    labelEn: "liter",
    kind: "volume",
    baseCode: "ml",
    baseFactor: "1000",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "ml",
    labelFa: "میلی‌لیتر",
    labelEn: "milliliter",
    kind: "volume",
    baseCode: "ml",
    baseFactor: "1",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "m",
    labelFa: "متر",
    labelEn: "meter",
    kind: "length",
    baseCode: "m",
    baseFactor: "1",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "hour",
    labelFa: "ساعت",
    labelEn: "hour",
    kind: "time",
    baseCode: "hour",
    baseFactor: "1",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "day",
    labelFa: "روز",
    labelEn: "day",
    kind: "time",
    baseCode: "hour",
    baseFactor: "24",
    isSystem: true,
    workspaceId: null,
  },
  {
    code: "service",
    labelFa: "خدمت",
    labelEn: "service",
    kind: "service",
    baseCode: null,
    baseFactor: null,
    isSystem: true,
    workspaceId: null,
  },
];

export const SYSTEM_CATEGORIES: CategoryRecord[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    workspaceId: null,
    parentId: null,
    name: "خوراک و نوشیدنی",
    slug: "food-drink",
    sortOrder: 10,
    active: true,
    createdByUserId: null,
    createdAt: new Date(0),
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    workspaceId: null,
    parentId: null,
    name: "خدمات",
    slug: "services",
    sortOrder: 20,
    active: true,
    createdByUserId: null,
    createdAt: new Date(0),
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    workspaceId: null,
    parentId: null,
    name: "متفرقه",
    slug: "misc",
    sortOrder: 30,
    active: true,
    createdByUserId: null,
    createdAt: new Date(0),
  },
];
