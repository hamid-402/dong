import type {
  CreatePersonalAddonChargeRequest,
  DisputePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const addonChargesApi = {
  listAddonCharges: (workspaceId: string) =>
    apiFetch<PersonalAddonChargeSummary[]>(
      `/workspaces/${workspaceId}/addon-charges`,
    ),
  createAddonCharge: (
    workspaceId: string,
    body: CreatePersonalAddonChargeRequest,
  ) =>
    apiFetch<PersonalAddonChargeSummary>(
      `/workspaces/${workspaceId}/addon-charges`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  confirmAddonCharge: (workspaceId: string, chargeId: string) =>
    apiFetch<PersonalAddonChargeSummary>(
      `/workspaces/${workspaceId}/addon-charges/${chargeId}/confirm`,
      { method: "POST" },
    ),
  disputeAddonCharge: (
    workspaceId: string,
    chargeId: string,
    body: DisputePersonalAddonChargeRequest = {},
  ) =>
    apiFetch<PersonalAddonChargeSummary>(
      `/workspaces/${workspaceId}/addon-charges/${chargeId}/dispute`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
