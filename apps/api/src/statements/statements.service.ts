import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildMemberStatementDetail,
  statementDetailToCsv,
  statementDetailToJson,
  summarizeMemberStatement,
  buildStatementPack,
  statementPackToCsv,
  buildStatementPackPrintHtml,
  defaultKindDocumentTitle,
  spaceKindForTemplate,
  type AuthActor,
  type CreateStatementExportRequest,
  type CreateStatementPackExportRequest,
  type MemberStatementDetail,
  type StatementExportSummary,
  type StatementGranularity,
  type WorkspacePayoutInstructions,
  type WorkspaceStatementsResponse,
} from "@dang/contracts";
import { buildXlsxWorkbook } from "../reports/xlsx-body.js";
import {
  buildStatementPackPdf,
  statementPackPdfProviderMode,
} from "../reports/statement-pack-pdf.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { ACCOUNT_STORE, type AccountStore } from "../auth/account.types.js";
import { MailerService } from "../auth/mailer.service.js";
import { createAdaptiveRateLimit } from "../auth/rate-limit.factory.js";
import {
  applyRateLimitHeaders,
  rateLimitProblemFields,
  type RateLimitHeaderReply,
} from "../auth/rate-limit.js";
import { resolveExpenseListOptions } from "../expenses/expense-list-options.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { loadAppEnv } from "@dang/config";
import {
  payoutDestinationEncryptionMode,
  type PayoutDestinationEncryptionMode,
} from "./payout-destination-crypto.js";
import {
  PAYOUT_INSTRUCTIONS_STORE,
  type PayoutInstructionsStore,
} from "./payout-instructions.types.js";
import {
  STATEMENTS_EXPORT_STORE,
  type StatementsExportStore,
} from "./statements.types.js";

const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const notifyRate = createAdaptiveRateLimit(20, 60_000);

@Injectable()
export class StatementsService {
  constructor(
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(STATEMENTS_EXPORT_STORE)
    private readonly exports: StatementsExportStore,
    @Inject(PAYOUT_INSTRUCTIONS_STORE)
    private readonly payout: PayoutInstructionsStore,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
  ) {}

  persistence(): "memory" | "postgres" {
    return this.exports.persistence;
  }

  payoutPersistence(): "memory" | "postgres" {
    return this.payout.persistence;
  }

  providerMode(): "csv_json_print_v1" {
    return "csv_json_print_v1";
  }

  /** Honest binary PDF capability — depends on bundled Vazirmatn font. */
  packPdfProviderMode(): "pdfkit_vazir_v1" | "unavailable" {
    // Lazy import path via reports helper would create cycle; duplicate check here.
    return statementPackPdfProviderMode();
  }

  payoutProviderMode(): "workspace_v1" {
    return "workspace_v1";
  }

  payoutDestinationCryptoMode(): PayoutDestinationEncryptionMode {
    return payoutDestinationEncryptionMode();
  }

  async listSummaries(
    actor: AuthActor,
    workspaceId: string,
    from: string,
    to: string,
    granularity: StatementGranularity,
  ): Promise<WorkspaceStatementsResponse> {
    const { role } = await this.access.requireAccess(
      workspaceId,
      actor.userId,
      "statement.read_self",
    );
    const canReadAny = this.access.evaluate(
      role,
      "statement.read_any",
      actor.userId,
    ).allowed;

    if (!canReadAny) {
      const detail = await this.getDetail(actor, workspaceId, actor.userId, from, to);
      return {
        workspaceId,
        from,
        to,
        granularity,
        members: [summarizeMemberStatement(detail, granularity)],
      };
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const expenses = await this.loadExpenses(workspaceId, actor.userId);
    const summaries = members.map((m) => {
      const detail = buildMemberStatementDetail({
        workspaceId,
        userId: m.userId,
        from,
        to,
        expenses,
      });
      return summarizeMemberStatement(detail, granularity);
    });

    return { workspaceId, from, to, granularity, members: summaries };
  }

  async getDetail(
    actor: AuthActor,
    workspaceId: string,
    subjectUserId: string,
    from: string,
    to: string,
  ): Promise<MemberStatementDetail> {
    if (actor.userId === subjectUserId) {
      await this.access.requireAccess(workspaceId, actor.userId, "statement.read_self");
    } else {
      await this.access.requireAccess(workspaceId, actor.userId, "statement.read_any");
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    if (!members.some((m) => m.userId === subjectUserId)) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "عضو یافت نشد",
        status: 404,
      });
    }

