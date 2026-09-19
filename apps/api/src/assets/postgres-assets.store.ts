import {
  and,
  asset,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  AssetDepreciationReportRow,
  AssetLifecycleRequest,
  AssetSummary,
  AssignAssetRequest,
  CreateAssetFromDeliveryRequest,
  DamageAssetRequest,
  ReturnAssetRequest,
  TransferAssetRequest,
} from "@dang/contracts";
import { computeDepreciationTick } from "@dang/contracts";
import type { ProcurementStore } from "../procurement/procurement.types.js";
import type { AssetsStore } from "./assets.store.js";

function asDateString(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

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
    usefulLifeMonths: row.usefulLifeMonths ?? undefined,
    salvageMinor: row.salvageMinor?.toString(),
    accumulatedDepreciationMinor: row.accumulatedDepreciationMinor?.toString(),
    lastDepreciatedOn: row.lastDepreciatedOn
      ? asDateString(row.lastDepreciatedOn)
      : undefined,
    acquisitionDate: row.acquisitionDate
      ? asDateString(row.acquisitionDate)
      : undefined,
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
          usefulLifeMonths: input.usefulLifeMonths ?? null,
          salvageMinor: input.salvageMinor ? BigInt(input.salvageMinor) : 0n,
          accumulatedDepreciationMinor: 0n,
          acquisitionDate:
            input.acquisitionDate ?? new Date().toISOString().slice(0, 10),
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

  getAsset(workspaceId: string, assetId: string): Promise<AssetSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      return rows[0] ? mapAsset(rows[0]) : undefined;
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

  markRepair(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary> {
    return this.setLifecycleStatus(workspaceId, input.assetId, "in_repair", [
      "active",
      "damaged",
    ]);
  }

  resumeActive(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary> {
    return this.setLifecycleStatus(workspaceId, input.assetId, "active", ["in_repair"]);
  }

  retire(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, input.assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("ASSET_NOT_FOUND");
      if (existing.status === "retired") throw new Error("ASSET_STATUS");
      const updated = await tx
        .update(asset)
        .set({ status: "retired" })
        .where(eq(asset.id, input.assetId))
        .returning();
      return mapAsset(updated[0]!);
    });
  }

  private setLifecycleStatus(
    workspaceId: string,
    assetId: string,
    next: AssetSummary["status"],
    allowed: AssetSummary["status"][],
  ): Promise<AssetSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, assetId), eq(asset.workspaceId, workspaceId)))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("ASSET_NOT_FOUND");
      if (!allowed.includes(existing.status)) throw new Error("ASSET_STATUS");
      const updated = await tx
        .update(asset)
        .set({ status: next })
        .where(eq(asset.id, assetId))
        .returning();
      return mapAsset(updated[0]!);
    });
  }

  runMonthlyDepreciation(
    workspaceId: string,
    asOfIso: string,
  ): Promise<{ updated: number; skipped: number }> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx.select().from(asset).where(eq(asset.workspaceId, workspaceId));
      let updated = 0;
      let skipped = 0;
      for (const row of rows) {
        const summary = mapAsset(row);
        if (!summary.acquisitionCost) {
          skipped += 1;
          continue;
        }
        const tick = computeDepreciationTick({
          acquisitionCost: summary.acquisitionCost,
          salvageMinor: summary.salvageMinor,
          usefulLifeMonths: summary.usefulLifeMonths,
          accumulatedDepreciationMinor: summary.accumulatedDepreciationMinor,
          lastDepreciatedOn: summary.lastDepreciatedOn,
          status: summary.status,
          asOfIso,
        });
        if (tick.skipped) {
          skipped += 1;
          continue;
        }
        await tx
          .update(asset)
          .set({
            accumulatedDepreciationMinor: tick.nextAccumulatedMinor,
            lastDepreciatedOn: tick.lastDepreciatedOn,
          })
          .where(eq(asset.id, row.id));
        updated += 1;
      }
      return { updated, skipped };
    });
  }

  depreciationReport(workspaceId: string): Promise<AssetDepreciationReportRow[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx.select().from(asset).where(eq(asset.workspaceId, workspaceId));
      const out: AssetDepreciationReportRow[] = [];
      for (const row of rows) {
        const a = mapAsset(row);
        if (!a.acquisitionCost || !a.usefulLifeMonths) continue;
        const cost = BigInt(a.acquisitionCost.amountMinor);
        const acc = BigInt(a.accumulatedDepreciationMinor ?? "0");
        const book = cost - acc;
        out.push({
          assetId: a.id,
          title: a.title,
          acquisitionCostMinor: a.acquisitionCost.amountMinor,
          salvageMinor: a.salvageMinor ?? "0",
          usefulLifeMonths: a.usefulLifeMonths,
          accumulatedDepreciationMinor: a.accumulatedDepreciationMinor ?? "0",
          bookValueMinor: (book > 0n ? book : 0n).toString(),
          lastDepreciatedOn: a.lastDepreciatedOn,
        });
      }
      return out;
    });
  }
}
