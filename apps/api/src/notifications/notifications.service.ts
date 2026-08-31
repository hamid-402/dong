import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthActor, CreateNotificationInput, NotificationSummary } from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { NOTIFICATION_STORE, type NotificationStore } from "./notification.store.js";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  notify(input: CreateNotificationInput): Promise<NotificationSummary> {
    return this.notifications.create(input);
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
        this.notify({
          workspaceId,
          userId,
          channel: "in_app",
          title: "هزینه جدید ثبت شد",
          body: `${expenseTitle} — در دفتر ثبت شد`,
          metadata: { event: "expense.posted" },
        }),
      ),
    );
  }

  async notifySettlementConfirmed(
    workspaceId: string,
    fromUserId: string,
    toUserId: string,
    amountMinor: string,
  ): Promise<void> {
    await Promise.all([
      this.notify({
        workspaceId,
        userId: fromUserId,
        channel: "in_app",
        title: "تسویه تأیید شد",
        body: `مبلغ ${amountMinor} ریال تأیید شد`,
        metadata: { event: "settlement.confirmed" },
      }),
      this.notify({
        workspaceId,
        userId: toUserId,
        channel: "in_app",
        title: "تسویه دریافت شد",
        body: `مبلغ ${amountMinor} ریال تأیید شد`,
        metadata: { event: "settlement.confirmed" },
      }),
    ]);
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
      return await this.notifications.markRead(workspaceId, actor.userId, notificationId);
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

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }
}
