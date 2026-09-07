import type {
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";

export type CostCenterStore = {
  readonly persistence: "memory" | "postgres";
  list(
    workspaceId: string,
    actorUserId: string,
  ): Promise<CostCenterSummary[]>;
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateCostCenterRequest,
  ): Promise<CostCenterSummary>;
};

export const COST_CENTER_STORE = Symbol("COST_CENTER_STORE");
