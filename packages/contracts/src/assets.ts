import type { Money } from "./money.js";

export type AssetStatus = "active" | "returned" | "damaged" | "retired";

export type AssetSummary = {
  id: string;
  workspaceId: string;
  title: string;
  serialNumber?: string;
  purchaseOrderId?: string;
  deliveryId?: string;
  acquisitionCost?: Money;
  ownerUserId?: string;
  custodianUserId?: string;
  location?: string;
  status: AssetStatus;
  createdAt: string;
};

export type CreateAssetFromDeliveryRequest = {
  workspaceId: string;
  deliveryId: string;
  title: string;
  serialNumber?: string;
  ownerUserId?: string;
  custodianUserId?: string;
  location?: string;
  idempotencyKey: string;
};

export type AssignAssetRequest = {
  workspaceId: string;
  assetId: string;
  ownerUserId?: string;
  custodianUserId?: string;
  location?: string;
};

export type TransferAssetRequest = {
  workspaceId: string;
  assetId: string;
  toCustodianUserId: string;
  location?: string;
  note?: string;
};

export type ReturnAssetRequest = {
  workspaceId: string;
  assetId: string;
  note?: string;
};

export type DamageAssetRequest = {
  workspaceId: string;
  assetId: string;
  note?: string;
};
