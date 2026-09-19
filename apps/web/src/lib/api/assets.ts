import type {
  AssetDepreciationReportRow,
  AssetLifecycleRequest,
  AssetSummary,
  CreateAssetFromDeliveryRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Asset endpoints — domain slice (dong-50 #30). */
export const assetsApi = {
  createAssetFromDelivery: (workspaceId: string, body: CreateAssetFromDeliveryRequest) =>
    postWithOfflineQueue<AssetSummary>({
      path: `/workspaces/${workspaceId}/assets/from-delivery`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت دارایی از تحویل",
    }),
  listAssets: (workspaceId: string) =>
    apiFetch<AssetSummary[]>(`/workspaces/${workspaceId}/assets`),
  markRepair: (workspaceId: string, body: AssetLifecycleRequest) =>
    postWithOfflineQueue<AssetSummary>({
      path: `/workspaces/${workspaceId}/assets/mark-repair`,
      body: JSON.stringify(body),
      label: "ارسال به تعمیر",
    }),
  resumeActive: (workspaceId: string, body: AssetLifecycleRequest) =>
    postWithOfflineQueue<AssetSummary>({
      path: `/workspaces/${workspaceId}/assets/resume-active`,
      body: JSON.stringify(body),
      label: "بازگشت به فعال",
    }),
  retire: (workspaceId: string, body: AssetLifecycleRequest) =>
    postWithOfflineQueue<AssetSummary>({
      path: `/workspaces/${workspaceId}/assets/retire`,
      body: JSON.stringify(body),
      label: "از رده خارج",
    }),
  depreciationReport: (workspaceId: string) =>
    apiFetch<AssetDepreciationReportRow[]>(
      `/workspaces/${workspaceId}/assets/depreciation-report`,
    ),
};
