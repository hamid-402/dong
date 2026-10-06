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
  pettyCashAllowedForKind,
  signedPettyCashDelta,
  spaceKindForTemplate,
  treasuryLabelsForKind,
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
  type PettyCashHealthReport,
  type PettyCashLedgerResponse,
  type PettyCashLedgerRow,
  type PettyCashMovementSummary,
  type RejectOnBehalfPaymentRequest,
  type RejectPaymentReceiptRequest,
  type GiftPettyCashRequest,
  type GiftPettyCashResponse,
  type SettlePayRequest,
  type SettlePayResponse,
  type SpendPettyCashAsExpenseRequest,
  type SpendPettyCashAsExpenseResponse,
  type TopupPettyCashFromMembersRequest,
  type TopupPettyCashFromMembersResponse,
  computeBalancesFromJournal,
  journalAsOfDay,
  moneyIrr,
  netForUser,
  planSettlePay,
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
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { SettlementsService } from "../settlements/settlements.service.js";
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
import {
  appendPettyCashNoteMeta,
  parsePettyCashNoteMeta,
} from "./petty-cash-note.js";

@Injectable()
export class WorkspacePaymentsService {
  constructor(
    @Inject(PAYMENT_OPS_STORE) private readonly ops: PaymentOpsStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(forwardRef(() => ExpensesService))
    private readonly expenses: ExpensesService,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(forwardRef(() => SettlementsService))
    private readonly settlementsService: SettlementsService,
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
    @Optional() @Inject(AUDIT_STORE) private readonly audit?: AuditStore,
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
        title: "Ú©Ø¯ Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ú©Ø§Ø±Øªâ€ŒØ¨Ù‡â€ŒÚ©Ø§Ø±Øª Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª",
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
          title: "ØªØ³ÙˆÛŒÙ‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
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
        title: "Ø±Ø³ÛŒØ¯ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
        code: "RECEIPT_NOT_FOUND",
      });
    }
    if (existing.status !== "submitted") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "Ø±Ø³ÛŒØ¯ Ù‚Ø¨Ù„Ø§Ù‹ Ø¨Ø±Ø±Ø³ÛŒ Ø´Ø¯Ù‡",
        status: 409,
        code: "RECEIPT_ALREADY_REVIEWED",
      });
    }
    if (existing.payerUserId === actor.userId) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Ø¨Ø±Ø±Ø³ÛŒ Ø±Ø³ÛŒØ¯ ØªÙˆØ³Ø· Ø®ÙˆØ¯ Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª",
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
          title: "ØªØ³ÙˆÛŒÙ‡Ù” Ù…ØªØµÙ„ ÛŒØ§ÙØª Ù†Ø´Ø¯",
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
          title: "ØªØ³ÙˆÛŒÙ‡Ù” Ù„ÛŒÙ†Ú©â€ŒØ´Ø¯Ù‡ Ù‚Ø§Ø¨Ù„ ØªØ£ÛŒÛŒØ¯ Ù†ÛŒØ³Øª",
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
        title: "Ø±Ø³ÛŒØ¯ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
        code: "RECEIPT_NOT_FOUND",
      });
    }
    if (existing.payerUserId === actor.userId) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Ø¨Ø±Ø±Ø³ÛŒ Ø±Ø³ÛŒØ¯ ØªÙˆØ³Ø· Ø®ÙˆØ¯ Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª",
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
      const movements = await this.ops.listMovements(workspaceId, fund.id);
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

  /**
   * Full petty-cash ledger for one fund — running balance, actor names,
   * and for topups the cash-in person + each member's contribution share.
   */
  async getPettyCashLedger(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
  ): Promise<PettyCashLedgerResponse> {
    await this.access.requireMemberRole(workspaceId, actor.userId);
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "صندوق تنخواه یافت نشد",
        status: 404,
      });
    }
    const members =
      (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const nameOf = (userId: string) =>
      members.find((m) => m.userId === userId)?.displayName?.trim() ||
      userId.slice(0, 8);

    const movements = await this.ops.listMovements(workspaceId, fundId);
    const sorted = [...movements].sort((a, b) => {
      const ta = a.occurredAt || a.createdAt;
      const tb = b.occurredAt || b.createdAt;
      const c = ta.localeCompare(tb);
      if (c !== 0) return c;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const expenseIds = [
      ...new Set(
        sorted
          .map((m) => m.expenseId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const expenseById = new Map<
      string,
      {
        paidByUserId?: string;
        occurredOn?: string;
        splits: Array<{ userId: string; amountMinor: string }>;
        title?: string;
      }
    >();
    if (expenseIds.length > 0) {
      try {
        const expenses = await this.expenses.list(actor, workspaceId, {});
        for (const exp of expenses) {
          if (!expenseIds.includes(exp.id)) continue;
          expenseById.set(exp.id, {
            paidByUserId: exp.paidByUserId,
            occurredOn: exp.occurredOn,
            title: exp.title,
            splits: (exp.splits ?? []).map((s) => ({
              userId: s.userId,
              amountMinor: s.amount.amountMinor,
            })),
          });
        }
      } catch {
        // Ledger still works without expense enrichment
      }
    }

    let running = BigInt(fund.openingBalanceMinor || "0");
    const rows: PettyCashLedgerRow[] = [];
    for (const m of sorted) {
      const delta = signedPettyCashDelta(m.kind, m.amountMinor);
      running += delta;
      const linked = m.expenseId ? expenseById.get(m.expenseId) : undefined;
      const isInflow = m.kind === "topup" || m.kind === "return" || m.kind === "gift";
      const noteMeta = parsePettyCashNoteMeta(m.note);
      const cashInBy =
        (isInflow
          ? linked?.paidByUserId?.trim() ||
            noteMeta.cashInByUserId ||
            (m.kind === "gift" ? m.actorUserId : undefined)
          : undefined) || (isInflow ? m.actorUserId : undefined);
      const occurredAtRaw = m.occurredAt || m.createdAt;
      const ledgerDate =
        noteMeta.ledgerDate ||
        linked?.occurredOn ||
        occurredAtRaw.slice(0, 10);
      rows.push({
        id: m.id,
        fundId: m.fundId,
        kind: m.kind,
        amountMinor: m.amountMinor,
        signedDeltaMinor: delta.toString(),
        balanceAfterMinor: running.toString(),
        // Prefer calendar ledger day (Iran-facing date) over UTC clock skew.
        occurredAt:
          /^\d{4}-\d{2}-\d{2}$/.test(ledgerDate) && !noteMeta.ledgerDate && !linked?.occurredOn
            ? occurredAtRaw
            : `${ledgerDate}T12:00:00.000Z`,
        createdAt: m.createdAt,
        actorUserId: m.actorUserId,
        actorDisplayName: nameOf(m.actorUserId),
        note: m.note || linked?.title,
        expenseId: m.expenseId,
        ...(cashInBy
          ? {
              cashInByUserId: cashInBy,
              cashInByDisplayName: nameOf(cashInBy),
            }
          : {}),
        ...(isInflow && linked?.splits?.length
          ? {
              memberContributions: linked.splits.map((s) => ({
                userId: s.userId,
                displayName: nameOf(s.userId),
                amountMinor: s.amountMinor,
              })),
            }
          : {}),
      });
    }

    return {
      fundId: fund.id,
      fundName: fund.name,
      custodianUserId: fund.custodianUserId,
      custodianDisplayName: nameOf(fund.custodianUserId),
      fundCreatedAt: fund.createdAt,
      createdByUserId: fund.createdByUserId,
      createdByDisplayName: nameOf(fund.createdByUserId),
      fundActive: fund.active,
      openingBalanceMinor: fund.openingBalanceMinor,
      closingBalanceMinor: running.toString(),
      currency: "IRR",
      rows,
    };
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
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(workspace?.template);
    if (!pettyCashAllowedForKind(kind)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ÙØ¶Ø§ÛŒ Ø´Ø®ØµÛŒ ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ø´ØªØ±Ú© Ù†Ø¯Ø§Ø±Ø¯",
        status: 400,
        code: "PETTY_CASH_PERSONAL_FORBIDDEN",
        detail: "Ø¨Ø±Ø§ÛŒ ÙØ¶Ø§ÛŒ Ø´Ø®ØµÛŒ Ø§Ø² Ù¾Ø³â€ŒØ§Ù†Ø¯Ø§Ø² Ø´Ø®ØµÛŒ Ø§Ø³ØªÙØ§Ø¯Ù‡ Ú©Ù†ÛŒØ¯ â€” ØµÙ†Ø¯ÙˆÙ‚ Ù…Ø´ØªØ±Ú© ÙÙ‚Ø· Ø¨Ø±Ø§ÛŒ Ú¯Ø±ÙˆÙ‡/Ø³Ø§Ø²Ù…Ø§Ù†/Ø³Ø§Ø®ØªÙ…Ø§Ù† Ø§Ø³Øª.",
      });
    }
    const custodianUserId = body.custodianUserId?.trim() || actor.userId;
    const fund = await this.ops.createFund(workspaceId, actor.userId, {
      ...body,
      custodianUserId,
    });
    return toFundSummary(fund, fund.openingBalanceMinor);
  }

  /**
   * Soft-close petty cash â€” ledger retained; no further topup/spend until reopen.
   */
  async closePettyCashFund(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
  ): Promise<PettyCashFundSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
      });
    }
    if (!fund.active) {
      const movements = await this.ops.listMovements(workspaceId, fundId);
      const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
      return toFundSummary(fund, balance.toString(), undefined);
    }
    const closed = await this.ops.setFundActive(workspaceId, fundId, false);
    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(closed.openingBalanceMinor, movements);
    return toFundSummary(closed, balance.toString());
  }

  /** Reopen a soft-closed petty cash fund (finance only). */
  async reopenPettyCashFund(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
  ): Promise<PettyCashFundSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
      });
    }
    if (fund.active) {
      const movements = await this.ops.listMovements(workspaceId, fundId);
      const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
      return toFundSummary(fund, balance.toString());
    }
    const opened = await this.ops.setFundActive(workspaceId, fundId, true);
    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(opened.openingBalanceMinor, movements);
    return toFundSummary(opened, balance.toString());
  }

  /**
   * Ensure at least one active default petty-cash fund exists (finance only).
   * Idempotent: returns existing active funds without creating duplicates.
   */
  async ensureDefaultPettyCashFund(
    actor: AuthActor,
    workspaceId: string,
    body?: { idempotencyKey?: string },
  ): Promise<{
    created: boolean;
    funds: PettyCashFundSummary[];
    defaultFund: PettyCashFundSummary | null;
  }> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(workspace?.template);
    if (!pettyCashAllowedForKind(kind)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ÙØ¶Ø§ÛŒ Ø´Ø®ØµÛŒ ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ø´ØªØ±Ú© Ù†Ø¯Ø§Ø±Ø¯",
        status: 400,
        code: "PETTY_CASH_PERSONAL_FORBIDDEN",
      });
    }
    const existing = await this.listPettyCash(actor, workspaceId);
    const active = existing.filter((f) => f.active);
    if (active.length > 0) {
      return {
        created: false,
        funds: existing,
        defaultFund: active[0] ?? null,
      };
    }
    if (this.mfa) await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    const labels = treasuryLabelsForKind(kind);
    const fund = await this.ops.createFund(workspaceId, actor.userId, {
      name: labels.defaultFundName,
      custodianUserId: actor.userId,
      openingBalanceMinor: "0",
      idempotencyKey:
        body?.idempotencyKey?.trim() ||
        `ensure-default-petty:${workspaceId}`,
    });
    const summary = toFundSummary(fund, fund.openingBalanceMinor);
    return {
      created: true,
      funds: [summary],
      defaultFund: summary,
    };
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
        title: "Ø¨Ø±Ø¯Ø§Ø´Øª ØªÙ†Ø®ÙˆØ§Ù‡ Ù†ÛŒØ§Ø² Ø¨Ù‡ Ø®Ø±Ø¬ Ù„ÛŒÙ†Ú©â€ŒØ´Ø¯Ù‡ Ø¯Ø§Ø±Ø¯",
        status: 400,
        code: "PETTY_CASH_SPEND_NEEDS_EXPENSE",
        detail:
          "Ø¨Ø±Ø¯Ø§Ø´Øª ØªÙ†Ø®ÙˆØ§Ù‡ Ø¨Ø§ÛŒØ¯ Ø¨Ù‡ Ø®Ø±Ø¬ Ù„ÛŒÙ†Ú© Ø´ÙˆØ¯ â€” Ø§Ø² spend-as-expense ÛŒØ§ funding_source Ø±ÙˆÛŒ Ø®Ø±Ø¬ Ø§Ø³ØªÙØ§Ø¯Ù‡ Ú©Ù†ÛŒØ¯.",
      });
    }
    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
      });
    }
    if (!fund.active) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ Ø¨Ø³ØªÙ‡ Ø§Ø³Øª",
        status: 400,
        code: "PETTY_CASH_FUND_CLOSED",
        detail: "Ø¨Ø±Ø§ÛŒ ÙˆØ§Ø±ÛŒØ²/Ø¨Ø±Ø¯Ø§Ø´ØªØŒ ØµÙ†Ø¯ÙˆÙ‚ Ø±Ø§ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø¨Ø§Ø² Ú©Ù†ÛŒØ¯.",
      });
    }
    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    const delta = signedPettyCashDelta(body.kind, body.amountMinor);
    if (body.kind === "spend" && balance + delta < 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø§Ù†Ø¯Ù‡Ù” ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ù†ÙÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }
    if (body.kind === "adjust" && balance + delta < 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø§Ù†Ø¯Ù‡Ù” ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ù†ÙÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }

    const movement = await this.ops.createMovement(workspaceId, fundId, actor.userId, {
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
   * Gift / donation to petty cash â€” fund balance only.
   * No shared expense and no debt for other members.
   * Any mutable member may gift; cashInBy defaults to actor.
   */
  async giftPettyCash(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
    body: GiftPettyCashRequest,
  ): Promise<GiftPettyCashResponse> {
    await this.access.requireMutableMember(workspaceId, actor.userId);
    const cashInBy = body.cashInByUserId?.trim() || actor.userId;
    await this.access.requireMember(workspaceId, cashInBy);

    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(workspace?.template);
    if (!pettyCashAllowedForKind(kind)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "ÙØ¶Ø§ÛŒ Ø´Ø®ØµÛŒ ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ø´ØªØ±Ú© Ù†Ø¯Ø§Ø±Ø¯",
        status: 400,
        code: "PETTY_CASH_PERSONAL_FORBIDDEN",
      });
    }

    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund || !fund.active) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
      });
    }

    const amount = BigInt(body.amountMinor);
    if (amount <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø¨Ù„Øº Ù‡Ø¯ÛŒÙ‡ Ø¨Ø§ÛŒØ¯ Ù…Ø«Ø¨Øª Ø¨Ø§Ø´Ø¯",
        status: 400,
      });
    }

    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    const baseNote =
      body.note?.trim() || "هدیه به صندوق — بدون بدهی برای اعضا";
    const occurredOnGift =
      body.occurredAt?.trim().slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const note = appendPettyCashNoteMeta(baseNote, {
      cashInByUserId: cashInBy,
      ledgerDate: /^\d{4}-\d{2}-\d{2}$/.test(occurredOnGift)
        ? occurredOnGift
        : undefined,
    });

    const movement = await this.ops.createMovement(workspaceId, fundId, actor.userId, {
      kind: "gift",
      amountMinor: body.amountMinor,
      note,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      idempotencyKey: body.idempotencyKey,
    });
    const nextBalance = balance + amount;
    const movementSummary = {
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
    };

    if (this.audit) {
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "petty_cash.gift",
        targetType: "petty_cash_fund",
        targetId: fundId,
        result: "success",
        metadata: {
          movementId: movement.id,
          amountMinor: body.amountMinor,
          cashInByUserId: cashInBy,
        },
      });
    }

    return {
      fund: toFundSummary(fund, nextBalance.toString()),
      movement: movementSummary,
      balanceMinor: nextBalance.toString(),
    };
  }

  /**
   * Member cash-in that raises fund balance AND credits the depositor's net
   * by the full amount (expense paid by depositor, split only among others —
   * or self-only when workspace has a single member).
   */
  async depositPettyCashMemberCredit(
    actor: AuthActor,
    workspaceId: string,
    fundId: string,
    body: {
      amountMinor: string;
      cashInByUserId?: string;
      note?: string;
      occurredOn?: string;
      occurredAt?: string;
      idempotencyKey: string;
    },
  ): Promise<TopupPettyCashFromMembersResponse> {
    await this.access.requireMutableMember(workspaceId, actor.userId);
    const cashInBy = body.cashInByUserId?.trim() || actor.userId;
    await this.access.requireMember(workspaceId, cashInBy);

    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(workspace?.template);
    if (!pettyCashAllowedForKind(kind)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "فضای شخصی تنخواه مشترک ندارد",
        status: 400,
        code: "PETTY_CASH_PERSONAL_FORBIDDEN",
      });
    }

    const fund = await this.ops.getFund(workspaceId, fundId);
    if (!fund || !fund.active) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "صندوق تنخواه یافت نشد",
        status: 404,
      });
    }

    const amount = BigInt(body.amountMinor);
    if (amount <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "مبلغ واریز باید مثبت باشد",
        status: 400,
      });
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const ids = [
      ...new Set(
        members.filter((m) => !m.disabledAt).map((m) => m.userId),
      ),
    ];
    if (!ids.includes(cashInBy)) {
      ids.push(cashInBy);
    }
    if (ids.length === 0) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "عضوی برای ثبت اعتبار واریز نیست",
        status: 400,
      });
    }

    // Full credit to depositor: others share the expense; solo → self-only (net 0).
    const others = ids.filter((id) => id !== cashInBy);
    const participantUserIds = others.length > 0 ? others : [cashInBy];

    const total = { amountMinor: body.amountMinor, currency: "IRR" as const };
    let previewSplits: ExpenseSplitLine[];
    try {
      previewSplits = allocateExpenseSplit({
        total,
        splitMethod: "equal",
        participantUserIds,
      });
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "SPLIT_ERROR";
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "تقسیم اعتبار واریز نامعتبر است",
        status: 400,
        detail: code,
      });
    }

    const occurredOn =
      body.occurredOn?.trim() ||
      (body.occurredAt?.trim().slice(0, 10) ||
        new Date().toISOString().slice(0, 10));
    const title = `واریز صندوق — ${fund.name}`;
    const baseNote =
      body.note?.trim() ||
      "واریز به صندوق: اعتبار واریزکننده (کاهش بدهی / افزایش بستانکاری)";
    const note = appendPettyCashNoteMeta(baseNote, {
      cashInByUserId: cashInBy,
      ledgerDate: occurredOn,
    });

    const expense = await this.expenses.createDraft(actor, workspaceId, {
      workspaceId,
      title,
      note,
      total,
      paidByUserId: cashInBy,
      splitMethod: "equal",
      participantUserIds,
      occurredOn,
      visibility: "shared",
      requiresApproval: false,
      commit: "auto",
      idempotencyKey: body.idempotencyKey,
    });

    if (expense.status !== "posted") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "خرج اعتبار واریز ثبت نشد",
        status: 409,
        code: "FUND_DEPOSIT_CREDIT_NOT_POSTED",
        expenseId: expense.id,
        expenseStatus: expense.status,
      });
    }

    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    const movement = await this.ops.createMovement(workspaceId, fundId, actor.userId, {
      kind: "topup",
      amountMinor: body.amountMinor,
      expenseId: expense.id,
      note,
      occurredAt: body.occurredAt ?? `${occurredOn}T12:00:00.000Z`,
      idempotencyKey: `${body.idempotencyKey}:topup`,
    });
    const nextBalance = balance + amount;

    if (this.audit) {
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "petty_cash.deposit_credit",
        targetType: "petty_cash_fund",
        targetId: fundId,
        result: "success",
        metadata: {
          movementId: movement.id,
          expenseId: expense.id,
          amountMinor: body.amountMinor,
          cashInByUserId: cashInBy,
        },
      });
    }

    return {
      fund: toFundSummary(fund, nextBalance.toString()),
      expense,
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
      splits: expense.splits.length > 0 ? expense.splits : previewSplits,
    };
  }

  /**
   * Smart settle-pay: plan + optional write (settlement claim Â± fund gift).
   * Live journal nets are truth; optional asOf only shapes suggestion / gift split.
   */
  async settlePay(
    actor: AuthActor,
    workspaceId: string,
    body: SettlePayRequest,
  ): Promise<SettlePayResponse> {
    await this.access.requireMutableMember(workspaceId, actor.userId);
    const counterparty = body.counterpartyUserId.trim();
    if (counterparty === actor.userId) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ø·Ø±Ù Ù…Ù‚Ø§Ø¨Ù„ Ù†Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ Ø®ÙˆØ¯ØªØ§Ù† Ø¨Ø§Ø´Ø¯",
        status: 400,
        code: "SETTLE_SELF",
      });
    }
    await this.access.requireMember(workspaceId, counterparty);

    const entries = await this.ledger.listForWorkspace(workspaceId, actor.userId);
    const liveLines = computeBalancesFromJournal(entries);
    const livePayer = netForUser(liveLines, actor.userId);
    const liveCp = netForUser(liveLines, counterparty);

    const suggestEntries =
      body.asOf && /^\d{4}-\d{2}-\d{2}$/.test(body.asOf)
        ? entries.filter((e) => journalAsOfDay(e) <= body.asOf!)
        : entries;
    const suggestLines = body.asOf
      ? computeBalancesFromJournal(suggestEntries)
      : liveLines;
    const suggestPayer = netForUser(suggestLines, actor.userId);
    const suggestCp = netForUser(suggestLines, counterparty);

    let plan;
    try {
      plan = planSettlePay({
        intent: body.intent,
        payAmountMinor: body.amountMinor,
        payerNetMinor: suggestPayer.toString(),
        counterpartyNetMinor: suggestCp.toString(),
      });
    } catch {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø¨Ù„Øº Ù¾Ø±Ø¯Ø§Ø®Øª Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª",
        status: 400,
      });
    }

    plan = {
      ...plan,
      payerNetAfterSettlementMinor: (
        livePayer + BigInt(plan.settlementAmountMinor)
      ).toString(),
    };

    const previewOnly = body.previewOnly === true;
    if (previewOnly) {
      return {
        workspaceId,
        previewOnly: true,
        plan,
        payerNetBeforeMinor: livePayer.toString(),
        counterpartyNetBeforeMinor: liveCp.toString(),
      };
    }

    let settlement: SettlePayResponse["settlement"];
    let gift: GiftPettyCashResponse | undefined;

    const settleAmt = BigInt(plan.settlementAmountMinor);
    const giftAmt = BigInt(plan.giftAmountMinor);

    // Gift first: if claim later fails, gift is already correct and idempotent to retry.
    // Claim-first left orphaned claims when gift failed; cancel was best-effort only.
    if (giftAmt > 0n) {
      const fundId = body.fundId?.trim();
      if (!fundId) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Ø¨Ø±Ø§ÛŒ Ù‡Ø¯ÛŒÙ‡ Ø¨Ù‡ ØµÙ†Ø¯ÙˆÙ‚ØŒ fundId Ù„Ø§Ø²Ù… Ø§Ø³Øª",
          status: 400,
          code: "FUND_ID_REQUIRED_FOR_GIFT",
        });
      }
      gift = await this.giftPettyCash(actor, workspaceId, fundId, {
        amountMinor: plan.giftAmountMinor,
        cashInByUserId: actor.userId,
        note:
          body.note?.trim() ||
          (settleAmt > 0n
            ? "Ù…Ø§Ø²Ø§Ø¯ Ù¾Ø±Ø¯Ø§Ø®Øª â†’ Ù‡Ø¯ÛŒÙ‡ Ø¨Ù‡ ØµÙ†Ø¯ÙˆÙ‚ (Ø¨Ø¯ÙˆÙ† Ø¨Ø¯Ù‡ÛŒ Ø§Ø¹Ø¶Ø§)"
            : "Ù‡Ø¯ÛŒÙ‡ Ø¨Ù‡ ØµÙ†Ø¯ÙˆÙ‚ (Ø¨Ø¯ÙˆÙ† Ø¨Ø¯Ù‡ÛŒ Ø§Ø¹Ø¶Ø§)"),
        idempotencyKey: `${body.idempotencyKey}:gift`,
      });
    }

    if (settleAmt > 0n) {
      settlement = await this.settlementsService.createClaim(actor, workspaceId, {
        workspaceId,
        fromUserId: actor.userId,
        toUserId: counterparty,
        amount: moneyIrr(plan.settlementAmountMinor),
        note:
          body.note?.trim() ||
          (body.intent === "settle_and_fund_gift"
            ? "ØªØ³ÙˆÛŒÙ‡ Ù‡ÙˆØ´Ù…Ù†Ø¯ (Ø¨Ø®Ø´ ØªØ³ÙˆÛŒÙ‡)"
            : "ØªØ³ÙˆÛŒÙ‡ Ù‡ÙˆØ´Ù…Ù†Ø¯"),
        idempotencyKey: `${body.idempotencyKey}:settle`,
      });
    }

    if (this.audit) {
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "payments.settle_pay",
        targetType: "workspace",
        targetId: workspaceId,
        result: "success",
        metadata: {
          intent: body.intent,
          settlementId: settlement?.id ?? null,
          giftMovementId: gift?.movement.id ?? null,
          settlementAmountMinor: plan.settlementAmountMinor,
          giftAmountMinor: plan.giftAmountMinor,
          asOf: body.asOf ?? null,
        },
      });
    }

    return {
      workspaceId,
      previewOnly: false,
      plan,
      payerNetBeforeMinor: livePayer.toString(),
      counterpartyNetBeforeMinor: liveCp.toString(),
      settlement,
      gift,
    };
  }

  /**
   * Ø´Ø§Ø±Ú˜ ØªÙ†Ø®ÙˆØ§Ù‡ Ø¨Ø§ Ø³Ù‡Ù… Ø§Ø¹Ø¶Ø§: Ø®Ø±Ø¬ Ù…Ø´ØªØ±Ú© (Ù…Ø§Ù†Ø¯Ù‡) + Ø­Ø±Ú©Øª topup Ù„ÛŒÙ†Ú©â€ŒØ´Ø¯Ù‡.
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
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
      });
    }

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const memberIds = new Set(members.map((m) => m.userId));
    for (const uid of body.participantUserIds) {
      if (!memberIds.has(uid)) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Ø´Ø±Ú©Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ø¹Ø¶Ùˆ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ù†ÛŒØ³Øª",
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
        title: "Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ø¹Ø¶Ùˆ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ù†ÛŒØ³Øª",
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
        title: "ØªÙ‚Ø³ÛŒÙ… Ø´Ø§Ø±Ú˜ ØµÙ†Ø¯ÙˆÙ‚ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª",
        status: 400,
        detail: code,
      });
    }

    const occurredOn =
      body.occurredOn?.trim() || new Date().toISOString().slice(0, 10);
    const title = `Ø´Ø§Ø±Ú˜ ØªÙ†Ø®ÙˆØ§Ù‡ â€” ${fund.name}`;

    const expense = await this.expenses.createDraft(actor, workspaceId, {
      workspaceId,
      title,
      note: body.note?.trim() || "Ø´Ø§Ø±Ú˜ ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ Ø§Ø² Ø³Ù‡Ù… Ø§Ø¹Ø¶Ø§",
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
        title: "Ø®Ø±Ø¬ Ø´Ø§Ø±Ú˜ ØµÙ†Ø¯ÙˆÙ‚ Ø«Ø¨Øª Ù†Ø´Ø¯",
        status: 409,
        code: "FUND_TOPUP_NOT_POSTED",
        detail:
          "Ø®Ø±Ø¬ Ø´Ø§Ø±Ú˜ ØªÙ†Ø®ÙˆØ§Ù‡ Ø«Ø¨Øª Ù†Ù‡Ø§ÛŒÛŒ Ù†Ø´Ø¯Ø› ØµÙ†Ø¯ÙˆÙ‚ Ø§ÙØ²Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù†Ø´Ø¯ ØªØ§ Ù…Ø§Ù†Ø¯Ù‡ Ùˆ Ø³Ù‡Ù…â€ŒÙ‡Ø§ Ø¬Ø¯Ø§ Ù†Ù…Ø§Ù†Ù†Ø¯.",
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
   * Ø¨Ø±Ø¯Ø§Ø´Øª Ø§Ø² ØªÙ†Ø®ÙˆØ§Ù‡ Ø¨Ø§ Ø³Ù‡Ù…: Ø®Ø±Ø¬ Ù…Ø´ØªØ±Ú© (funding=petty_cash) + Ø­Ø±Ú©Øª spend.
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
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
      });
    }

    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    const amount = BigInt(body.amountMinor);
    if (balance < amount) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø§Ù†Ø¯Ù‡Ù” ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ù†ÙÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯",
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
          title: "Ø´Ø±Ú©Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ø¹Ø¶Ùˆ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ù†ÛŒØ³Øª",
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
        title: "Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ø¹Ø¶Ùˆ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ù†ÛŒØ³Øª",
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
        title: "ØªÙ‚Ø³ÛŒÙ… Ø¨Ø±Ø¯Ø§Ø´Øª ØµÙ†Ø¯ÙˆÙ‚ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª",
        status: 400,
        detail: code,
      });
    }

    const occurredOn =
      body.occurredOn?.trim() || new Date().toISOString().slice(0, 10);
    const title = body.title?.trim() || `Ø¨Ø±Ø¯Ø§Ø´Øª ØªÙ†Ø®ÙˆØ§Ù‡ â€” ${fund.name}`;

    const expense = await this.expenses.createDraft(actor, workspaceId, {
      workspaceId,
      title,
      note: body.note?.trim() || "Ø®Ø±ÛŒØ¯ Ø§Ø² ØµÙ†Ø¯ÙˆÙ‚ ØªÙ†Ø®ÙˆØ§Ù‡",
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
        title: "Ø®Ø±Ø¬ Ø¨Ø±Ø¯Ø§Ø´Øª ØµÙ†Ø¯ÙˆÙ‚ Ø«Ø¨Øª Ù†Ø´Ø¯",
        status: 409,
        code: "FUND_SPEND_NOT_POSTED",
        detail:
          "Ø®Ø±Ø¬ Ø¨Ø±Ø¯Ø§Ø´Øª ØªÙ†Ø®ÙˆØ§Ù‡ Ø«Ø¨Øª Ù†Ù‡Ø§ÛŒÛŒ Ù†Ø´Ø¯Ø› Ù…ÙˆØ¬ÙˆØ¯ÛŒ ØµÙ†Ø¯ÙˆÙ‚ Ú©Ù… Ù†Ø´Ø¯ ØªØ§ Ø¯ÙØªØ± Ùˆ ØµÙ†Ø¯ÙˆÙ‚ Ø¬Ø¯Ø§ Ù†Ù…Ø§Ù†Ù†Ø¯.",
        expenseId: expense.id,
        expenseStatus: expense.status,
      });
    }

    // funding_source on createDraft/post should already have debited the fund;
    // create a linked spend only if that path did not run (e.g. older test stubs).
    let movement = (await this.ops.listMovements(workspaceId, fundId)).find(
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
      const all = await this.ops.listMovements(workspaceId, fundId);
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
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªØ£Ù…ÛŒÙ† ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 400,
        code: "FUNDING_FUND_NOT_FOUND",
      });
    }
    const movements = await this.ops.listMovements(workspaceId, fundId);
    const balance = this.computeFundBalance(fund.openingBalanceMinor, movements);
    if (balance < BigInt(amountMinor)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø§Ù†Ø¯Ù‡Ù” ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ù†ÙÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }
  }

  /**
   * After expense post with fundingSourceKind=petty_cash â€” debit the fund once.
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
        title: "ØµÙ†Ø¯ÙˆÙ‚ ØªØ£Ù…ÛŒÙ† ØªÙ†Ø®ÙˆØ§Ù‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 400,
        code: "FUNDING_FUND_NOT_FOUND",
      });
    }
    const existing = await this.ops.listMovements(workspaceId, fundId);
    const prior = existing.find(
      (m) => m.expenseId === expense.id && m.kind === "spend",
    );
    if (prior) return prior;

    const balance = this.computeFundBalance(fund.openingBalanceMinor, existing);
    const amount = BigInt(expense.total.amountMinor);
    if (balance < amount) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Ù…Ø§Ù†Ø¯Ù‡Ù” ØªÙ†Ø®ÙˆØ§Ù‡ Ù…Ù†ÙÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯",
        status: 400,
        code: "PETTY_CASH_INSUFFICIENT",
      });
    }

    return this.ops.createMovement(workspaceId, fundId, actor.userId, {
      kind: "spend",
      amountMinor: expense.total.amountMinor,
      expenseId: expense.id,
      note: expense.title ? `Ø®Ø±Ø¬ Ø§Ø² ØªÙ†Ø®ÙˆØ§Ù‡ â€” ${expense.title}` : "Ø®Ø±Ø¬ Ø§Ø² ØªÙ†Ø®ÙˆØ§Ù‡",
      occurredAt: new Date().toISOString(),
      idempotencyKey: `funding-spend:${expense.id}`,
    });
  }

  /**
   * After expense post with fundingSourceKind=credit â€” open a linked credit purchase
   * (idempotent). Any member who can post the expense can trigger this; repayments
   * stay finance-gated via createCreditPurchasePayment.
   */
  async applyFundingCreditForPostedExpense(
    actor: AuthActor,
    workspaceId: string,
    expense: {
      id: string;
      total: { amountMinor: string };
      fundingSourceKind?: string;
      title?: string;
      occurredOn?: string;
    },
  ): Promise<CreditPurchaseSummary | null> {
    if (expense.fundingSourceKind !== "credit") return null;
    await this.access.requireMemberRole(workspaceId, actor.userId);

    const existing = await this.ops.listCreditPurchases(workspaceId);
    const prior = existing.find((p) => p.expenseId === expense.id);
    if (prior) {
      const payments = await this.ops.listCreditPayments(prior.id);
      return toCreditSummary(prior, payments);
    }

    const purchasedAt = expense.occurredOn?.trim()
      ? `${expense.occurredOn.trim()}T12:00:00.000Z`
      : new Date().toISOString();
    const due = new Date(purchasedAt);
    if (Number.isNaN(due.getTime())) {
      due.setTime(Date.now());
    }
    due.setUTCDate(due.getUTCDate() + 30);
    const dueDate = due.toISOString().slice(0, 10);

    const purchase = await this.ops.createCreditPurchase(
      workspaceId,
      actor.userId,
      {
        supplierRef: (expense.title?.trim() || "Ø®Ø±ÛŒØ¯ Ø§Ø¹ØªØ¨Ø§Ø±ÛŒ / Ù‚Ø³Ø·ÛŒ").slice(0, 200),
        amountMinor: expense.total.amountMinor,
        purchasedAt,
        dueDate,
        expenseId: expense.id,
        note: "Ø«Ø¨Øª Ø®ÙˆØ¯Ú©Ø§Ø± Ø§Ø² Ù…Ù†Ø¨Ø¹ Ù¾Ø±Ø¯Ø§Ø®Øª Ø§Ø¹ØªØ¨Ø§Ø±ÛŒ Ø±ÙˆÛŒ Ø®Ø±Ø¬",
        idempotencyKey: `funding-credit:${expense.id}`,
      },
    );
    return toCreditSummary(purchase, []);
  }

  /**
   * When an expense is reversed, reverse linked petty-cash movements
   * (topupâ†’spend, spendâ†’topup) so fund balance stays consistent with the ledger.
   * Uses ops directly â€” caller already authorized expense.reverse.
   */
  async compensateMovementsForReversedExpense(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<PettyCashMovementSummary[]> {
    const funds = await this.ops.listFunds(workspaceId);
    const created: PettyCashMovementSummary[] = [];
    for (const fund of funds) {
      const movements = await this.ops.listMovements(workspaceId, fund.id);
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

        const movement = await this.ops.createMovement(workspaceId, fund.id, actor.userId, {
          kind: compensateKind,
          amountMinor,
          expenseId,
          note: `Ø¬Ø¨Ø±Ø§Ù† Ø¨Ø±Ú¯Ø´Øª Ø®Ø±Ø¬ (reverse:${m.id})`,
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
        title: "Ø®Ø±ÛŒØ¯ Ø§Ø¹ØªØ¨Ø§Ø±ÛŒ ÛŒØ§ÙØª Ù†Ø´Ø¯",
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
        title: "Ù…Ø¨Ù„Øº Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨ÛŒØ´ Ø§Ø² Ø®Ø±ÛŒØ¯ Ø§Ø¹ØªØ¨Ø§Ø±ÛŒ Ø§Ø³Øª",
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
        title: "Ø¨Ø¯Ù‡Ú©Ø§Ø± Ùˆ Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÚ©Ù†Ù†Ø¯Ù‡ Ø¨Ø§ÛŒØ¯ Ù…ØªÙØ§ÙˆØª Ø¨Ø§Ø´Ù†Ø¯",
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
          title: "ØªØ³ÙˆÛŒÙ‡ ÛŒØ§ÙØª Ù†Ø´Ø¯",
          status: 404,
        });
      }
      if (settlement.fromUserId !== body.debtorUserId) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Ø¨Ø¯Ù‡Ú©Ø§Ø± ØªØ³ÙˆÛŒÙ‡ Ù…Ø·Ø§Ø¨Ù‚Øª Ù†Ø¯Ø§Ø±Ø¯",
          status: 400,
          code: "ON_BEHALF_SETTLEMENT_DEBTOR",
        });
      }
      if (settlement.amount.amountMinor !== body.amountMinor) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Ù…Ø¨Ù„Øº Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ Ø¨Ø§ÛŒØ¯ Ø¨Ø§ ØªØ³ÙˆÛŒÙ‡ Ø¨Ø±Ø§Ø¨Ø± Ø¨Ø§Ø´Ø¯",
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
        title: "Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
        code: "ON_BEHALF_NOT_FOUND",
      });
    }
    if (existing.status !== "pending") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ Ù‚Ø¨Ù„Ø§Ù‹ Ø¨Ø±Ø±Ø³ÛŒ Ø´Ø¯Ù‡",
        status: 409,
        code: "ON_BEHALF_ALREADY_REVIEWED",
      });
    }

    const isFinance = isFinanceManagerRole(role);
    const isPayer = actor.userId === existing.payerUserId;
    if (!isFinance && !isPayer) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "ÙÙ‚Ø· Ù…Ø§Ø¯Ø±Ø®Ø±Ø¬ ÛŒØ§ ØªØ£Ù…ÛŒÙ†â€ŒÚ©Ù†Ù†Ø¯Ù‡ Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ ØªØ£ÛŒÛŒØ¯ Ú©Ù†Ø¯",
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
        title: "Ø¨Ø¯Ù‡Ú©Ø§Ø± Ù†Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÙ‡Ø§ÛŒ Ø¨Ø²Ø±Ú¯ Ø¨Ù‡â€ŒØ¬Ø§ÛŒ Ø®ÙˆØ¯ Ø±Ø§ ØªØ£ÛŒÛŒØ¯ Ú©Ù†Ø¯",
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
        actionLabel: "Ù¾Ø±Ø¯Ø§Ø®Øª Ø§Ø² Ø­Ø³Ø§Ø¨ Ø¯ÛŒÚ¯Ø±ÛŒ",
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
          title: "ØªØ³ÙˆÛŒÙ‡Ù” Ù…ØªØµÙ„ ÛŒØ§ÙØª Ù†Ø´Ø¯",
          status: 404,
        });
      }
      if (settlement.amount.amountMinor !== existing.amount.amountMinor) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Ù…Ø¨Ù„Øº Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ Ø¨Ø§ÛŒØ¯ Ø¨Ø§ ØªØ³ÙˆÛŒÙ‡ Ø¨Ø±Ø§Ø¨Ø± Ø¨Ø§Ø´Ø¯",
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
          title: "ØªØ³ÙˆÛŒÙ‡Ù” Ù„ÛŒÙ†Ú©â€ŒØ´Ø¯Ù‡ Ù‚Ø§Ø¨Ù„ ØªØ£ÛŒÛŒØ¯ Ù†ÛŒØ³Øª",
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
        title: "Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
        code: "ON_BEHALF_NOT_FOUND",
      });
    }
    const isFinance = isFinanceManagerRole(role);
    const isPayer = actor.userId === existing.payerUserId;
    if (!isFinance && !isPayer) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "ÙÙ‚Ø· Ù…Ø§Ø¯Ø±Ø®Ø±Ø¬ ÛŒØ§ ØªØ£Ù…ÛŒÙ†â€ŒÚ©Ù†Ù†Ø¯Ù‡ Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ Ø±Ø¯ Ú©Ù†Ø¯",
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
        title: "ÙÙ‚Ø· Û´ Ø±Ù‚Ù… Ø¢Ø®Ø± Ø­Ø³Ø§Ø¨/Ú©Ø§Ø±Øª Ù…Ù‚ØµØ¯ Ù…Ø¬Ø§Ø² Ø§Ø³Øª",
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
      title: "ÙÙ‚Ø· Ù…Ø¯ÛŒØ± Ù…Ø§Ù„ÛŒ ÛŒØ§ Ø·Ù„Ø¨Ú©Ø§Ø± ØªØ³ÙˆÛŒÙ‡ Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ ÙÛŒØ´ Ø±Ø§ Ø¨Ø±Ø±Ø³ÛŒ Ú©Ù†Ø¯",
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
        title: "Ø±Ø³ÛŒØ¯ Ù‚Ø¨Ù„Ø§Ù‹ Ø¨Ø±Ø±Ø³ÛŒ Ø´Ø¯Ù‡",
        status: 409,
        code: "RECEIPT_ALREADY_REVIEWED",
      });
    }
    if (detail === "RECEIPT_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Ø±Ø³ÛŒØ¯ ÛŒØ§ÙØª Ù†Ø´Ø¯",
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
        title: "Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ Ù‚Ø¨Ù„Ø§Ù‹ Ø¨Ø±Ø±Ø³ÛŒ Ø´Ø¯Ù‡",
        status: 409,
        code: "ON_BEHALF_ALREADY_REVIEWED",
      });
    }
    if (detail === "ON_BEHALF_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ù‡â€ŒØ¬Ø§ÛŒ ÛŒØ§ÙØª Ù†Ø´Ø¯",
        status: 404,
        code: "ON_BEHALF_NOT_FOUND",
      });
    }
    throw error;
  }
}
