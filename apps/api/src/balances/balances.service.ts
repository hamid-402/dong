import {
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  isZeroSumBalances,
  type AuthActor,
  type WorkspaceBalancesResponse,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";

@Injectable()
export class BalancesService {
  constructor(
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  async getProvisional(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<WorkspaceBalancesResponse> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }

    const lines = await this.ledger.balancesForWorkspace(workspaceId, actor.userId);

    return {
      workspaceId,
      provisional: this.ledger.persistence !== "postgres",
      source: this.ledger.persistence === "postgres" ? "postgres_journal" : "memory_journal",
      currency: "IRR",
      lines,
      zeroSum: isZeroSumBalances(lines),
    };
  }
}
