import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import {
  buildDailyLedgerCsv,
  buildDailyLedgerMatrix,
  moneySchema,
  parseDailyLedgerImportCsv,
  parseLedgerImportText,
  parseDongToWorkbook,
  resolveDailyLedgerRange,
  resolveLedgerColumnTarget,
  assertAmountMatchesQuantity,
  pettyCashAllowedForKind,
  spaceKindForTemplate,
  type AuthActor,
  type CreateDailyLedgerDepositRequest,
  type CreateDailyLedgerDepositResponse,
  type CreateDailyLedgerEntryRequest,
  type CreateExpenseDraftRequest,
  type CreateWorkspaceRangeLockRequest,
  type DailyLedgerDayTemplateResponse,
  type DailyLedgerFundDeposit,
  type DailyLedgerRangePreset,
  type DailyLedgerResponse,
  type MembershipSummary,
  type PostLedgerDayRequest,
  type UpdateDailyLedgerEntryRequest,
  type UpsertWorkspaceDayRequest,
  type UpsertWorkspaceDayResponse,
  type WorkspaceRangeLockSummary,
} from "@dang/contracts";
import { readXlsxMatrices } from "../reports/xlsx-read.js";
import { RANGE_LOCK_ROLES } from "@dang/contracts";
import { CatalogService } from "../catalog/catalog.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { WorkspacePaymentsService } from "../payments/workspace-payments.service.js";
import { parsePettyCashNoteMeta } from "../payments/petty-cash-note.js";
import { resolveExpenseListOptions } from "./expense-list-options.js";
import { EXPENSE_STORE, type ExpenseStore } from "./expense.types.js";
import { ExpensesService } from "./expenses.service.js";
import {
  WORKSPACE_DAY_STORE,
  type WorkspaceDayStore,
} from "./workspace-day.store.js";
import {
  WORKSPACE_RANGE_LOCK_STORE,
  type WorkspaceRangeLockStore,
} from "./workspace-range-lock.store.js";

const LOCK_ROLES = new Set<string>(RANGE_LOCK_ROLES);

type MembersCache = Map<string, MembershipSummary[]>;

