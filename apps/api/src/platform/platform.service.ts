import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  PLATFORM_BREAK_GLASS_MAX_MINUTES,
  PRODUCT_FLAG_ENV,
  readProductFeatureFlags,
  type AuthActor,
  type PlatformBreakGlassListResponse,
  type PlatformBreakGlassOpenRequest,
  type PlatformDisableUserRequest,
  type PlatformFlagsResponse,
  type PlatformOutboxStatsResponse,
  type PlatformPasswordResetResponse,
  type PlatformRole,
  type PlatformSecurityEventsPage,
  type PlatformSetRoleRequest,
  type PlatformSetRoleResponse,
  type PlatformUserSummary,
  type PlatformUsersPage,
} from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import {
  ACCOUNT_STORE,
  RESET_TTL_MS,
  type AccountRecord,
  type AccountStore,
} from "../auth/account.types.js";
import { MailerService } from "../auth/mailer.service.js";
import { hashToken, newOpaqueToken } from "../auth/password.js";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import {
  SECURITY_EVENT_RECORDER,
  type SecurityEventRecorder,
} from "../security-events/security-events.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  PLATFORM_BREAK_GLASS_STORE,
  toBreakGlassDto,
  type PlatformBreakGlassStore,
} from "./platform.types.js";

function hideNotFound(): never {
  throw new NotFoundException({
    type: "https://dang.local/problems/not-found",
    title: "Not Found",
    status: 404,
    detail: "Not Found",
  });
}

