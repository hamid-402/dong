import type {
  AddonChargeStatus,
  CreatePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";

export type AddonChargeTransition = Extract<
  AddonChargeStatus,
  "confirmed" | "disputed"
>;

export type AddonChargeStore = {
  readonly persistence: "memory" | "postgres";
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreatePersonalAddonChargeRequest,
  ): Promise<PersonalAddonChargeSummary>;
  list(
    workspaceId: string,
    actorUserId: string,
  ): Promise<PersonalAddonChargeSummary[]>;
  get(
    workspaceId: string,
    chargeId: string,
    actorUserId: string,
  ): Promise<PersonalAddonChargeSummary | null>;
  transition(
    workspaceId: string,
    chargeId: string,
    actorUserId: string,
    next: AddonChargeTransition,
    note?: string,
  ): Promise<PersonalAddonChargeSummary>;
};

export const ADDON_CHARGE_STORE = Symbol("ADDON_CHARGE_STORE");
