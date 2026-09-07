import type {
  CreateMemberAllowanceRequest,
  MemberAllowanceSummary,
} from "@dang/contracts";

export type AllowanceStore = {
  readonly persistence: "memory" | "postgres";
  list(workspaceId: string, actorUserId: string): Promise<MemberAllowanceSummary[]>;
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateMemberAllowanceRequest,
  ): Promise<MemberAllowanceSummary>;
};

export const ALLOWANCE_STORE = Symbol("ALLOWANCE_STORE");
