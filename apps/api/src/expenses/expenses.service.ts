import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type {
  AuthActor,
  CreateExpenseDraftRequest,
  ExpenseListQuery,
  ExpenseSummary,
  JournalEntrySummary,
  MemberInvoiceAdjustmentSummary,
} from "@dang/contracts";
import {
  buildFormulaWeightsFromSubunits,
  readProductFeatureFlags,
  resolvePostingDecision,
  spaceKindForTemplate,
  COMPANY_EXPENSE_POST_ROLES,
  type PostingDecision,
} from "@dang/contracts";
import { parseExpenseCsv, type ExpenseCsvImportRequest } from "@dang/contracts";
import { withTenantContext, type AppDatabase } from "@dang/db";
import { getRequestId, getTraceId, withSpan } from "@dang/observability";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import {
  OUTBOX_STORE,
  type OutboxRecord,
  type OutboxStore,
} from "../outbox/outbox.types.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "../attachments/attachment.store.js";
import { ApprovalStepsService } from "../approval-steps/approval-steps.module.js";
import { MakerCheckerService } from "../maker-checker/maker-checker.service.js";
import { MfaService } from "../auth/mfa.service.js";
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { createClassRateLimit } from "../auth/rate-limit.factory.js";
import {
  applyRateLimitHeaders,
  rateLimitProblemFields,
  type RateLimitHeaderReply,
} from "../auth/rate-limit.js";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import { BillingMaintenanceService } from "../billing/billing-maintenance.service.js";
import { resolveExpenseListOptions } from "./expense-list-options.js";
import {
  EXPENSE_POLICY_STORE,
  type ExpensePolicyStore,
} from "../expense-policy/expense-policy.types.js";
import {
  EXPENSE_STORE,
  toExpenseSummary,
  type ExpenseStore,
  type StoredExpense,
} from "./expense.types.js";
import { ExpenseTagsService } from "./expense-tags.service.js";
import { OUTING_STORE, type OutingStore } from "./outing.store.js";
import { WorkspacePaymentsService } from "../payments/workspace-payments.service.js";
import {
  WORKSPACE_SUBUNIT_STORE,
  type WorkspaceSubunitStore,
} from "../subunits/subunit.types.js";
import type { AllowancesService } from "../allowances/allowances.service.js";
import { evaluatePerDiemRequiresApproval } from "./expense-org-policy.js";
import {
  applyOriginalMoneyToIrr,
  resolveConversionLive,
} from "../fx-rates/fx-convert-live.js";
import { loadAppEnv } from "@dang/config";
import type { FxRateSummary } from "@dang/contracts";

const COMPANY_POST_ROLES = new Set<string>(COMPANY_EXPENSE_POST_ROLES);

/** Adaptive finance-write class — createDraft / submit mutations. */
const expenseWriteRate = createClassRateLimit("finance-write");


@Injectable()
export class ExpensesService {
  constructor(
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(EXPENSE_POLICY_STORE) private readonly policies: ExpensePolicyStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(OutboxRelay) private readonly outboxRelay: OutboxRelay,
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(ApprovalStepsService) private readonly approvalSteps: ApprovalStepsService,
    @Inject(MakerCheckerService) private readonly makerChecker: MakerCheckerService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Optional() @Inject(ExpenseTagsService) private readonly expenseTags?: ExpenseTagsService,
    @Optional() @Inject(OUTING_STORE) private readonly outings?: OutingStore,
    /** Optional so unit tests can build the service without billing wired. */
    @Optional() @Inject(BILLING_STORE) private readonly billing?: BillingStore,
    @Optional()
    @Inject(BillingMaintenanceService)
    private readonly billingMaintenance?: BillingMaintenanceService,
    @Optional()
    @Inject(forwardRef(() => WorkspacePaymentsService))
    private readonly workspacePayments?: WorkspacePaymentsService,
    @Optional() @Inject(MfaService) private readonly mfa?: MfaService,
    @Optional()
    @Inject(WORKSPACE_SUBUNIT_STORE)
    private readonly subunits?: WorkspaceSubunitStore,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /** Lazy — FxRatesModule is optional for unit tests without FX wired. */
  private async listFxRates(): Promise<FxRateSummary[] | null> {
    if (!this.moduleRef) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- break module load order
      const { FxRatesService: S } = require("../fx-rates/fx-rates.module.js") as {
        FxRatesService: new (...args: never[]) => { list(): Promise<FxRateSummary[]> };
      };
      const fx = this.moduleRef.get(S, { strict: false });
      if (!fx) return null;
      return fx.list();
    } catch {
      return null;
    }
  }

