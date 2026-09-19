import type {
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  CreateCatalogUnitRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest,
} from "@dang/contracts";
import {
  SYSTEM_CATEGORIES,
  SYSTEM_UNITS,
  normalizeCatalogName,
  slugifyCategoryName,
  type CatalogStore,
  type CategoryRecord,
  type ItemRecord,
  type ListItemsFilter,
  type PinRecord,
  type PriceRecord,
  type UnitRecord,
  type UsageRecord,
} from "./catalog.types.js";

export class MemoryCatalogStore implements CatalogStore {
  readonly persistence = "memory" as const;
  private readonly units = new Map<string, UnitRecord>(
    SYSTEM_UNITS.map((u) => [u.code, { ...u }]),
  );
  private readonly categories = new Map<string, CategoryRecord>(
    SYSTEM_CATEGORIES.map((c) => [c.id, { ...c, createdAt: new Date(c.createdAt) }]),
  );
  private readonly items = new Map<string, ItemRecord>();
  private readonly prices = new Map<string, PriceRecord[]>();
  private readonly usage = new Map<string, UsageRecord>();
  private readonly pins = new Map<string, PinRecord[]>();

  listUnits(workspaceId?: string | null): Promise<UnitRecord[]> {
    const rows = [...this.units.values()].filter(
      (u) => u.isSystem || (workspaceId != null && u.workspaceId === workspaceId),
    );
    rows.sort((a, b) => a.code.localeCompare(b.code));
    return Promise.resolve(rows.map((u) => ({ ...u })));
  }

  getUnit(code: string): Promise<UnitRecord | null> {
    const row = this.units.get(code);
    return Promise.resolve(row ? { ...row } : null);
  }

  createWorkspaceUnit(
    workspaceId: string,
    input: CreateCatalogUnitRequest,
  ): Promise<UnitRecord> {
    if (this.units.has(input.code)) throw new Error("UNIT_CODE_TAKEN");
    const row: UnitRecord = {
      code: input.code,
      labelFa: input.labelFa,
      labelEn: input.labelEn,
      kind: input.kind,
      baseCode: input.baseCode ?? null,
      baseFactor: input.baseFactor ?? null,
      isSystem: false,
      workspaceId,
    };
    this.units.set(row.code, row);
    return Promise.resolve({ ...row });
  }

  listCategories(workspaceId: string): Promise<CategoryRecord[]> {
    const rows = [...this.categories.values()].filter(
      (c) => c.workspaceId == null || c.workspaceId === workspaceId,
    );
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return Promise.resolve(rows.map((c) => ({ ...c, createdAt: new Date(c.createdAt) })));
  }