@Injectable()
export class DailyLedgerService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(WORKSPACE_DAY_STORE) private readonly days: WorkspaceDayStore,
    @Inject(WORKSPACE_RANGE_LOCK_STORE) private readonly locks: WorkspaceRangeLockStore,
    @Inject(ExpensesService) private readonly expenseService: ExpensesService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Optional()
    @Inject(forwardRef(() => WorkspacePaymentsService))
    private readonly payments?: WorkspacePaymentsService,
  ) {}

  /** Per-request/method cache so listMembers is not hit repeatedly in one flow. */
  private async loadMembers(
    workspaceId: string,
    userId: string,
    cache: MembersCache,
  ): Promise<MembershipSummary[]> {
    const key = `${workspaceId}:${userId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const members = await this.iam.listMembers(workspaceId, userId);
    if (!members?.length) {
      throw new ForbiddenException({ detail: "عضویت پیدا نشد" });
    }
    cache.set(key, members);
    return members;
  }

  async getLedger(
    actor: AuthActor,
    workspaceId: string,
    fromQ?: string,
    toQ?: string,
    presetQ?: string,
    daysQ?: string,
  ): Promise<DailyLedgerResponse> {
    await this.requireMember(workspaceId, actor.userId);
    const range = this.resolveRange(presetQ, fromQ, toQ, daysQ);
    return this.buildLedger(actor, workspaceId, range.from, range.to, new Map());
  }

  async exportCsvPayload(
    actor: AuthActor,
    workspaceId: string,
    fromQ?: string,
    toQ?: string,
    presetQ?: string,
    daysQ?: string,
  ): Promise<{ body: string; filename: string }> {
    await this.requireMember(workspaceId, actor.userId);
    const range = this.resolveRange(presetQ, fromQ, toQ, daysQ);
    const ledger = await this.buildLedger(
      actor,
      workspaceId,
      range.from,
      range.to,
      new Map(),
    );
    const csv = buildDailyLedgerCsv(ledger);
    const body = `\uFEFF${csv}`;
    const filename = `dang-daily-ledger-${range.from}_${range.to}.csv`;
    return { body, filename };
  }

  async upsertDay(
    actor: AuthActor,
    workspaceId: string,
    date: string,
    body: UpsertWorkspaceDayRequest,
  ): Promise<UpsertWorkspaceDayResponse> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    await this.assertNotRangeLocked(workspaceId, actor.userId, date);
    try {
      const prevRows = await this.days.listDays(workspaceId, actor.userId, date, date);
      const prev = prevRows[0];
      const becomingHoliday = body.isHoliday === true && !prev?.isHoliday;
      const clearingHoliday = body.isHoliday === false && prev?.isHoliday;

      if (becomingHoliday) {
        const reversedIds = await this.reverseExpensesOnDate(actor, workspaceId, date);
        return await this.days.upsertDay(workspaceId, actor.userId, date, {
          ...body,
          holidayReversedExpenseIds: reversedIds,
        });
      }

      if (clearingHoliday) {
        const ids = prev?.holidayReversedExpenseIds ?? [];
        const restore = await this.restoreReversedExpenses(actor, workspaceId, ids);
        const updated = await this.days.upsertDay(workspaceId, actor.userId, date, {
          ...body,
          holidayReversedExpenseIds: [],
        });
        return { ...updated, restore };
      }

      return await this.days.upsertDay(workspaceId, actor.userId, date, body);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "DATE") {
        throw new BadRequestException({ detail: "تاریخ باید YYYY-MM-DD باشد" });
      }
      throw error;
    }
  }

  async listLocks(
    actor: AuthActor,
    workspaceId: string,
    activeQ?: string,
  ): Promise<WorkspaceRangeLockSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.locks.list(workspaceId, actor.userId, {
      activeOnly: activeQ === "1" || activeQ === "true",
    });
  }

  async createLock(
    actor: AuthActor,
    workspaceId: string,
    body: CreateWorkspaceRangeLockRequest,
  ): Promise<WorkspaceRangeLockSummary> {
    await this.requireLockManager(workspaceId, actor.userId);
    try {
      return await this.locks.create(workspaceId, actor.userId, body);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "DATE_RANGE") {
        throw new BadRequestException({ detail: "بازه تاریخ نامعتبر است" });
      }
      if (error instanceof Error && error.message === "RANGE_OVERLAP") {
        throw new BadRequestException({ detail: "با بازه قفل‌شدهٔ دیگر هم‌پوشانی دارد" });
      }
      if (error instanceof Error && error.message === "IDEMPOTENCY") {
        throw new BadRequestException({ detail: "idempotencyKey لازم است" });
      }
      throw error;
    }
  }

  async unlockLock(
    actor: AuthActor,
    workspaceId: string,
    lockId: string,
  ): Promise<WorkspaceRangeLockSummary> {
    await this.requireLockManager(workspaceId, actor.userId);
    try {
      return await this.locks.unlock(workspaceId, lockId, actor.userId);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw new NotFoundException({ detail: "قفل پیدا نشد" });
      }
      throw error;
    }
  }

  async addEntry(
    actor: AuthActor,
    workspaceId: string,
    body: CreateDailyLedgerEntryRequest,
  ): Promise<DailyLedgerResponse> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    this.validateEntryBody(body);
    await this.assertDayOpen(workspaceId, actor.userId, body.date);

    const cache: MembersCache = new Map();
    const members = await this.loadMembers(workspaceId, actor.userId, cache);

    const memberId = body.memberUserId?.trim() || null;
    const draft = this.buildDraft(actor, workspaceId, body, members.map((m) => m.userId), memberId);
    const created = await this.expenseService.createDraft(actor, workspaceId, draft);
    await this.expenseService.post(actor, workspaceId, created.id);
    return this.buildLedger(actor, workspaceId, body.date, body.date, cache);
  }

  async importCsv(
    actor: AuthActor,
    workspaceId: string,
    body: {
      csv?: string;
      paste?: string;
      xlsxBase64?: string;
      rows?: Array<{
        date: string;
        column: string;
        itemName: string;
        amountToman: number;
      }>;
      holidays?: string[];
      columnMap?: Record<string, string>;
      sheetSource?: "auto" | "master" | "members";
      previewOnly?: boolean;
      idempotencyKey?: string;
    },
  ): Promise<{
    imported: number;
    skipped: number;
    holidays: number;
    warnings: string[];
    unmappedColumns: string[];
    preview?: Array<{
      date: string;
      column: string;
      itemName: string;
      amountToman: number;
      resolved: "shared" | "member" | "skip" | "unmapped";
      memberUserId?: string;
    }>;
    ledger: DailyLedgerResponse;
  }> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);

    const text = (body.paste ?? body.csv ?? "").trim();
    const xlsxB64 = body.xlsxBase64?.trim();
    let parsed =
      text.length > 0
        ? parseLedgerImportText(text)
        : {
            rows: [] as ReturnType<typeof parseDailyLedgerImportCsv>,
            holidays: [] as string[],
            warnings: [] as string[],
          };

    if (body.rows && body.rows.length > 0) {
      parsed = {
        rows: body.rows.map((r) => ({
          date: r.date,
          column: r.column,
          itemName: r.itemName,
          amountToman: r.amountToman,
        })),
        holidays: body.holidays ?? [],
        warnings: [],
      };
    } else if (xlsxB64) {
      const buf = Buffer.from(xlsxB64.replace(/^data:[^;]+;base64,/, ""), "base64");
      const sheets = readXlsxMatrices(buf);
      if (sheets.length === 0) {
        throw new BadRequestException({ detail: "شیت معتبری در فایل Excel نبود" });
      }
      parsed = parseDongToWorkbook(sheets, { source: body.sheetSource ?? "auto" });
    } else if (text.length > 0 && parsed.rows.length === 0) {
      const legacy = parseDailyLedgerImportCsv(text);
      parsed = { rows: legacy, holidays: [], warnings: parsed.warnings };
    }

    if (parsed.rows.length === 0 && parsed.holidays.length === 0) {
      throw new BadRequestException({
        detail: parsed.warnings[0] ?? "هیچ ردیف معتبری برای ورود نبود",
      });
    }
    if (parsed.rows.length > 500) {
      throw new BadRequestException({ detail: "حداکثر ۵۰۰ ردیف در هر import" });
    }

    const cache: MembersCache = new Map();
    const members = await this.loadMembers(workspaceId, actor.userId, cache);
    const columnMap = body.columnMap;

    const uniqueColumns = [
      ...new Set(parsed.rows.map((r) => r.column.trim()).filter(Boolean)),
    ];
    const unmappedColumns: string[] = [];
    for (const col of uniqueColumns) {
      const resolved = resolveLedgerColumnTarget(col, members, columnMap);
      if (resolved.kind === "unmapped") unmappedColumns.push(col);
    }

    const preview = parsed.rows.slice(0, 80).map((row) => {
      const resolved = resolveLedgerColumnTarget(row.column, members, columnMap);
      return {
        date: row.date,
        column: row.column,
        itemName: row.itemName,
        amountToman: row.amountToman,
        resolved: resolved.kind,
        memberUserId: resolved.kind === "member" ? resolved.userId : undefined,
      };
    });

    const rangeFrom = parsed.rows[0]?.date ?? parsed.holidays[0]!;
    const rangeTo =
      parsed.rows[parsed.rows.length - 1]?.date ??
      parsed.holidays[parsed.holidays.length - 1]!;

    if (body.previewOnly) {
      const ledger = await this.buildLedger(
        actor,
        workspaceId,
        rangeFrom,
        rangeTo,
        cache,
      );
      return {
        imported: 0,
        skipped: 0,
        holidays: 0,
        warnings: [
          ...parsed.warnings,
          `پیش‌نمایش: ${parsed.rows.length} قلم · ${parsed.holidays.length} تعطیل`,
        ].slice(0, 20),
        unmappedColumns,
        preview,
        ledger,
      };
    }

    if (unmappedColumns.length > 0) {
      const ledger = await this.buildLedger(
        actor,
        workspaceId,
        rangeFrom,
        rangeTo,
        cache,
      );
      return {
        imported: 0,
        skipped: parsed.rows.length,
        holidays: 0,
        warnings: [
          ...parsed.warnings,
          `ستون‌های بدون نگاشت عضو: ${unmappedColumns.join("، ")} — نگاشت کنید و دوباره بفرستید`,
        ].slice(0, 20),
        unmappedColumns,
        preview,
        ledger,
      };
    }

    let imported = 0;
    let skipped = 0;
    const warnings = [...parsed.warnings];
    let minDate = rangeFrom;
    let maxDate = rangeFrom;
    const batchKey = body.idempotencyKey?.trim() || crypto.randomUUID();

    for (let i = 0; i < parsed.rows.length; i += 1) {
      const row = parsed.rows[i]!;
      minDate = row.date < minDate ? row.date : minDate;
      maxDate = row.date > maxDate ? row.date : maxDate;
      try {
        await this.assertDayOpen(workspaceId, actor.userId, row.date);
        const resolved = resolveLedgerColumnTarget(row.column, members, columnMap);
        if (resolved.kind === "skip") {
          skipped += 1;
          continue;
        }
        const memberId = resolved.kind === "member" ? resolved.userId : null;
        const amountMinor = String(Math.round(row.amountToman) * 10);
        const draft = this.buildDraft(
          actor,
          workspaceId,
          {
            date: row.date,
            itemName: row.itemName,
            amount: { amountMinor, currency: "IRR" },
            memberUserId: memberId,
            idempotencyKey: `${batchKey}:${i}`,
          },
          members.map((m) => m.userId),
          memberId,
        );
        const created = await this.expenseService.createDraft(actor, workspaceId, draft);
        await this.expenseService.post(actor, workspaceId, created.id);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    let holidaysSet = 0;
    for (const holiday of parsed.holidays) {
      minDate = holiday < minDate ? holiday : minDate;
      maxDate = holiday > maxDate ? holiday : maxDate;
      try {
        await this.upsertDay(actor, workspaceId, holiday, { isHoliday: true });
        holidaysSet += 1;
      } catch {
        skipped += 1;
      }
    }

    const ledger = await this.buildLedger(actor, workspaceId, minDate, maxDate, cache);
    return {
      imported,
      skipped,
      holidays: holidaysSet,
      warnings: [...new Set(warnings)].slice(0, 20),
      unmappedColumns: [],
      preview,
      ledger,
    };
  }

  async updateEntry(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
    body: UpdateDailyLedgerEntryRequest,
  ): Promise<DailyLedgerResponse> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    const itemName = body.itemName?.trim();
    if (!itemName) throw new BadRequestException({ detail: "نام کالا لازم است" });
    if (!moneySchema.safeParse(body.amount).success) {
      throw new BadRequestException({ detail: "مبلغ نامعتبر است" });
    }
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({ detail: "idempotencyKey لازم است" });
    }

    const listed = await this.listVisibleExpenses(workspaceId, actor.userId);
    const current = listed.find((e) => e.id === expenseId && e.status !== "reversed");
    if (!current) throw new NotFoundException({ detail: "قلم پیدا نشد" });

    const nextDate = body.date?.trim() || current.occurredOn;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      throw new BadRequestException({ detail: "تاریخ نامعتبر است" });
    }
    try {
      assertAmountMatchesQuantity({
        amountMinor: body.amount.amountMinor,
        quantity: body.quantity,
        unitPriceMinor: body.unitPriceMinor,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AMOUNT_MISMATCH") {
        throw new BadRequestException({
          detail: "amountMinor must equal round(quantity × unitPriceMinor)",
          code: "AMOUNT_MISMATCH",
          title: "AMOUNT_MISMATCH",
        });
      }
      throw error;
    }
    await this.assertDayOpen(workspaceId, actor.userId, current.occurredOn);
    if (nextDate !== current.occurredOn) {
      await this.assertDayOpen(workspaceId, actor.userId, nextDate);
    }

    const cache: MembersCache = new Map();
    const members = await this.loadMembers(workspaceId, actor.userId, cache);

    const isMemberCell =
      current.visibility === "shared" &&
      current.splits.length === 1 &&
      current.participantUserIds.length === 1;
    let memberId: string | null = isMemberCell ? current.splits[0]!.userId : null;
    if (body.memberUserId !== undefined) {
      memberId = body.memberUserId;
      if (memberId !== null && !members.some((m) => m.userId === memberId)) {
        throw new BadRequestException({ detail: "عضو نامعتبر است" });
      }
    }

    await this.expenseService.reverse(actor, workspaceId, expenseId);
    const draft = this.buildDraft(
      actor,
      workspaceId,
      {
        date: nextDate,
        itemName,
        amount: body.amount,
        memberUserId: memberId,
        idempotencyKey: body.idempotencyKey.trim(),
        catalogItemId: body.catalogItemId,
        unitCode: body.unitCode,
        quantity: body.quantity,
        unitPriceMinor: body.unitPriceMinor,
        fundingSourceKind:
          body.fundingSourceKind ??
          (current.fundingSourceKind === "petty_cash" ||
          current.fundingSourceKind === "personal"
            ? current.fundingSourceKind
            : undefined),
        fundingRefId: body.fundingRefId ?? current.fundingRefId,
      },
      members.map((m) => m.userId),
      memberId,
    );
    const created = await this.expenseService.createDraft(actor, workspaceId, draft);
    await this.expenseService.post(actor, workspaceId, created.id);
    const from = nextDate < current.occurredOn ? nextDate : current.occurredOn;
    const to = nextDate > current.occurredOn ? nextDate : current.occurredOn;
    return this.buildLedger(actor, workspaceId, from, to, cache);
  }

  async deleteEntry(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<DailyLedgerResponse> {
    await this.requireMember(workspaceId, actor.userId);
    const listed = await this.listVisibleExpenses(workspaceId, actor.userId);
    const current = listed.find((e) => e.id === expenseId);
    if (!current || current.status === "reversed") {
      throw new NotFoundException({ detail: "قلم پیدا نشد" });
    }
    await this.assertDayOpen(workspaceId, actor.userId, current.occurredOn);
    await this.expenseService.reverse(actor, workspaceId, expenseId);
    return this.buildLedger(
      actor,
      workspaceId,
      current.occurredOn,
      current.occurredOn,
      new Map(),
    );
  }

  validateEntryBody(body: CreateDailyLedgerEntryRequest): void {
    if (!body.itemName?.trim()) {
      throw new BadRequestException({ detail: "نام کالا لازم است" });
    }
    if (!moneySchema.safeParse(body.amount).success) {
      throw new BadRequestException({ detail: "مبلغ نامعتبر است" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
      throw new BadRequestException({ detail: "تاریخ باید YYYY-MM-DD باشد" });
    }
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({ detail: "idempotencyKey لازم است" });
    }
    if (body.fundingSourceKind === "petty_cash" && !body.fundingRefId?.trim()) {
      throw new BadRequestException({
        detail: "برای خرج از تنخواه، صندوق را انتخاب کنید",
        code: "FUNDING_REF_REQUIRED",
      });
    }
    if (body.fundingRefId?.trim() && !body.fundingSourceKind) {
      throw new BadRequestException({
        detail: "نوع منبع پرداخت لازم است",
        code: "FUNDING_KIND_REQUIRED",
      });
    }
    try {
      assertAmountMatchesQuantity({
        amountMinor: body.amount.amountMinor,
        quantity: body.quantity,
        unitPriceMinor: body.unitPriceMinor,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AMOUNT_MISMATCH") {
        throw new BadRequestException({
          detail: "amountMinor must equal round(quantity × unitPriceMinor)",
          code: "AMOUNT_MISMATCH",
          title: "AMOUNT_MISMATCH",
        });
      }
      throw error;
    }
  }

  buildDraft(
    actor: AuthActor,
    workspaceId: string,
    body: CreateDailyLedgerEntryRequest,
    allMemberIds: string[],
    memberId: string | null,
  ): CreateExpenseDraftRequest {
    const catalogFields = {
      catalogItemId: body.catalogItemId?.trim() || undefined,
      unitCode: body.unitCode?.trim() || undefined,
      quantity: body.quantity,
      unitPriceMinor: body.unitPriceMinor,
    };
    const funding =
      body.fundingSourceKind === "petty_cash" && body.fundingRefId?.trim()
        ? {
            fundingSourceKind: "petty_cash" as const,
            fundingRefId: body.fundingRefId.trim(),
          }
        : body.fundingSourceKind === "personal"
          ? { fundingSourceKind: "personal" as const }
          : {};
    if (memberId) {
      if (!allMemberIds.includes(memberId)) {
        throw new BadRequestException({ detail: "عضو انتخاب‌شده در گروه نیست" });
      }
      return {
        workspaceId,
        title: body.itemName.trim(),
        total: body.amount,
        paidByUserId: memberId,
        splitMethod: "amount",
        participantUserIds: [memberId],
        splitLines: [{ userId: memberId, amount: body.amount }],
        occurredOn: body.date,
        idempotencyKey: body.idempotencyKey.trim(),
        visibility: "shared",
        source: "daily_ledger",
        ...catalogFields,
        ...funding,
      };
    }
    return {
      workspaceId,
      title: body.itemName.trim(),
      total: body.amount,
      paidByUserId: actor.userId,
      splitMethod: "equal",
      participantUserIds: allMemberIds,
      occurredOn: body.date,
      idempotencyKey: body.idempotencyKey.trim(),
      visibility: "shared",
      source: "daily_ledger",
      ...catalogFields,
      ...funding,
    };
  }

  /** POST /ledger/day — shared + personal lines in one request (S11-07). */
  async postDay(
    actor: AuthActor,
    workspaceId: string,
    body: PostLedgerDayRequest,
  ): Promise<DailyLedgerResponse> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    if (!body.lines?.length) {
      throw new BadRequestException({ detail: "حداقل یک قلم لازم است" });
    }
    await this.assertDayOpen(workspaceId, actor.userId, body.date);

    const cache: MembersCache = new Map();
    const members = await this.loadMembers(workspaceId, actor.userId, cache);
    const memberIds = members.map((m) => m.userId);
    const batchKey = body.idempotencyKey.trim();

    for (let i = 0; i < body.lines.length; i += 1) {
      const line = body.lines[i]!;
      const entry: CreateDailyLedgerEntryRequest = {
        date: body.date,
        itemName: line.itemName,
        amount: line.amount,
        memberUserId: line.memberUserId,
        idempotencyKey: `${batchKey}:${i}`,
        catalogItemId: line.catalogItemId,
        unitCode: line.unitCode,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        fundingSourceKind: line.fundingSourceKind,
        fundingRefId: line.fundingRefId,
      };
      this.validateEntryBody(entry);
      const memberId = line.memberUserId?.trim() || null;
      const draft = this.buildDraft(actor, workspaceId, entry, memberIds, memberId);
      const created = await this.expenseService.createDraft(actor, workspaceId, draft);
      await this.expenseService.post(actor, workspaceId, created.id);
    }

    return this.buildLedger(actor, workspaceId, body.date, body.date, cache);
  }

  /**
   * GET /ledger/day/:date/template — frequent usage + yesterday selections.
   * Empty arrays when none; never invents fake items.
   */
  async getDayTemplate(
    actor: AuthActor,
    workspaceId: string,
    date: string,
  ): Promise<DailyLedgerDayTemplateResponse> {
    await this.requireMember(workspaceId, actor.userId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({ detail: "تاریخ باید YYYY-MM-DD باشد" });
    }

    const [frequentItems, pins, yesterdayLedger] = await Promise.all([
      this.catalog.listFrequent(actor, workspaceId, 20).catch(() => []),
      this.catalog.listPins(actor, workspaceId).catch(() => []),
      this.buildLedger(actor, workspaceId, shiftIsoDate(date, -1), shiftIsoDate(date, -1)),
    ]);

    const yesterdayLines: DailyLedgerDayTemplateResponse["yesterdayLines"] = [];
    const yesterday = yesterdayLedger.days[0];
    if (yesterday) {
      for (const item of yesterday.shared.items) {
        yesterdayLines.push({
          itemName: item.title,
          amount: item.amount,
          memberUserId: null,
          catalogItemId: item.catalogItemId,
          unitCode: item.unitCode,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
        });
      }
      for (const member of yesterdayLedger.members) {
        const cell = yesterday.members[member.userId];
        if (!cell) continue;
        for (const item of cell.items) {
          yesterdayLines.push({
            itemName: item.title,
            amount: item.amount,
            memberUserId: member.userId,
            catalogItemId: item.catalogItemId,
            unitCode: item.unitCode,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
          });
        }
      }
    }

    return {
      date,
      frequentItems,
      pins,
      yesterdayLines,
    };
  }

  async assertDayOpen(
    workspaceId: string,
    actorUserId: string,
    date: string,
  ): Promise<void> {
    await this.assertNotRangeLocked(workspaceId, actorUserId, date);
    const meta = await this.days.listDays(workspaceId, actorUserId, date, date);
    if (meta[0]?.isHoliday) {
      throw new BadRequestException({
        detail: "این روز تعطیل است؛ برای ثبت قلم ابتدا تعطیلی را بردارید",
      });
    }
  }

  async assertNotRangeLocked(
    workspaceId: string,
    actorUserId: string,
    date: string,
  ): Promise<void> {
    const locks = await this.locks.list(workspaceId, actorUserId, { activeOnly: true });
    if (locks.some((l) => date >= l.from && date <= l.to)) {
      throw new BadRequestException({
        detail: "این روز در بازهٔ قفل‌شده است؛ ابتدا قفل را باز کنید",
      });
    }
  }

  async reverseExpensesOnDate(
    actor: AuthActor,
    workspaceId: string,
    date: string,
  ): Promise<string[]> {
    const listed = await this.listVisibleExpenses(workspaceId, actor.userId);
    const targets = listed.filter(
      (e) =>
        e.occurredOn === date &&
        e.status !== "reversed" &&
        e.source === "daily_ledger",
    );
    const ids: string[] = [];
    for (const expense of targets) {
      await this.expenseService.reverse(actor, workspaceId, expense.id);
      ids.push(expense.id);
    }
    return ids;
  }

  async restoreReversedExpenses(
    actor: AuthActor,
    workspaceId: string,
    expenseIds: readonly string[],
  ): Promise<{ restored: number; failed: number }> {
    if (!expenseIds.length) return { restored: 0, failed: 0 };
    const listed = await this.listVisibleExpenses(workspaceId, actor.userId);
    const byId = new Map(listed.map((e) => [e.id, e]));
    let restored = 0;
    let failed = 0;
    for (const id of expenseIds) {
      const old = byId.get(id);
      if (!old || old.status !== "reversed" || old.source !== "daily_ledger") {
        failed += 1;
        continue;
      }
      const useSplitLines =
        old.splitMethod === "amount" ||
        old.splitMethod === "percent" ||
        old.splitMethod === "shares";
      const draft: CreateExpenseDraftRequest = {
        workspaceId,
        title: old.title,
        total: old.total,
        paidByUserId: old.paidByUserId,
        splitMethod: old.splitMethod === "itemized" ? "equal" : old.splitMethod,
        participantUserIds: [...old.participantUserIds],
        splitLines: useSplitLines
          ? old.splits.map((s) => ({
              userId: s.userId,
              amount: s.amount,
              percent: s.percent,
              shares: s.shares,
            }))
          : undefined,
        occurredOn: old.occurredOn,
        idempotencyKey: `holiday-restore:${old.id}:${crypto.randomUUID()}`,
        visibility: old.visibility,
        source: "daily_ledger",
      };
      try {
        const created = await this.expenseService.createDraft(actor, workspaceId, draft);
        await this.expenseService.post(actor, workspaceId, created.id);
        restored += 1;
      } catch {
        failed += 1;
      }
    }
    return { restored, failed };
  }

  async buildLedger(
    actor: AuthActor,
    workspaceId: string,
    from: string,
    to: string,
    cache: MembersCache = new Map(),
  ): Promise<DailyLedgerResponse> {
    const members = await this.loadMembers(workspaceId, actor.userId, cache);
    const me = members.find((m) => m.userId === actor.userId);
    const canManageLocks = Boolean(me && LOCK_ROLES.has(me.role));
    const [expenses, dayMeta, rangeLocks, fundDeposits] = await Promise.all([
      this.listVisibleExpenses(workspaceId, actor.userId),
      this.days.listDays(workspaceId, actor.userId, from, to),
      this.locks.list(workspaceId, actor.userId, { activeOnly: true }),
      this.listFundDeposits(actor, workspaceId, from, to),
    ]);
    const matrix = buildDailyLedgerMatrix({
      workspaceId,
      from,
      to,
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
      })),
      expenses: expenses.filter((e) => e.source === "daily_ledger"),
      dayMeta: dayMeta.map((d) => ({
        date: d.date,
        isHoliday: d.isHoliday,
        note: d.note,
      })),
      rangeLocks,
      canManageLocks,
      expensePersistence: this.expenses.persistence,
      dayMetaPersistence: this.days.persistence,
      fundDeposits,
    });

    const relatedByDate = new Map<string, typeof matrix.days[0]["relatedExpenses"]>();
    for (const expense of expenses) {
      if (expense.status === "reversed") continue;
      if (expense.source === "daily_ledger") continue;
      if (expense.occurredOn < from || expense.occurredOn > to) continue;
      const list = relatedByDate.get(expense.occurredOn) ?? [];
      list.push({
        id: expense.id,
        title: expense.title,
        amount: expense.total,
        status: expense.status,
        visibility: expense.visibility,
      });
      relatedByDate.set(expense.occurredOn, list);
    }
    const days = matrix.days.map((day) => {
      const related = relatedByDate.get(day.date);
      if (!related || related.length === 0) return day;
      return { ...day, relatedExpenses: related };
    });

    return { ...matrix, days, rangeLocks, canManageLocks };
  }

  /**
   * Record member cash-in to petty cash for a day.
   * Default `balance`: fund ↑ + shared expense so depositor net improves.
   * Optional `gift`: fund ↑ only (no member balance change).
   */
  async createDeposit(
    actor: AuthActor,
    workspaceId: string,
    body: CreateDailyLedgerDepositRequest,
  ): Promise<CreateDailyLedgerDepositResponse> {
    if (!this.payments) {
      throw new BadRequestException({
        detail: "سرویس تنخواه در این فرآیند در دسترس نیست",
        code: "PETTY_CASH_UNAVAILABLE",
      });
    }
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    await this.assertDayOpen(workspaceId, actor.userId, body.date);

    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(workspace?.template);
    if (!pettyCashAllowedForKind(kind)) {
      throw new BadRequestException({
        detail: "فضای شخصی تنخواه مشترک ندارد",
        code: "PETTY_CASH_PERSONAL_FORBIDDEN",
      });
    }

    const cashInBy = body.cashInByUserId?.trim() || actor.userId;
    const occurredAt = `${body.date}T12:00:00.000Z`;
    const mode = body.mode === "gift" ? "gift" : "balance";
    const note =
      body.note?.trim() ||
      (mode === "gift"
        ? `هدیه به صندوق — ${body.date}`
        : `واریز دفتر روزانه — ${body.date}`);

    if (mode === "gift") {
      const gifted = await this.payments.giftPettyCash(actor, workspaceId, body.fundId, {
        amountMinor: body.amountMinor,
        cashInByUserId: cashInBy,
        note: `${note} (cashInBy:${cashInBy} ledgerDate:${body.date})`,
        occurredAt,
        idempotencyKey: body.idempotencyKey,
      });

      const deposit: DailyLedgerFundDeposit = {
        movementId: gifted.movement.id,
        fundId: gifted.fund.id,
        fundName: gifted.fund.name,
        kind: "gift",
        amountMinor: gifted.movement.amountMinor,
        actorUserId: gifted.movement.actorUserId,
        cashInByUserId: cashInBy,
        occurredOn: body.date,
        occurredAt: gifted.movement.occurredAt,
        note: gifted.movement.note,
      };

      return {
        workspaceId,
        deposit,
        balanceMinor: gifted.balanceMinor,
      };
    }

    const credited = await this.payments.depositPettyCashMemberCredit(
      actor,
      workspaceId,
      body.fundId,
      {
        amountMinor: body.amountMinor,
        cashInByUserId: cashInBy,
        note: `${note} (cashInBy:${cashInBy} ledgerDate:${body.date})`,
        occurredOn: body.date,
        occurredAt,
        idempotencyKey: body.idempotencyKey,
      },
    );

    const deposit: DailyLedgerFundDeposit = {
      movementId: credited.movement.id,
      fundId: credited.fund.id,
      fundName: credited.fund.name,
      kind: "topup",
      amountMinor: credited.movement.amountMinor,
      actorUserId: credited.movement.actorUserId,
      cashInByUserId: cashInBy,
      occurredOn: body.date,
      occurredAt: credited.movement.occurredAt,
      note: credited.movement.note,
    };

    return {
      workspaceId,
      deposit,
      balanceMinor: credited.balanceMinor,
    };
  }

  private async listFundDeposits(
    actor: AuthActor,
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<DailyLedgerFundDeposit[]> {
    if (!this.payments) return [];
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(workspace?.template);
    if (!pettyCashAllowedForKind(kind)) return [];

    let funds: Awaited<ReturnType<WorkspacePaymentsService["listPettyCash"]>>;
    try {
      funds = await this.payments.listPettyCash(actor, workspaceId);
    } catch {
      return [];
    }

    const out: DailyLedgerFundDeposit[] = [];
    for (const fund of funds) {
      let ledger: Awaited<ReturnType<WorkspacePaymentsService["getPettyCashLedger"]>>;
      try {
        ledger = await this.payments.getPettyCashLedger(actor, workspaceId, fund.id);
      } catch {
        continue;
      }
      for (const row of ledger.rows) {
        if (row.kind !== "gift" && row.kind !== "topup" && row.kind !== "return") {
          continue;
        }
        const noteMeta = parsePettyCashNoteMeta(row.note);
        const occurredOn =
          noteMeta.ledgerDate ||
          row.occurredAt.slice(0, 10);
        if (occurredOn < from || occurredOn > to) continue;
        out.push({
          movementId: row.id,
          fundId: fund.id,
          fundName: fund.name,
          kind: row.kind,
          amountMinor: row.amountMinor,
          actorUserId: row.actorUserId,
          cashInByUserId:
            row.cashInByUserId ?? noteMeta.cashInByUserId ?? row.actorUserId,
          occurredOn,
          occurredAt: row.occurredAt,
          note: row.note,
          expenseId: row.expenseId,
        });
      }
    }
    out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return out;
  }

  resolveRange(
    presetQ?: string,
    fromQ?: string,
    toQ?: string,
    daysQ?: string,
  ): { from: string; to: string } {
    const preset = (presetQ?.trim() || "custom") as DailyLedgerRangePreset;
    if (fromQ && toQ) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromQ) || !/^\d{4}-\d{2}-\d{2}$/.test(toQ) || fromQ > toQ) {
        throw new BadRequestException({ detail: "بازه تاریخ نامعتبر است" });
      }
      return { from: fromQ, to: toQ };
    }
    const days = daysQ ? Number(daysQ) : undefined;
    try {
      return resolveDailyLedgerRange(preset, new Date(), {
        from: fromQ ?? "",
        to: toQ ?? "",
        days: Number.isFinite(days) ? days : undefined,
      });
    } catch {
      throw new BadRequestException({ detail: "preset یا بازه نامعتبر است" });
    }
  }

  async requireMember(workspaceId: string, userId: string): Promise<void> {
    await this.access.requireMember(workspaceId, userId);
  }

  private async listVisibleExpenses(workspaceId: string, userId: string) {
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      userId,
    );
    return this.expenses.listForWorkspace(workspaceId, userId, { viewAllPrivate });
  }

  async requireLockManager(workspaceId: string, userId: string): Promise<void> {
    const members = await this.loadMembers(workspaceId, userId, new Map());
    const me = members.find((m) => m.userId === userId);
    if (!me || !LOCK_ROLES.has(me.role)) {
      throw new ForbiddenException({
        detail: "فقط owner/admin/finance می‌توانند بازه را قفل یا باز کنند",
      });
    }
  }
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}