  /** Lazy — AllowancesModule imports ExpensesModule. */
  private allowancesService(): AllowancesService | undefined {
    if (!this.moduleRef) return undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- break module cycle
      const { AllowancesService: S } = require("../allowances/allowances.service.js") as {
        AllowancesService: new (...args: never[]) => AllowancesService;
      };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  async createDraft(
    actor: AuthActor,
    workspaceId: string,
    body: CreateExpenseDraftRequest,
    reply?: RateLimitHeaderReply | null,
  ): Promise<ExpenseSummary> {
    await this.assertExpenseWriteRate(actor.userId, workspaceId, reply);
    await this.access.requireAccess(workspaceId, actor.userId, "expense.create");

    let draftBody = body;
    if (body.missionKind) {
      draftBody = { ...body, visibility: "company" };
    }
    const resolvedBody = await this.resolveFormulaDraft(workspaceId, actor.userId, draftBody);

    let requiresApproval = resolvedBody.requiresApproval;
    let policyNoteSuffix = "";
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const visibility = resolvedBody.visibility ?? "shared";
    const flags = readProductFeatureFlags(process.env);
    const orgExpense =
      flags.expensePolicy && spaceKindForTemplate(workspace?.template) === "org";
    if (orgExpense && (visibility === "shared" || visibility === "company")) {
      const policy = await this.policies.get(workspaceId, actor.userId);
      if (policy.requireCostCenter && !resolvedBody.costCenterId?.trim()) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "COST_CENTER_REQUIRED",
          status: 400,
          detail: "مرکز هزینه برای این فضای سازمانی الزامی است",
        });
      }
      if (
        policy.approvalThresholdMinor !== null &&
        BigInt(resolvedBody.total.amountMinor) >= BigInt(policy.approvalThresholdMinor)
      ) {
        requiresApproval = true;
      }
      if (policy.perDiemDailyMinor?.trim()) {
        const expenses = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
          viewAllPrivate: true,
        });
        if (
          evaluatePerDiemRequiresApproval({
            perDiemDailyMinor: policy.perDiemDailyMinor,
            expenses,
            actorUserId: actor.userId,
            occurredOn: resolvedBody.occurredOn,
            addedMinor: resolvedBody.total.amountMinor,
          })
        ) {
          requiresApproval = true;
          policyNoteSuffix = "[policy:per_diem_exceeded]";
        }
      }
    }
    if (flags.allowance) {
      const allowances = this.allowancesService();
      if (
        allowances &&
        (await allowances.wouldExceedActiveAllowance(
          workspaceId,
          actor.userId,
          actor.userId,
          resolvedBody.total.amountMinor,
          resolvedBody.occurredOn,
        ))
      ) {
        requiresApproval = true;
        policyNoteSuffix = policyNoteSuffix
          ? `${policyNoteSuffix} [policy:allowance_over_limit]`
          : "[policy:allowance_over_limit]";
      }
    }
    if (resolvedBody.periodId) {
      await this.assertPeriodAcceptsPostings(workspaceId, actor.userId, resolvedBody.periodId);
    }
    if (resolvedBody.outingId && this.outings) {
      await this.assertOutingBudget(
        workspaceId,
        actor.userId,
        resolvedBody.outingId,
        resolvedBody.total.amountMinor,
      );
    }

    let fxBound = resolvedBody;
    if (
      resolvedBody.originalCurrency &&
      resolvedBody.originalAmountMinor &&
      resolvedBody.originalCurrency.toUpperCase() !== "IRR"
    ) {
      if (!resolveConversionLive(loadAppEnv())) {
        throw new BadRequestException({
          type: "https://dang.local/problems/fx-conversion-off",
          title: "FX_CONVERSION_OFF",
          status: 400,
          detail:
            "تبدیل ارز زنده خاموش است — capabilities.conversionLive یا جدول نرخ در دسترس نیست",
        });
      }
      const rows = await this.listFxRates();
      if (!rows) {
        throw new BadRequestException({
          type: "https://dang.local/problems/fx-conversion-off",
          title: "FX_CONVERSION_OFF",
          status: 400,
          detail: "سرویس نرخ ارز در دسترس نیست",
        });
      }
      try {
        const applied = applyOriginalMoneyToIrr({
          rows,
          originalCurrency: resolvedBody.originalCurrency,
          originalAmountMinor: resolvedBody.originalAmountMinor,
          asOf: resolvedBody.occurredOn,
        });
        if (resolvedBody.total.amountMinor !== applied.irrMinor) {
          throw new BadRequestException({
            type: "https://dang.local/problems/fx-total-mismatch",
            title: "FX_TOTAL_MISMATCH",
            status: 400,
            detail: `مبلغ IRR باید ${applied.irrMinor} باشد (نرخ ${applied.rate})`,
            expectedIrrMinor: applied.irrMinor,
            fxRateId: applied.fxRateId,
          });
        }
        fxBound = { ...resolvedBody, fxRateId: applied.fxRateId };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        const msg = err instanceof Error ? err.message : "FX_CONVERT_FAILED";
        throw new BadRequestException({
          type: "https://dang.local/problems/fx-convert-failed",
          title: msg,
          status: 400,
          detail:
            msg === "FX_RATE_NOT_FOUND"
              ? "نرخ ارز برای این جفت در جدول نیست"
              : "تبدیل ارز ناموفق بود",
        });
      }
    }

    const payload: CreateExpenseDraftRequest = {
      ...fxBound,
      workspaceId,
      note: policyNoteSuffix
        ? [fxBound.note?.trim(), policyNoteSuffix].filter(Boolean).join(" ")
        : fxBound.note,
      periodId:
        fxBound.periodId ??
        (await this.resolvePeriodId(workspaceId, actor.userId, fxBound)),
      requiresApproval:
        requiresApproval ?? (visibility === "company" ? true : undefined),
    };

    try {
      const created = await withSpan(
        "expense.createDraft",
        { workspaceId, visibility },
        () =>
          this.idempotency.run(
            `expense.draft:${workspaceId}`,
            actor.userId,
            resolvedBody.idempotencyKey,
            async () => {
              const created = await this.expenses.createDraft(actor.userId, payload);
              let tagIds: string[] | undefined;
              if (resolvedBody.tagIds?.length && this.expenseTags) {
                tagIds = await this.expenseTags.store().setExpenseTags(
                  workspaceId,
                  created.id,
                  actor.userId,
                  resolvedBody.tagIds,
                );
              }
              await this.recordCatalogUsage(workspaceId, created);
              await this.audit.append({
                workspaceId,
                actorUserId: actor.userId,
                action: "expense.draft.create",
                targetType: "expense",
                targetId: created.id,
                result: "success",
                metadata: {
                  amountMinor: created.total.amountMinor,
                  splitMethod: created.splitMethod,
                },
              });
              return { ...toExpenseSummary(created), tagIds };
            },
          ),
      );
      if (resolvedBody.commit !== "auto") {
        await this.refreshPendingInvoices(workspaceId, actor.userId, created);
        return created;
      }
      const committed = await this.commitAuto(actor, workspaceId, created);
      await this.refreshPendingInvoices(workspaceId, actor.userId, committed);
      return committed;
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  /**
   * Carries a fresh draft as far as workspace policy allows in one request:
   * submit, then post when nothing holds it back. Approval holds are a normal
   * outcome, not an error — the caller reads the returned status.
   */
  private async commitAuto(
    actor: AuthActor,
    workspaceId: string,
    draft: ExpenseSummary,
  ): Promise<ExpenseSummary> {
    const submitted = await this.submit(actor, workspaceId, draft.id);
    const decision = await this.resolveAutoPostingDecision(
      actor,
      workspaceId,
      submitted,
    );
    if (decision.commit !== "post") return submitted;
    try {
      return await this.post(actor, workspaceId, draft.id);
    } catch (error: unknown) {
      // A guard we could not predict (role/approval) — leave it submitted.
      if (error instanceof ForbiddenException) return submitted;
      throw error;
    }
  }

  /** Server-side answer to “may this expense hit the ledger now?”. */
  private async resolveAutoPostingDecision(
    actor: AuthActor,
    workspaceId: string,
    expense: ExpenseSummary,
  ): Promise<PostingDecision> {
    const flags = readProductFeatureFlags(process.env);
    const policy = flags.expensePolicy
      ? await this.policies.get(workspaceId, actor.userId).catch(() => null)
      : null;
    const { role } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    const categoryIds = policy?.requireReceiptCategoryIds ?? [];
    const categoryForced =
      Boolean(expense.categoryId) && categoryIds.includes(expense.categoryId!);
    const receipts =
      policy?.requireReceiptAboveMinor || categoryForced
        ? await this.attachments
            .listForTarget(workspaceId, "expense", expense.id)
            .catch(() => [])
        : [];
    const makerCheckerThreshold = await this.makerChecker
      .resolveThresholdMinor(workspaceId, actor.userId)
      .catch(() => null);

    return resolvePostingDecision({
      totalMinor: expense.total.amountMinor,
      visibility: expense.visibility ?? "shared",
      requiresApproval: Boolean(expense.requiresApproval),
      approved: Boolean(expense.approvedAt),
      approvalThresholdMinor: policy?.approvalThresholdMinor ?? null,
      requireReceiptAboveMinor: policy?.requireReceiptAboveMinor ?? null,
      requireReceiptCategoryIds: categoryIds,
      categoryId: expense.categoryId ?? null,
      hasReceipt: receipts.length > 0,
      makerCheckerThresholdMinor: makerCheckerThreshold,
      actorCanPostCompany: role ? COMPANY_POST_ROLES.has(role) : false,
      actorIsMaker: (expense.createdByUserId ?? actor.userId) === actor.userId,
    });
  }

  /**
   * Period the expense belongs to, opening the Jalali-month period when the
   * workspace has none. Without this an expense would never reach an invoice.
   * Failures stay silent: a missing period must not block recording a cost.
   */
  /**
   * A caller-supplied period is the one path the auto planner cannot protect:
   * closed books must refuse new costs, otherwise a settled invoice silently
   * grows after the members already approved and paid it.
   */
  private async assertPeriodAcceptsPostings(
    workspaceId: string,
    actorUserId: string,
    periodId: string,
  ): Promise<void> {
    if (!this.billing) return;
    let period: Awaited<ReturnType<BillingStore["getPeriod"]>>;
    try {
      period = await this.billing.getPeriod(workspaceId, periodId, actorUserId);
    } catch {
      // A check that cannot run must not block recording a real cost.
      return;
    }
    if (!period) {
      throw new NotFoundException({ detail: "دورهٔ مالی پیدا نشد" });
    }
    if (period.status === "open" || period.status === "review") return;
    throw new BadRequestException({
      type: "https://dang.local/problems/validation",
      title: "این دوره بسته شده است",
      status: 400,
      detail: `دورهٔ «${period.title}» دیگر خرج نمی‌پذیرد؛ خرج را در دورهٔ باز ثبت کنید`,
      code: "PERIOD_NOT_OPEN",
    });
  }

  private async resolveFormulaDraft(
    workspaceId: string,
    actorUserId: string,
    body: CreateExpenseDraftRequest,
  ): Promise<CreateExpenseDraftRequest> {
    if (body.splitMethod !== "formula") return body;
    if (!body.formulaBasis) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "formulaBasis لازم است",
        status: 400,
        code: "FORMULA_BASIS_REQUIRED",
      });
    }
    if (!this.subunits) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "تقسیم فرمولی در این محیط در دسترس نیست",
        status: 400,
        code: "SUBUNITS_UNAVAILABLE",
      });
    }
    const subunitRows = await this.subunits.list(workspaceId, actorUserId);
    let formulaWeights;
    try {
      formulaWeights = buildFormulaWeightsFromSubunits(
        body.participantUserIds,
        subunitRows,
        body.formulaBasis,
      );
    } catch {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "وزن فرمولی معتبر نیست",
        status: 400,
        code: "EXPENSE_SPLIT_FORMULA",
      });
    }
    const participantUserIds = formulaWeights.map((row) => row.userId);
    return { ...body, participantUserIds, formulaWeights };
  }

  private async resolvePeriodId(
    workspaceId: string,
    actorUserId: string,
    body: CreateExpenseDraftRequest,
  ): Promise<string | undefined> {
    if (!this.billing) return undefined;
    const occurredOn = body.occurredOn?.trim();
    if (!occurredOn) return undefined;
    try {
      const period = await this.billing.ensureAutoPeriod(
        workspaceId,
        actorUserId,
        occurredOn,
      );
      // Lets the scheduled sweep reach this workspace with a real member actor.
      this.billingMaintenance?.remember(workspaceId, actorUserId);
      return period.id;
    } catch {
      return undefined;
    }
  }

  async submit(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
    reply?: RateLimitHeaderReply | null,
  ): Promise<ExpenseSummary> {
    await this.assertExpenseWriteRate(actor.userId, workspaceId, reply);
    await this.access.requireAccess(workspaceId, actor.userId, "expense.create");
    await this.assertReceiptPolicy(workspaceId, expenseId, actor.userId);
    await this.assertCostCenterPolicy(workspaceId, expenseId, actor.userId);
    try {
      const updated = await this.expenses.submit(workspaceId, expenseId, actor.userId);
      if (updated.requiresApproval) {
        await this.approvalSteps.createFirst(workspaceId, expenseId, actor.userId);
      }
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.submit",
        targetType: "expense",
        targetId: updated.id,
        result: "success",
        metadata: { status: updated.status },
      });
      const summary = toExpenseSummary(updated);
      await this.refreshPendingInvoices(workspaceId, actor.userId, summary);
      return summary;
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  /**
   * The "pending" figure beside a live invoice comes from draft and submitted
   * expenses, so it has to move when one is recorded — otherwise the member
   * sees a stale number until someone posts. Derived data: a failure here must
   * never block recording a cost.
   */
  private async refreshPendingInvoices(
    workspaceId: string,
    actorUserId: string,
    expense: ExpenseSummary,
  ): Promise<void> {
    if (!this.billing || !expense.periodId) return;
    // A posting already rewrote the documents in its own transaction. A reversal
    // of an uncommitted draft did not, and it has to lower the pending figure.
    if (expense.status === "posted") return;
    const memberUserIds = [...new Set(expense.splits.map((split) => split.userId))];
    if (memberUserIds.length === 0) return;
    try {
      const result = await this.billing.recalculateMemberInvoices({
        workspaceId,
        periodId: expense.periodId,
        actorUserId,
        memberUserIds,
        reason: "expense.pending",
      });
      // Members with nothing committed yet hold no document, so nothing moved.
      if (result.updated.length === 0) return;
      const row = await this.insertInvoiceRecalculatedEvent(
        workspaceId,
        expense,
        result.updated.map((invoice) => invoice.memberUserId),
        "expense.pending",
        undefined,
        { actorUserId },
      );
      if (row) await this.outboxRelay.dispatch(row);
    } catch {
      // Pending figures refresh again on the next write or the reconcile sweep.
    }
  }

  async post(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    await this.access.requireAccess(workspaceId, actor.userId, "expense.create");
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    await this.assertReceiptPolicy(workspaceId, expenseId, actor.userId);
    try {
      const { viewAllPrivate, role } = await resolveExpenseListOptions(
        this.iam,
        workspaceId,
        actor.userId,
      );
      const listed = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      });
      const current = listed.find((e) => e.id === expenseId);
      if (!current) throw new Error("EXPENSE_NOT_FOUND");
      if (current.visibility === "company") {
        if (!role || !COMPANY_POST_ROLES.has(role)) {
          throw new ForbiddenException({
            detail: "ثبت نهایی خرج شرکتی فقط با نقش تأییدکننده/مدیر مجاز است",
          });
        }
      }
      if (current.requiresApproval && !current.approvedAt) {
        if (!role || !COMPANY_POST_ROLES.has(role)) {
          throw new ForbiddenException({
            detail: "این خرج پیش از ثبت نهایی نیاز به تأیید مدیر مالی یا تأییدکننده دارد",
          });
        }
        await this.expenses.approve(
          workspaceId,
          expenseId,
          actor.userId,
          { viewAllPrivate },
        );
      }

      if (
        this.workspacePayments &&
        current.fundingSourceKind === "petty_cash" &&
        current.fundingRefId
      ) {
        await this.workspacePayments.assertPettyCashFundingAvailable(
          workspaceId,
          current.fundingRefId,
          current.total.amountMinor,
        );
      }

      const previousStatus = current.status;
      const moneyDb = this.sharedMoneyDb();
      let updated: StoredExpense;
      let journal: JournalEntrySummary;
      return await withSpan(
        "expense.post",
        { workspaceId, expenseId },
        async () => {
      if (moneyDb) {
        const atomic = await withTenantContext(
          moneyDb,
          { workspaceId, userId: actor.userId },
          async (tx) => {
            const posted = await this.expenses.post(workspaceId, expenseId, actor.userId, {
              viewAllPrivate,
              tx,
            });
            const summary = toExpenseSummary(posted);
            const entry = await withSpan(
              "ledger.postExpense",
              { expenseId, journal: "tx" },
              () => this.ledger.postExpense(actor.userId, summary, { tx }),
            );
            if (summary.visibility === "company") {
              await this.procurement.applyCompanyExpenseSpend(
                workspaceId,
                summary.total.amountMinor,
                summary.budgetId,
                { tx },
              );
            }
            const invoice = await this.recalculateInvoices(
              workspaceId,
              actor.userId,
              summary,
              "expense.posted",
              tx,
            );
            const corr = this.outboxRelay.correlation();
            const outboxRow = await this.outbox.insert(
              {
                workspaceId,
                aggregateType: "expense",
                aggregateId: posted.id,
                eventType: "expense.posted",
                payload: {
                  expenseId: posted.id,
                  title: posted.title,
                  paidByUserId: posted.paidByUserId,
                  participantUserIds: posted.participantUserIds,
                  journalEntryId: entry.id,
                },
                requestId: corr.requestId,
                traceId: corr.traceId,
              },
              { tx },
            );
            const invoiceRow = await this.insertInvoiceRecalculatedEvent(
              workspaceId,
              summary,
              invoice.memberUserIds,
              "expense.posted",
              tx,
              { actorUserId: actor.userId, adjustments: invoice.adjustments },
            );
            return { posted, entry, summary, outboxRow, invoiceRow };
          },
        );
        updated = atomic.posted;
        journal = atomic.entry;
        await this.audit.append({
          workspaceId,
          actorUserId: actor.userId,
          action: "expense.post",
          targetType: "expense",
          targetId: updated.id,
          result: "success",
          requestId: getRequestId(),
          traceId: getTraceId(),
          metadata: {
            status: updated.status,
            journalEntryId: journal.id,
            ledger: "postgres_journal",
            outboxId: atomic.outboxRow.id,
          },
        });
        await this.outboxRelay.dispatch(atomic.outboxRow);
        if (atomic.invoiceRow) await this.outboxRelay.dispatch(atomic.invoiceRow);
        await this.afterExpensePosted(actor, workspaceId, atomic.summary);
        return atomic.summary;
      }

      try {
        updated = await this.expenses.post(workspaceId, expenseId, actor.userId, {
          viewAllPrivate,
        });
        const summary = toExpenseSummary(updated);
        journal = await withSpan("ledger.postExpense", { expenseId }, () =>
          this.ledger.postExpense(actor.userId, summary),
        );
        if (summary.visibility === "company") {
          await this.procurement.applyCompanyExpenseSpend(
            workspaceId,
            summary.total.amountMinor,
            summary.budgetId,
          );
        }
        const invoice = await this.recalculateInvoices(
          workspaceId,
          actor.userId,
          summary,
          "expense.posted",
        );
        const corr = this.outboxRelay.correlation();
        const outboxRow = await this.outbox.insert({
          workspaceId,
          aggregateType: "expense",
          aggregateId: updated.id,
          eventType: "expense.posted",
          payload: {
            expenseId: updated.id,
            title: updated.title,
            paidByUserId: updated.paidByUserId,
            participantUserIds: updated.participantUserIds,
            journalEntryId: journal.id,
          },
          requestId: corr.requestId,
          traceId: corr.traceId,
        });
        await this.audit.append({
          workspaceId,
          actorUserId: actor.userId,
          action: "expense.post",
          targetType: "expense",
          targetId: updated.id,
          result: "success",
          requestId: getRequestId(),
          traceId: getTraceId(),
          metadata: {
            status: updated.status,
            journalEntryId: journal.id,
            ledger: "memory_journal",
            outboxId: outboxRow.id,
          },
        });
        await this.outboxRelay.dispatch(outboxRow);
        const invoiceRow = await this.insertInvoiceRecalculatedEvent(
          workspaceId,
          summary,
          invoice.memberUserIds,
          "expense.posted",
          undefined,
          { actorUserId: actor.userId, adjustments: invoice.adjustments },
        );
        if (invoiceRow) await this.outboxRelay.dispatch(invoiceRow);
        await this.afterExpensePosted(actor, workspaceId, summary);
        return summary;
      } catch (error: unknown) {
        if (this.expenses.compensateStatus) {
          const after = await this.expenses.get(workspaceId, expenseId, actor.userId);
          if (after?.status === "posted") {
            await this.expenses.compensateStatus(workspaceId, expenseId, previousStatus);
          }
        }
        throw error;
      }
        },
      );
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.rethrowLifecycle(error);
    }
  }

  async reverse(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    await this.access.requireAccess(workspaceId, actor.userId, "expense.create");
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    try {
      const { viewAllPrivate } = await resolveExpenseListOptions(
        this.iam,
        workspaceId,
        actor.userId,
      );
      const listed = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      });
      const current = listed.find((e) => e.id === expenseId);
      if (!current) throw new Error("EXPENSE_NOT_FOUND");
      if (current.status === "reversed") throw new Error("EXPENSE_STATUS");
      const previousStatus = current.status;
      const moneyDb = this.sharedMoneyDb();
      let updated: StoredExpense;
      let outboxId: string | undefined;
      return await withSpan(
        "expense.reverse",
        { workspaceId, expenseId },
        async () => {
      if (moneyDb && previousStatus === "posted") {
        const atomic = await withTenantContext(
          moneyDb,
          { workspaceId, userId: actor.userId },
          async (tx) => {
            const reversed = await this.expenses.reverse(
              workspaceId,
              expenseId,
              actor.userId,
              { viewAllPrivate, tx },
            );
            await withSpan("ledger.reverseExpense", { expenseId }, () =>
              this.ledger.reverseExpense(workspaceId, actor.userId, expenseId, {
                tx,
              }),
            );
            const summary = toExpenseSummary(reversed);
            const invoice = await this.recalculateInvoices(
              workspaceId,
              actor.userId,
              summary,
              "expense.reversed",
              tx,
            );
            const corr = this.outboxRelay.correlation();
            const outboxRow = await this.outbox.insert(
              {
                workspaceId,
                aggregateType: "expense",
                aggregateId: reversed.id,
                eventType: "expense.reversed",
                payload: {
                  expenseId: reversed.id,
                  previousStatus,
                  participantUserIds: reversed.participantUserIds,
                },
                requestId: corr.requestId,
                traceId: corr.traceId,
              },
              { tx },
            );
            const invoiceRow = await this.insertInvoiceRecalculatedEvent(
              workspaceId,
              summary,
              invoice.memberUserIds,
              "expense.reversed",
              tx,
              { actorUserId: actor.userId, adjustments: invoice.adjustments },
            );
            return { reversed, outboxRow, invoiceRow };
          },
        );
        updated = atomic.reversed;
        outboxId = atomic.outboxRow.id;
        await this.outboxRelay.dispatch(atomic.outboxRow);
        if (atomic.invoiceRow) await this.outboxRelay.dispatch(atomic.invoiceRow);
      } else {
        try {
          updated = await this.expenses.reverse(workspaceId, expenseId, actor.userId, {
            viewAllPrivate,
          });
          if (previousStatus === "posted") {
            await withSpan("ledger.reverseExpense", { expenseId }, () =>
              this.ledger.reverseExpense(workspaceId, actor.userId, expenseId),
            );
            const summary = toExpenseSummary(updated);
            const invoice = await this.recalculateInvoices(
              workspaceId,
              actor.userId,
              summary,
              "expense.reversed",
            );
            const corr = this.outboxRelay.correlation();
            const outboxRow = await this.outbox.insert({
              workspaceId,
              aggregateType: "expense",
              aggregateId: updated.id,
              eventType: "expense.reversed",
              payload: {
                expenseId: updated.id,
                previousStatus,
                participantUserIds: updated.participantUserIds,
              },
              requestId: corr.requestId,
              traceId: corr.traceId,
            });
            outboxId = outboxRow.id;
            await this.outboxRelay.dispatch(outboxRow);
            const invoiceRow = await this.insertInvoiceRecalculatedEvent(
              workspaceId,
              summary,
              invoice.memberUserIds,
              "expense.reversed",
              undefined,
              { actorUserId: actor.userId, adjustments: invoice.adjustments },
            );
            if (invoiceRow) await this.outboxRelay.dispatch(invoiceRow);
          }
        } catch (error: unknown) {
          if (this.expenses.compensateStatus && previousStatus === "posted") {
            const after = await this.expenses.get(workspaceId, expenseId, actor.userId);
            if (after?.status === "reversed") {
              await this.expenses.compensateStatus(
                workspaceId,
                expenseId,
                previousStatus,
              );
            }
          }
          throw error;
        }
      }
      if (previousStatus !== "posted") {
        // Cancelling a draft or a submitted expense takes its amount out of the
        // "pending" figure members see beside their invoice.
        await this.refreshPendingInvoices(
          workspaceId,
          actor.userId,
          toExpenseSummary(updated),
        );
      }
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.reverse",
        targetType: "expense",
        targetId: expenseId,
        result: "success",
        requestId: getRequestId(),
        traceId: getTraceId(),
        metadata: {
          previousStatus: current.status,
          ...(outboxId ? { outboxId } : {}),
        },
      });
      if (this.workspacePayments) {
        await this.workspacePayments.compensateMovementsForReversedExpense(
          actor,
          workspaceId,
          expenseId,
        );
      }
      return toExpenseSummary(updated);
        },
      );
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  /**
   * Soft-void the old expense then create a corrected replacement in one call.
   */
  async revise(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
    body: CreateExpenseDraftRequest & { reverseReason?: string },
    reply?: RateLimitHeaderReply | null,
  ): Promise<{ reversed: ExpenseSummary; created: ExpenseSummary }> {
    const reversed = await this.reverse(actor, workspaceId, expenseId);
    const { reverseReason: _reason, ...draftBody } = body;
    void _reason;
    const created = await this.createDraft(
      actor,
      workspaceId,
      {
        ...draftBody,
        workspaceId,
        note:
          draftBody.note?.trim() ||
          `اصلاح خرج برگشتی ${expenseId.slice(0, 8)}`,
        commit: draftBody.commit ?? "auto",
        idempotencyKey:
          draftBody.idempotencyKey?.trim() ||
          `revise:${expenseId}:${crypto.randomUUID()}`,
      },
      reply,
    );
    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "expense.revise",
      targetType: "expense",
      targetId: created.id,
      result: "success",
      requestId: getRequestId(),
      traceId: getTraceId(),
      metadata: {
        reversedExpenseId: reversed.id,
        reverseReason: body.reverseReason ?? null,
      },
    });
    return { reversed, created };
  }

  private sharedMoneyDb(): AppDatabase | undefined {
    const expenseDb = this.expenses.db;
    const ledgerDb = this.ledger.db;
    if (!expenseDb || !ledgerDb || expenseDb !== ledgerDb) return undefined;
    if (this.procurement.db && this.procurement.db !== expenseDb) return undefined;
    if (this.outbox.db && this.outbox.db !== expenseDb) return undefined;
    if (this.billing?.db && this.billing.db !== expenseDb) return undefined;
    return expenseDb;
  }

  /** Debit petty cash when a posted expense declares funding_source=petty_cash. */
  private async afterExpensePosted(
    actor: AuthActor,
    workspaceId: string,
    summary: ExpenseSummary,
  ): Promise<void> {
    if (!this.workspacePayments) return;
    if (summary.fundingSourceKind !== "petty_cash" || !summary.fundingRefId) {
      return;
    }
    await this.workspacePayments.applyFundingSpendForPostedExpense(
      actor,
      workspaceId,
      summary,
    );
  }

  /**
   * Outbox row that makes the invoice change visible to connected members.
   * Written in the same transaction as the recalculation it describes.
   */
  private async insertInvoiceRecalculatedEvent(
    workspaceId: string,
    expense: ExpenseSummary,
    memberUserIds: readonly string[],
    reason: string,
    tx?: AppDatabase,
    options: {
      actorUserId?: string;
      adjustments?: readonly MemberInvoiceAdjustmentSummary[];
    } = {},
  ): Promise<OutboxRecord | undefined> {
    if (memberUserIds.length === 0 || !expense.periodId) return undefined;
    const corr = this.outboxRelay.correlation();
    return this.outbox.insert(
      {
        workspaceId,
        aggregateType: "member_invoice",
        aggregateId: expense.periodId,
        eventType: "invoice.recalculated",
        payload: {
          periodId: expense.periodId,
          memberUserIds: [...memberUserIds],
          reason,
          ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
          ...(options.adjustments?.length
            ? {
                adjustments: options.adjustments.map((row) => ({
                  memberUserId: row.memberUserId,
                  deltaMinor: row.delta.amountMinor,
                })),
              }
            : {}),
        },
        requestId: corr.requestId,
        traceId: corr.traceId,
      },
      tx ? { tx } : undefined,
    );
  }

  /**
   * Rewrites the live draft invoices of the members touched by an expense.
   * Runs inside the caller's money transaction so balances and invoices can
   * never drift apart; outside a transaction (memory mode) it is best-effort.
   */
  private async recalculateInvoices(
    workspaceId: string,
    actorUserId: string,
    expense: ExpenseSummary,
    reason: string,
    tx?: AppDatabase,
  ): Promise<{
    memberUserIds: string[];
    adjustments: readonly MemberInvoiceAdjustmentSummary[];
  }> {
    const none = { memberUserIds: [] as string[], adjustments: [] as const };
    if (!this.billing || !expense.periodId) return none;
    const memberUserIds = [...new Set(expense.splits.map((split) => split.userId))];
    if (memberUserIds.length === 0) return none;
    const run = () =>
      this.billing!.recalculateMemberInvoices(
        {
          workspaceId,
          periodId: expense.periodId!,
          actorUserId,
          memberUserIds,
          reason,
        },
        { tx },
      );
    if (tx) {
      // Inside the transaction a failure must roll the whole posting back.
      const result = await run();
      return { memberUserIds, adjustments: result.adjustments };
    }
    try {
      const result = await run();
      return { memberUserIds, adjustments: result.adjustments };
    } catch {
      // Memory/degraded mode: the manual generate path stays available.
      return none;
    }
  }

  async promotePrivateToCompany(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    const { viewAllPrivate, role } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    if (!role || !COMPANY_POST_ROLES.has(role)) {
      throw new ForbiddenException({
        detail: "تبدیل به خرج شرکتی فقط برای تأییدکننده/مدیر مجاز است",
      });
    }
    const listed = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
      viewAllPrivate,
    });
    const current = listed.find((e) => e.id === expenseId);
    if (!current) throw new NotFoundException({ detail: "خرج پیدا نشد" });
    if (current.visibility !== "private") {
      throw new BadRequestException({ detail: "فقط خرج خصوصی قابل تبدیل به شرکتی است" });
    }
    const store = this.expenses as ExpenseStore & {
      updateVisibility?: (
        workspaceId: string,
        expenseId: string,
        visibility: "company",
        actorUserId: string,
        options?: { viewAllPrivate?: boolean },
      ) => Promise<StoredExpense>;
    };
    if (!store.updateVisibility) {
      throw new BadRequestException({ detail: "به‌روزرسانی visibility در این store فعال نیست" });
    }
    const updated = await store.updateVisibility(
      workspaceId,
      expenseId,
      "company",
      actor.userId,
      { viewAllPrivate },
    );
    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "expense.reimburse.approve",
      targetType: "expense",
      targetId: updated.id,
      result: "success",
      metadata: { visibility: "company" },
    });
    const summary = toExpenseSummary(updated);
    // Visibility decides whether the amount sits in the private or shared part
    // of the invoice, so the document has to be rewritten with the new answer.
    if (summary.status === "posted") {
      const invoice = await this.recalculateInvoices(
        workspaceId,
        actor.userId,
        summary,
        "expense.visibility",
      );
      const row = await this.insertInvoiceRecalculatedEvent(
        workspaceId,
        summary,
        invoice.memberUserIds,
        "expense.visibility",
        undefined,
        { actorUserId: actor.userId, adjustments: invoice.adjustments },
      );
      if (row) await this.outboxRelay.dispatch(row);
    } else {
      await this.refreshPendingInvoices(workspaceId, actor.userId, summary);
    }
    return summary;
  }

  async approve(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    if (readProductFeatureFlags(process.env).approvalSteps) {
      const assigned = await this.approvalSteps.pending(workspaceId, actor.userId);
      if (!assigned.some((step) => step.expenseId === expenseId)) {
        throw new ForbiddenException({
          detail: "This approval step is assigned to another approver.",
        });
      }
    }
    const current = await this.expenses.get(workspaceId, expenseId, actor.userId);
    if (!current) {
      throw new NotFoundException({ detail: "خرج پیدا نشد" });
    }
    const { role } = await this.access.requireAccess(
      workspaceId,
      actor.userId,
      "expense.approve",
      {
        status: current.status,
        visibility: current.visibility,
        ownerUserId: current.createdByUserId,
      },
    );
    await this.makerChecker.assertFourEyes({
      workspaceId,
      actorUserId: actor.userId,
      makerUserId: current.createdByUserId,
      amountMinor: current.total.amountMinor,
      actionLabel: "تأیید خرج",
    });
    const tiers = await this.makerChecker.resolveApprovalTiersForWorkspace(
      workspaceId,
      actor.userId,
    );
    const tierGate = await this.makerChecker.applyTierGate({
      workspaceId,
      requestType: "expense",
      requestId: expenseId,
      amountMinor: current.total.amountMinor,
      makerUserId: current.createdByUserId,
      approverUserId: actor.userId,
      approverRoles: [role],
      decision: "approved",
      tiers,
    });
    if (tierGate.outcome === "pending" || tierGate.outcome === "rejected") {
      return this.makerChecker.withTierProgress(
        toExpenseSummary(current),
        tierGate.evaluation,
      );
    }
    try {
      const updated = await this.expenses.approve(
        workspaceId,
        expenseId,
        actor.userId,
        { viewAllPrivate },
      );
      await this.approvalSteps.approve(workspaceId, expenseId, actor.userId);
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.approve",
        targetType: "expense",
        targetId: expenseId,
        result: "success",
        metadata:
          tierGate.outcome === "finalize"
            ? {
                approvalsHave: tierGate.evaluation.approvalsCount,
                approvalsNeeded: tierGate.evaluation.requiredApprovals,
              }
            : undefined,
      });
      const approved = await this.postAfterApproval(actor, workspaceId, updated);
      return tierGate.outcome === "finalize"
        ? this.makerChecker.withTierProgress(approved, tierGate.evaluation)
        : approved;
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  /**
   * The approval was the last thing holding the expense back, so post it now
   * instead of asking the approver to click a second button.
   */
  private async postAfterApproval(
    actor: AuthActor,
    workspaceId: string,
    approved: StoredExpense,
  ): Promise<ExpenseSummary> {
    const summary = toExpenseSummary(approved);
    if (summary.status === "posted" || summary.status === "reversed") return summary;
    const decision = await this.resolveAutoPostingDecision(
      actor,
      workspaceId,
      summary,
    );
    if (decision.commit !== "post") return summary;
    try {
      return await this.post(actor, workspaceId, summary.id);
    } catch {
      // Approval itself succeeded; posting stays available as its own action.
      return summary;
    }
  }

  async list(
    actor: AuthActor,
    workspaceId: string,
    query: ExpenseListQuery = {},
  ): Promise<ExpenseSummary[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    const rows = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
      viewAllPrivate,
    });
    let tagFilter: Set<string> | null = null;
    if (query.tagId && this.expenseTags) {
      const ids = await this.expenseTags
        .store()
        .listExpenseIdsWithTag(workspaceId, query.tagId);
      tagFilter = new Set(ids);
    }
    return rows.filter((expense) => {
      if (query.visibility && expense.visibility !== query.visibility) return false;
      if (query.status && expense.status !== query.status) return false;
      if (query.from && expense.occurredOn < query.from) return false;
      if (query.to && expense.occurredOn > query.to) return false;
      if (query.categoryId && expense.categoryId !== query.categoryId) return false;
      if (tagFilter && !tagFilter.has(expense.id)) return false;
      if (query.paidByUserId) {
        const payer = query.paidByUserId.trim();
        const primary = expense.paidByUserId === payer;
        const inLines = (expense.paymentLines ?? []).some((line) => line.userId === payer);
        if (!primary && !inLines) return false;
      }
      if (query.q) {
        const needle = query.q.trim().toLowerCase();
        const hay = expense.title.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (query.catalogItemId) {
        const wanted = query.catalogItemId.trim();
        const onHeader = expense.catalogItemId?.trim() === wanted;
        const onItem = (expense.items ?? []).some(
          (item) => item.catalogItemId?.trim() === wanted,
        );
        if (!onHeader && !onItem) return false;
      }
      return true;
    });
  }

  async importCsv(actor: AuthActor, workspaceId: string, input: ExpenseCsvImportRequest) {
    if (!readProductFeatureFlags(process.env).expenseImport) {
      throw new ForbiddenException({ detail: "Set ENABLE_EXPENSE_IMPORT=1" });
    }
    const rows = parseExpenseCsv(input.csvText);
    const created: ExpenseSummary[] = [];
    for (const [index, row] of rows.entries()) {
      created.push(await this.createDraft(actor, workspaceId, {
        workspaceId,
        title: row.title,
        total: { amountMinor: (BigInt(row.amountToman) * 10n).toString(), currency: "IRR" },
        paidByUserId: actor.userId,
        splitMethod: "equal",
        participantUserIds: [actor.userId],
        occurredOn: row.occurredOn,
        visibility: row.visibility,
        idempotencyKey: `${input.idempotencyKey}:${index}`,
      }));
    }
    return { imported: created.length, expenses: created };
  }

  private async assertExpenseWriteRate(
    userId: string,
    workspaceId: string,
    reply?: RateLimitHeaderReply | null,
  ): Promise<void> {
    const rate = await expenseWriteRate.consume(`expense-write:${workspaceId}:${userId}`);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many expense writes",
          status: 429,
          detail: "تعداد ثبت/ارسال خرج زیاد است؛ کمی بعد دوباره تلاش کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertOutingBudget(
    workspaceId: string,
    actorUserId: string,
    outingId: string,
    amountMinor: string,
  ): Promise<void> {
    if (!this.outings) return;
    const event = await this.outings.get(workspaceId, outingId, actorUserId);
    if (!event) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Outing not found",
        status: 400,
        detail: "outingId does not match a workspace outing",
      });
    }
    if (!event.budgetCapMinor) return;
    const next = BigInt(event.total.amountMinor) + BigInt(amountMinor);
    if (next > BigInt(event.budgetCapMinor)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/outing-budget",
        title: "OUTING_BUDGET_EXCEEDED",
        status: 400,
        detail: `سقف بودجه رویداد (${event.budgetCapMinor}) با این خرج رد می‌شود`,
      });
    }
  }

  private async assertCostCenterPolicy(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<void> {
    if (!readProductFeatureFlags(process.env).expensePolicy) return;
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actorUserId);
    if (spaceKindForTemplate(workspace?.template) !== "org") return;
    const policy = await this.policies.get(workspaceId, actorUserId);
    if (!policy.requireCostCenter) return;
    const { viewAllPrivate } = await resolveExpenseListOptions(this.iam, workspaceId, actorUserId);
    const expense = (
      await this.expenses.listForWorkspace(workspaceId, actorUserId, { viewAllPrivate })
    ).find((row) => row.id === expenseId);
    if (!expense) return;
    const visibility = expense.visibility ?? "shared";
    if (visibility !== "shared" && visibility !== "company") return;
    if (!expense.costCenterId?.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "COST_CENTER_REQUIRED",
        status: 400,
        detail: "مرکز هزینه برای این فضای سازمانی الزامی است",
      });
    }
  }

  private async assertReceiptPolicy(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<void> {
    if (!readProductFeatureFlags(process.env).expensePolicy) return;
    const policy = await this.policies.get(workspaceId, actorUserId);
    const categoryIds = policy.requireReceiptCategoryIds ?? [];
    const { viewAllPrivate } = await resolveExpenseListOptions(this.iam, workspaceId, actorUserId);
    const expense = (await this.expenses.listForWorkspace(workspaceId, actorUserId, { viewAllPrivate }))
      .find((row) => row.id === expenseId);
    if (!expense) return;

    const overAmount =
      policy.requireReceiptAboveMinor !== null &&
      BigInt(expense.total.amountMinor) >= BigInt(policy.requireReceiptAboveMinor);
    const categoryForced =
      Boolean(expense.categoryId) && categoryIds.includes(expense.categoryId!);
    if (!overAmount && !categoryForced) return;

    const attachments = await this.attachments.listForTarget(workspaceId, "expense", expenseId);
    if (attachments.length === 0) {
      throw new BadRequestException({
        type: "https://dang.local/problems/receipt-required",
        title: "RECEIPT_REQUIRED",
        status: 400,
        detail: categoryForced
          ? "A receipt attachment is required for this expense category."
          : "A receipt attachment is required by workspace policy.",
      });
    }
  }

  private async recordCatalogUsage(
    workspaceId: string,
    expense: StoredExpense,
  ): Promise<void> {
    const ids = new Set<string>();
    if (expense.catalogItemId?.trim()) ids.add(expense.catalogItemId.trim());
    for (const item of expense.items ?? []) {
      if (item.catalogItemId?.trim()) ids.add(item.catalogItemId.trim());
    }
    for (const id of ids) {
      try {
        await this.catalog.recordUsage(workspaceId, id, 1);
      } catch {
        // Usage is best-effort — draft already persisted.
      }
    }
  }

  private rethrowLifecycle(error: unknown): never {
    if (error instanceof Error && error.message === "EXPENSE_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Expense not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "EXPENSE_FORBIDDEN") {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Expense action not allowed",
        status: 403,
        detail: "You cannot mutate this expense",
      });
    }
    if (error instanceof Error && error.message === "EXPENSE_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid expense status transition",
        status: 400,
        detail: "Allowed: draft→submit, draft|submitted→post",
      });
    }
    if (error instanceof Error && error.message === "EXPENSE_APPROVAL_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Expense is not awaiting approval",
        status: 400,
      });
    }
    throw error;
  }

  private rethrowValidation(error: unknown): never {
    if (error instanceof Error) {
      const map: Record<string, string> = {
        EXPENSE_CURRENCY: "Only IRR is supported",
        EXPENSE_AMOUNT: "Amount must be a positive integer minor unit",
        EXPENSE_TITLE: "Title must be 1-120 characters",
        EXPENSE_PARTICIPANTS: "At least one participant is required",
        EXPENSE_IDEMPOTENCY: "Idempotency key is required",
        EXPENSE_DATE: "occurredOn must be YYYY-MM-DD",
        EXPENSE_PAYER: "paidByUserId is required",
        EXPENSE_SPLIT_SUM: "Split lines must sum to total",
        EXPENSE_SPLIT_PERCENT: "Percent split must use basis points summing to 10000",
        EXPENSE_SPLIT_SHARES: "Shares must be positive integers",
        EXPENSE_SPLIT_LINES: "splitLines required for amount/percent/shares",
        EXPENSE_SPLIT_METHOD: "Unsupported split method",
        EXPENSE_SPLIT_ITEMS: "Itemized expenses need receipt lines with assignees",
        EXPENSE_SPLIT_ITEM_TOTAL: "Itemized total must equal items + tip + tax − discount",
        EXPENSE_PAYMENT_AMOUNT: "Payment lines must be positive IRR amounts",
        EXPENSE_PAYMENT_SUM: "Payment lines must sum to total",
        EXPENSE_PRIVATE_ASSIGNEE: "Private expenses must have exactly one participant",
        EXPENSE_ORIGINAL_MONEY: "originalCurrency and originalAmountMinor must be provided together",
        AMOUNT_MISMATCH: "amountMinor must equal round(quantity × unitPriceMinor)",
      };
      const detail = map[error.message];
      if (detail) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: error.message === "AMOUNT_MISMATCH" ? "AMOUNT_MISMATCH" : "Invalid expense draft",
          status: 400,
          detail,
          code: error.message === "AMOUNT_MISMATCH" ? "AMOUNT_MISMATCH" : undefined,
        });
      }
    }
    throw error;
  }
}
