import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  AuthActor,
  ExpenseItemInput,
  ExpenseSummary,
  Money,
  WorkspaceSummary,
} from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import {
  CATALOG_STORE,
  type CatalogStore,
  type ItemRecord,
} from "../catalog/catalog.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { PROCUREMENT_STORE, type ProcurementStore } from "../procurement/procurement.types.js";
import {
  SOCIAL_STORE,
  friendshipPairKey,
  type SocialStore,
} from "../social/social.types.js";

export type DemoSeedResult = {
  workspace: WorkspaceSummary;
  expense: ExpenseSummary;
  partnerSubject: string;
  persistence: {
    iam: "memory" | "postgres";
    expense: "memory" | "postgres";
    ledger: "memory" | "postgres";
    procurement: "memory" | "postgres";
    billing: "memory" | "postgres";
  };
  reused: boolean;
};

export type ColleaguesDemoSeedResult = {
  label: "دمو";
  workspace: WorkspaceSummary;
  members: Array<{ key: string; displayName: string; userId: string; role: string }>;
  catalogItemIds: Record<string, string>;
  expense: ExpenseSummary;
  invoices: Array<{ id: string; memberUserId: string; totalMinor: string }>;
  friendshipsCreated: number;
  persistence: {
    iam: "memory" | "postgres";
    expense: "memory" | "postgres";
    ledger: "memory" | "postgres";
    catalog: "memory" | "postgres";
    billing: "memory" | "postgres";
    social: "memory" | "postgres" | "none";
  };
  reused: boolean;
};

export type ColleaguesDemoPurgeResult = {
  label: "دمو";
  purgedWorkspaceIds: string[];
  deactivatedCatalogItems: number;
  reversedExpenses: number;
  disabledMembers: number;
  deletedFriendships: number;
};

const DEMO_SLUG_PREFIX = "demo-aftab";
const PARTNER_SUBJECT = "partner-demo";

/** Colleagues scenario workspace slug prefix — also the demo tag locator for purge. */
export const COLLEAGUES_SLUG_PREFIX = "demo-colleagues";
export const DEMO_UI_LABEL = "دمو" as const;
export const COLLEAGUES_SEED_CONFIRM = "SEED_COLLEAGUES_DEMO";
export const COLLEAGUES_PURGE_CONFIRM = "PURGE_COLLEAGUES_DEMO";
export const WORKSPACE_SEED_CONFIRM = "SEED_WORKSPACE_DEMO";
export const AFTAB_PURGE_CONFIRM = "PURGE_AFTAB_DEMO";

const DEMO_NOTE = "دمو";

const COLLEAGUE_DEFS = [
  { key: "sarikhani", displayName: "ساریخانی", subject: "demo-colleague-sarikhani" },
  { key: "montazeri", displayName: "منتظری", subject: "demo-colleague-montazeri" },
  { key: "kazemi", displayName: "کاظمی", subject: null as string | null },
  { key: "moradi", displayName: "مرادی", subject: "demo-colleague-moradi" },
  { key: "jalali", displayName: "جلالی", subject: "demo-colleague-jalali" },
] as const;

/** Exported for unit tests — production never seeds, even with ALLOW_DEV_AUTH. */
export function assertDemoSeedAllowed(env: {
  nodeEnv: string;
  allowDevAuth: boolean;
}): void {
  if (env.nodeEnv === "production") {
    throw new GoneException({
      type: "https://dang.local/problems/demo-disabled",
      title: "Demo seed unavailable",
      status: 410,
      detail: "Demo seed is disabled in production.",
    });
  }
  if (!env.allowDevAuth) {
    throw new BadRequestException({
      type: "https://dang.local/problems/forbidden",
      title: "Demo seed only available with ALLOW_DEV_AUTH",
      status: 400,
    });
  }
}

/** Honest capabilities signal — never true when NODE_ENV=production. */
export function demoSeedAllowedFromEnv(env: {
  nodeEnv: string;
  allowDevAuth: boolean;
}): boolean {
  return env.nodeEnv !== "production" && env.allowDevAuth;
}

