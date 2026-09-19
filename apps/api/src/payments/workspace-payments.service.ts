import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import {
  allocateExpenseSplit,
  assertNoCustodyPayload,
  isFinanceManagerRole,
  meetsMakerCheckerThreshold,
  signedPettyCashDelta,
  type AuthActor,
  type CreateCreditPurchasePaymentRequest,
  type CreateCreditPurchaseRequest,
  type CreateOnBehalfPaymentRequest,
  type CreatePaymentReceiptRequest,
  type CreatePettyCashFundRequest,
  type CreatePettyCashMovementRequest,
  type CreditPurchaseStatus,
  type CreditPurchaseSummary,
  type ExpenseSplitLine,
  type MembershipRole,
  type OnBehalfPaymentStatus,
  type OnBehalfPaymentSummary,
  type PaymentReceiptStatus,
  type PaymentReceiptSummary,
  type PettyCashFundSummary,
  type PettyCashMovementSummary,
  type RejectOnBehalfPaymentRequest,
  type RejectPaymentReceiptRequest,
  type SpendPettyCashAsExpenseRequest,
  type SpendPettyCashAsExpenseResponse,
  type PettyCashHealthReport,
  type TopupPettyCashFromMembersRequest,
  type TopupPettyCashFromMembersResponse,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { ExpensesService } from "../expenses/expenses.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import {
  BILLING_STORE,
  type BillingStore,
} from "../billing/billing.types.js";
import { InvoiceEventsService } from "../billing/invoice-events.service.js";
import { MakerCheckerService } from "../maker-checker/maker-checker.service.js";
import { MfaService } from "../auth/mfa.service.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";
import {
  SETTLEMENT_STORE,
  toSettlementSummary,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import {
  PAYMENT_OPS_STORE,
  toCreditSummary,
  toFundSummary,
  toOnBehalfSummary,
  toReceiptSummary,
  type PaymentOpsStore,
  type StoredPaymentReceipt,
} from "./payment-ops.types.js";

@Injectable()
export class WorkspacePaymentsService {
  constructor(
    @Inject(PAYMENT_OPS_STORE) private readonly ops: PaymentOpsStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(forwardRef(() => ExpensesService))
    private readonly expenses: ExpensesService,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(InvoiceEventsService)
    private readonly invoiceEvents: InvoiceEventsService,
    @Optional()
    @Inject(MakerCheckerService)
    private readonly makerChecker?: MakerCheckerService,
    @Optional() @Inject(OUTBOX_STORE) private readonly outbox?: OutboxStore,
    @Optional() @Inject(OutboxRelay) private readonly outboxRelay?: OutboxRelay,
    @Optional() @Inject(MfaService) private readonly mfa?: MfaService,
  ) {}

  persistence(): "memory" | "postgres" {
    return this.ops.persistence;
  }

  async listReceipts(
    actor: AuthActor,
    workspaceId: string,
    status?: PaymentReceiptStatus,
  ): Promise<PaymentReceiptSummary[]> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const rows = await this.ops.listReceipts(workspaceId, status);
    if (isFinanceManagerRole(role)) {
      return rows.map(toReceiptSummary);
    }
    const settlements = await this.settlements.listForWorkspace(
      workspaceId,
      actor.userId,
    );
    const creditorSettlementIds = new Set(
      settlements
        .filter((s) => s.toUserId === actor.userId)
        .map((s) => s.id),
    );
    return rows
      .filter(
        (r) =>
          r.payerUserId === actor.userId ||
          (r.settlementId != null && creditorSettlementIds.has(r.settlementId)),
      )
      .map(toReceiptSummary);
  }

  async createReceipt(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePaymentReceiptRequest,
  ): Promise<PaymentReceiptSummary> {
    await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(
      await this.access.requireMemberRole(workspaceId, actor.userId),
    );
    assertNoCustodyPayload(body);
    this.assertDestLast4(body.destLast4);

    if (body.method === "card_to_card" && !body.referenceNo?.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "کد پیگیری کارت‌به‌کارت الزامی است",
        status: 400,
        code: "CARD_TRANSFER_REF_REQUIRED",
      });
    }

    if (body.settlementId) {
      const settlement = await this.settlements.get(
        workspaceId,
        body.settlementId,
        actor.userId,
      );
      if (!settlement) {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "تسویه یافت نشد",
          status: 404,
        });
      }
    }

    const row = await this.ops.createReceipt(workspaceId, actor.userId, body);
    return toReceiptSummary(row);
  }

  async approveReceipt(
    actor: AuthActor,
    workspaceId: string,
    receiptId: string,
  ): Promise<PaymentReceiptSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.ops.getReceipt(workspaceId, receiptId);
    if (!existing) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "رسید یافت نشد",
        status: 404,
        code: "RECEIPT_NOT_FOUND",
      });
    }
    if (existing.status !== "submitted") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "رسید قبلاً بررسی شده",
        status: 409,
        code: "RECEIPT_ALREADY_REVIEWED",
      });
    }
    if (existing.payerUserId === actor.userId) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "بررسی رسید توسط خود پرداخت‌کننده مجاز نیست",
        status: 403,
        code: "RECEIPT_SELF_REVIEW",
      });
    }

    await this.assertCanReviewReceipt(actor.userId, role, workspaceId, existing);

    let journalEntryId: string | undefined;

    if (existing.settlementId) {
      const settlement = await this.settlements.get(
        workspaceId,
        existing.settlementId,
        actor.userId,
      );
      if (!settlement) {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "تسویهٔ متصل یافت نشد",
          status: 404,
        });
      }
      if (settlement.status === "claimed") {
        const confirmed = await this.settlements.confirm(
          workspaceId,
          settlement.id,
          actor.userId,
        );
        const journal = await this.ledger.postSettlement(
          actor.userId,
          toSettlementSummary(confirmed),
        );
        journalEntryId = journal.id;
      } else if (settlement.status === "confirmed") {
        const journal = await this.ledger.postSettlement(
          actor.userId,
          toSettlementSummary(settlement),
        );
        journalEntryId = journal.id;
      } else {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "تسویهٔ لینک‌شده قابل تأیید نیست",
          status: 400,
        });
      }
    } else {
      const counterpartyUserId = await this.resolveCounterparty(
        workspaceId,
        existing.memberInvoiceId,
        actor.userId,
      );
      const journal = await this.ledger.postPaymentReceipt(actor.userId, {
        workspaceId,
        receiptId: existing.id,
        payerUserId: existing.payerUserId,
        counterpartyUserId,
        amount: existing.amount,
      });
      journalEntryId = journal.id;
    }

    if (existing.memberInvoiceId) {
      try {
        const paid = await this.billing.markInvoicePaid(
          workspaceId,
          existing.memberInvoiceId,
          actor.userId,
        );
        await this.invoiceEvents.announce({
          workspaceId,
          periodId: paid.periodId,
          memberUserIds: [paid.memberUserId],
          reason: "invoice.paid.receipt",
        });
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail !== "INVOICE_STATUS") throw error;
      }
    }

    try {
      const approved = await this.ops.reviewReceipt(workspaceId, receiptId, {
        status: "approved",
        reviewedByUserId: actor.userId,
        journalEntryId,
      });
      return toReceiptSummary(approved);
    } catch (error: unknown) {
      this.rethrowReceiptReview(error);
    }
  }

  async rejectReceipt(
    actor: AuthActor,
    workspaceId: string,
    receiptId: string,
    body: RejectPaymentReceiptRequest,
  ): Promise<PaymentReceiptSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.ops.getReceipt(workspaceId, receiptId);
    if (!existing) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "رسید یافت نشد",
        status: 404,
        code: "RECEIPT_NOT_FOUND",
      });
    }
    if (existing.payerUserId === actor.userId) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "بررسی رسید توسط خود پرداخت‌کننده مجاز نیست",
        status: 403,
        code: "RECEIPT_SELF_REVIEW",
      });
    }
    await this.assertCanReviewReceipt(actor.userId, role, workspaceId, existing);
    try {
      const rejected = await this.ops.reviewReceipt(workspaceId, receiptId, {
        status: "rejected",
        reviewedByUserId: actor.userId,
        reviewNote: body.note,
      });
      return toReceiptSummary(rejected);
    } catch (error: unknown) {
      this.rethrowReceiptReview(error);
    }
  }

  async listPettyCash(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<PettyCashFundSummary[]> {
    await this.access.requireMemberRole(workspaceId, actor.userId);
    const funds = await this.ops.listFunds(workspaceId);
    const out: PettyCashFundSummary[] = [];
    for (const fund of funds) {
      const movements = await this.ops.listMovements(fund.id);
      const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
      out.push(
        toFundSummary(
          fund,
          balance.toString(),
          movements.map((m) => ({
            id: m.id,
            fundId: m.fundId,
            kind: m.kind,
            amountMinor: m.amountMinor,
            expenseId: m.expenseId,
            settlementId: m.settlementId,
            actorUserId: m.actorUserId,
            occurredAt: m.occurredAt,
            note: m.note,
            createdAt: m.createdAt,
          })),
        ),
      );
    }
    return out;
  }

  async pettyCashHealth(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<PettyCashHealthReport> {
    const funds = await this.listPettyCash(actor, workspaceId);
    let total = 0n;
    const rows = funds.map((f) => {
      const balance = BigInt(f.balanceMinor);
      total += balance;
      const movements = f.movements ?? [];
      const last = movements
        .map((m) => m.occurredAt || m.createdAt)
        .sort()
        .at(-1);
      const status: "ok" | "empty" | "inactive" = !f.active
        ? "inactive"
        : balance <= 0n
          ? "empty"
          : "ok";
      return {
        id: f.id,
        name: f.name,
        active: f.active,
        balanceMinor: f.balanceMinor,
        openingBalanceMinor: f.openingBalanceMinor,
        movementCount: movements.length,
        lastMovementAt: last,
        status,
      };
    });
    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      fundCount: funds.length,
      activeFundCount: funds.filter((f) => f.active).length,
      totalBalanceMinor: total.toString(),
      funds: rows,
    };
  }

  async createPettyCashFund(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePettyCashFundRequest,
  ): Promise<PettyCashFundSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const custodianUserId = body.custodianUserId?.trim() || actor.userId;
    const fund = await this.ops.createFund(workspaceId, actor.userId, {
      ...body,
      custodianUserId,
    });
    return toFundSummary(fund, fund.openingBalanceMinor);
  }

  async createPettyCashMovement(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
    body: CreatePettyCashMovementRequest,
  ) {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    if (body.kind === "spend" && !body.expenseId?.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "برداشت تنخواه نیاز به خرج لینک‌شده دارد",
        status: 400,
        code: "PETTY_CASH_SPEND_NEEDS_EXPENSE",
        detail:
          "برداشت تنخواه باید به خرج لینک شود — از spend-as-expense یا funding_source روی خرج استفاده کنید.",
      });
    }
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "صندوق تنخواه یافت نشد",
        status: 404,
      });
    }
    const movements = await this.ops.listMovements(fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    const delta = signedPettyCashDelta(body.kind, body.amountMinor);
    if (body.kind === "spend" && balance + delta < 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ماندهٔ تنخواه منفی می‌شود",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }
    if (body.kind === "adjust" && balance + delta < 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ماندهٔ تنخواه منفی می‌شود",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }

    const movement = await this.ops.createMovement(fundId, actor.userId, {
      ...body,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
    });
    const nextBalance = balance + delta;
    return {
      movement: {
        id: movement.id,
        fundId: movement.fundId,
        kind: movement.kind,
        amountMinor: movement.amountMinor,
        expenseId: movement.expenseId,
        settlementId: movement.settlementId,
        actorUserId: movement.actorUserId,
        occurredAt: movement.occurredAt,
        note: movement.note,
        createdAt: movement.createdAt,
      },
      balanceMinor: nextBalance.toString(),
    };
  }

  /**
   * شارژ تنخواه با سهم اعضا: خرج مشترک (مانده) + حرکت topup لینک‌شده.
   */
  async topupPettyCashFromMembers(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
    body: TopupPettyCashFromMembersRequest,
  ): Promise<TopupPettyCashFromMembersResponse> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund || !fund.active) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "صندوق تنخواه یافت نشد",
        status: 404,
      });
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const memberIds = new Set(members.map((m) => m.userId));
    for (const uid of body.participantUserIds) {
      if (!memberIds.has(uid)) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "شرکت‌کننده عضو فضای کاری نیست",
          status: 400,
          code: "PARTICIPANT_NOT_MEMBER",
          detail: uid,
        });
      }
    }

    const splitMethod = body.splitMethod ?? "equal";
    const paidByUserId = body.paidByUserId?.trim() || actor.userId;
    if (!memberIds.has(paidByUserId)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "پرداخت‌کننده عضو فضای کاری نیست",
        status: 400,
        code: "PAYER_NOT_MEMBER",
      });
    }

    let splitLines = body.splitLines?.map((line) => ({
      userId: line.userId,
      amount: line.amount ?? { amountMinor: "0", currency: "IRR" as const },
      percent: line.percent,
      shares: line.shares,
    }));

    if (splitMethod === "shares" && (!splitLines || splitLines.length === 0)) {
      splitLines = body.participantUserIds.map((userId) => {
        const member = members.find((m) => m.userId === userId);
        return {
          userId,
          amount: { amountMinor: "0", currency: "IRR" as const },
          percent: undefined,
          shares:
            member?.defaultShares && member.defaultShares > 0
              ? member.defaultShares
              : 1,
        };
      });
    }

    const total = {
      amountMinor: body.amountMinor,
      currency: "IRR" as const,
    };

    let previewSplits: ExpenseSplitLine[];
    try {
      previewSplits = allocateExpenseSplit({
        total,
        splitMethod,
        participantUserIds: body.participantUserIds,
        splitLines,
      });
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "SPLIT_ERROR";
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "تقسیم شارژ صندوق نامعتبر است",
        status: 400,
        detail: code,
      });
    }

    const occurredOn =
      body.occurredOn?.trim() || new Date().toISOString().slice(0, 10);
    const title = `شارژ تنخواه — ${fund.name}`;

    const expense = await this.expenses.createDraft(actor, workspaceId, {
      workspaceId,
      title,
      note: body.note?.trim() || "شارژ صندوق تنخواه از سهم اعضا",
      total,
      paidByUserId,
      splitMethod,
      participantUserIds: body.participantUserIds,
      splitLines:
        splitMethod === "equal"
          ? undefined
          : previewSplits.map((s) => ({
              userId: s.userId,
              amount: s.amount,
              percent: s.percent,
              shares: s.shares,
            })),
      occurredOn,
      visibility: "shared",
      requiresApproval: false,
      commit: "auto",
      idempotencyKey: body.idempotencyKey,
    });

    if (expense.status !== "posted") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "خرج شارژ صندوق ثبت نشد",
        status: 409,
        code: "FUND_TOPUP_NOT_POSTED",
        detail:
          "خرج شارژ تنخواه ثبت نهایی نشد؛ صندوق افزایش داده نشد تا مانده و سهم‌ها جدا نمانند.",
        expenseId: expense.id,
        expenseStatus: expense.status,
      });
    }

    const movementResult = await this.createPettyCashMovement(
      actor,
      workspaceId,
      fundId,
      {
        kind: "topup",
        amountMinor: body.amountMinor,
        expenseId: expense.id,
        note: body.note?.trim() || title,
        idempotencyKey: `${body.idempotencyKey}:topup`,
      },
    );

    const funds = await this.listPettyCash(actor, workspaceId);
    const fundSummary =
      funds.find((f) => f.id === fundId) ??
      toFundSummary(fund, movementResult.balanceMinor);

    return {
      fund: fundSummary,
      expense,
      movement: movementResult.movement,
      balanceMinor: movementResult.balanceMinor,
      splits: expense.splits.length > 0 ? expense.splits : previewSplits,
    };
  }

  /**
   * برداشت از تنخواه با سهم: خرج مشترک (funding=petty_cash) + حرکت spend.
   */
  async spendPettyCashAsExpense(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
    body: SpendPettyCashAsExpenseRequest,
  ): Promise<SpendPettyCashAsExpenseResponse> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund || !fund.active) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "صندوق تنخواه یافت نشد",
        status: 404,
      });
    }

    const movements = await this.ops.listMovements(fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    const amount = BigInt(body.amountMinor);
    if (balance < amount) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ماندهٔ تنخواه منفی می‌شود",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const memberIds = new Set(members.map((m) => m.userId));
    for (const uid of body.participantUserIds) {
      if (!memberIds.has(uid)) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "شرکت‌کننده عضو فضای کاری نیست",
          status: 400,
          code: "PARTICIPANT_NOT_MEMBER",
          detail: uid,
        });
      }
    }

    const splitMethod = body.splitMethod ?? "equal";
    const paidByUserId = body.paidByUserId?.trim() || actor.userId;
    if (!memberIds.has(paidByUserId)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "پرداخت‌کننده عضو فضای کاری نیست",
        status: 400,
        code: "PAYER_NOT_MEMBER",
      });
    }

    let splitLines = body.splitLines?.map((line) => ({
      userId: line.userId,
      amount: line.amount ?? { amountMinor: "0", currency: "IRR" as const },
      percent: line.percent,
      shares: line.shares,
    }));

    if (splitMethod === "shares" && (!splitLines || splitLines.length === 0)) {
      splitLines = body.participantUserIds.map((userId) => {
        const member = members.find((m) => m.userId === userId);
        return {
          userId,
          amount: { amountMinor: "0", currency: "IRR" as const },
          percent: undefined,
          shares:
            member?.defaultShares && member.defaultShares > 0
              ? member.defaultShares
              : 1,
        };
      });
    }

    const total = {
      amountMinor: body.amountMinor,
      currency: "IRR" as const,
    };

    let previewSplits: ExpenseSplitLine[];
    try {
      previewSplits = allocateExpenseSplit({
        total,
        splitMethod,
        participantUserIds: body.participantUserIds,
        splitLines,
      });
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "SPLIT_ERROR";
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "تقسیم برداشت صندوق نامعتبر است",
        status: 400,
        detail: code,
      });
    }

    const occurredOn =
      body.occurredOn?.trim() || new Date().toISOString().slice(0, 10);
    const title = body.title?.trim() || `برداشت تنخواه — ${fund.name}`;

    const expense = await this.expenses.createDraft(actor, workspaceId, {
      workspaceId,
      title,
      note: body.note?.trim() || "خرید از صندوق تنخواه",
      total,
      paidByUserId,
      splitMethod,
      participantUserIds: body.participantUserIds,
      splitLines:
        splitMethod === "equal"
          ? undefined
          : previewSplits.map((s) => ({
              userId: s.userId,
              amount: s.amount,
              percent: s.percent,
              shares: s.shares,
            })),
      occurredOn,
      visibility: "shared",
      requiresApproval: false,
      commit: "auto",
      fundingSourceKind: "petty_cash",
      fundingRefId: fundId,
      idempotencyKey: body.idempotencyKey,
    });

    if (expense.status !== "posted") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "خرج برداشت صندوق ثبت نشد",
        status: 409,
        code: "FUND_SPEND_NOT_POSTED",
        detail:
          "خرج برداشت تنخواه ثبت نهایی نشد؛ موجودی صندوق کم نشد تا دفتر و صندوق جدا نمانند.",
        expenseId: expense.id,
        expenseStatus: expense.status,
      });
    }

    // funding_source on createDraft/post should already have debited the fund;
    // create a linked spend only if that path did not run (e.g. older test stubs).
    let movement = (await this.ops.listMovements(fundId)).find(
      (m) => m.expenseId === expense.id && m.kind === "spend",
    );
    let balanceMinor: string;
    if (!movement) {
      const movementResult = await this.createPettyCashMovement(
        actor,
        workspaceId,
        fundId,
        {
          kind: "spend",
          amountMinor: body.amountMinor,
          expenseId: expense.id,
          note: body.note?.trim() || title,
          idempotencyKey: `${body.idempotencyKey}:spend`,
        },
      );
      movement = movementResult.movement;
      balanceMinor = movementResult.balanceMinor;
    } else {
      const all = await this.ops.listMovements(fundId);
      balanceMinor = this.computeFundBalance(
        fund.openingBalanceMinor,
        all,
      ).toString();
    }

    const funds = await this.listPettyCash(actor, workspaceId);
    const fundSummary =
      funds.find((f) => f.id === fundId) ?? toFundSummary(fund, balanceMinor);

    return {
      fund: fundSummary,
      expense,
      movement,
      balanceMinor,
      splits: expense.splits.length > 0 ? expense.splits : previewSplits,
    };
  }

  /**
   * Pre-flight before posting an expense funded by petty cash.
   */
  async assertPettyCashFundingAvailable(
    workspaceId: string,
    fundId: string,
    amountMinor: string,
  ): Promise<void> {
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund || !fund.active) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "صندوق تأمین تنخواه یافت نشد",
        status: 400,
        code: "FUNDING_FUND_NOT_FOUND",
      });
    }
    const movements = await this.ops.listMovements(fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    if (balance < BigInt(amountMinor)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ماندهٔ تنخواه منفی می‌شود",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }
  }

  /**
   * After expense post with fundingSourceKind=petty_cash — debit the fund once.
   * Uses ops directly so any member who can post the expense can fund from petty cash
   * (fund must exist and have balance).
   */
  async applyFundingSpendForPostedExpense(
    actor: AuthActor,
    workspaceId: string,
    expense: {
      id: string;
      total: { amountMinor: string };
      fundingSourceKind?: string;
      fundingRefId?: string;
      title?: string;
    },
  ): Promise<PettyCashMovementSummary | null> {
    if (expense.fundingSourceKind !== "petty_cash" || !expense.fundingRefId) {
      return null;
    }
    const fundId = expense.fundingRefId;
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund || !fund.active) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "صندوق تأمین تنخواه یافت نشد",
        status: 400,
        code: "FUNDING_FUND_NOT_FOUND",
      });
    }
    const existing = await this.ops.listMovements(fundId);
    const prior = existing.find(
      (m) => m.expenseId === expense.id && m.kind === "spend",
    );
    if (prior) return prior;

    const balance = this.computeFundBalance(fund.openingBalanceMinor, existing);
    const amount = BigInt(expense.total.amountMinor);
    if (balance < amount) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ماندهٔ تنخواه منفی می‌شود",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }

    return this.ops.createMovement(fundId, actor.userId, {
      kind: "spend",
      amountMinor: expense.total.amountMinor,
      expenseId: expense.id,
      note: expense.title ? `خرج از تنخواه — ${expense.title}` : "خرج از تنخواه",
      occurredAt: new Date().toISOString(),
      idempotencyKey: `funding-spend:${expense.id}`,
    });
  }

  /**
   * When an expense is reversed, reverse linked petty-cash movements
   * (topup→spend, spend→topup) so fund balance stays consistent with the ledger.
   * Uses ops directly — caller already authorized expense.reverse.
   */
  async compensateMovementsForReversedExpense(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<PettyCashMovementSummary[]> {
    const funds = await this.ops.listFunds(workspaceId);
    const created: PettyCashMovementSummary[] = [];
    for (const fund of funds) {
      const movements = await this.ops.listMovements(fund.id);
      const linked = movements.filter((m) => m.expenseId === expenseId);
      for (const m of linked) {
        const alreadyCompensated = movements.some(
          (other) =>
            other.id !== m.id &&
            other.expenseId === expenseId &&
            Boolean(other.note?.includes(`reverse:${m.id}`)),
        );
        if (alreadyCompensated) continue;

        let compensateKind: "topup" | "spend" | "adjust" | null = null;
        let amountMinor = m.amountMinor.replace(/^-/, "");
        if (m.kind === "topup" || m.kind === "return") {
          compensateKind = "spend";
        } else if (m.kind === "spend") {
          compensateKind = "topup";
        } else {
          continue;
        }

        const balance = this.computeFundBalance(fund.openingBalanceMinor, [
          ...movements,
          ...created.filter((c) => c.fundId === fund.id),
        ]);
        if (
          compensateKind === "spend" &&
          balance < BigInt(amountMinor)
        ) {
          compensateKind = "adjust";
          amountMinor = `-${amountMinor}`;
        }

        const movement = await this.ops.createMovement(fund.id, actor.userId, {
          kind: compensateKind,
          amountMinor,
          expenseId,
          note: `جبران برگشت خرج (reverse:${m.id})`,
          occurredAt: new Date().toISOString(),
          idempotencyKey:
            compensateKind === "adjust"
              ? `fund-reverse:${expenseId}:${m.id}:adj`
              : `fund-reverse:${expenseId}:${m.id}`,
        });
        created.push(movement);
      }
    }
    return created;
  }

  async listCreditPurchases(
    actor: AuthActor,
    workspaceId: string,
    status?: CreditPurchaseStatus,
  ): Promise<CreditPurchaseSummary[]> {
    await this.access.requireMemberRole(workspaceId, actor.userId);
    const purchases = await this.ops.listCreditPurchases(workspaceId, status);
    const out: CreditPurchaseSummary[] = [];
    for (const purchase of purchases) {
      const payments = await this.ops.listCreditPayments(purchase.id);
      out.push(toCreditSummary(purchase, payments));
    }
    return out;
  }

  async createCreditPurchase(
    actor: AuthActor,
    workspaceId: string,
    body: CreateCreditPurchaseRequest,
  ): Promise<CreditPurchaseSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const purchase = await this.ops.createCreditPurchase(
      workspaceId,
      actor.userId,
      body,
    );
    return toCreditSummary(purchase, []);
  }

  async createCreditPurchasePayment(
    actor: AuthActor,
    workspaceId: string,
    purchaseId: string,
    body: CreateCreditPurchasePaymentRequest,
  ): Promise<CreditPurchaseSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const purchase = await this.ops.getCreditPurchase(workspaceId, purchaseId);
    if (!purchase) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "خرید اعتباری یافت نشد",
        status: 404,
      });
    }
    const existingPayments = await this.ops.listCreditPayments(purchaseId);
    const paid = existingPayments.reduce(
      (s, p) => s + BigInt(p.amountMinor),
      0n,
    );
    const next = paid + BigInt(body.amountMinor);
    if (next > BigInt(purchase.amountMinor)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "مبلغ پرداخت بیش از خرید اعتباری است",
        status: 400,
        code: "CREDIT_OVERPAY",
      });
    }

    await this.ops.createCreditPayment(purchaseId, actor.userId, {
      ...body,
      paidAt: body.paidAt ?? new Date().toISOString(),
    });
    const status: CreditPurchaseStatus =
      next === BigInt(purchase.amountMinor) ? "paid" : "partially_paid";
    const updated = await this.ops.updateCreditPurchaseStatus(
      workspaceId,
      purchaseId,
      status,
    );
    const payments = await this.ops.listCreditPayments(purchaseId);
    return toCreditSummary(updated, payments);
  }

  async listOnBehalf(
    actor: AuthActor,
    workspaceId: string,
    status?: OnBehalfPaymentStatus,
  ): Promise<OnBehalfPaymentSummary[]> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const rows = await this.ops.listOnBehalf(workspaceId, status);
    if (isFinanceManagerRole(role)) {
      return rows.map(toOnBehalfSummary);
    }
    return rows
      .filter(
        (r) =>
          r.debtorUserId === actor.userId ||
          r.payerUserId === actor.userId ||
          r.initiatedByUserId === actor.userId,
      )
      .map(toOnBehalfSummary);
  }

  async createOnBehalf(
    actor: AuthActor,
    workspaceId: string,
    body: CreateOnBehalfPaymentRequest,
  ): Promise<OnBehalfPaymentSummary> {
    await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(
      await this.access.requireMemberRole(workspaceId, actor.userId),
    );
    if (body.debtorUserId === body.payerUserId) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "بدهکار و پرداخت‌کننده باید متفاوت باشند",
        status: 400,
        code: "ON_BEHALF_SAME_PARTY",
      });
    }
    await this.access.requireMemberRole(workspaceId, body.debtorUserId);
    await this.access.requireMemberRole(workspaceId, body.payerUserId);

    if (body.settlementId) {
      const settlement = await this.settlements.get(
        workspaceId,
        body.settlementId,
        actor.userId,
      );
      if (!settlement) {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "تسویه یافت نشد",
          status: 404,
        });
      }
      if (settlement.fromUserId !== body.debtorUserId) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "بدهکار تسویه مطابقت ندارد",
          status: 400,
          code: "ON_BEHALF_SETTLEMENT_DEBTOR",
        });
      }
      if (settlement.amount.amountMinor !== body.amountMinor) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "مبلغ پرداخت به‌جای باید با تسویه برابر باشد",
          status: 400,
          code: "ON_BEHALF_AMOUNT_MISMATCH",
        });
      }
    }

    const row = await this.ops.createOnBehalf(workspaceId, actor.userId, body);
    return toOnBehalfSummary(row);
  }

  async approveOnBehalf(
    actor: AuthActor,
    workspaceId: string,
    onBehalfId: string,
  ): Promise<OnBehalfPaymentSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.ops.getOnBehalf(workspaceId, onBehalfId);
    if (!existing) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "پرداخت به‌جای یافت نشد",
        status: 404,
        code: "ON_BEHALF_NOT_FOUND",
      });
    }
    if (existing.status !== "pending") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "پرداخت به‌جای قبلاً بررسی شده",
        status: 409,
        code: "ON_BEHALF_ALREADY_REVIEWED",
      });
    }

    const isFinance = isFinanceManagerRole(role);
    const isPayer = actor.userId === existing.payerUserId;
    if (!isFinance && !isPayer) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مادرخرج یا تأمین‌کننده می‌تواند تأیید کند",
        status: 403,
        code: "ON_BEHALF_UNAUTHORIZED",
      });
    }

    const thresholdMinor = this.makerChecker
      ? await this.makerChecker.resolveThresholdMinor(workspaceId, actor.userId)
      : process.env.MAKER_CHECKER_THRESHOLD_MINOR?.trim() || null;
    if (
      meetsMakerCheckerThreshold(existing.amount.amountMinor, thresholdMinor) &&
      actor.userId === existing.debtorUserId
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "بدهکار نمی‌تواند پرداخت‌های بزرگ به‌جای خود را تأیید کند",
        status: 403,
        code: "ON_BEHALF_DEBTOR_SELF_APPROVE",
      });
    }

    if (this.makerChecker) {
      await this.makerChecker.assertFourEyes({
        workspaceId,
        actorUserId: actor.userId,
        makerUserId: existing.initiatedByUserId,
        amountMinor: existing.amount.amountMinor,
        actionLabel: "پرداخت از حساب دیگری",
      });
      const tierGate = await this.makerChecker.applyTierGate({
        workspaceId,
        requestType: "payment_on_behalf",
        requestId: onBehalfId,
        amountMinor: existing.amount.amountMinor,
        makerUserId: existing.initiatedByUserId,
        approverUserId: actor.userId,
        approverRoles: [role],
        decision: "approved",
      });
      if (tierGate.outcome === "pending" || tierGate.outcome === "rejected") {
        return this.makerChecker.withTierProgress(
          toOnBehalfSummary(existing),
          tierGate.evaluation,
        );
      }
    }

    let journalEntryId: string | undefined;

    if (existing.settlementId) {
      const settlement = await this.settlements.get(
        workspaceId,
        existing.settlementId,
        actor.userId,
      );
      if (!settlement) {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "تسویهٔ متصل یافت نشد",
          status: 404,
        });
      }
      if (settlement.amount.amountMinor !== existing.amount.amountMinor) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "مبلغ پرداخت به‌جای باید با تسویه برابر باشد",
          status: 400,
          code: "ON_BEHALF_AMOUNT_MISMATCH",
        });
      }

      let confirmed = settlement;
      if (settlement.status === "claimed") {
        confirmed = await this.settlements.confirm(
          workspaceId,
          settlement.id,
          actor.userId,
        );
      } else if (settlement.status !== "confirmed") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "تسویهٔ لینک‌شده قابل تأیید نیست",
          status: 400,
        });
      }
      await this.ledger.postSettlement(
        actor.userId,
        toSettlementSummary(confirmed),
      );
      const funding = await this.ledger.postOnBehalfPayment(actor.userId, {
        workspaceId,
        onBehalfId: existing.id,
        debtorUserId: existing.debtorUserId,
        payerUserId: existing.payerUserId,
        amount: existing.amount,
        fundingTransfer: true,
      });
      journalEntryId = funding.id;
    } else {
      const journal = await this.ledger.postOnBehalfPayment(actor.userId, {
        workspaceId,
        onBehalfId: existing.id,
        debtorUserId: existing.debtorUserId,
        payerUserId: existing.payerUserId,
        amount: existing.amount,
      });
      journalEntryId = journal.id;
    }

    try {
      const approved = await this.ops.reviewOnBehalf(workspaceId, onBehalfId, {
        status: "approved",
        approvedByUserId: actor.userId,
        journalEntryId,
      });
      await this.announceOnBehalf(workspaceId, approved.id, {
        debtorUserId: approved.debtorUserId,
        payerUserId: approved.payerUserId,
        amountMinor: approved.amount.amountMinor,
        journalEntryId: journalEntryId ?? "",
      });
      return toOnBehalfSummary(approved);
    } catch (error: unknown) {
      this.rethrowOnBehalfReview(error);
    }
  }

  /**
   * The approval already moved the journal for two members. Telling them is a
   * follow-on: never let a failed announcement undo a booked payment.
   */
  private async announceOnBehalf(
    workspaceId: string,
    onBehalfId: string,
    payload: {
      debtorUserId: string;
      payerUserId: string;
      amountMinor: string;
      journalEntryId: string;
    },
  ): Promise<void> {
    if (!this.outbox || !this.outboxRelay) return;
    try {
      const corr = this.outboxRelay.correlation();
      const row = await this.outbox.insert({
        workspaceId,
        aggregateType: "payment_on_behalf",
        aggregateId: onBehalfId,
        eventType: "payment.on_behalf.approved",
        payload: { onBehalfId, ...payload },
        requestId: corr.requestId,
        traceId: corr.traceId,
      });
      await this.outboxRelay.dispatch(row);
    } catch {
      // Pending rows are redriven by the relay on its own schedule.
    }
  }

  async rejectOnBehalf(
    actor: AuthActor,
    workspaceId: string,
    onBehalfId: string,
    body: RejectOnBehalfPaymentRequest,
  ): Promise<OnBehalfPaymentSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.ops.getOnBehalf(workspaceId, onBehalfId);
    if (!existing) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "پرداخت به‌جای یافت نشد",
        status: 404,
        code: "ON_BEHALF_NOT_FOUND",
      });
    }
    const isFinance = isFinanceManagerRole(role);
    const isPayer = actor.userId === existing.payerUserId;
    if (!isFinance && !isPayer) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مادرخرج یا تأمین‌کننده می‌تواند رد کند",
        status: 403,
        code: "ON_BEHALF_UNAUTHORIZED",
      });
    }
    try {
      const rejected = await this.ops.reviewOnBehalf(workspaceId, onBehalfId, {
        status: "rejected",
        approvedByUserId: actor.userId,
        rejectNote: body.note,
      });
      return toOnBehalfSummary(rejected);
    } catch (error: unknown) {
      this.rethrowOnBehalfReview(error);
    }
  }

  private computeFundBalance(
    openingBalanceMinor: string,
    movements: Array<{ kind: string; amountMinor: string }>,
  ): bigint {
    let balance = BigInt(openingBalanceMinor);
    for (const m of movements) {
      balance += signedPettyCashDelta(
        m.kind as "topup" | "spend" | "return" | "adjust",
        m.amountMinor,
      );
    }
    return balance;
  }

  private assertDestLast4(destLast4?: string): void {
    if (destLast4 == null || destLast4 === "") return;
    if (!/^[0-9]{4}$/.test(destLast4)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "فقط ۴ رقم آخر حساب/کارت مقصد مجاز است",
        status: 400,
      });
    }
  }

  /**
   * Two-sided card/receipt review: finance manager OR settlement creditor (toUserId).
   * Receipts without settlement stay finance-only.
   */
  private async assertCanReviewReceipt(
    actorUserId: string,
    role: MembershipRole,
    workspaceId: string,
    receipt: StoredPaymentReceipt,
  ): Promise<void> {
    if (isFinanceManagerRole(role)) return;

    if (receipt.settlementId) {
      const settlement = await this.settlements.get(
        workspaceId,
        receipt.settlementId,
        actorUserId,
      );
      if (settlement && settlement.toUserId === actorUserId) return;
    }

    throw new ForbiddenException({
      type: "https://dang.local/problems/forbidden",
      title: "فقط مدیر مالی یا طلبکار تسویه می‌تواند فیش را بررسی کند",
      status: 403,
      code: "RECEIPT_REVIEW_UNAUTHORIZED",
    });
  }

  private async resolveCounterparty(
    workspaceId: string,
    memberInvoiceId: string | undefined,
    reviewerUserId: string,
  ): Promise<string> {
    if (memberInvoiceId) {
      // Invoice paid reduces member debt vs finance reviewer as counterparty.
      return reviewerUserId;
    }
    void workspaceId;
    return reviewerUserId;
  }

  private rethrowReceiptReview(error: unknown): never {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail === "RECEIPT_ALREADY_REVIEWED") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "رسید قبلاً بررسی شده",
        status: 409,
        code: "RECEIPT_ALREADY_REVIEWED",
      });
    }
    if (detail === "RECEIPT_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "رسید یافت نشد",
        status: 404,
        code: "RECEIPT_NOT_FOUND",
      });
    }
    throw error;
  }

  private rethrowOnBehalfReview(error: unknown): never {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail === "ON_BEHALF_ALREADY_REVIEWED") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "پرداخت به‌جای قبلاً بررسی شده",
        status: 409,
        code: "ON_BEHALF_ALREADY_REVIEWED",
      });
    }
    if (detail === "ON_BEHALF_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "پرداخت به‌جای یافت نشد",
        status: 404,
        code: "ON_BEHALF_NOT_FOUND",
      });
    }
    throw error;
  }
}
