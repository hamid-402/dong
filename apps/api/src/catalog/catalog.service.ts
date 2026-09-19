import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
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
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  CATALOG_STORE,
  toCategoryDto,
  toItemDto,
  toPinDto,
  toPriceDto,
  toUnitDto,
  type CatalogStore,
  type CategoryRecord,
} from "./catalog.types.js";

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_STORE) private readonly store: CatalogStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
  ) {}

  persistence(): "memory" | "postgres" {
    return this.store.persistence;
  }

  async listUnits(actor: AuthActor, workspaceId?: string): Promise<CatalogUnit[]> {
    if (workspaceId) await this.access.requireMember(workspaceId, actor.userId);
    const rows = await this.store.listUnits(workspaceId ?? null);
    return rows.map(toUnitDto);
  }

  async createUnit(
    actor: AuthActor,
    workspaceId: string,
    body: CreateCatalogUnitRequest,
  ): Promise<CatalogUnit> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      return toUnitDto(await this.store.createWorkspaceUnit(workspaceId, body));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async listCategories(actor: AuthActor, workspaceId: string): Promise<CatalogCategory[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const rows = await this.store.listCategories(workspaceId);
    return this.buildCategoryTree(rows);
  }

  async createCategory(
    actor: AuthActor,
    workspaceId: string,
    body: CreateCatalogCategoryRequest,
  ): Promise<CatalogCategory> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      return toCategoryDto(await this.store.createCategory(workspaceId, actor.userId, body));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async updateCategory(
    actor: AuthActor,
    workspaceId: string,
    categoryId: string,
    body: UpdateCatalogCategoryRequest,
  ): Promise<CatalogCategory> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      return toCategoryDto(await this.store.updateCategory(workspaceId, categoryId, body));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async listItems(
    actor: AuthActor,
    workspaceId: string,
    query: {
      q?: string;
      categoryId?: string;
      activeOnly?: boolean;
      cursor?: string;
      limit?: number;
    },
  ): Promise<CatalogItemsPage> {
    await this.access.requireMember(workspaceId, actor.userId);
    const page = await this.store.listItems(
      { ownerKind: "workspace", workspaceId },
      query,
    );
    return {
      items: page.items.map(toItemDto),
      nextCursor: page.nextCursor,
    };
  }

  async createItem(
    actor: AuthActor,
    workspaceId: string,
    body: CreateCatalogItemRequest,
  ): Promise<CatalogItem> {
    await this.access.requireMember(workspaceId, actor.userId);
    try {
      return toItemDto(
        await this.store.createItem({
          ownerKind: "workspace",
          workspaceId,
          createdByUserId: actor.userId,
          body,
        }),
      );
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  /** Personal menu — used by import + tests; not a separate fake UI surface. */
  async createPersonalItem(
    actor: AuthActor,
    body: CreateCatalogItemRequest,
  ): Promise<CatalogItem> {
    try {
      return toItemDto(
        await this.store.createItem({
          ownerKind: "user",
          ownerUserId: actor.userId,
          createdByUserId: actor.userId,
          body,
        }),
      );
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async updateItem(
    actor: AuthActor,
    workspaceId: string,
    itemId: string,
    body: UpdateCatalogItemRequest,
  ): Promise<CatalogItem> {
    await this.access.requireMember(workspaceId, actor.userId);
    await this.requireWorkspaceItem(workspaceId, itemId);
    try {
      return toItemDto(await this.store.updateItem(itemId, actor.userId, body));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async deactivateItem(
    actor: AuthActor,
    workspaceId: string,
    itemId: string,
  ): Promise<CatalogItem> {
    await this.access.requireMember(workspaceId, actor.userId);
    await this.requireWorkspaceItem(workspaceId, itemId);
    try {
      return toItemDto(await this.store.setItemActive(itemId, false));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async activateItem(
    actor: AuthActor,
    workspaceId: string,
    itemId: string,
  ): Promise<CatalogItem> {
    await this.access.requireMember(workspaceId, actor.userId);
    await this.requireWorkspaceItem(workspaceId, itemId);
    try {
      return toItemDto(await this.store.setItemActive(itemId, true));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async listPrices(
    actor: AuthActor,
    workspaceId: string,
    itemId: string,
  ): Promise<CatalogItemPrice[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    await this.requireWorkspaceItem(workspaceId, itemId);
    return (await this.store.listPrices(itemId)).map(toPriceDto);
  }

  async listFrequent(
    actor: AuthActor,
    workspaceId: string,
    limit?: number,
  ): Promise<CatalogFrequentItem[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const rows = await this.store.listFrequent(workspaceId, limit ?? 20);
    return rows.map((row) => ({
      ...toItemDto(row),
      useCount: row.useCount,
      lastUsedAt: row.lastUsedAt.toISOString(),
    }));
  }

  /** Called by ledger/expense flows (S11-07); exposed for tests. */
  async recordUsage(workspaceId: string, itemId: string, delta = 1): Promise<void> {
    await this.store.recordUsage(workspaceId, itemId, delta);
  }

  async listPins(actor: AuthActor, workspaceId: string): Promise<CatalogPin[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const pins = await this.store.listPins(workspaceId);
    const out: CatalogPin[] = [];
    for (const pin of pins) {
      const item = await this.store.getItem(pin.itemId);
      out.push(toPinDto(pin, item ? toItemDto(item) : undefined));
    }
    return out;
  }

  async replacePins(
    actor: AuthActor,
    workspaceId: string,
    body: ReplaceCatalogPinsRequest,
  ): Promise<CatalogPin[]> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      const pins = await this.store.replacePins(workspaceId, actor.userId, body.itemIds);
      const out: CatalogPin[] = [];
      for (const pin of pins) {
        const item = await this.store.getItem(pin.itemId);
        out.push(toPinDto(pin, item ? toItemDto(item) : undefined));
      }
      return out;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async importPersonal(
    actor: AuthActor,
    workspaceId: string,
    body: ImportPersonalCatalogRequest,
  ): Promise<CatalogItem[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const personal = await this.store.listItems(
      { ownerKind: "user", ownerUserId: actor.userId },
      { activeOnly: true, limit: 200 },
    );
    const selected = body.itemIds?.length
      ? personal.items.filter((item) => body.itemIds!.includes(item.id))
      : personal.items;
    const imported: CatalogItem[] = [];
    for (const src of selected) {
      try {
        const created = await this.store.createItem({
          ownerKind: "workspace",
          workspaceId,
          createdByUserId: actor.userId,
          body: {
            name: src.name,
            unitCode: src.unitCode,
            referencePriceMinor: src.referencePriceMinor.toString(),
            description: src.description ?? undefined,
            categoryId: src.categoryId ?? undefined,
            sku: src.sku ?? undefined,
            barcode: src.barcode ?? undefined,
          },
        });
        imported.push(toItemDto(created));
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "CATALOG_NAME_TAKEN") continue;
        this.rethrow(error);
      }
    }
    return imported;
  }

  private buildCategoryTree(rows: CategoryRecord[]): CatalogCategory[] {
    const byId = new Map(rows.map((r) => [r.id, toCategoryDto(r, [])]));
    const roots: CatalogCategory[] = [];
    for (const row of rows) {
      const dto = byId.get(row.id)!;
      if (row.parentId && byId.has(row.parentId)) {
        const parent = byId.get(row.parentId)!;
        parent.children = parent.children ?? [];
        parent.children.push(dto);
      } else {
        roots.push(dto);
      }
    }
    return roots;
  }

  private async requireWorkspaceItem(workspaceId: string, itemId: string) {
    const item = await this.store.getItem(itemId);
    if (!item || item.ownerKind !== "workspace" || item.workspaceId !== workspaceId) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Catalog item not found",
        status: 404,
        detail: "قلم کاتالوگ یافت نشد",
      });
    }
    return item;
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error) {
      if (error.message === "CATALOG_NAME_TAKEN") {
        throw new ConflictException({
          type: "https://dang.local/problems/catalog-name-taken",
          title: "Catalog name taken",
          status: 409,
          detail: "نام این قلم در کاتالوگ تکراری است",
          code: "CATALOG_NAME_TAKEN",
        });
      }
      if (error.message === "UNIT_UNKNOWN" || error.message === "UNIT_CODE_TAKEN") {
        throw new BadRequestException({
          type: "https://dang.local/problems/unit-unknown",
          title: "Unknown unit",
          status: 400,
          detail: "واحد نامعتبر است",
          code: "UNIT_UNKNOWN",
        });
      }
      if (error.message === "CATALOG_ITEM_NOT_FOUND" || error.message === "CATEGORY_NOT_FOUND") {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "Not found",
          status: 404,
        });
      }
      if (error.message === "CATEGORY_DEPTH") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Category too deep",
          status: 400,
          detail: "دسته حداکثر دو سطح دارد",
        });
      }
      if (error.message === "CATALOG_ITEM_INACTIVE") {
        throw new BadRequestException({
          type: "https://dang.local/problems/catalog-item-inactive",
          title: "Catalog item inactive",
          status: 400,
          code: "CATALOG_ITEM_INACTIVE",
        });
      }
    }
    throw error;
  }
}
