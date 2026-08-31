import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { AuthActor, ExpenseSummary, WorkspaceSummary } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { PROCUREMENT_STORE, type ProcurementStore } from "../procurement/procurement.types.js";

export type DemoSeedResult = {
  workspace: WorkspaceSummary;
  expense: ExpenseSummary;
  partnerSubject: string;
  persistence: {
    iam: "memory" | "postgres";
    expense: "memory" | "postgres";
    ledger: "memory" | "postgres";
    procurement: "memory" | "postgres";
  };
  reused: boolean;
};

const DEMO_SLUG_PREFIX = "demo-aftab";
const PARTNER_SUBJECT = "partner-demo";

function demoSlugFor(subject: string): string {
  const safe = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${DEMO_SLUG_PREFIX}-${safe || "user"}`;
}

@Injectable()
export class DemoSeedService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
  ) {}

  async seed(actor: AuthActor): Promise<DemoSeedResult> {
    const env = loadAppEnv();
    if (!env.allowDevAuth) {
      throw new BadRequestException({
        type: "https://dang.local/problems/forbidden",
        title: "Demo seed only available with ALLOW_DEV_AUTH",
        status: 400,
      });
    }

    const slug = demoSlugFor(actor.externalSubject);
    const existing = (await this.iam.listWorkspacesForUser(actor.userId)).find(
      (w) => w.slug === slug || w.slug.startsWith(DEMO_SLUG_PREFIX),
    );
    if (existing) {
      const listed = await this.expenses.listForWorkspace(existing.id, actor.userId);
      const expense =
        listed[0] ??
        (await this.createPostedExpense(actor, existing.id, [actor.userId]));
      return {
        workspace: existing,
        expense,
        partnerSubject: PARTNER_SUBJECT,
        persistence: this.persistence(),
        reused: true,
      };
    }

    const workspace = await this.iam.createWorkspace({
      actorUserId: actor.userId,
      name: "پروژه آفتاب",
      slug,
      template: "project_partners",
    });

    const invite = await this.iam.createInvite({
      workspaceId: workspace.id,
      actorUserId: actor.userId,
      role: "member",
      invitedSubject: PARTNER_SUBJECT,
    });

    const partner = await this.iam.upsertDevActor({
      externalSubject: PARTNER_SUBJECT,
      displayName: "سارا یوسفی",
    });
    await this.iam.acceptInvite(invite.token, partner);

    const members = await this.iam.listMembers(workspace.id, actor.userId);
    const participantIds = (members ?? []).map((m) => m.userId);
    const expense = await this.createPostedExpense(actor, workspace.id, participantIds);

    await this.procurement.createNeed(actor.userId, {
      workspaceId: workspace.id,
      title: "تجهیزات شبکه دفتر",
      description: "سوییچ و اکسس‌پوینت برای سالن اصلی",
      estimatedAmount: { amountMinor: "36800000", currency: "IRR" },
      idempotencyKey: "demo-need-1",
    });

    await this.audit.append({
      workspaceId: workspace.id,
      actorUserId: actor.userId,
      action: "demo.seed",
      targetType: "workspace",
      targetId: workspace.id,
      result: "success",
      metadata: { slug },
    });

    return {
      workspace,
      expense,
      partnerSubject: PARTNER_SUBJECT,
      persistence: this.persistence(),
      reused: false,
    };
  }

  private persistence() {
    return {
      iam: this.iam.persistence,
      expense: this.expenses.persistence,
      ledger: this.ledger.persistence,
      procurement: this.procurement.persistence,
    };
  }

  private async createPostedExpense(
    actor: AuthActor,
    workspaceId: string,
    participantIds: string[],
  ): Promise<ExpenseSummary> {
    const participants = participantIds.length > 0 ? participantIds : [actor.userId];
    const total = { amountMinor: "12500000", currency: "IRR" as const };
    const occurredOn = new Date().toISOString().slice(0, 10);
    const draft = await this.expenses.createDraft(actor.userId, {
      workspaceId,
      title: "خرید اقلام جلسه",
      total,
      paidByUserId: actor.userId,
      splitMethod: "equal",
      participantUserIds: participants,
      occurredOn,
      idempotencyKey: `demo-expense-${workspaceId}`,
    });
    await this.expenses.submit(workspaceId, draft.id, actor.userId);
    const posted = await this.expenses.post(workspaceId, draft.id, actor.userId);
    await this.ledger.postExpense(actor.userId, posted);
    return posted;
  }
}
