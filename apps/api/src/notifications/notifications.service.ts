import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { AuthActor, CreateNotificationInput, NotificationSummary } from "@dang/contracts";
import { enrichNotificationMetadata, groupDebtAlertLevel } from "@dang/contracts";
import { createLogger } from "@dang/observability";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { NOTIFICATION_STORE, type NotificationStore } from "./notification.store.js";
import { RealtimeHub } from "./realtime-hub.js";
import type { WaveFSettingsService } from "../wave-f-settings/wave-f-settings.service.js";
import type { MessagingService } from "../messaging/messaging.service.js";

const logger = createLogger("dang-api-notifications");

type EventPrefKey =
  | "expensePosted"
  | "settlementClaimed"
  | "inviteAccepted"
  | "inviteRemind"
  | "securityAlert";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(RealtimeHub) private readonly realtime: RealtimeHub,
    /** Lazy — avoids WaveF → Access → Platform → Notifications → WaveF DI cycle. */
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  private prefs(): WaveFSettingsService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { WaveFSettingsService: W } = require("../wave-f-settings/wave-f-settings.service.js") as {
        WaveFSettingsService: new (...args: never[]) => WaveFSettingsService;
      };
      return this.moduleRef.get(W, { strict: false });
    } catch {
      return undefined;
    }
  }

  async notify(actorUserId: string, input: CreateNotificationInput): Promise<NotificationSummary> {
    const created = await this.notifications.create(actorUserId, {
      ...input,
      metadata: enrichNotificationMetadata(input.metadata),
    });
    this.realtime.publishNotification(created);
    return created;
  }

  /** Skip in-app delivery when the recipient disabled this event class. */
  private async allowsEvent(userId: string, key: EventPrefKey): Promise<boolean> {
    const prefs = this.prefs();
    if (!prefs) return true;
    const pref = await prefs.getPref(userId);
    return pref[key] !== false;
  }

  private async notifyIfAllowed(
    actorUserId: string,
    input: CreateNotificationInput,
    key: EventPrefKey,
  ): Promise<NotificationSummary | null> {
    if (!(await this.allowsEvent(input.userId, key))) return null;
    return this.notify(actorUserId, input);
  }

  async notifyExpensePosted(
    workspaceId: string,
    payerUserId: string,
    expenseTitle: string,
    participantUserIds: readonly string[],
  ): Promise<void> {
    const recipients = participantUserIds.filter((id) => id !== payerUserId);
    await Promise.all(
      recipients.map((userId) =>
        this.notifyIfAllowed(
          payerUserId,
          {
            workspaceId,
            userId,
            channel: "in_app",
            title: "هزینه جدید ثبت شد",
            body: `${expenseTitle} — در دفتر ثبت شد`,
            metadata: { event: "expense.posted" },
          },
          "expensePosted",
        ),
      ),
    );
  }

  /**
   * The member already approved, was issued, paid or disputed this invoice, and
   * the underlying expenses have since changed. The document itself is never
   * rewritten behind their back — a correction notice is filed instead, and
   * this is how they hear about it.
   */
  async notifyInvoiceAdjusted(
    workspaceId: string,
    actorUserId: string,
    memberUserId: string,
    deltaMinor: string,
  ): Promise<void> {
    if (!memberUserId) return;
    const delta = BigInt(deltaMinor);
    if (delta === 0n) return;
    const direction = delta > 0n ? "بدهی شما بیشتر شد" : "بدهی شما کمتر شد";
    const absolute = (delta < 0n ? -delta : delta).toString();
    // Not preference-gated, like invoice issuance: a member cannot be left
    // unaware that the document they acted on no longer matches the books.
    await this.notify(actorUserId, {
      workspaceId,
      userId: memberUserId,
      channel: "in_app",
      title: "اعلامیهٔ اصلاحی صورتحساب",
      body: `${direction} · ${absolute} ریال — صورتحساب صادرشده تغییر نکرد`,
      metadata: { event: "invoice.adjusted", route: "/invoices" },
    });
  }

  /** The debtor's balance moved because someone else paid for them. */
  async notifyOnBehalfPaid(
    workspaceId: string,
    payerUserId: string,
    debtorUserId: string,
    amountMinor: string,
  ): Promise<void> {
    if (!debtorUserId || debtorUserId === payerUserId) return;
    await this.notifyIfAllowed(
      payerUserId,
      {
        workspaceId,
        userId: debtorUserId,
        channel: "in_app",
        title: "بدهی شما پرداخت شد",
        body: `مبلغ ${amountMinor} ریال به‌جای شما پرداخت و تأیید شد`,
        metadata: { event: "payment.on_behalf.approved", route: "/settlements" },
      },
      "settlementClaimed",
    );
  }

  async notifySettlementClaimed(
    workspaceId: string,
    actorUserId: string,
    counterpartUserId: string,
    amountMinor: string,
  ): Promise<void> {
    if (!counterpartUserId || counterpartUserId === actorUserId) return;
    await this.notifyIfAllowed(
      actorUserId,
      {
        workspaceId,
        userId: counterpartUserId,
        channel: "in_app",
        title: "ادعای تسویه جدید",
        body: `مبلغ ${amountMinor} ریال برای تأیید ادعا شده است`,
        metadata: { event: "settlement.claimed", route: "/settlements" },
      },
      "settlementClaimed",
    );
  }

  async notifySettlementConfirmed(
    workspaceId: string,
    actorUserId: string,
    fromUserId: string,
    toUserId: string,
    amountMinor: string,
  ): Promise<void> {
    await Promise.all([
      this.notifyIfAllowed(
        actorUserId,
        {
          workspaceId,
          userId: fromUserId,
          channel: "in_app",
          title: "تسویه تأیید شد",
          body: `مبلغ ${amountMinor} ریال تأیید شد`,
          metadata: { event: "settlement.confirmed" },
        },
        "settlementClaimed",
      ),
      this.notifyIfAllowed(
        actorUserId,
        {
          workspaceId,
          userId: toUserId,
          channel: "in_app",
          title: "تسویه دریافت شد",
          body: `مبلغ ${amountMinor} ریال تأیید شد`,
          metadata: { event: "settlement.confirmed" },
        },
        "settlementClaimed",
      ),
    ]);
  }

  /** Remind the inviter that a pending invite is nearing expiry (G09 #52). */
  async notifyInviteExpiringSoon(
    workspaceId: string,
    inviterUserId: string,
    invite: { id: string; expiresAt: string; invitedSubject?: string },
  ): Promise<void> {
    const subject = invite.invitedSubject?.trim();
    await this.notifyIfAllowed(
      inviterUserId,
      {
        workspaceId,
        userId: inviterUserId,
        channel: "in_app",
        title: "یادآوری دعوت در انتظار",
        body: subject
          ? `دعوت ${subject} تا ${invite.expiresAt.slice(0, 10)} منقضی می‌شود`
          : `یک دعوت در انتظار تا ${invite.expiresAt.slice(0, 10)} منقضی می‌شود`,
        metadata: { event: "invite.remind", inviteId: invite.id, route: "/members" },
      },
      "inviteRemind",
    );
  }

  /** Notify workspace owners/admins (except accepter) when an invite is accepted. */
  async notifyInviteAccepted(
    workspaceId: string,
    accepterUserId: string,
    workspaceName: string,
  ): Promise<void> {
    const members = (await this.iam.listMembers(workspaceId, accepterUserId)) ?? [];
    const recipients = members.filter(
      (m) =>
        (m.role === "owner" || m.role === "admin") && m.userId !== accepterUserId,
    );
    if (recipients.length === 0) {
      logger.debug("invite.accept.notify.skip", {
        workspaceId,
        reason: "no_owner_admin_recipients",
      });
      return;
    }
    await Promise.all(
      recipients.map((m) =>
        this.notifyIfAllowed(
          accepterUserId,
          {
            workspaceId,
            userId: m.userId,
            channel: "in_app",
            title: "دعوت پذیرفته شد",
            body: `عضو جدید به «${workspaceName}» پیوست`,
            metadata: { event: "invite.accepted", route: "/members" },
          },
          "inviteAccepted",
        ),
      ),
    );
  }

  /** Account/workspace security signal — gated by securityAlert pref. */
  async notifySecurityAlert(
    actorUserId: string,
    input: {
      workspaceId: string;
      userId: string;
      title: string;
      body: string;
      event: string;
    },
  ): Promise<void> {
    await this.notifyIfAllowed(
      actorUserId,
      {
        workspaceId: input.workspaceId,
        userId: input.userId,
        channel: "in_app",
        title: input.title,
        body: input.body,
        metadata: { event: input.event },
      },
      "securityAlert",
    );
  }

  async notifyGroupDebtAlerts(
    workspaceId: string,
    actorUserId: string,
    lines: readonly { userId: string; net: { amountMinor: string } }[],
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    for (const line of lines) {
      const level = groupDebtAlertLevel(BigInt(line.net.amountMinor));
      if (level === "ok") continue;
      const existing = await this.notifications.listForUser(workspaceId, line.userId);
      const already = existing.some(
        (n) =>
          n.metadata?.event === "group.debt.alert" &&
          (n.createdAt?.slice(0, 10) ?? "") === today,
      );
      if (already) continue;
      const toman = Math.round(Number(line.net.amountMinor) / 10);
      const absLabel = new Intl.NumberFormat("fa-IR").format(Math.abs(toman));
      const direction = toman >= 0 ? "طلب شما" : "بدهی شما";
      await this.notify(actorUserId, {
        workspaceId,
        userId: line.userId,
        channel: "in_app",
        title: level === "exceeded" ? "مانده زیاد — اقدام کنید" : "مانده قابل توجه",
        body: `${direction} حدود ${absLabel} تومان است`,
        metadata: {
          event: "group.debt.alert",
          route: "/settlements",
          level: String(level),
        },
      });
    }
  }

  /** Explicit member-triggered reminder (once per target per day). */
  async notifyDebtReminder(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
    netAmountMinor: string,
  ): Promise<{ ok: true; skipped?: "already_today" }> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.notifications.listForUser(workspaceId, targetUserId);
    const already = existing.some(
      (n) =>
        (n.metadata?.event === "group.debt.remind" ||
          n.metadata?.event === "group.debt.alert") &&
        (n.createdAt?.slice(0, 10) ?? "") === today,
    );
    if (already) return { ok: true, skipped: "already_today" };

    const toman = Math.round(Number(netAmountMinor) / 10);
    const absLabel = new Intl.NumberFormat("fa-IR").format(Math.abs(toman));
    await this.notify(actorUserId, {
      workspaceId,
      userId: targetUserId,
      channel: "in_app",
      title: "یادآوری بدهی",
      body: `مانده بدهی شما حدود ${absLabel} تومان است — از تسویه اقدام کنید.`,
      metadata: {
        event: "group.debt.remind",
        route: "/settlements",
        level: "remind",
        actions: "settle,open",
      },
    });
    await this.fanOutMessaging(targetUserId, workspaceId, {
      title: "یادآوری بدهی",
      body: `مانده بدهی شما حدود ${absLabel} تومان است — از تسویه اقدام کنید.`,
    });
    return { ok: true };
  }

  private messaging(): MessagingService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MessagingService: M } = require("../messaging/messaging.service.js") as {
        MessagingService: new (...args: never[]) => MessagingService;
      };
      return this.moduleRef.get(M, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async fanOutMessaging(
    userId: string,
    workspaceId: string,
    message: { title: string; body: string },
  ): Promise<void> {
    const messaging = this.messaging();
    if (!messaging?.isLiveChannel) return;
    try {
      await messaging.send({
        workspaceId,
        userId,
        title: message.title,
        body: message.body,
      });
    } catch (err: unknown) {
      logger.warn("messaging fan-out failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<NotificationSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.notifications.listForUser(workspaceId, actor.userId);
  }

  async markRead(
    actor: AuthActor,
    workspaceId: string,
    notificationId: string,
  ): Promise<NotificationSummary> {
    await this.requireMember(workspaceId, actor.userId);
    try {
      const updated = await this.notifications.markRead(
        workspaceId,
        actor.userId,
        notificationId,
      );
      this.realtime.publishNotificationRead(updated);
      return updated;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOTIFICATION_NOT_FOUND") {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "Notification not found",
          status: 404,
        });
      }
      throw error;
    }
  }

  /** Membership check for SSE and list — throws Forbidden if not a member. */
  async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }

  hub(): RealtimeHub {
    return this.realtime;
  }
}
