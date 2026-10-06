import {
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  createDatabase,
  eq,
  membership,
  sql,
  userAccount,
  userNotificationPref,
  userUiPref,
  withTenantContext,
  workspacePlan,
  type AppDatabase,
} from "@dang/db";
import {
  planAllows,
  readProductFeatureFlags,
  INTERNAL_DIGEST_ACTOR_USER_ID,
  INTERNAL_DIGEST_WORKSPACE_ID,
  type AuthActor,
  type NotificationPreferenceSummary,
  type UiPreferenceSummary,
  type UpdateNotificationPreferenceRequest,
  type UpdateUiPreferenceRequest,
  type WorkspacePlanSummary,
} from "@dang/contracts";
import { MailerService } from "../auth/mailer.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";

const DEFAULT_EVENT_PREFS = {
  expensePosted: true,
  settlementClaimed: true,
  inviteAccepted: true,
  securityAlert: true,
} as const;

function normalizePinnedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

function defaultNotificationPref(): NotificationPreferenceSummary {
  return { emailDigest: "off", ...DEFAULT_EVENT_PREFS };
}

function mapNotificationRow(row: {
  emailDigest: string;
  expensePosted?: boolean | null;
  settlementClaimed?: boolean | null;
  inviteAccepted?: boolean | null;
  securityAlert?: boolean | null;
  updatedAt: Date;
}): NotificationPreferenceSummary {
  return {
    emailDigest: row.emailDigest as "off" | "weekly" | "monthly",
    expensePosted: row.expensePosted ?? true,
    settlementClaimed: row.settlementClaimed ?? true,
    inviteAccepted: row.inviteAccepted ?? true,
    securityAlert: row.securityAlert ?? true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class WaveFSettingsService {
  private readonly db?: AppDatabase;
  private dbUnreachable = false;
  private readonly prefs = new Map<string, NotificationPreferenceSummary>();
  private readonly uiPrefs = new Map<string, UiPreferenceSummary>();
  private readonly plans = new Map<string, WorkspacePlanSummary>();

  constructor(
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(MailerService) private readonly mailer: MailerService,
  ) {
    if (process.env.DATABASE_URL) {
      this.db = createDatabase(process.env.DATABASE_URL).db;
    }
  }

  private markDbUnreachable(err: unknown): boolean {
    const detail = err instanceof Error ? err.message : String(err);
    if (
      /does not exist|relation|ECONNREFUSED|ETIMEDOUT|timeout|connect|ENOTFOUND|connection/i.test(
        detail,
      )
    ) {
      this.dbUnreachable = true;
      return true;
    }
    return false;
  }

  private useDb(): boolean {
    return Boolean(this.db) && !this.dbUnreachable;
  }

  async getPref(userId: string): Promise<NotificationPreferenceSummary> {
    if (!this.useDb()) {
      return this.prefs.get(userId) ?? defaultNotificationPref();
    }
    try {
      return await this.db!.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
        const rows = await tx
          .select()
          .from(userNotificationPref)
          .where(eq(userNotificationPref.userId, userId))
          .limit(1);
        return rows[0] ? mapNotificationRow(rows[0]) : defaultNotificationPref();
      });
    } catch {
      // Any DB/RLS/driver failure: degrade to memory defaults (account chrome).
      this.dbUnreachable = true;
      return this.prefs.get(userId) ?? defaultNotificationPref();
    }
  }

  async putPref(userId: string, body: UpdateNotificationPreferenceRequest) {
    const flags = readProductFeatureFlags(process.env);
    if (body.emailDigest !== "off" && !flags.weeklyDigest) {
      throw new ForbiddenException({ detail: "Set ENABLE_WEEKLY_DIGEST=1" });
    }
    if (!this.useDb()) {
      const prior = this.prefs.get(userId) ?? defaultNotificationPref();
      const row: NotificationPreferenceSummary = {
        emailDigest: body.emailDigest,
        expensePosted: body.expensePosted ?? prior.expensePosted ?? true,
        settlementClaimed:
          body.settlementClaimed ?? prior.settlementClaimed ?? true,
        inviteAccepted: body.inviteAccepted ?? prior.inviteAccepted ?? true,
        securityAlert: body.securityAlert ?? prior.securityAlert ?? true,
        updatedAt: new Date().toISOString(),
      };
      this.prefs.set(userId, row);
      return row;
    }
    const toMemory = (): NotificationPreferenceSummary => {
      const prior = this.prefs.get(userId) ?? defaultNotificationPref();
      const row: NotificationPreferenceSummary = {
        emailDigest: body.emailDigest,
        expensePosted: body.expensePosted ?? prior.expensePosted ?? true,
        settlementClaimed:
          body.settlementClaimed ?? prior.settlementClaimed ?? true,
        inviteAccepted: body.inviteAccepted ?? prior.inviteAccepted ?? true,
        securityAlert: body.securityAlert ?? prior.securityAlert ?? true,
        updatedAt: new Date().toISOString(),
      };
      this.prefs.set(userId, row);
      return row;
    };
    try {
      return await this.db!.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
        const existing = await tx
          .select()
          .from(userNotificationPref)
          .where(eq(userNotificationPref.userId, userId))
          .limit(1);
        const prior = existing[0]
          ? mapNotificationRow(existing[0])
          : defaultNotificationPref();
        const expensePosted = body.expensePosted ?? prior.expensePosted ?? true;
        const settlementClaimed =
          body.settlementClaimed ?? prior.settlementClaimed ?? true;
        const inviteAccepted = body.inviteAccepted ?? prior.inviteAccepted ?? true;
        const securityAlert = body.securityAlert ?? prior.securityAlert ?? true;
        const rows = await tx
          .insert(userNotificationPref)
          .values({
            userId,
            emailDigest: body.emailDigest,
            expensePosted,
            settlementClaimed,
            inviteAccepted,
            securityAlert,
          })
          .onConflictDoUpdate({
            target: userNotificationPref.userId,
            set: {
              emailDigest: body.emailDigest,
              expensePosted,
              settlementClaimed,
              inviteAccepted,
              securityAlert,
              updatedAt: new Date(),
            },
          })
          .returning();
        return mapNotificationRow(rows[0]!);
      });
    } catch (err: unknown) {
      if (this.markDbUnreachable(err)) {
        return toMemory();
      }
      throw err;
    }
  }

  async getUiPref(userId: string): Promise<UiPreferenceSummary> {
    const fallback = (): UiPreferenceSummary =>
      this.uiPrefs.get(userId) ?? {
        dismissShellTour: false,
        dismissStatementsTour: false,
        pinnedWorkspaceIds: [],
      };
    if (!this.useDb()) return fallback();
    try {
      return await this.db!.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
        const rows = await tx
          .select()
          .from(userUiPref)
          .where(eq(userUiPref.userId, userId))
          .limit(1);
        return rows[0]
          ? {
              dismissShellTour: rows[0].dismissShellTour,
              dismissStatementsTour: rows[0].dismissStatementsTour,
              pinnedWorkspaceIds: normalizePinnedIds(rows[0].pinnedWorkspaceIds),
              updatedAt: rows[0].updatedAt.toISOString(),
            }
          : fallback();
      });
    } catch {
      // Same degrade as notification prefs — chrome must not 500.
      this.dbUnreachable = true;
      return fallback();
    }
  }

  async putUiPref(userId: string, body: UpdateUiPreferenceRequest): Promise<UiPreferenceSummary> {
    const current = await this.getUiPref(userId);
    const next: UiPreferenceSummary = {
      dismissShellTour: body.dismissShellTour ?? current.dismissShellTour,
      dismissStatementsTour:
        body.dismissStatementsTour ?? current.dismissStatementsTour,
      pinnedWorkspaceIds:
        body.pinnedWorkspaceIds !== undefined
          ? normalizePinnedIds(body.pinnedWorkspaceIds)
          : current.pinnedWorkspaceIds,
      updatedAt: new Date().toISOString(),
    };
    if (!this.useDb()) {
      this.uiPrefs.set(userId, next);
      return next;
    }
    try {
      return await this.db!.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
        const rows = await tx
          .insert(userUiPref)
          .values({
            userId,
            dismissShellTour: next.dismissShellTour,
            dismissStatementsTour: next.dismissStatementsTour,
            pinnedWorkspaceIds: next.pinnedWorkspaceIds,
          })
          .onConflictDoUpdate({
            target: userUiPref.userId,
            set: {
              dismissShellTour: next.dismissShellTour,
              dismissStatementsTour: next.dismissStatementsTour,
              pinnedWorkspaceIds: next.pinnedWorkspaceIds,
              updatedAt: new Date(),
            },
          })
          .returning();
        return {
          dismissShellTour: rows[0]!.dismissShellTour,
          dismissStatementsTour: rows[0]!.dismissStatementsTour,
          pinnedWorkspaceIds: normalizePinnedIds(rows[0]!.pinnedWorkspaceIds),
          updatedAt: rows[0]!.updatedAt.toISOString(),
        };
      });
    } catch (err: unknown) {
      if (this.markDbUnreachable(err)) {
        this.uiPrefs.set(userId, next);
        return next;
      }
      throw err;
    }
  }

  async getPlan(actor: AuthActor, w: string): Promise<WorkspacePlanSummary> {
    await this.access.requireMember(w, actor.userId);
    if (!this.db) {
      return this.plans.get(w) ?? {
        workspaceId: w,
        plan: "free",
        seatsLimit: null,
        features: [],
      };
    }
    return withTenantContext(
      this.db,
      { workspaceId: w, userId: actor.userId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(workspacePlan)
          .where(eq(workspacePlan.workspaceId, w))
          .limit(1);
        const r = rows[0];
        return r
          ? {
              workspaceId: w,
              plan: r.plan as "free" | "pro" | "business",
              seatsLimit: r.seatsLimit,
              features: r.featuresJson
                ? (JSON.parse(r.featuresJson) as string[])
                : [],
              updatedAt: r.updatedAt.toISOString(),
            }
          : {
              workspaceId: w,
              plan: "free",
              seatsLimit: null,
              features: [],
            };
      },
    );
  }

  /**
   * Resolve workspace plan then apply `planAllows`.
   * With current product policy, `planAllows` always succeeds (no premium upsell).
   */
  async requirePlanFeature(
    actor: AuthActor,
    workspaceId: string,
    feature: string,
  ): Promise<WorkspacePlanSummary> {
    const summary = await this.getPlan(actor, workspaceId);
    if (!planAllows(summary.plan, feature)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/plan-required",
        title: "Plan upgrade required",
        status: 403,
        detail: `قابلیت «${feature}» در پلن ${summary.plan} فعال نیست`,
        code: "plan_required",
        feature,
        plan: summary.plan,
      });
    }
    return summary;
  }

  async putPlan(
    actor: AuthActor,
    w: string,
    input: {
      plan: "free" | "pro" | "business";
      seatsLimit?: number | null;
      features?: string[];
    },
  ) {
    const flags = readProductFeatureFlags(process.env);
    const role = await this.access.requireMemberRole(w, actor.userId);
    const allowDevPlan =
      process.env.ALLOW_DEV_AUTH === "true" || process.env.ALLOW_DEV_AUTH === "1";
    if (
      !flags.planAdmin &&
      !(flags.workspacePlans && role === "owner") &&
      !(allowDevPlan && role === "owner")
    ) {
      throw new ForbiddenException({
        detail: "Workspace plan administration is disabled",
      });
    }
    const row = {
      workspaceId: w,
      plan: input.plan,
      seatsLimit: input.seatsLimit ?? null,
      features: input.features ?? [],
      updatedAt: new Date().toISOString(),
    };
    if (!this.db) {
      this.plans.set(w, row);
      return row;
    }
    return withTenantContext(
      this.db,
      { workspaceId: w, userId: actor.userId },
      async (tx) => {
        const rows = await tx
          .insert(workspacePlan)
          .values({
            workspaceId: w,
            plan: input.plan,
            seatsLimit: row.seatsLimit,
            featuresJson: JSON.stringify(row.features),
          })
          .onConflictDoUpdate({
            target: workspacePlan.workspaceId,
            set: {
              plan: input.plan,
              seatsLimit: row.seatsLimit,
              featuresJson: JSON.stringify(row.features),
              updatedAt: new Date(),
            },
          })
          .returning();
        return { ...row, updatedAt: rows[0]!.updatedAt.toISOString() };
      },
    );
  }

  /** R10-21 — apply plan after verified subscription payment (no admin UI required). */
  async applyPlanFromSubscription(
    workspaceId: string,
    plan: "free" | "pro" | "business",
  ): Promise<WorkspacePlanSummary> {
    const row = {
      workspaceId,
      plan,
      seatsLimit: null as number | null,
      features: [] as string[],
      updatedAt: new Date().toISOString(),
    };
    if (!this.db) {
      this.plans.set(workspaceId, row);
      return row;
    }
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const rows = await tx
          .insert(workspacePlan)
          .values({
            workspaceId,
            plan,
            seatsLimit: null,
            featuresJson: "[]",
          })
          .onConflictDoUpdate({
            target: workspacePlan.workspaceId,
            set: { plan, updatedAt: new Date() },
          })
          .returning();
        return {
          workspaceId,
          plan: rows[0]!.plan as "free" | "pro" | "business",
          seatsLimit: rows[0]!.seatsLimit,
          features: rows[0]!.featuresJson
            ? (JSON.parse(rows[0]!.featuresJson) as string[])
            : [],
          updatedAt: rows[0]!.updatedAt.toISOString(),
        };
      },
    );
  }

  async weeklyTick() {
    if (!readProductFeatureFlags(process.env).weeklyDigest) {
      throw new ForbiddenException({ detail: "Set ENABLE_WEEKLY_DIGEST=1" });
    }
    if (!this.db) {
      return {
        eligible: 0,
        sent: 0,
        detail: "Postgres is required for digest recipient discovery",
      };
    }
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.internal_job','1',true)`);
      const prefs = await tx
        .select()
        .from(userNotificationPref)
        .where(eq(userNotificationPref.emailDigest, "weekly"));
      let sent = 0;
      for (const pref of prefs) {
        await tx.execute(sql`select set_config('app.user_id',${pref.userId},true)`);
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, pref.userId))
          .limit(1);
        const user = users[0];
        if (!user?.email) continue;
        const spaces = await tx
          .select()
          .from(membership)
          .where(eq(membership.userId, pref.userId));
        const result = this.mailer.send({
          to: user.email,
          subject: "خلاصه هفتگی دنگ",
          text: `تعداد فضاهای کاری فعال شما: ${spaces.filter((space) => !space.disabledAt).length}`,
        });
        if (result.delivered) sent += 1;
      }
      return { eligible: prefs.length, sent };
    });
  }
}

export { INTERNAL_DIGEST_ACTOR_USER_ID, INTERNAL_DIGEST_WORKSPACE_ID };
