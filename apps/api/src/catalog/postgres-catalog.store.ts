import {
  and,
  asc,
  catalogCategory,
  catalogItem,
  catalogItemPin,
  catalogItemPrice,
  catalogItemUsage,
  createDatabase,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  or,
  sql,
  unit,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  CreateCatalogUnitRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest,
} from "@dang/contracts";
import {
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

function mapUnit(row: typeof unit.$inferSelect): UnitRecord {
  return {
    code: row.code,
    labelFa: row.labelFa,
    labelEn: row.labelEn,
    kind: row.kind as UnitRecord["kind"],
    baseCode: row.baseCode ?? null,
    baseFactor: row.baseFactor ?? null,
    isSystem: row.isSystem,
    workspaceId: row.workspaceId ?? null,
  };
}

function mapCategory(row: typeof catalogCategory.$inferSelect): CategoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId ?? null,
    parentId: row.parentId ?? null,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    active: row.active,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt,
  };
}

function mapItem(row: typeof catalogItem.$inferSelect): ItemRecord {
  return {
    id: row.id,
    ownerKind: row.ownerKind as ItemRecord["ownerKind"],
    workspaceId: row.workspaceId ?? null,
    ownerUserId: row.ownerUserId ?? null,
    categoryId: row.categoryId ?? null,
    name: row.name,
    nameNormalized: row.nameNormalized,
    unitCode: row.unitCode,
    referencePriceMinor: row.referencePriceMinor,
    currency: "IRR",
    description: row.description ?? null,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    active: row.active,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
  };
}

function mapPrice(row: typeof catalogItemPrice.$inferSelect): PriceRecord {
  return {
    id: row.id,
    itemId: row.itemId,
    priceMinor: row.priceMinor,
    currency: "IRR",
    effectiveFrom: row.effectiveFrom,
    createdByUserId: row.createdByUserId,
    note: row.note ?? null,
  };
}

function mapUsage(row: typeof catalogItemUsage.$inferSelect): UsageRecord {
  return {
    workspaceId: row.workspaceId,
    itemId: row.itemId,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt,
  };
}

function mapPin(row: typeof catalogItemPin.$inferSelect): PinRecord {
  return {
    workspaceId: row.workspaceId,
    itemId: row.itemId,
    pinnedByUserId: row.pinnedByUserId,
    pinnedAt: row.pinnedAt,
    sortOrder: row.sortOrder,
  };
}

