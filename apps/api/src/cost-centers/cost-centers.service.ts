import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  AuthActor,
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";
import { readProductFeatureFlags } from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  COST_CENTER_STORE,
  type CostCenterStore,
} from "./cost-centers.types.js";

@Injectable()
export class CostCentersService {
  constructor(
    @Inject(COST_CENTER_STORE)
    private readonly store: CostCenterStore,
    private readonly access: WorkspaceAccessService,
  ) {}

  async list(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<CostCenterSummary[]> {
    this.assertEnabled();
    await this.access.requireMember(workspaceId, actor.userId);
    return this.store.list(workspaceId, actor.userId);
  }

  async create(
    actor: AuthActor,
    workspaceId: string,
    input: CreateCostCenterRequest,
  ): Promise<CostCenterSummary> {
    this.assertEnabled();
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    try {
      return await this.store.create(workspaceId, actor.userId, input);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "COST_CENTER_CODE_EXISTS") {
        throw new BadRequestException({
          type: "https://dang.local/problems/cost-center-code-exists",
          title: "Cost center code already exists",
          status: 400,
        });
      }
      throw error;
    }
  }

  private assertEnabled(): void {
    if (!readProductFeatureFlags(process.env).costCenter) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Cost centers are disabled",
        status: 403,
        detail: "Set ENABLE_COST_CENTER=1 to enable this feature.",
      });
    }
  }
}