    const expenses = await this.loadExpenses(workspaceId, actor.userId);
    const detail = buildMemberStatementDetail({
      workspaceId,
      userId: subjectUserId,
      from,
      to,
      expenses,
    });
    const payoutRow = await this.payout.get(workspaceId, actor.userId);
    detail.payoutInstructions = payoutRow
      ? ({
          holderName: payoutRow.holderName,
          destinationKind: payoutRow.destinationKind,
          destinationValue: payoutRow.destinationValue,
          bankName: payoutRow.bankName,
          updatedAt: payoutRow.updatedAt,
          updatedByUserId: payoutRow.updatedByUserId,
        } satisfies WorkspacePayoutInstructions)
      : null;
    return detail;
  }

  async notifyMember(
    actor: AuthActor,
    workspaceId: string,
    subjectUserId: string,
    from: string,
    to: string,
    reply?: RateLimitHeaderReply | null,
  ): Promise<{ notified: true; href: string; emailDelivered: boolean }> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const rate = await notifyRate.consume(`stmt-notify:${workspaceId}:${actor.userId}`);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      this.securityEvents.emit("auth.rate_limited", {
        workspaceId,
        actorUserId: actor.userId,
        reason: "statement_notify",
      });
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many statement notifications",
          status: 429,
          detail: "اعلان صورتحساب زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const subject = members.find((m) => m.userId === subjectUserId);
    if (!subject) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "عضو یافت نشد",
        status: 404,
      });
    }

    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const slug = workspace?.slug ?? workspaceId;
    const href = `/w/${encodeURIComponent(slug)}/statements/${encodeURIComponent(subjectUserId)}?from=${from}&to=${to}`;

    await this.notifications.notify(actor.userId, {
      workspaceId,
      userId: subjectUserId,
      channel: "in_app",
      title: "صورتحساب آماده است",
      body: `بازه ${from} تا ${to} — از لینک صورتحساب باز کنید`,
      metadata: {
        event: "statement.ready",
        from,
        to,
        href,
      },
    });

    let emailDelivered = false;
    if (this.mailer.isLiveDelivery()) {
      const account = await this.accounts.findById(subjectUserId);
      const toEmail = account?.email?.trim();
      if (toEmail && toEmail.includes("@") && !toEmail.endsWith("@invalid.local")) {
        const env = loadAppEnv();
        const absoluteHref = `${env.webOrigin.replace(/\/$/, "")}${href}`;
        const sent = this.mailer.send({
          to: toEmail,
          subject: "صورتحساب آماده است — دنگ",
          text: `صورتحساب بازه ${from} تا ${to} آماده است. برای مشاهده لینک زیر را باز کنید.`,
          actionUrl: absoluteHref,
        });
        emailDelivered = sent.delivered;
      }
    }

    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "statement.notify",
      targetType: "member_statement",
      targetId: subjectUserId,
      result: "success",
      metadata: {
        from,
        to,
        emailDelivered: emailDelivered ? "1" : "0",
        mailerMode: this.mailer.mode(),
      },
    });

    return { notified: true, href, emailDelivered };
  }

  async createExport(
    actor: AuthActor,
    workspaceId: string,
    subjectUserId: string,
    body: CreateStatementExportRequest,
  ): Promise<StatementExportSummary> {
    const detail = await this.getDetail(
      actor,
      workspaceId,
      subjectUserId,
      body.from,
      body.to,
    );
    await this.access.requireAccess(workspaceId, actor.userId, "statement.export", {
      ownerUserId: subjectUserId,
    });

    const id = crypto.randomUUID();
    const fileName =
      body.format === "csv"
        ? `statement-${subjectUserId.slice(0, 8)}-${body.from}_${body.to}.csv`
        : `statement-${subjectUserId.slice(0, 8)}-${body.from}_${body.to}.json`;
    const mimeType =
      body.format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
    const content =
      body.format === "csv" ? statementDetailToCsv(detail) : statementDetailToJson(detail);

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS).toISOString();
    const downloadPath = `/workspaces/${workspaceId}/statements/exports/${id}/download`;
    const created = await this.exports.create({
      id,
      workspaceId,
      subjectUserId,
      from: body.from,
      to: body.to,
      format: body.format,
      status: "ready",
      rowCount: detail.lines.length,
      downloadPath,
      requestedByUserId: actor.userId,
      createdAt: nowIso,
      completedAt: nowIso,
      expiresAt,
      body: content,
      mimeType,
      fileName,
    });

    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "statement.export.create",
      targetType: "statement_export",
      targetId: id,
      result: "success",
      metadata: {
        subjectUserId,
        format: body.format,
        from: body.from,
        to: body.to,
        rowCount: String(detail.lines.length),
      },
    });

    return this.toSummary(created);
  }

  /**
   * Organizational pack: master day×member sheet + one sheet per member
   * (xlsx / csv / formal HTML print / binary PDF).
   */
  async createPackExport(
    actor: AuthActor,
    workspaceId: string,
    body: CreateStatementPackExportRequest,
  ): Promise<StatementExportSummary> {
    const { role } = await this.access.requireAccess(
      workspaceId,
      actor.userId,
      "statement.read_self",
    );
    const canReadAny = this.access.evaluate(
      role,
      "statement.read_any",
      actor.userId,
    ).allowed;
    await this.access.requireAccess(workspaceId, actor.userId, "statement.export", {
      ownerUserId: actor.userId,
    });

    const allMembers = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const members = canReadAny
      ? allMembers
      : allMembers.filter((m) => m.userId === actor.userId);
    if (!members.length) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "عضوی یافت نشد",
        status: 404,
      });
    }

    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const expenses = await this.loadExpenses(workspaceId, actor.userId);
    const payoutRow = await this.payout.get(workspaceId, actor.userId);
    const payoutInstructions = payoutRow
      ? ({
          holderName: payoutRow.holderName,
          destinationKind: payoutRow.destinationKind,
          destinationValue: payoutRow.destinationValue,
          bankName: payoutRow.bankName,
          updatedAt: payoutRow.updatedAt,
          updatedByUserId: payoutRow.updatedByUserId,
        } satisfies WorkspacePayoutInstructions)
      : null;

    const kind = spaceKindForTemplate(workspace?.template);
    const kindLabel =
      kind === "personal"
        ? "شخصی"
        : kind === "building"
          ? "ساختمان"
          : kind === "org"
            ? "سازمان"
            : "گروه";

    const issuedAtIso = new Date().toISOString();
    const documentNo =
      body.documentNo?.trim() ||
      `STP-${workspaceId.slice(0, 8)}-${body.from.replaceAll("-", "")}`;

    const pack = buildStatementPack({
      meta: {
        workspaceId,
        workspaceName: workspace?.name ?? workspaceId,
        spaceKindLabel: kindLabel,
        kindDocumentTitle:
          body.kindDocumentTitle?.trim() || defaultKindDocumentTitle(kindLabel),
        letterheadNote: body.letterheadNote?.trim() || undefined,
        footerNote:
          body.footerNote?.trim() ||
          "این سند بر اساس هزینه‌های ثبت‌شده در سامانه دنگ صادر شده است.",
        sealLabel: body.sealLabel?.trim() || undefined,
        from: body.from,
        to: body.to,
        documentNo,
        issuedAtIso,
        payoutInstructions,
      },
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName?.trim() || m.userId.slice(0, 8),
      })),
      expenses,
    });

    const id = crypto.randomUUID();
    let fileName: string;
    let mimeType: string;
    let content: string;
    let encoding: "utf8" | "base64" = "utf8";

    if (body.format === "xlsx") {
      const buf = buildXlsxWorkbook(pack.sheets);
      content = buf.toString("base64");
      encoding = "base64";
      mimeType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      fileName = `statement-pack-${body.from}_${body.to}.xlsx`;
    } else if (body.format === "pdf") {
      const buf = await buildStatementPackPdf(pack);
      if (!buf.length || buf.subarray(0, 4).toString("latin1") !== "%PDF") {
        throw new HttpException(
          {
            type: "https://dang.local/problems/pdf-unavailable",
            title: "PDF در دسترس نیست",
            status: 503,
            detail:
              statementPackPdfProviderMode() === "unavailable"
                ? "فونت Vazirmatn روی سرور نیست — از چاپ رسمی HTML استفاده کنید"
                : "تولید PDF ناموفق بود",
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      content = buf.toString("base64");
      encoding = "base64";
      mimeType = "application/pdf";
      fileName = `statement-pack-${body.from}_${body.to}.pdf`;
    } else if (body.format === "html_print") {
      content = buildStatementPackPrintHtml(pack);
      mimeType = "text/html; charset=utf-8";
      fileName = `statement-pack-${body.from}_${body.to}.html`;
    } else {
      content = statementPackToCsv(pack);
      mimeType = "text/csv; charset=utf-8";
      fileName = `statement-pack-${body.from}_${body.to}.csv`;
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS).toISOString();
    const downloadPath = `/workspaces/${workspaceId}/statements/exports/${id}/download`;
    const created = await this.exports.create({
      id,
      workspaceId,
      subjectUserId: actor.userId,
      from: body.from,
      to: body.to,
      format:
        body.format === "csv"
          ? "csv"
          : body.format === "xlsx"
            ? "xlsx"
            : body.format === "pdf"
              ? "pdf"
              : "html_print",
      status: "ready",
      rowCount: pack.details.reduce((n, d) => n + d.lines.length, 0),
      downloadPath,
      requestedByUserId: actor.userId,
      createdAt: nowIso,
      completedAt: nowIso,
      expiresAt,
      body: encoding === "base64" ? `base64:${content}` : content,
      mimeType,
      fileName,
    });

    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "statement.pack.export.create",
      targetType: "statement_export",
      targetId: id,
      result: "success",
      metadata: {
        format: body.format,
        from: body.from,
        to: body.to,
        memberCount: String(members.length),
        rowCount: String(created.rowCount),
      },
    });

    return this.toSummary(created);
  }

  async getExport(
    actor: AuthActor,
    workspaceId: string,
    exportId: string,
  ): Promise<StatementExportSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    const row = await this.exports.get(workspaceId, exportId, actor.userId);
    if (!row) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "خروجی یافت نشد",
        status: 404,
      });
    }
    await this.assertCanAccessExport(actor, workspaceId, row.subjectUserId, row.requestedByUserId);
    return this.toSummary(row);
  }

  async downloadPayload(
    actor: AuthActor,
    workspaceId: string,
    exportId: string,
  ): Promise<{ body: string | Buffer; mimeType: string; fileName: string }> {
    await this.access.requireMember(workspaceId, actor.userId);
    const row = await this.exports.get(workspaceId, exportId, actor.userId);
    if (!row || row.status !== "ready" || !row.body) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "فایل خروجی آماده نیست",
        status: 404,
      });
    }
    await this.assertCanAccessExport(actor, workspaceId, row.subjectUserId, row.requestedByUserId);

    this.securityEvents.emit("privacy.data_exported", {
      workspaceId,
      actorUserId: actor.userId,
      reason: "statement_export_download",
      attrs: {
        exportId,
        subjectUserId: row.subjectUserId,
        format: row.format,
      },
    });

    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "statement.export.download",
      targetType: "statement_export",
      targetId: exportId,
      result: "success",
      metadata: {
        subjectUserId: row.subjectUserId,
        format: row.format,
      },
    });

    const raw = row.body;
    const body =
      raw.startsWith("base64:") ? Buffer.from(raw.slice("base64:".length), "base64") : raw;

    return {
      body,
      mimeType: row.mimeType ?? "application/octet-stream",
      fileName: row.fileName ?? `statement-${exportId}`,
    };
  }

  /** Retention sweep — memory store clears bodies; postgres relies on lazy get(). */
  async purgeExpiredExports(): Promise<{ purged: number }> {
    const purged = await this.exports.purgeExpiredBodies();
    return { purged };
  }

  private async assertCanAccessExport(
    actor: AuthActor,
    workspaceId: string,
    subjectUserId: string,
    requestedByUserId: string,
  ): Promise<void> {
    if (actor.userId === requestedByUserId) {
      await this.access.requireAccess(workspaceId, actor.userId, "statement.export", {
        ownerUserId: subjectUserId,
      });
      return;
    }
    if (actor.userId === subjectUserId) {
      await this.access.requireAccess(workspaceId, actor.userId, "statement.read_self");
      return;
    }
    await this.access.requireAccess(workspaceId, actor.userId, "statement.read_any");
  }

  private async loadExpenses(workspaceId: string, actorUserId: string) {
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actorUserId,
    );
    return this.expenses.listForWorkspace(workspaceId, actorUserId, {
      viewAllPrivate,
    });
  }

  private toSummary(
    row: StatementExportSummary & { body?: string; expiresAt?: string },
  ): StatementExportSummary {
    const { body: _body, ...summary } = row as StatementExportSummary & {
      body?: string;
      mimeType?: string;
      fileName?: string;
      expiresAt?: string;
    };
    void _body;
    return {
      id: summary.id,
      workspaceId: summary.workspaceId,
      subjectUserId: summary.subjectUserId,
      from: summary.from,
      to: summary.to,
      format: summary.format,
      status: summary.status,
      rowCount: summary.rowCount,
      downloadPath: summary.downloadPath,
      requestedByUserId: summary.requestedByUserId,
      createdAt: summary.createdAt,
      completedAt: summary.completedAt,
      errorDetail: summary.errorDetail,
      expiresAt: summary.expiresAt,
    };
  }
}