  createCategory(
    workspaceId: string,
    createdByUserId: string,
    input: CreateCatalogCategoryRequest,
  ): Promise<CategoryRecord> {
    if (input.parentId) {
      const parent = this.categories.get(input.parentId);
      if (!parent) throw new Error("CATEGORY_NOT_FOUND");
      if (parent.parentId) throw new Error("CATEGORY_DEPTH");
      if (parent.workspaceId != null && parent.workspaceId !== workspaceId) {
        throw new Error("CATEGORY_NOT_FOUND");
      }
    }
    const row: CategoryRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      parentId: input.parentId ?? null,
      name: input.name.trim(),
      slug: slugifyCategoryName(input.name),
      sortOrder: input.sortOrder ?? 100,
      active: true,
      createdByUserId,
      createdAt: new Date(),
    };
    this.categories.set(row.id, row);
    return Promise.resolve({ ...row });
  }

  updateCategory(
    workspaceId: string,
    categoryId: string,
    patch: UpdateCatalogCategoryRequest,
  ): Promise<CategoryRecord> {
    const row = this.categories.get(categoryId);
    if (!row || row.workspaceId !== workspaceId) throw new Error("CATEGORY_NOT_FOUND");
    if (patch.name !== undefined) {
      row.name = patch.name.trim();
      row.slug = slugifyCategoryName(patch.name);
    }
    if (patch.sortOrder !== undefined) row.sortOrder = patch.sortOrder;
    if (patch.active !== undefined) row.active = patch.active;
    return Promise.resolve({ ...row });
  }

  async listItems(
    scope:
      | { ownerKind: "workspace"; workspaceId: string }
      | { ownerKind: "user"; ownerUserId: string },
    filter: ListItemsFilter = {},
  ): Promise<{ items: ItemRecord[]; nextCursor?: string }> {
    const limit = filter.limit ?? 50;
    const activeOnly = filter.activeOnly !== false;
    const q = filter.q ? normalizeCatalogName(filter.q) : undefined;
    let rows = [...this.items.values()].filter((item) => {
      if (scope.ownerKind === "workspace") {
        if (item.ownerKind !== "workspace" || item.workspaceId !== scope.workspaceId) {
          return false;
        }
      } else if (item.ownerKind !== "user" || item.ownerUserId !== scope.ownerUserId) {
        return false;
      }
      if (activeOnly && (!item.active || item.archivedAt)) return false;
      if (filter.categoryId && item.categoryId !== filter.categoryId) return false;
      if (q && !item.nameNormalized.includes(q)) return false;
      return true;
    });
    rows.sort((a, b) => a.nameNormalized.localeCompare(b.nameNormalized) || a.id.localeCompare(b.id));
    if (filter.cursor) {
      const idx = rows.findIndex((r) => r.id === filter.cursor);
      rows = idx >= 0 ? rows.slice(idx + 1) : rows;
    }
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page[page.length - 1]?.id : undefined;
    return { items: page.map((r) => ({ ...r })), nextCursor };
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    const row = this.items.get(itemId);
    return Promise.resolve(row ? { ...row } : null);
  }

  async createItem(input: {
    ownerKind: "workspace" | "user";
    workspaceId?: string | null;
    ownerUserId?: string | null;
    createdByUserId: string;
    body: CreateCatalogItemRequest;
  }): Promise<ItemRecord> {
    const unit = await this.getUnit(input.body.unitCode);
    if (!unit) throw new Error("UNIT_UNKNOWN");
    if (
      !unit.isSystem &&
      input.ownerKind === "workspace" &&
      unit.workspaceId !== input.workspaceId
    ) {
      throw new Error("UNIT_UNKNOWN");
    }
    const nameNormalized = normalizeCatalogName(input.body.name);
    const clash = [...this.items.values()].find((item) => {
      if (item.archivedAt) return false;
      if (item.nameNormalized !== nameNormalized) return false;
      if (input.ownerKind === "workspace") {
        return item.ownerKind === "workspace" && item.workspaceId === input.workspaceId;
      }
      return item.ownerKind === "user" && item.ownerUserId === input.ownerUserId;
    });
    if (clash) throw new Error("CATALOG_NAME_TAKEN");

    if (input.body.categoryId) {
      const cat = this.categories.get(input.body.categoryId);
      if (!cat) throw new Error("CATEGORY_NOT_FOUND");
      if (
        cat.workspaceId != null &&
        (input.ownerKind !== "workspace" || cat.workspaceId !== input.workspaceId)
      ) {
        throw new Error("CATEGORY_NOT_FOUND");
      }
    }

    const now = new Date();
    const row: ItemRecord = {
      id: crypto.randomUUID(),
      ownerKind: input.ownerKind,
      workspaceId: input.ownerKind === "workspace" ? (input.workspaceId ?? null) : null,
      ownerUserId: input.ownerKind === "user" ? (input.ownerUserId ?? null) : null,
      categoryId: input.body.categoryId ?? null,
      name: input.body.name.trim(),
      nameNormalized,
      unitCode: input.body.unitCode,
      referencePriceMinor: BigInt(input.body.referencePriceMinor),
      currency: "IRR",
      description: input.body.description?.trim() || null,
      sku: input.body.sku?.trim() || null,
      barcode: input.body.barcode?.trim() || null,
      active: true,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.items.set(row.id, row);
    this.prices.set(row.id, [
      {
        id: crypto.randomUUID(),
        itemId: row.id,
        priceMinor: row.referencePriceMinor,
        currency: "IRR",
        effectiveFrom: now,
        createdByUserId: input.createdByUserId,
        note: "initial",
      },
    ]);
    return { ...row };
  }

  async updateItem(
    itemId: string,
    actorUserId: string,
    patch: UpdateCatalogItemRequest,
  ): Promise<ItemRecord> {
    const row = this.items.get(itemId);
    if (!row) throw new Error("CATALOG_ITEM_NOT_FOUND");
    if (patch.unitCode) {
      const unit = await this.getUnit(patch.unitCode);
      if (!unit) throw new Error("UNIT_UNKNOWN");
      row.unitCode = patch.unitCode;
    }
    if (patch.name !== undefined) {
      const nameNormalized = normalizeCatalogName(patch.name);
      const clash = [...this.items.values()].find((item) => {
        if (item.id === itemId || item.archivedAt) return false;
        if (item.nameNormalized !== nameNormalized) return false;
        if (row.ownerKind === "workspace") {
          return item.ownerKind === "workspace" && item.workspaceId === row.workspaceId;
        }
        return item.ownerKind === "user" && item.ownerUserId === row.ownerUserId;
      });
      if (clash) throw new Error("CATALOG_NAME_TAKEN");
      row.name = patch.name.trim();
      row.nameNormalized = nameNormalized;
    }
    if (patch.referencePriceMinor !== undefined) {
      const priceMinor = BigInt(patch.referencePriceMinor);
      if (priceMinor !== row.referencePriceMinor) {
        row.referencePriceMinor = priceMinor;
        const list = this.prices.get(row.id) ?? [];
        list.unshift({
          id: crypto.randomUUID(),
          itemId: row.id,
          priceMinor,
          currency: "IRR",
          effectiveFrom: new Date(),
          createdByUserId: actorUserId,
          note: null,
        });
        this.prices.set(row.id, list);
      }
    }
    if (patch.description !== undefined) {
      row.description = patch.description?.trim() || null;
    }
    if (patch.categoryId !== undefined) row.categoryId = patch.categoryId;
    if (patch.sku !== undefined) row.sku = patch.sku?.trim() || null;
    if (patch.barcode !== undefined) row.barcode = patch.barcode?.trim() || null;
    row.updatedAt = new Date();
    return { ...row };
  }

  setItemActive(itemId: string, active: boolean): Promise<ItemRecord> {
    const row = this.items.get(itemId);
    if (!row) throw new Error("CATALOG_ITEM_NOT_FOUND");
    row.active = active;
    row.archivedAt = active ? null : row.archivedAt ?? new Date();
    if (active) row.archivedAt = null;
    row.updatedAt = new Date();
    return Promise.resolve({ ...row });
  }

  listPrices(itemId: string): Promise<PriceRecord[]> {
    const list = this.prices.get(itemId) ?? [];
    return Promise.resolve(list.map((p) => ({ ...p })));
  }

  getPriceById(priceId: string): Promise<(PriceRecord & { itemId: string }) | null> {
    for (const [itemId, list] of this.prices.entries()) {
      const hit = list.find((p) => p.id === priceId);
      if (hit) return Promise.resolve({ ...hit, itemId });
    }
    return Promise.resolve(null);
  }

  listFrequent(
    workspaceId: string,
    limit = 20,
  ): Promise<Array<ItemRecord & UsageRecord>> {
    const rows = [...this.usage.values()]
      .filter((u) => u.workspaceId === workspaceId && u.useCount > 0)
      .sort(
        (a, b) =>
          b.useCount - a.useCount || b.lastUsedAt.getTime() - a.lastUsedAt.getTime(),
      )
      .slice(0, limit);
    const out: Array<ItemRecord & UsageRecord> = [];
    for (const u of rows) {
      const item = this.items.get(u.itemId);
      if (!item || !item.active || item.archivedAt) continue;
      out.push({ ...item, ...u });
    }
    return Promise.resolve(out);
  }

  recordUsage(workspaceId: string, itemId: string, delta = 1): Promise<UsageRecord> {
    const key = `${workspaceId}:${itemId}`;
    const existing = this.usage.get(key);
    const row: UsageRecord = existing
      ? {
          ...existing,
          useCount: existing.useCount + delta,
          lastUsedAt: new Date(),
        }
      : {
          workspaceId,
          itemId,
          useCount: delta,
          lastUsedAt: new Date(),
        };
    this.usage.set(key, row);
    return Promise.resolve({ ...row });
  }

  listPins(workspaceId: string): Promise<PinRecord[]> {
    const rows = this.pins.get(workspaceId) ?? [];
    return Promise.resolve(
      [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({ ...p })),
    );
  }

  replacePins(
    workspaceId: string,
    pinnedByUserId: string,
    itemIds: string[],
  ): Promise<PinRecord[]> {
    const now = new Date();
    const rows: PinRecord[] = itemIds.map((itemId, index) => {
      const item = this.items.get(itemId);
      if (!item || item.ownerKind !== "workspace" || item.workspaceId !== workspaceId) {
        throw new Error("CATALOG_ITEM_NOT_FOUND");
      }
      return {
        workspaceId,
        itemId,
        pinnedByUserId,
        pinnedAt: now,
        sortOrder: index,
      };
    });
    this.pins.set(workspaceId, rows);
    return Promise.resolve(rows.map((p) => ({ ...p })));
  }
}
