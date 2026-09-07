import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { isFinanceManagerRole, readProductFeatureFlags, type AuthActor, type CreateReimbursementRequest } from "@dang/contracts";
import { ExpensesService } from "../expenses/expenses.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { REIMBURSEMENT_STORE, type ReimbursementStore } from "./reimbursements.types.js";

@Injectable()
export class ReimbursementsService {
  constructor(
    @Inject(REIMBURSEMENT_STORE) private readonly store: ReimbursementStore,
    private readonly access: WorkspaceAccessService,
    private readonly expenses: ExpensesService,
  ) {}
  private enabled() {
    if (!readProductFeatureFlags(process.env).reimbursement) throw new ForbiddenException({ detail: "Set ENABLE_REIMBURSEMENT=1" });
  }
  async create(actor: AuthActor, workspaceId: string, input: CreateReimbursementRequest) {
    this.enabled(); const role = await this.access.requireMemberRole(workspaceId, actor.userId); this.access.assertNotReadOnly(role);
    if (input.expenseId) {
      const linked = (await this.expenses.list(actor, workspaceId)).find((row) => row.id === input.expenseId);
      if (!linked || linked.visibility !== "private" || !linked.participantUserIds.includes(actor.userId)) {
        throw new BadRequestException({ detail: "Linked reimbursement expense must be the claimant's private expense." });
      }
      if (linked.total.amountMinor !== input.amountMinor) {
        throw new BadRequestException({ detail: "Reimbursement amount must equal the linked private expense total." });
      }
    }
    return this.store.create(workspaceId, actor.userId, input);
  }
  async list(actor: AuthActor, workspaceId: string) {
    this.enabled(); const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const rows = await this.store.list(workspaceId, actor.userId);
    return isFinanceManagerRole(role) || role === "approver" ? rows : rows.filter((r) => r.claimantUserId === actor.userId);
  }
  async transition(actor: AuthActor, workspaceId: string, id: string, action: "submit"|"approve"|"reject"|"paid"|"cancel", note?: string) {
    this.enabled(); const role = await this.access.requireMemberRole(workspaceId, actor.userId); this.access.assertNotReadOnly(role);
    const row = await this.store.get(workspaceId, id, actor.userId);
    if (!row) throw new NotFoundException({ detail: "Reimbursement not found" });
    const manager = isFinanceManagerRole(role) || role === "approver";
    if (["approve", "reject", "paid"].includes(action) && !manager) throw new ForbiddenException({ detail: "Finance approval required" });
    if (["submit", "cancel"].includes(action) && row.claimantUserId !== actor.userId && !manager) throw new ForbiddenException();
    const rules = {
      submit: [["draft"], "submitted"], approve: [["submitted"], "approved"],
      reject: [["submitted"], "rejected"], paid: [["approved"], "paid"],
      cancel: [["draft", "submitted"], "cancelled"],
    } as const;
    const [from, to] = rules[action];
    try {
      const updated = await this.store.transition(workspaceId, id, actor.userId, from, to, note);
      if (action === "approve" && updated.expenseId) {
        await this.expenses.promotePrivateToCompany(actor, workspaceId, updated.expenseId);
      }
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === "REIMBURSEMENT_STATUS") throw new BadRequestException({ detail: "Invalid reimbursement transition" });
      throw error;
    }
  }
}
