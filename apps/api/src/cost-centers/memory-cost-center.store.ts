import type {
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";
import type { CostCenterStore } from "./cost-centers.types.js";

export class MemoryCostCenterStore implements CostCenterStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, CostCenterSummary>();

  list(
    workspaceId: string,
    _actorUserId: string,
  ): Promise<CostCenterSummary[]> {
    void _actorUserId;
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => a.code.localeCompare(b.code)),
    );
  }

  create(
    workspaceId: string,
    _actorUserId: string,
    input: CreateCostCenterRequest,
  ): Promise<CostCenterSummary> {
    void _actorUserId;
    const code = input.code.trim();
    const duplicate = [...this.rows.values()].some(
      (row) => row.workspaceId === workspaceId && row.code === code,
    );
    if (duplicate) return Promise.reject(new Error("COST_CENTER_CODE_EXISTS"));

    const row: CostCenterSummary = {
      id: crypto.randomUUID(),
      workspaceId,
      name: input.name.trim(),
      code,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }
}