function toUserSummary(row: AccountRecord): PlatformUserSummary {
  return {
    userId: row.userId,
    email: row.email ?? undefined,
    username: row.username ?? undefined,
    displayName: row.displayName,
    platformRole: row.platformRole,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PlatformService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(PLATFORM_BREAK_GLASS_STORE) private readonly breakGlass: PlatformBreakGlassStore,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(SECURITY_EVENT_RECORDER)
    private readonly securityEvents: SecurityEventRecorder,
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(OutboxRelay) private readonly outboxRelay: OutboxRelay,
    @Optional() @Inject(AUDIT_STORE) private readonly audit?: AuditStore,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  persistence() {
    return this.breakGlass.persistence;
  }

  /** Active break-glass for workspace financial read (auditor-equivalent). */
  async hasActiveBreakGlass(actorUserId: string, workspaceId: string): Promise<boolean> {
    const row = await this.breakGlass.findActive(actorUserId, workspaceId);
    return Boolean(row);
  }

  private async requirePlatform(
    actor: AuthActor,
    mode: "read" | "write",
  ): Promise<AccountRecord> {
    const user = await this.accounts.findById(actor.userId);
    if (!user || user.disabledAt) hideNotFound();
    if (mode === "write") {
      if (user.platformRole !== "platform_owner") hideNotFound();
      return user;
    }
    if (
      user.platformRole !== "platform_owner" &&
      user.platformRole !== "platform_support"
    ) {
      hideNotFound();
    }
    return user;
  }

  async listUsers(
    actor: AuthActor,
    query: { q?: string; cursor?: string },
  ): Promise<PlatformUsersPage> {
    // API-SURFACE: user search is owner-only.
    await this.requirePlatform(actor, "write");
    const page = await this.accounts.searchUsers({
      q: query.q,
      cursor: query.cursor,
      limit: 20,
    });
    return {
      items: page.items.map(toUserSummary),
      nextCursor: page.nextCursor,
    };
  }

  async setUserRole(
    actor: AuthActor,
    uid: string,
    body: PlatformSetRoleRequest,
  ): Promise<PlatformSetRoleResponse> {
    await this.requirePlatform(actor, "write");
    if (actor.userId === uid) {
      throw new BadRequestException({
        type: "https://dang.local/problems/self-role-change",
        title: "Cannot change own platform role",
        status: 400,
        detail: "تغییر نقش سامانهٔ خودتان مجاز نیست",
        code: "SELF_ROLE_CHANGE",
      });
    }
    const target = await this.accounts.findById(uid);
    if (!target) hideNotFound();

    const nextRole = body.platformRole;
    if (nextRole === "platform_owner" && body.confirmPendingId) {
      const pending = await this.breakGlass.getPendingRoleChange(body.confirmPendingId);
      if (
        !pending ||
        pending.targetUserId !== uid ||
        pending.requestedByUserId === actor.userId
      ) {
        throw new BadRequestException({
          type: "https://dang.local/problems/maker-checker",
          title: "Invalid pending elevation",
          status: 400,
          detail: "تأیید ارتقا باید توسط مالک سامانهٔ دیگری انجام شود",
          code: "PENDING_ROLE_INVALID",
        });
      }
      const taken = await this.breakGlass.takePendingRoleChange(body.confirmPendingId);
      if (!taken) {
        throw new BadRequestException({
          type: "https://dang.local/problems/maker-checker",
          title: "Invalid pending elevation",
          status: 400,
          detail: "تأیید ارتقا باید توسط مالک سامانهٔ دیگری انجام شود",
          code: "PENDING_ROLE_INVALID",
        });
      }
      const applied = await this.accounts.setPlatformRole(uid, "platform_owner");
      return { user: toUserSummary(applied), status: "applied" };
    }

    if (
      nextRole === "platform_owner" &&
      target.platformRole !== "platform_owner" &&
      readProductFeatureFlags(process.env).makerChecker
    ) {
      const pending = await this.breakGlass.createPendingRoleChange({
        targetUserId: uid,
        requestedByUserId: actor.userId,
      });
      return {
        user: toUserSummary(target),
        pendingId: pending.id,
        status: "pending_second_owner",
      };
    }

    if (
      target.platformRole === "platform_owner" &&
      nextRole !== "platform_owner" &&
      !target.disabledAt
    ) {
      const owners = await this.accounts.countActivePlatformOwners();
      if (owners <= 1) {
        throw new BadRequestException({
          type: "https://dang.local/problems/last-platform-owner",
          title: "Cannot demote last platform owner",
          status: 400,
          detail: "حداقل یک مالک سامانه باید فعال بماند",
          code: "LAST_PLATFORM_OWNER",
        });
      }
    }

    const applied = await this.accounts.setPlatformRole(uid, nextRole);
    return { user: toUserSummary(applied), status: "applied" };
  }

  async triggerPasswordReset(
    actor: AuthActor,
    uid: string,
  ): Promise<PlatformPasswordResetResponse> {
    await this.requirePlatform(actor, "write");
    const target = await this.accounts.findById(uid);
    if (!target?.email || !target.passwordHash) hideNotFound();
    const env = loadAppEnv();
    const token = newOpaqueToken();
    await this.accounts.createPasswordReset({
      userId: target.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    const debugResetUrl = `${env.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    const sent = this.mailer.send({
      to: target.email,
      subject: "بازیابی رمز عبور دنگ",
      text: "برای تنظیم رمز جدید روی لینک کلیک کنید.",
      actionUrl: debugResetUrl,
    });
    return {
      ok: true,
      debugResetUrl: env.allowDevAuth
        ? sent.debugUrl ?? debugResetUrl
        : undefined,
    };
  }

  async disableUser(
    actor: AuthActor,
    uid: string,
    body: PlatformDisableUserRequest,
  ): Promise<PlatformUserSummary> {
    await this.requirePlatform(actor, "write");
    if (actor.userId === uid) {
      throw new BadRequestException({
        detail: "نمی‌توانید حساب خودتان را غیرفعال کنید",
        status: 400,
        code: "SELF_DISABLE",
      });
    }
    const target = await this.accounts.findById(uid);
    if (!target) hideNotFound();
    if (target.platformRole === "platform_owner" && !target.disabledAt) {
      const owners = await this.accounts.countActivePlatformOwners();
      if (owners <= 1) {
        throw new BadRequestException({
          detail: "حداقل یک مالک سامانه باید فعال بماند",
          status: 400,
          code: "LAST_PLATFORM_OWNER",
        });
      }
    }
    const updated = await this.accounts.setDisabled(uid, {
      disabledAt: new Date(),
      disabledByUserId: actor.userId,
      disabledReason: (body.reason ?? "").trim() || null,
    });
    return toUserSummary(updated);
  }

  async getFlags(actor: AuthActor): Promise<PlatformFlagsResponse> {
    await this.requirePlatform(actor, "read");
    return {
      productFlags: readProductFeatureFlags(process.env),
      envKeys: { ...PRODUCT_FLAG_ENV },
    };
  }

  async listSecurityEvents(
    actor: AuthActor,
    query: { cursor?: string; category?: string; severity?: string } = {},
  ): Promise<PlatformSecurityEventsPage> {
    await this.requirePlatform(actor, "read");
    return this.securityEvents.listRecent({
      cursor: query.cursor,
      limit: 50,
      category: query.category as PlatformSecurityEventsPage["items"][number]["category"] | undefined,
      severity: query.severity as PlatformSecurityEventsPage["items"][number]["severity"] | undefined,
    });
  }

  /**
   * Honest outbox relay gauges for platform console.
   * Never invents zero counters when the store cannot read stats.
   */
  async getOutboxStats(actor: AuthActor): Promise<PlatformOutboxStatsResponse> {
    await this.requirePlatform(actor, "read");
    let stats: PlatformOutboxStatsResponse["stats"] = null;
    if (typeof this.outbox.getRelayStats === "function") {
      stats = await this.outbox.getRelayStats();
    }
    return {
      persistence: this.outbox.persistence,
      stats,
    };
  }

  /** Platform owner: redrive pending outbox rows (real dispatch, no invented success). */
  async redriveOutbox(
    actor: AuthActor,
    limit = 25,
  ): Promise<{
    persistence: "memory" | "postgres";
    attempted: number;
    processed: number;
    failed: number;
  }> {
    await this.requirePlatform(actor, "write");
    const capped = Math.max(1, Math.min(Number(limit) || 25, 100));
    const result = await this.outboxRelay.redrive(capped);
    await this.audit?.append({
      workspaceId: "platform",
      actorUserId: actor.userId,
      action: "platform.outbox.redrive",
      targetType: "outbox",
      targetId: "batch",
      result: result.failed > 0 && result.processed === 0 ? "failure" : "success",
      metadata: {
        attempted: result.attempted,
        processed: result.processed,
        failed: result.failed,
      },
    });
    return {
      persistence: this.outbox.persistence,
      ...result,
    };
  }

  async openBreakGlass(
    actor: AuthActor,
    body: PlatformBreakGlassOpenRequest,
  ): Promise<PlatformBreakGlassListResponse["items"][number]> {
    await this.requirePlatform(actor, "write");
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 8) {
      throw new BadRequestException({
        detail: "دلیل break-glass باید حداقل ۸ نویسه باشد",
        status: 400,
        code: "REASON_REQUIRED",
      });
    }
    const minutes = Math.floor(Number(body.expiresInMinutes));
    if (
      !Number.isFinite(minutes) ||
      minutes < 1 ||
      minutes > PLATFORM_BREAK_GLASS_MAX_MINUTES
    ) {
      throw new BadRequestException({
        detail: `بازه باید بین ۱ و ${PLATFORM_BREAK_GLASS_MAX_MINUTES} دقیقه باشد`,
        status: 400,
        code: "INVALID_EXPIRY",
      });
    }
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const row = await this.breakGlass.open({
      actorUserId: actor.userId,
      workspaceId: body.workspaceId,
      reason,
      expiresAt,
      ticketRef: body.ticketRef?.trim() || null,
    });
    this.securityEvents.emit("access.break_glass_opened", {
      workspaceId: row.workspaceId,
      actorUserId: actor.userId,
      targetType: "break_glass",
      targetId: row.id,
      reason,
      attrs: { expiresAt: expiresAt.toISOString() },
    });
    await this.notifications
      ?.notifySecurityAlert(actor.userId, {
        workspaceId: row.workspaceId,
        userId: actor.userId,
        title: "Break-glass باز شد",
        body: reason || "دسترسی اضطراری پلتفرم به فضای کاری فعال شد",
        event: "access.break_glass_opened",
      })
      .catch(() => undefined);
    await this.audit?.append({
      workspaceId: body.workspaceId,
      actorUserId: actor.userId,
      action: "platform.break_glass.open",
      targetType: "break_glass",
      targetId: row.id,
      result: "success",
      reason,
      metadata: { expiresAt: expiresAt.toISOString() },
    });
    return toBreakGlassDto(row);
  }

  async revokeBreakGlass(actor: AuthActor, bid: string) {
    await this.requirePlatform(actor, "write");
    const existing = await this.breakGlass.findById(bid);
    if (!existing) hideNotFound();
    const row = await this.breakGlass.revoke(bid, actor.userId);
    if (!row) hideNotFound();
    this.securityEvents.emit("access.break_glass_revoked", {
      workspaceId: row.workspaceId,
      actorUserId: actor.userId,
      targetType: "break_glass",
      targetId: row.id,
    });
    await this.audit?.append({
      workspaceId: row.workspaceId,
      actorUserId: actor.userId,
      action: "platform.break_glass.revoke",
      targetType: "break_glass",
      targetId: row.id,
      result: "success",
    });
    return toBreakGlassDto(row);
  }

  async listBreakGlass(
    actor: AuthActor,
    cursor?: string,
  ): Promise<PlatformBreakGlassListResponse> {
    await this.requirePlatform(actor, "read");
    const page = await this.breakGlass.list({ cursor, limit: 50 });
    return {
      items: page.items.map((r) => toBreakGlassDto(r)),
      nextCursor: page.nextCursor,
    };
  }
}

export type { PlatformRole };