export function assertColleaguesSeedConfirm(body: { confirm?: string } | undefined): void {
  if (body?.confirm !== COLLEAGUES_SEED_CONFIRM) {
    throw new BadRequestException({
      type: "https://dang.local/problems/demo-confirm-required",
      title: "Confirmation required",
      status: 400,
      detail: `Body must include { "confirm": "${COLLEAGUES_SEED_CONFIRM}" }.`,
    });
  }
}

export function assertColleaguesPurgeConfirm(body: { confirm?: string } | undefined): void {
  if (body?.confirm !== COLLEAGUES_PURGE_CONFIRM) {
    throw new BadRequestException({
      type: "https://dang.local/problems/demo-confirm-required",
      title: "Confirmation required",
      status: 400,
      detail: `Body must include { "confirm": "${COLLEAGUES_PURGE_CONFIRM}" }.`,
    });
  }
}

export function assertAftabPurgeConfirm(body: { confirm?: string } | undefined): void {
  if (body?.confirm !== AFTAB_PURGE_CONFIRM) {
    throw new BadRequestException({
      type: "https://dang.local/problems/demo-confirm-required",
      title: "Confirmation required",
      status: 400,
      detail: `Body must include { "confirm": "${AFTAB_PURGE_CONFIRM}" }.`,
    });
  }
}

export function assertWorkspaceSeedConfirm(body: { confirm?: string } | undefined): void {
  if (body?.confirm !== WORKSPACE_SEED_CONFIRM) {
    throw new BadRequestException({
      type: "https://dang.local/problems/demo-confirm-required",
      title: "Confirmation required",
      status: 400,
      detail: `Body must include { "confirm": "${WORKSPACE_SEED_CONFIRM}" }.`,
    });
  }
}

