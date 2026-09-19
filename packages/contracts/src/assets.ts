import type { Money } from "./money.js";

export type AssetStatus = "active" | "returned" | "damaged" | "retired" | "in_repair";

export type AssetSummary = {
  id: string;
  workspaceId: string;
  title: string;
  serialNumber?: string;
  purchaseOrderId?: string;
  deliveryId?: string;
  acquisitionCost?: Money;
  usefulLifeMonths?: number;
  salvageMinor?: string;
  accumulatedDepreciationMinor?: string;
  lastDepreciatedOn?: string;
  acquisitionDate?: string;
  ownerUserId?: string;
  custodianUserId?: string;
  location?: string;
  status: AssetStatus;
  createdAt: string;
};

export type AssetDepreciationReportRow = {
  assetId: string;
  title: string;
  acquisitionCostMinor: string;
  salvageMinor: string;
  usefulLifeMonths: number;
  accumulatedDepreciationMinor: string;
  bookValueMinor: string;
  lastDepreciatedOn?: string;
};

export type AssetLifecycleRequest = {
  workspaceId: string;
  assetId: string;
  note?: string;
};

export type CreateAssetFromDeliveryRequest = {
  workspaceId: string;
  deliveryId: string;
  title: string;
  serialNumber?: string;
  ownerUserId?: string;
  custodianUserId?: string;
  location?: string;
  usefulLifeMonths?: number;
  salvageMinor?: string;
  acquisitionDate?: string;
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
