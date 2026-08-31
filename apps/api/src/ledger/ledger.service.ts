import {
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { AuthActor, JournalEntrySummary } from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "./ledger.types.js";

@Injectable()
export class LedgerService {
  constructor(
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  async list(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<JournalEntrySummary[]> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    return this.ledger.listForWorkspace(workspaceId, actor.userId);
  }
}