function demoSlugFor(subject: string): string {
  const safe = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${DEMO_SLUG_PREFIX}-${safe || "user"}`;
}

function colleaguesSlugFor(subject: string): string {
  const safe = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  return `${COLLEAGUES_SLUG_PREFIX}-${safe || "user"}`;
}

function irr(amountMinor: string): Money {
  return { amountMinor, currency: "IRR" };
}

@Injectable()
export class DemoSeedService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(CATALOG_STORE) private readonly catalog: CatalogStore,
    @Optional() @Inject(SOCIAL_STORE) private readonly social: SocialStore | null,
  ) {}

  async seed(
    actor: AuthActor,
    body?: { confirm?: string },
  ): Promise<DemoSeedResult> {
    assertWorkspaceSeedConfirm(body);
    const env = loadAppEnv();
    assertDemoSeedAllowed(env);

    const slug = demoSlugFor(actor.externalSubject);
    const existing = (await this.iam.listWorkspacesForUser(actor.userId)).find(
      (w) => w.slug === slug || w.slug.startsWith(DEMO_SLUG_PREFIX),
    );
    if (existing) {
      const listed = await this.expenses.listForWorkspace(existing.id, actor.userId);
      let expense =
        listed[0] ??
        (await this.createPostedExpense(actor, existing.id, [actor.userId]));

      const periods = await this.billing.listPeriods(existing.id, actor.userId);
      if (periods.length === 0) {
        const members = await this.iam.listMembers(existing.id, actor.userId);
        const participantIds = (members ?? []).map((m) => m.userId);
        expense = await this.seedPeriodBilling(actor, existing.id, participantIds);
      }

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
      role: "finance",
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
    const shared = await this.seedPeriodBilling(actor, workspace.id, participantIds);

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
      metadata: { slug, periodExpenseId: shared.id },
    });

    return {
      workspace,
      expense,
      partnerSubject: PARTNER_SUBJECT,
      persistence: this.persistence(),
      reused: false,
    };
  }

  async seedColleagues(
    actor: AuthActor,
    body: { confirm?: string },
  ): Promise<ColleaguesDemoSeedResult> {
    const env = loadAppEnv();
    assertDemoSeedAllowed(env);
    assertColleaguesSeedConfirm(body);

    const slug = colleaguesSlugFor(actor.externalSubject);
    const existing = (await this.iam.listWorkspacesForUser(actor.userId)).find(
      (w) =>
        w.slug === slug ||
        (w.slug.startsWith(COLLEAGUES_SLUG_PREFIX) && !w.name.includes("پاک‌شده")),
    );
    if (existing) {
      return this.colleaguesReusePayload(actor, existing, true);
    }

    const workspace = await this.iam.createWorkspace({
      actorUserId: actor.userId,
      name: `گروه همکاران (${DEMO_UI_LABEL})`,
      slug,
      template: "friends_family",
    });

    const byKey = new Map<string, { userId: string; displayName: string; role: string }>();
    byKey.set("kazemi", {
      userId: actor.userId,
      displayName: "کاظمی",
      role: "owner",
    });

    let financeSeeded = false;
    for (const def of COLLEAGUE_DEFS) {
      if (def.key === "kazemi") continue;
      const colleague = await this.iam.upsertDevActor({
        externalSubject: def.subject,
        displayName: def.displayName,
      });
      const role = financeSeeded ? "member" : "finance";
      await this.iam.addMemberByUserId({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        userId: colleague.userId,
        role,
        addedVia: "seed",
      });
      financeSeeded = true;
      byKey.set(def.key, {
        userId: colleague.userId,
        displayName: def.displayName,
        role,
      });
    }

    const catalogItems = await this.seedColleaguesCatalog(actor.userId, workspace.id);
    const participantIds = COLLEAGUE_DEFS.map((d) => byKey.get(d.key)!.userId);

    const today = new Date().toISOString().slice(0, 10);
    const period = await this.billing.createPeriod(actor.userId, {
      workspaceId: workspace.id,
      title: `هفته همکاران (${DEMO_UI_LABEL})`,
      kind: "week",
      startsOn: today,
      endsOn: today,
      note: DEMO_NOTE,
      idempotencyKey: `demo-colleagues-period-${workspace.id}`,
    });

    const expense = await this.seedColleaguesExpense(
      actor,
      workspace.id,
      participantIds,
      byKey,
      catalogItems,
      period.id,
    );

    const invoices = await this.billing.generateInvoices(workspace.id, period.id, actor.userId, {
      sendForApproval: true,
    });

    const friendshipsCreated = await this.seedColleaguesFriendships(actor.userId, byKey);

    await this.audit.append({
      workspaceId: workspace.id,
      actorUserId: actor.userId,
      action: "demo.seed.colleagues",
      targetType: "workspace",
      targetId: workspace.id,
      result: "success",
      metadata: {
        label: DEMO_UI_LABEL,
        slug,
        expenseId: expense.id,
        confirm: COLLEAGUES_SEED_CONFIRM,
      },
    });

    return {
      label: DEMO_UI_LABEL,
      workspace,
      members: COLLEAGUE_DEFS.map((d) => {
        const row = byKey.get(d.key)!;
        return {
          key: d.key,
          displayName: row.displayName,
          userId: row.userId,
          role: row.role,
        };
      }),
      catalogItemIds: Object.fromEntries(
        Object.entries(catalogItems).map(([k, v]) => [k, v.id]),
      ),
      expense,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        memberUserId: inv.memberUserId,
        totalMinor: inv.total.amountMinor,
      })),
      friendshipsCreated,
      persistence: this.colleaguesPersistence(),
      reused: false,
    };
  }

  async purgeColleagues(
    actor: AuthActor,
    body: { confirm?: string },
  ): Promise<ColleaguesDemoPurgeResult> {
    const env = loadAppEnv();
    assertDemoSeedAllowed(env);
    assertColleaguesPurgeConfirm(body);

    const workspaces = (await this.iam.listWorkspacesForUser(actor.userId)).filter(
      (w) => w.slug.startsWith(COLLEAGUES_SLUG_PREFIX),
    );

    let deactivatedCatalogItems = 0;
    let reversedExpenses = 0;
    let disabledMembers = 0;
    let deletedFriendships = 0;
    const purgedWorkspaceIds: string[] = [];

    for (const workspace of workspaces) {
      const items = await this.catalog.listItems(
        { ownerKind: "workspace", workspaceId: workspace.id },
        { activeOnly: false, limit: 200 },
      );
      for (const item of items.items) {
        if (item.description?.includes(DEMO_NOTE) || item.active) {
          await this.catalog.setItemActive(item.id, false);
          deactivatedCatalogItems += 1;
        }
      }

      const expenses = await this.expenses.listForWorkspace(workspace.id, actor.userId, {
        viewAllPrivate: true,
      });
      for (const expense of expenses) {
        if (expense.status === "reversed") continue;
        if (!expense.title.includes(DEMO_UI_LABEL)) continue;
        try {
          await this.expenses.reverse(workspace.id, expense.id, actor.userId, {
            viewAllPrivate: true,
          });
          await this.ledger.reverseExpense(workspace.id, actor.userId, expense.id);
          reversedExpenses += 1;
        } catch {
          /* best-effort purge */
        }
      }

      const members = (await this.iam.listMembers(workspace.id, actor.userId)) ?? [];
      for (const member of members) {
        if (member.userId === actor.userId) continue;
        if (member.role === "owner") continue;
        try {
          await this.iam.disableMember({
            workspaceId: workspace.id,
            actorUserId: actor.userId,
            targetUserId: member.userId,
            reason: `پاک‌سازی ${DEMO_UI_LABEL}`,
          });
          disabledMembers += 1;
        } catch {
          /* last finance / already disabled */
        }
      }

      if (this.social) {
        const friendships = await this.social.listFriendshipsForUser(actor.userId);
        for (const row of friendships) {
          if (!row.note?.includes(DEMO_NOTE)) continue;
          await this.social.deleteFriendship(row.id);
          deletedFriendships += 1;
        }
      }

      await this.iam.updateWorkspaceProfile({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        name: `گروه همکاران (${DEMO_UI_LABEL} · پاک‌شده)`,
        timezone: workspace.timezone || "Asia/Tehran",
        displayUnit: workspace.displayUnit === "toman" ? "toman" : "rial",
      });

      await this.audit.append({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        action: "demo.purge.colleagues",
        targetType: "workspace",
        targetId: workspace.id,
        result: "success",
        metadata: { label: DEMO_UI_LABEL, confirm: COLLEAGUES_PURGE_CONFIRM },
      });

      purgedWorkspaceIds.push(workspace.id);
    }

    return {
      label: DEMO_UI_LABEL,
      purgedWorkspaceIds,
      deactivatedCatalogItems,
      reversedExpenses,
      disabledMembers,
      deletedFriendships,
    };
  }

  /** Soft-purge «پروژه آفتاب» demo workspaces so they leave the active space list. */
  async purgeAftab(
    actor: AuthActor,
    body: { confirm?: string },
  ): Promise<ColleaguesDemoPurgeResult> {
    const env = loadAppEnv();
    assertDemoSeedAllowed(env);
    assertAftabPurgeConfirm(body);

    const workspaces = (await this.iam.listWorkspacesForUser(actor.userId)).filter(
      (w) =>
        w.slug.startsWith(DEMO_SLUG_PREFIX) ||
        w.name.includes("آفتاب"),
    );

    const deactivatedCatalogItems = 0;
    let reversedExpenses = 0;
    let disabledMembers = 0;
    const deletedFriendships = 0;
    const purgedWorkspaceIds: string[] = [];

    for (const workspace of workspaces) {
      if (workspace.name.includes("پاک‌شده")) {
        purgedWorkspaceIds.push(workspace.id);
        continue;
      }

      const expenses = await this.expenses.listForWorkspace(workspace.id, actor.userId, {
        viewAllPrivate: true,
      });
      for (const expense of expenses) {
        if (expense.status === "reversed") continue;
        try {
          await this.expenses.reverse(workspace.id, expense.id, actor.userId, {
            viewAllPrivate: true,
          });
          await this.ledger.reverseExpense(workspace.id, actor.userId, expense.id);
          reversedExpenses += 1;
        } catch {
          /* best-effort purge */
        }
      }

      const members = (await this.iam.listMembers(workspace.id, actor.userId)) ?? [];
      for (const member of members) {
        if (member.userId === actor.userId) continue;
        if (member.role === "owner") continue;
        try {
          await this.iam.disableMember({
            workspaceId: workspace.id,
            actorUserId: actor.userId,
            targetUserId: member.userId,
            reason: `پاک‌سازی ${DEMO_UI_LABEL} آفتاب`,
          });
          disabledMembers += 1;
        } catch {
          /* last finance / already disabled */
        }
      }

      await this.iam.updateWorkspaceProfile({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        name: `پروژه آفتاب (${DEMO_UI_LABEL} · پاک‌شده)`,
        timezone: workspace.timezone || "Asia/Tehran",
        displayUnit: workspace.displayUnit === "toman" ? "toman" : "rial",
      });

      await this.audit.append({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        action: "demo.purge.aftab",
        targetType: "workspace",
        targetId: workspace.id,
        result: "success",
        metadata: { label: DEMO_UI_LABEL, confirm: AFTAB_PURGE_CONFIRM },
      });

      purgedWorkspaceIds.push(workspace.id);
    }

    return {
      label: DEMO_UI_LABEL,
      purgedWorkspaceIds,
      deactivatedCatalogItems,
      reversedExpenses,
      disabledMembers,
      deletedFriendships,
    };
  }

  private async colleaguesReusePayload(
    actor: AuthActor,
    workspace: WorkspaceSummary,
    reused: boolean,
  ): Promise<ColleaguesDemoSeedResult> {
    const members = (await this.iam.listMembers(workspace.id, actor.userId)) ?? [];
    const catalogPage = await this.catalog.listItems(
      { ownerKind: "workspace", workspaceId: workspace.id },
      { activeOnly: true, limit: 50 },
    );
    const catalogItemIds: Record<string, string> = {};
    for (const item of catalogPage.items) {
      if (item.name === "نون") catalogItemIds.noon = item.id;
      if (item.name === "پنیر") catalogItemIds.cheese = item.id;
      if (item.name === "نوشابه") catalogItemIds.soda = item.id;
      if (item.name === "ماست") catalogItemIds.yogurt = item.id;
    }
    const expenses = await this.expenses.listForWorkspace(workspace.id, actor.userId);
    const expense =
      expenses.find((e) => e.title.includes(DEMO_UI_LABEL)) ??
      expenses[0] ??
      (await this.createPostedExpense(actor, workspace.id, [actor.userId]));
    const periods = await this.billing.listPeriods(workspace.id, actor.userId);
    const invoices =
      periods[0] != null
        ? await this.billing.listInvoices(workspace.id, periods[0].id, actor.userId)
        : [];

    return {
      label: DEMO_UI_LABEL,
      workspace,
      members: members.map((m) => ({
        key: m.userId,
        displayName: m.displayName,
        userId: m.userId,
        role: m.role,
      })),
      catalogItemIds,
      expense,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        memberUserId: inv.memberUserId,
        totalMinor: inv.total.amountMinor,
      })),
      friendshipsCreated: 0,
      persistence: this.colleaguesPersistence(),
      reused,
    };
  }

  private async seedColleaguesCatalog(
    actorUserId: string,
    workspaceId: string,
  ): Promise<Record<"noon" | "cheese" | "soda" | "yogurt", ItemRecord>> {
    const noon = await this.catalog.createItem({
      ownerKind: "workspace",
      workspaceId,
      createdByUserId: actorUserId,
      body: {
        name: "نون",
        unitCode: "piece",
        referencePriceMinor: "25000",
        description: DEMO_NOTE,
      },
    });
    const cheese = await this.catalog.createItem({
      ownerKind: "workspace",
      workspaceId,
      createdByUserId: actorUserId,
      body: {
        name: "پنیر",
        unitCode: "pack",
        referencePriceMinor: "2450000",
        description: DEMO_NOTE,
      },
    });
    const soda = await this.catalog.createItem({
      ownerKind: "workspace",
      workspaceId,
      createdByUserId: actorUserId,
      body: {
        name: "نوشابه",
        unitCode: "piece",
        referencePriceMinor: "300000",
        description: DEMO_NOTE,
      },
    });
    const yogurt = await this.catalog.createItem({
      ownerKind: "workspace",
      workspaceId,
      createdByUserId: actorUserId,
      body: {
        name: "ماست",
        unitCode: "pack",
        referencePriceMinor: "200000",
        description: DEMO_NOTE,
      },
    });
    return { noon, cheese, soda, yogurt };
  }

  private async seedColleaguesExpense(
    actor: AuthActor,
    workspaceId: string,
    participantIds: string[],
    byKey: Map<string, { userId: string; displayName: string; role: string }>,
    catalog: Record<"noon" | "cheese" | "soda" | "yogurt", ItemRecord>,
    periodId: string,
  ): Promise<ExpenseSummary> {
    const kazemiId = byKey.get("kazemi")!.userId;
    const sodaChoosers = ["sarikhani", "kazemi", "moradi"] as const;
    const yogurtChoosers = ["montazeri", "kazemi", "jalali"] as const;

    const items: ExpenseItemInput[] = [
      {
        title: "نون",
        amount: irr("50000"),
        assigneeUserIds: participantIds,
        catalogItemId: catalog.noon.id,
        unitCode: "piece",
        quantity: 2,
        unitPriceMinor: "25000",
        notes: DEMO_NOTE,
      },
      {
        title: "پنیر",
        amount: irr("2450000"),
        assigneeUserIds: participantIds,
        catalogItemId: catalog.cheese.id,
        unitCode: "pack",
        quantity: 1,
        unitPriceMinor: "2450000",
        notes: DEMO_NOTE,
      },
      ...sodaChoosers.map((key) => ({
        title: `نوشابه · ${byKey.get(key)!.displayName}`,
        amount: irr("300000"),
        assigneeUserIds: [byKey.get(key)!.userId],
        catalogItemId: catalog.soda.id,
        unitCode: "piece",
        quantity: 1,
        unitPriceMinor: "300000",
        notes: DEMO_NOTE,
      })),
      ...yogurtChoosers.map((key) => ({
        title: `ماست · ${byKey.get(key)!.displayName}`,
        amount: irr("200000"),
        assigneeUserIds: [byKey.get(key)!.userId],
        catalogItemId: catalog.yogurt.id,
        unitCode: "pack",
        quantity: 1,
        unitPriceMinor: "200000",
        notes: DEMO_NOTE,
      })),
    ];

    const totalMinor = (
      50_000n +
      2_450_000n +
      300_000n * BigInt(sodaChoosers.length) +
      200_000n * BigInt(yogurtChoosers.length)
    ).toString();

    const draft = await this.expenses.createDraft(actor.userId, {
      workspaceId,
      title: `خرید همکاران (${DEMO_UI_LABEL})`,
      note: DEMO_NOTE,
      total: irr(totalMinor),
      paidByUserId: kazemiId,
      splitMethod: "itemized",
      participantUserIds: participantIds,
      items,
      occurredOn: new Date().toISOString().slice(0, 10),
      periodId,
      visibility: "shared",
      idempotencyKey: `demo-colleagues-expense-${workspaceId}`,
    });
    await this.expenses.submit(workspaceId, draft.id, actor.userId);
    const posted = await this.expenses.post(workspaceId, draft.id, actor.userId);
    await this.ledger.postExpense(actor.userId, posted);
    await this.catalog.recordUsage(workspaceId, catalog.noon.id, 1);
    await this.catalog.recordUsage(workspaceId, catalog.cheese.id, 1);
    await this.catalog.recordUsage(workspaceId, catalog.soda.id, sodaChoosers.length);
    await this.catalog.recordUsage(workspaceId, catalog.yogurt.id, yogurtChoosers.length);
    return posted;
  }

  private async seedColleaguesFriendships(
    actorUserId: string,
    byKey: Map<string, { userId: string; displayName: string; role: string }>,
  ): Promise<number> {
    if (!this.social) return 0;
    let created = 0;
    for (const def of COLLEAGUE_DEFS) {
      if (def.key === "kazemi") continue;
      const otherId = byKey.get(def.key)!.userId;
      const existing = await this.social.findFriendshipByPair(
        friendshipPairKey(actorUserId, otherId),
      );
      if (existing) continue;
      const row = await this.social.createFriendship({
        requesterUserId: actorUserId,
        addresseeUserId: otherId,
        note: DEMO_NOTE,
      });
      await this.social.updateFriendshipStatus(row.id, {
        status: "accepted",
        respondedAt: new Date(),
      });
      created += 1;
    }
    return created;
  }

  private persistence() {
    return {
      iam: this.iam.persistence,
      expense: this.expenses.persistence,
      ledger: this.ledger.persistence,
      procurement: this.procurement.persistence,
      billing: this.billing.persistence,
    };
  }

  private colleaguesPersistence() {
    return {
      iam: this.iam.persistence,
      expense: this.expenses.persistence,
      ledger: this.ledger.persistence,
      catalog: this.catalog.persistence,
      billing: this.billing.persistence,
      social: this.social?.persistence ?? ("none" as const),
    };
  }

  private async seedPeriodBilling(
    actor: AuthActor,
    workspaceId: string,
    participantIds: string[],
  ): Promise<ExpenseSummary> {
    const today = new Date().toISOString().slice(0, 10);
    const period = await this.billing.createPeriod(actor.userId, {
      workspaceId,
      title: "هفته جاری همکاران",
      kind: "week",
      startsOn: today,
      endsOn: today,
      note: "نمونه: خرج عمومی + خصوصی",
      idempotencyKey: `demo-period-${workspaceId}`,
    });

    const shared = await this.createPostedExpense(actor, workspaceId, participantIds, {
      title: "بیسکوییت اتاق کار",
      amountMinor: "5000000",
      periodId: period.id,
      visibility: "shared",
      idempotencyKey: `demo-shared-${workspaceId}`,
    });

    const partnerId = participantIds.find((id) => id !== actor.userId) ?? actor.userId;
    await this.createPostedExpense(actor, workspaceId, [partnerId], {
      title: "سالاد اضافه ناهار",
      amountMinor: "1800000",
      periodId: period.id,
      visibility: "private",
      idempotencyKey: `demo-private-${workspaceId}`,
      paidByUserId: actor.userId,
    });

    await this.billing.generateInvoices(workspaceId, period.id, actor.userId, {
      sendForApproval: true,
    });

    return shared;
  }

  private async createPostedExpense(
    actor: AuthActor,
    workspaceId: string,
    participantIds: string[],
    opts?: {
      title?: string;
      amountMinor?: string;
      periodId?: string;
      visibility?: "shared" | "private";
      idempotencyKey?: string;
      paidByUserId?: string;
    },
  ): Promise<ExpenseSummary> {
    const participants = participantIds.length > 0 ? participantIds : [actor.userId];
    const total = {
      amountMinor: opts?.amountMinor ?? "12500000",
      currency: "IRR" as const,
    };
    const occurredOn = new Date().toISOString().slice(0, 10);
    const draft = await this.expenses.createDraft(actor.userId, {
      workspaceId,
      title: opts?.title ?? "خرید اقلام جلسه",
      total,
      paidByUserId: opts?.paidByUserId ?? actor.userId,
      splitMethod: "equal",
      participantUserIds: participants,
      occurredOn,
      periodId: opts?.periodId,
      visibility: opts?.visibility ?? "shared",
      idempotencyKey: opts?.idempotencyKey ?? `demo-expense-${workspaceId}`,
    });
    await this.expenses.submit(workspaceId, draft.id, actor.userId);
    const posted = await this.expenses.post(workspaceId, draft.id, actor.userId);
    await this.ledger.postExpense(actor.userId, posted);
    return posted;
  }
}
