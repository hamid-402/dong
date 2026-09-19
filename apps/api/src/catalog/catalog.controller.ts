import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
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
import {
  createCatalogCategoryRequestSchema,
  createCatalogItemRequestSchema,
  createCatalogUnitRequestSchema,
  importPersonalCatalogRequestSchema,
  listCatalogItemsQuerySchema,
  replaceCatalogPinsRequestSchema,
  updateCatalogCategoryRequestSchema,
  updateCatalogItemRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CatalogService } from "./catalog.service.js";

@ApiTags("catalog")
@Controller()
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get("units")
  @ApiOperation({ summary: "System units + optional workspace custom units" })
  listUnits(
    @CurrentActor() actor: AuthActor,
    @Query("workspaceId") workspaceId?: string,
  ): Promise<CatalogUnit[]> {
    return this.catalog.listUnits(actor, workspaceId);
  }

  @Post("workspaces/:workspaceId/units")
  createUnit(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCatalogUnitRequestSchema))
    body: CreateCatalogUnitRequest,
  ): Promise<CatalogUnit> {
    return this.catalog.createUnit(actor, workspaceId, body);
  }

  @Get("workspaces/:workspaceId/catalog/categories")
  listCategories(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<CatalogCategory[]> {
    return this.catalog.listCategories(actor, workspaceId);
  }

  @Post("workspaces/:workspaceId/catalog/categories")
  createCategory(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCatalogCategoryRequestSchema))
    body: CreateCatalogCategoryRequest,
  ): Promise<CatalogCategory> {
    return this.catalog.createCategory(actor, workspaceId, body);
  }

  @Patch("workspaces/:workspaceId/catalog/categories/:cid")
  updateCategory(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("cid") cid: string,
    @Body(new ZodValidationPipe(updateCatalogCategoryRequestSchema))
    body: UpdateCatalogCategoryRequest,
  ): Promise<CatalogCategory> {
    return this.catalog.updateCategory(actor, workspaceId, cid, body);
  }

  @Get("workspaces/:workspaceId/catalog/items")
  listItems(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(listCatalogItemsQuerySchema))
    query: {
      q?: string;
      categoryId?: string;
      activeOnly?: boolean;
      cursor?: string;
      limit?: number;
    },
  ): Promise<CatalogItemsPage> {
    return this.catalog.listItems(actor, workspaceId, query);
  }

  @Post("workspaces/:workspaceId/catalog/items")
  createItem(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCatalogItemRequestSchema))
    body: CreateCatalogItemRequest,
  ): Promise<CatalogItem> {
    return this.catalog.createItem(actor, workspaceId, body);
  }

  @Patch("workspaces/:workspaceId/catalog/items/:itemId")
  updateItem(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateCatalogItemRequestSchema))
    body: UpdateCatalogItemRequest,
  ): Promise<CatalogItem> {
    return this.catalog.updateItem(actor, workspaceId, itemId, body);
  }

  @Post("workspaces/:workspaceId/catalog/items/:itemId/deactivate")
  deactivate(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
  ): Promise<CatalogItem> {
    return this.catalog.deactivateItem(actor, workspaceId, itemId);
  }

  @Post("workspaces/:workspaceId/catalog/items/:itemId/activate")
  activate(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
  ): Promise<CatalogItem> {
    return this.catalog.activateItem(actor, workspaceId, itemId);
  }

  @Get("workspaces/:workspaceId/catalog/items/:itemId/prices")
  listPrices(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
  ): Promise<CatalogItemPrice[]> {
    return this.catalog.listPrices(actor, workspaceId, itemId);
  }

  @Get("workspaces/:workspaceId/catalog/frequent")
  listFrequent(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("limit") limit?: string,
  ): Promise<CatalogFrequentItem[]> {
    const parsed = limit ? Number(limit) : undefined;
    return this.catalog.listFrequent(
      actor,
      workspaceId,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get("workspaces/:workspaceId/catalog/pins")
  listPins(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<CatalogPin[]> {
    return this.catalog.listPins(actor, workspaceId);
  }

  @Put("workspaces/:workspaceId/catalog/pins")
  replacePins(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(replaceCatalogPinsRequestSchema))
    body: ReplaceCatalogPinsRequest,
  ): Promise<CatalogPin[]> {
    return this.catalog.replacePins(actor, workspaceId, body);
  }

  @Post("workspaces/:workspaceId/catalog/import-personal")
  importPersonal(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(importPersonalCatalogRequestSchema))
    body: ImportPersonalCatalogRequest,
  ): Promise<CatalogItem[]> {
    return this.catalog.importPersonal(actor, workspaceId, body);
  }
}
