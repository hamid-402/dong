import type {
  AssetSummary,
  CreateAssetFromDeliveryRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Asset endpoints — domain slice (dong-50 #30). */
export const assetsApi = {
  createAssetFromDelivery: (workspaceId: string, body: CreateAssetFromDeliveryRequest) =>
    apiFetch<AssetSummary>(
      `/workspaces/${workspaceId}/assets/from-delivery`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listAssets: (workspaceId: string) =>
    apiFetch<AssetSummary[]>(`/workspaces/${workspaceId}/assets`),
};
