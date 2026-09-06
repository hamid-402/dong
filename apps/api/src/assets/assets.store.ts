import type {
  AssetSummary,
  AssignAssetRequest,
  CreateAssetFromDeliveryRequest,
  DamageAssetRequest,
  ReturnAssetRequest,
  TransferAssetRequest,
} from "@dang/contracts";
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
    ownerUserId: row.ownerUserId,
    custodianUserId: row.custodianUserId,
    location: row.location,
    status: row.status,
    createdAt: row.createdAt,
  };
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
}

export type AssetsStore = {
  readonly persistence: "memory" | "postgres";
  createFromDelivery(
    procurement: ProcurementStore,
    input: CreateAssetFromDeliveryRequest,
  ): Promise<AssetSummary>;
  listAssets(workspaceId: string): Promise<AssetSummary[]>;
  assign(workspaceId: string, input: AssignAssetRequest): Promise<AssetSummary>;
  transfer(workspaceId: string, input: TransferAssetRequest): Promise<AssetSummary>;
  markReturned(workspaceId: string, input: ReturnAssetRequest): Promise<AssetSummary>;
  markDamaged(workspaceId: string, input: DamageAssetRequest): Promise<AssetSummary>;
};

export const ASSETS_STORE = Symbol("ASSETS_STORE");
