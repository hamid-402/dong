import type {
  CreatePersonalAddonChargeRequest,
  DisputePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

export const addonChargesApi = {
  listAddonCharges: (workspaceId: string) =>
    apiFetch<PersonalAddonChargeSummary[]>(
      `/workspaces/${workspaceId}/addon-charges`,
    ),
  createAddonCharge: (
    workspaceId: string,
    body: CreatePersonalAddonChargeRequest,
  ) =>
    postWithOfflineQueue<PersonalAddonChargeSummary>({
      path: `/workspaces/${workspaceId}/addon-charges`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.title?.trim() || "شارژ الحاقی",
    }),
  confirmAddonCharge: (workspaceId: string, chargeId: string) =>
    postWithOfflineQueue<PersonalAddonChargeSummary>({
      path: `/workspaces/${workspaceId}/addon-charges/${chargeId}/confirm`,
      body: "{}",
      label: "تأیید شارژ الحاقی",
    }),
  disputeAddonCharge: (
    workspaceId: string,
    chargeId: string,
    body: DisputePersonalAddonChargeRequest = {},
  ) =>
    postWithOfflineQueue<PersonalAddonChargeSummary>({
      path: `/workspaces/${workspaceId}/addon-charges/${chargeId}/dispute`,
      body: JSON.stringify(body),
      label: "اختلاف شارژ الحاقی",
    }),
};