export class PostgresCatalogStore implements CatalogStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresCatalogStore {
    const { db } = createDatabase(connectionString);
    return new PostgresCatalogStore(db);
  }

  async listUnits(workspaceId?: string | null): Promise<UnitRecord[]> {
    const rows =
      workspaceId == null
        ? await this.db.select().from(unit).where(eq(unit.isSystem, true)).orderBy(asc(unit.code))
        : await this.db
            .select()
            .from(unit)
            .where(or(eq(unit.isSystem, true), eq(unit.workspaceId, workspaceId)))
            .orderBy(asc(unit.code));
    return rows.map(mapUnit);
  }

  async getUnit(code: string): Promise<UnitRecord | null> {
    const rows = await this.db.select().from(unit).where(eq(unit.code, code)).limit(1);
    return rows[0] ? mapUnit(rows[0]) : null;
  }

  async createWorkspaceUnit(
    workspaceId: string,
    input: CreateCatalogUnitRequest,
  ): Promise<UnitRecord> {
    try {
      const inserted = await this.db
        .insert(unit)
        .values({
          code: input.code,
          labelFa: input.labelFa,
          labelEn: input.labelEn,
          kind: input.kind,
          baseCode: input.baseCode,
          baseFactor: input.baseFactor,
          isSystem: false,
          workspaceId,
        })
        .returning();
      return mapUnit(inserted[0]!);
    } catch (error: unknown) {
      if (String(error).includes("duplicate") || String(error).includes("unique")) {
        throw new Error("UNIT_CODE_TAKEN");
      }
      throw error;
    }
  }

  async listCategories(workspaceId: string): Promise<CategoryRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogCategory)
      .where(
        or(isNull(catalogCategory.workspaceId), eq(catalogCategory.workspaceId, workspaceId)),
      )
      .orderBy(asc(catalogCategory.sortOrder), asc(catalogCategory.name));
    return rows.map(mapCategory);
  }

  async createCategory(
    workspaceId: string,
    createdByUserId: string,
    input: CreateCatalogCategoryRequest,
  ): Promise<CategoryRecord> {
    if (input.parentId) {
      const parents = await this.db
        .select()
        .from(catalogCategory)
        .where(eq(catalogCategory.id, input.parentId))
        .limit(1);
      const parent = parents[0];
      if (!parent) throw new Error("CATEGORY_NOT_FOUND");
      if (parent.parentId) throw new Error("CATEGORY_DEPTH");
      if (parent.workspaceId != null && parent.workspaceId !== workspaceId) {
        throw new Error("CATEGORY_NOT_FOUND");
      }
    }
    const inserted = await this.db
      .insert(catalogCategory)
      .values({
        workspaceId,
        parentId: input.parentId,
        name: input.name.trim(),
        slug: slugifyCategoryName(input.name),
        sortOrder: input.sortOrder ?? 100,
        createdByUserId,
      })
      .returning();
    return mapCategory(inserted[0]!);
  }

  async updateCategory(
    workspaceId: string,
    categoryId: string,
    patch: UpdateCatalogCategoryRequest,
  ): Promise<CategoryRecord> {
    const existing = await this.db
      .select()
      .from(catalogCategory)
      .where(
        and(eq(catalogCategory.id, categoryId), eq(catalogCategory.workspaceId, workspaceId)),
      )
      .limit(1);
    if (!existing[0]) throw new Error("CATEGORY_NOT_FOUND");
    const updated = await this.db
      .update(catalogCategory)
      .set({
        ...(patch.name !== undefined
          ? { name: patch.name.trim(), slug: slugifyCategoryName(patch.name) }
          : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      })
      .where(eq(catalogCategory.id, categoryId))
      .returning();
    return mapCategory(updated[0]!);
  }

  async listItems(
    scope:
      | { ownerKind: "workspace"; workspaceId: string }
      | { ownerKind: "user"; ownerUserId: string },
    filter: ListItemsFilter = {},
  ): Promise<{ items: ItemRecord[]; nextCursor?: string }> {
    const limit = filter.limit ?? 50;
    const activeOnly = filter.activeOnly !== false;
    const conditions = [
      eq(catalogItem.ownerKind, scope.ownerKind),
      scope.ownerKind === "workspace"
        ? eq(catalogItem.workspaceId, scope.workspaceId)
        : eq(catalogItem.ownerUserId, scope.ownerUserId),
    ];
    if (activeOnly) {
      conditions.push(eq(catalogItem.active, true));
      conditions.push(isNull(catalogItem.archivedAt));
    }
    if (filter.categoryId) conditions.push(eq(catalogItem.categoryId, filter.categoryId));
    if (filter.q?.trim()) {
      conditions.push(ilike(catalogItem.nameNormalized, `%${normalizeCatalogName(filter.q)}%`));
    }
    if (filter.cursor) {
      const cursorRows = await this.db
        .select()
        .from(catalogItem)
        .where(eq(catalogItem.id, filter.cursor))
        .limit(1);
      const cursor = cursorRows[0];
      if (cursor) {
        conditions.push(
          or(
            gt(catalogItem.nameNormalized, cursor.nameNormalized),
            and(
              eq(catalogItem.nameNormalized, cursor.nameNormalized),
              gt(catalogItem.id, cursor.id),
            ),
          )!,
        );
      }
    }
    const rows = await this.db
      .select()
      .from(catalogItem)
      .where(and(...conditions))
      .orderBy(asc(catalogItem.nameNormalized), asc(catalogItem.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page[page.length - 1]?.id : undefined;
    return { items: page.map(mapItem), nextCursor };
  }

  async getItem(itemId: string): Promise<ItemRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogItem)
      .where(eq(catalogItem.id, itemId))
      .limit(1);
    return rows[0] ? mapItem(rows[0]) : null;
  }

  async createItem(input: {
    ownerKind: "workspace" | "user";
    workspaceId?: string | null;
    ownerUserId?: string | null;
    createdByUserId: string;
    body: CreateCatalogItemRequest;
  }): Promise<ItemRecord> {
    const unitRow = await this.getUnit(input.body.unitCode);
    if (!unitRow) throw new Error("UNIT_UNKNOWN");
    if (
      !unitRow.isSystem &&
      input.ownerKind === "workspace" &&
      unitRow.workspaceId !== input.workspaceId
    ) {
      throw new Error("UNIT_UNKNOWN");
    }
    if (input.body.categoryId) {
      const cats = await this.db
        .select()
        .from(catalogCategory)
        .where(eq(catalogCategory.id, input.body.categoryId))
        .limit(1);
      const cat = cats[0];
      if (!cat) throw new Error("CATEGORY_NOT_FOUND");
      if (
        cat.workspaceId != null &&
        (input.ownerKind !== "workspace" || cat.workspaceId !== input.workspaceId)
      ) {
        throw new Error("CATEGORY_NOT_FOUND");
      }
    }
    const nameNormalized = normalizeCatalogName(input.body.name);
    const priceMinor = BigInt(input.body.referencePriceMinor);
    try {
      const inserted = await this.db.transaction(async (tx) => {
        const items = await tx
          .insert(catalogItem)
          .values({
            ownerKind: input.ownerKind,
            workspaceId: input.ownerKind === "workspace" ? input.workspaceId : null,
            ownerUserId: input.ownerKind === "user" ? input.ownerUserId : null,
            categoryId: input.body.categoryId,
            name: input.body.name.trim(),
            nameNormalized,
            unitCode: input.body.unitCode,
            referencePriceMinor: priceMinor,
            description: input.body.description?.trim() || null,
            sku: input.body.sku?.trim() || null,
            barcode: input.body.barcode?.trim() || null,
            createdByUserId: input.createdByUserId,
          })
          .returning();
        const item = items[0]!;
        await tx.insert(catalogItemPrice).values({
          itemId: item.id,
          priceMinor,
          createdByUserId: input.createdByUserId,
          note: "initial",
        });
        return item;
      });
      return mapItem(inserted);
    } catch (error: unknown) {
      if (String(error).includes("catalog_item_workspace_name_uq") || String(error).includes("catalog_item_user_name_uq")) {
        throw new Error("CATALOG_NAME_TAKEN");
      }
      throw error;
    }
  }

  async updateItem(
    itemId: string,
    actorUserId: string,
    patch: UpdateCatalogItemRequest,
  ): Promise<ItemRecord> {
    const existing = await this.getItem(itemId);
    if (!existing) throw new Error("CATALOG_ITEM_NOT_FOUND");
    if (patch.unitCode) {
      const unitRow = await this.getUnit(patch.unitCode);
      if (!unitRow) throw new Error("UNIT_UNKNOWN");
    }
    const nameNormalized =
      patch.name !== undefined ? normalizeCatalogName(patch.name) : undefined;
    const priceChanged =
      patch.referencePriceMinor !== undefined &&
      BigInt(patch.referencePriceMinor) !== existing.referencePriceMinor;
    try {
      const updated = await this.db.transaction(async (tx) => {
        const rows = await tx
          .update(catalogItem)
          .set({
            ...(patch.name !== undefined
              ? { name: patch.name.trim(), nameNormalized }
              : {}),
            ...(patch.unitCode !== undefined ? { unitCode: patch.unitCode } : {}),
            ...(patch.referencePriceMinor !== undefined
              ? { referencePriceMinor: BigInt(patch.referencePriceMinor) }
              : {}),
            ...(patch.description !== undefined
              ? { description: patch.description?.trim() || null }
              : {}),
            ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
            ...(patch.sku !== undefined ? { sku: patch.sku?.trim() || null } : {}),
            ...(patch.barcode !== undefined
              ? { barcode: patch.barcode?.trim() || null }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(catalogItem.id, itemId))
          .returning();
        if (priceChanged) {
          await tx.insert(catalogItemPrice).values({
            itemId,
            priceMinor: BigInt(patch.referencePriceMinor!),
            createdByUserId: actorUserId,
          });
        }
        return rows[0]!;
      });
      return mapItem(updated);
    } catch (error: unknown) {
      if (String(error).includes("catalog_item_workspace_name_uq") || String(error).includes("catalog_item_user_name_uq")) {
        throw new Error("CATALOG_NAME_TAKEN");
      }
      throw error;
    }
  }

  async setItemActive(itemId: string, active: boolean): Promise<ItemRecord> {
    const existing = await this.getItem(itemId);
    if (!existing) throw new Error("CATALOG_ITEM_NOT_FOUND");
    const updated = await this.db
      .update(catalogItem)
      .set({
        active,
        archivedAt: active ? null : existing.archivedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(catalogItem.id, itemId))
      .returning();
    return mapItem(updated[0]!);
  }

  async listPrices(itemId: string): Promise<PriceRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogItemPrice)
      .where(eq(catalogItemPrice.itemId, itemId))
      .orderBy(desc(catalogItemPrice.effectiveFrom));
    return rows.map(mapPrice);
  }

  async getPriceById(priceId: string): Promise<(PriceRecord & { itemId: string }) | null> {
    const rows = await this.db
      .select()
      .from(catalogItemPrice)
      .where(eq(catalogItemPrice.id, priceId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...mapPrice(row), itemId: row.itemId };
  }

  async listFrequent(
    workspaceId: string,
    limit = 20,
  ): Promise<Array<ItemRecord & UsageRecord>> {
    const rows = await this.db
      .select({
        item: catalogItem,
        usage: catalogItemUsage,
      })
      .from(catalogItemUsage)
      .innerJoin(catalogItem, eq(catalogItem.id, catalogItemUsage.itemId))
      .where(
        and(
          eq(catalogItemUsage.workspaceId, workspaceId),
          gt(catalogItemUsage.useCount, 0),
          eq(catalogItem.active, true),
          isNull(catalogItem.archivedAt),
        ),
      )
      .orderBy(desc(catalogItemUsage.useCount), desc(catalogItemUsage.lastUsedAt))
      .limit(limit);
    return rows.map((r) => ({ ...mapItem(r.item), ...mapUsage(r.usage) }));
  }

  async recordUsage(
    workspaceId: string,
    itemId: string,
    delta = 1,
  ): Promise<UsageRecord> {
    const upserted = await this.db
      .insert(catalogItemUsage)
      .values({
        workspaceId,
        itemId,
        useCount: delta,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [catalogItemUsage.workspaceId, catalogItemUsage.itemId],
        set: {
          useCount: sql`${catalogItemUsage.useCount} + ${delta}`,
          lastUsedAt: new Date(),
        },
      })
      .returning();
    return mapUsage(upserted[0]!);
  }

  async listPins(workspaceId: string): Promise<PinRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogItemPin)
      .where(eq(catalogItemPin.workspaceId, workspaceId))
      .orderBy(asc(catalogItemPin.sortOrder));
    return rows.map(mapPin);
  }

  async replacePins(
    workspaceId: string,
    pinnedByUserId: string,
    itemIds: string[],
  ): Promise<PinRecord[]> {
    return this.db.transaction(async (tx) => {
      for (const itemId of itemIds) {
        const items = await tx
          .select()
          .from(catalogItem)
          .where(
            and(
              eq(catalogItem.id, itemId),
              eq(catalogItem.ownerKind, "workspace"),
              eq(catalogItem.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        if (!items[0]) throw new Error("CATALOG_ITEM_NOT_FOUND");
      }
      await tx.delete(catalogItemPin).where(eq(catalogItemPin.workspaceId, workspaceId));
      if (itemIds.length === 0) return [];
      const inserted = await tx
        .insert(catalogItemPin)
        .values(
          itemIds.map((itemId, index) => ({
            workspaceId,
            itemId,
            pinnedByUserId,
            sortOrder: index,
          })),
        )
        .returning();
      return inserted.map(mapPin);
    });
  }
}
