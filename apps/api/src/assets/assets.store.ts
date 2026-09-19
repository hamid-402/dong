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

type StoredAsset = AssetSummary & { idempotencyKey: string };

function stripAsset(row: StoredAsset): AssetSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    serialNumber: row.serialNumber,
    purchaseOrderId: row.purchaseOrderId,
    deliveryId: row.deliveryId,
    acquisitionCost: row.acquisitionCost,
    usefulLifeMonths: row.usefulLifeMonths,
    salvageMinor: row.salvageMinor,
    accumulatedDepreciationMinor: row.accumulatedDepreciationMinor,
    lastDepreciatedOn: row.lastDepreciatedOn,
    acquisitionDate: row.acquisitionDate,
    ownerUserId: row.ownerUserId,
    custodianUserId: row.custodianUserId,
    location: row.location,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function bookValueMinor(row: StoredAsset): bigint {
  const cost = BigInt(row.acquisitionCost?.amountMinor ?? "0");
  const acc = BigInt(row.accumulatedDepreciationMinor ?? "0");
  const book = cost - acc;
  return book > 0n ? book : 0n;
}

export class MemoryAssetsStore implements AssetsStore {
  readonly persistence = "memory" as const;
  private readonly assets = new Map<string, StoredAsset>();

  async createFromDelivery(
    procurement: ProcurementStore,
    input: CreateAssetFromDeliveryRequest,
  ): Promise<AssetSummary> {
    const delivery = await procurement.getDelivery(input.workspaceId, input.deliveryId);
    if (!delivery) {
      throw new Error("DELIVERY_NOT_FOUND");
    }
    const po = await procurement.getPurchaseOrder(input.workspaceId, delivery.purchaseOrderId);
    if (!po) {
      throw new Error("PO_NOT_FOUND");
    }

    const id = crypto.randomUUID();
    const asset: StoredAsset = {
      id,
      workspaceId: input.workspaceId,
      title: input.title.trim(),
      serialNumber: input.serialNumber?.trim(),
      purchaseOrderId: po.id,
      deliveryId: delivery.id,
      acquisitionCost: po.amount,
      usefulLifeMonths: input.usefulLifeMonths,
      salvageMinor: input.salvageMinor ?? "0",
      accumulatedDepreciationMinor: "0",
      acquisitionDate: input.acquisitionDate ?? new Date().toISOString().slice(0, 10),
      ownerUserId: input.ownerUserId,
      custodianUserId: input.custodianUserId,
      location: input.location?.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.assets.set(id, asset);
    return stripAsset(asset);
  }

  listAssets(workspaceId: string): Promise<AssetSummary[]> {
    return Promise.resolve(
      [...this.assets.values()]
        .filter((a) => a.workspaceId === workspaceId)
        .map(stripAsset),
    );
  }

  getAsset(workspaceId: string, assetId: string): Promise<AssetSummary | undefined> {
    const row = this.assets.get(assetId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(stripAsset(row));
  }

  assign(workspaceId: string, input: AssignAssetRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    const updated: StoredAsset = {
      ...existing,
      ownerUserId: input.ownerUserId ?? existing.ownerUserId,
      custodianUserId: input.custodianUserId ?? existing.custodianUserId,
      location: input.location?.trim() ?? existing.location,
    };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  transfer(workspaceId: string, input: TransferAssetRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    if (existing.status !== "active") {
      return Promise.reject(new Error("ASSET_STATUS"));
    }
    const updated: StoredAsset = {
      ...existing,
      custodianUserId: input.toCustodianUserId,
      location: input.location?.trim() ?? existing.location,
    };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  markReturned(workspaceId: string, input: ReturnAssetRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    const updated: StoredAsset = { ...existing, status: "returned", custodianUserId: undefined };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  markDamaged(workspaceId: string, input: DamageAssetRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    const updated: StoredAsset = { ...existing, status: "damaged" };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  markRepair(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    if (existing.status !== "active" && existing.status !== "damaged") {
      return Promise.reject(new Error("ASSET_STATUS"));
    }
    const updated: StoredAsset = { ...existing, status: "in_repair" };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  resumeActive(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    if (existing.status !== "in_repair") {
      return Promise.reject(new Error("ASSET_STATUS"));
    }
    const updated: StoredAsset = { ...existing, status: "active" };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  retire(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary> {
    const existing = this.assets.get(input.assetId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ASSET_NOT_FOUND"));
    }
    if (existing.status === "retired") {
      return Promise.reject(new Error("ASSET_STATUS"));
    }
    const updated: StoredAsset = { ...existing, status: "retired" };
    this.assets.set(input.assetId, updated);
    return Promise.resolve(stripAsset(updated));
  }

  runMonthlyDepreciation(
    workspaceId: string,
    asOfIso: string,
  ): Promise<{ updated: number; skipped: number }> {
    let updated = 0;
    let skipped = 0;
    for (const row of this.assets.values()) {
      if (row.workspaceId !== workspaceId) continue;
      if (!row.acquisitionCost) {
        skipped += 1;
        continue;
      }
      const tick = computeDepreciationTick({
        acquisitionCost: row.acquisitionCost,
        salvageMinor: row.salvageMinor,
        usefulLifeMonths: row.usefulLifeMonths,
        accumulatedDepreciationMinor: row.accumulatedDepreciationMinor,
        lastDepreciatedOn: row.lastDepreciatedOn,
        status: row.status,
        asOfIso,
      });
      if (tick.skipped) {
        skipped += 1;
        continue;
      }
      row.accumulatedDepreciationMinor = tick.nextAccumulatedMinor.toString();
      row.lastDepreciatedOn = tick.lastDepreciatedOn;
      updated += 1;
    }
    return Promise.resolve({ updated, skipped });
  }

  depreciationReport(workspaceId: string): Promise<AssetDepreciationReportRow[]> {
    const rows: AssetDepreciationReportRow[] = [];
    for (const asset of this.assets.values()) {
      if (asset.workspaceId !== workspaceId) continue;
      if (!asset.acquisitionCost || !asset.usefulLifeMonths) continue;
      rows.push({
        assetId: asset.id,
        title: asset.title,
        acquisitionCostMinor: asset.acquisitionCost.amountMinor,
        salvageMinor: asset.salvageMinor ?? "0",
        usefulLifeMonths: asset.usefulLifeMonths,
        accumulatedDepreciationMinor: asset.accumulatedDepreciationMinor ?? "0",
        bookValueMinor: bookValueMinor(asset).toString(),
        lastDepreciatedOn: asset.lastDepreciatedOn,
      });
    }
    return Promise.resolve(rows);
  }
}

export type AssetsStore = {
  readonly persistence: "memory" | "postgres";
  createFromDelivery(
    procurement: ProcurementStore,
    input: CreateAssetFromDeliveryRequest,
  ): Promise<AssetSummary>;
  listAssets(workspaceId: string): Promise<AssetSummary[]>;
  getAsset(workspaceId: string, assetId: string): Promise<AssetSummary | undefined>;
  assign(workspaceId: string, input: AssignAssetRequest): Promise<AssetSummary>;
  transfer(workspaceId: string, input: TransferAssetRequest): Promise<AssetSummary>;
  markReturned(workspaceId: string, input: ReturnAssetRequest): Promise<AssetSummary>;
  markDamaged(workspaceId: string, input: DamageAssetRequest): Promise<AssetSummary>;
  markRepair(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary>;
  resumeActive(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary>;
  retire(workspaceId: string, input: AssetLifecycleRequest): Promise<AssetSummary>;
  runMonthlyDepreciation(
    workspaceId: string,
    asOfIso: string,
  ): Promise<{ updated: number; skipped: number }>;
  depreciationReport(workspaceId: string): Promise<AssetDepreciationReportRow[]>;
};

export const ASSETS_STORE = Symbol("ASSETS_STORE");
