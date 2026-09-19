import type {
  GenerateBuildingChargesRequest,
  GenerateBuildingChargesResult,
} from "@dang/contracts";
import { postWithOfflineQueue } from "./offline-post";

/** Monthly per-unit building charges (G08 #28). */
export const buildingChargesApi = {
  generateBuildingCharges: (
    workspaceId: string,
    body: GenerateBuildingChargesRequest,
  ) =>
    postWithOfflineQueue<GenerateBuildingChargesResult>({
      path: `/workspaces/${workspaceId}/building-charges/generate`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "صدور شارژ ماهانه",
    }),
};
