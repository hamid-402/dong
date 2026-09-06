import {
  and,
  asset,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  AssetSummary,
  AssignAssetRequest,
  CreateAssetFromDeliveryRequest,
  DamageAssetRequest,
  ReturnAssetRequest,
  TransferAssetRequest,
} from "@dang/contracts";
import type { ProcurementStore } from "../procurement/procurement.types.js";
import type { AssetsStore } from "./assets.store.js";

function mapAsset(row: typeof asset.$inferSelect): AssetSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    serialNumber: row.serialNumber ?? undefined,
    purchaseOrderId: row.purchaseOrderId ?? undefined,
    deliveryId: row.deliveryId ?? undefined,
    acquisitionCost:
      row.acquisitionCostMinor != null
        ? {
            amountMinor: row.acquisitionCostMinor.toString(),
            currency: (row.currency ?? "IRR") as "IRR",
          }
        : undefined,
    ownerUserId: row.ownerUserId ?? undefined,
    custodianUserId: row.custodianUserId ?? undefined,
    location: row.location ?? undefined,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresAssetsStore implements AssetsStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresAssetsStore {
    const { db } = createDatabase(connectionString);
    return new PostgresAssetsStore(db);
  }

  async createFromDelivery(
    procurement: ProcurementStore,
    input: CreateAssetFromDeliveryRequest,
  ): Promise<AssetSummary> {
    const delivery = await procurement.getDelivery(input.workspaceId, input.deliveryId);
    if (!delivery) throw new Error("DELIVERY_NOT_FOUND");
    const po = await procurement.getPurchaseOrder(input.workspaceId, delivery.purchaseOrderId);
    if (!po) throw new Error("PO_NOT_FOUND");

    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const existing = await tx
        .select()
        .from(asset)
        .where(
          and(
            eq(asset.workspaceId, input.workspaceId),
            eq(asset.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) return mapAsset(existing[0]);

      const inserted = await tx
        .insert(asset)
        .values({
          workspaceId: input.workspaceId,
          title: input.title.trim(),
          serialNumber: input.serialNumber?.trim() || null,
          purchaseOrderId: po.id,
          deliveryId: delivery.id,
          acquisitionCostMinor: BigInt(po.amount.amountMinor),
          currency: po.amount.currency,
          ownerUserId: input.ownerUserId ?? null,
          custodianUserId: input.custodianUserId ?? null,
          location: input.location?.trim() || null,
          status: "active",
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("ASSET_INSERT_FAILED");
      return mapAsset(row);
    });
  }

  listAssets(workspaceId: string): Promise<AssetSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx.select().from(asset).where(eq(asset.workspaceId, workspaceId));
      return rows.map(mapAsset);
    });
  }

  assign(workspaceId: string, input: AssignAssetRequest): Promise<AssetSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, input.assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("ASSET_NOT_FOUND");

      const updated = await tx
        .update(asset)
        .set({
          ownerUserId: input.ownerUserId ?? existing.ownerUserId,
          custodianUserId: input.custodianUserId ?? existing.custodianUserId,
          location: input.location?.trim() ?? existing.location,
        })
        .where(eq(asset.id, input.assetId))
        .returning();
      return mapAsset(updated[0]!);
    });
  }

  transfer(workspaceId: string, input: TransferAssetRequest): Promise<AssetSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, input.assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("ASSET_NOT_FOUND");
      if (existing.status !== "active") throw new Error("ASSET_STATUS");

      const updated = await tx
        .update(asset)
        .set({
          custodianUserId: input.toCustodianUserId,
          location: input.location?.trim() ?? existing.location,
        })
        .where(eq(asset.id, input.assetId))
        .returning();
      return mapAsset(updated[0]!);
    });
  }

  markReturned(workspaceId: string, input: ReturnAssetRequest): Promise<AssetSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, input.assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("ASSET_NOT_FOUND");

      const updated = await tx
        .update(asset)
        .set({ status: "returned", custodianUserId: null })
        .where(eq(asset.id, input.assetId))
        .returning();
      return mapAsset(updated[0]!);
    });
  }

  markDamaged(workspaceId: string, input: DamageAssetRequest): Promise<AssetSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, input.assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("ASSET_NOT_FOUND");

      const updated = await tx
        .update(asset)
        .set({ status: "damaged" })
        .where(eq(asset.id, input.assetId))
        .returning();
      return mapAsset(updated[0]!);
    });
  }
}
