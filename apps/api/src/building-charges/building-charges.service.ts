import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  AuthActor,
  GenerateBuildingChargesRequest,
  GenerateBuildingChargesResult,
} from "@dang/contracts";
import { isFinanceManagerRole, spaceKindForTemplate } from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { ExpensesService } from "../expenses/expenses.service.js";
import {
  EXPENSE_STORE,
  type ExpenseStore,
  type StoredExpense,
} from "../expenses/expense.types.js";
import {
  WORKSPACE_SUBUNIT_STORE,
  type WorkspaceSubunitStore,
} from "../subunits/subunit.types.js";

@Injectable()
export class BuildingChargesService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WORKSPACE_SUBUNIT_STORE) private readonly subunits: WorkspaceSubunitStore,
    @Inject(ExpensesService) private readonly expenses: ExpensesService,
    @Inject(EXPENSE_STORE) private readonly expenseStore: ExpenseStore,
  ) {}

  async generateMonthly(
    actor: AuthActor,
    workspaceId: string,
    body: GenerateBuildingChargesRequest,
  ): Promise<GenerateBuildingChargesResult> {
    const ws = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!ws) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "عضویت لازم است",
        status: 403,
      });
    }
    if (spaceKindForTemplate(ws.template) !== "building") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "شارژ ماهانه فقط برای فضای ساختمان است",
        status: 400,
        code: "NOT_BUILDING_WORKSPACE",
      });
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const me = members.find((m) => m.userId === actor.userId && !m.disabledAt);
    if (!me || !isFinanceManagerRole(me.role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مدیر مالی می‌تواند شارژ ماهانه صادر کند",
        status: 403,
      });
    }

    if (!/^\d{4}-\d{2}$/.test(body.yearMonth)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "yearMonth باید YYYY-MM باشد",
        status: 400,
      });
    }
    if (!/^[1-9]\d*$/.test(body.amountMinorPerUnit)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "amountMinorPerUnit نامعتبر است",
        status: 400,
      });
    }

    const occurredOn = `${body.yearMonth}-01`;
    const subunitList = await this.subunits.list(workspaceId, actor.userId);
    const created: GenerateBuildingChargesResult["created"] = [];
    const skipped: GenerateBuildingChargesResult["skipped"] = [];

    for (const sub of subunitList) {
      if (sub.kind !== "unit") continue;
      const memberIds = sub.memberUserIds.filter(Boolean);
      if (memberIds.length < 1) {
        skipped.push({ subunitId: sub.id, reason: "no_members" });
        continue;
      }

      const chargeKey = `building-charge:${workspaceId}:${body.yearMonth}:${sub.id}`;
      const existing = await this.findChargeExpense(workspaceId, actor.userId, chargeKey);
      if (existing) {
        skipped.push({
          subunitId: sub.id,
          reason: "already_generated",
          expenseId: existing.id,
        });
        continue;
      }

      const title = `شارژ ${sub.code} ${body.yearMonth}`;
      const draft = await this.expenses.createDraft(actor, workspaceId, {
        title,
        total: { amountMinor: body.amountMinorPerUnit, currency: "IRR" },
        paidByUserId: actor.userId,
        splitMethod: "equal",
        participantUserIds: memberIds,
        occurredOn,
        idempotencyKey: chargeKey,
        visibility: "shared",
        commit: body.autoPost ? "auto" : "draft",
      });

      created.push({
        subunitId: sub.id,
        expenseId: draft.id,
        status: draft.status,
      });
    }

    return { created, skipped };
  }

  private async findChargeExpense(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<StoredExpense | null> {
    const list = await this.expenseStore.listForWorkspace(workspaceId, actorUserId);
    for (const summary of list) {
      const full = await this.expenseStore.get(workspaceId, summary.id, actorUserId);
      if (full?.idempotencyKey === idempotencyKey) {
        return full;
      }
    }
    return null;
  }
}
