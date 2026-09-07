import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildDailyLedgerCsv,
  buildDailyLedgerMatrix,
  moneySchema,
  parseDailyLedgerImportCsv,
  resolveDailyLedgerRange,
  type AuthActor,
  type CreateDailyLedgerEntryRequest,
  type CreateExpenseDraftRequest,
  type CreateWorkspaceRangeLockRequest,
  type DailyLedgerRangePreset,
  type DailyLedgerResponse,
  type UpdateDailyLedgerEntryRequest,
  type UpsertWorkspaceDayRequest,
  type UpsertWorkspaceDayResponse,
  type WorkspaceRangeLockSummary,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
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

const LOCK_ROLES = new Set(["owner", "admin", "finance"]);

@Injectable()
export class DailyLedgerService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(WORKSPACE_DAY_STORE) private readonly days: WorkspaceDayStore,
    @Inject(WORKSPACE_RANGE_LOCK_STORE) private readonly locks: WorkspaceRangeLockStore,
    @Inject(ExpensesService) private readonly expenseService: ExpensesService,
  ) {}

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
    return this.buildLedger(actor, workspaceId, range.from, range.to);
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
    const ledger = await this.buildLedger(actor, workspaceId, range.from, range.to);
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
    await this.requireMember(workspaceId, actor.userId);
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
    await this.requireMember(workspaceId, actor.userId);
    this.validateEntryBody(body);
    await this.assertDayOpen(workspaceId, actor.userId, body.date);

    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members?.length) throw new ForbiddenException({ detail: "عضویت پیدا نشد" });

    const memberId = body.memberUserId?.trim() || null;
    const draft = this.buildDraft(actor, workspaceId, body, members.map((m) => m.userId), memberId);
    const created = await this.expenseService.createDraft(actor, workspaceId, draft);
    await this.expenseService.post(actor, workspaceId, created.id);
    return this.buildLedger(actor, workspaceId, body.date, body.date);
  }

  async importCsv(
    actor: AuthActor,
    workspaceId: string,
    body: { csv: string; idempotencyKey?: string },
  ): Promise<{ imported: number; skipped: number; ledger: DailyLedgerResponse }> {
    await this.requireMember(workspaceId, actor.userId);
    if (!body.csv?.trim()) {
      throw new BadRequestException({ detail: "متن CSV لازم است" });
    }
    const rows = parseDailyLedgerImportCsv(body.csv);
    if (rows.length === 0) {
      throw new BadRequestException({ detail: "هیچ ردیف معتبری در CSV نبود" });
    }
    if (rows.length > 500) {
      throw new BadRequestException({ detail: "حداکثر ۵۰۰ ردیف در هر import" });
    }
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members?.length) throw new ForbiddenException({ detail: "عضویت پیدا نشد" });
    const byName = new Map(
      members.map((m) => [m.displayName.trim().toLowerCase(), m.userId]),
    );

    let imported = 0;
    let skipped = 0;
    let minDate = rows[0]!.date;
    let maxDate = rows[0]!.date;
    const batchKey = body.idempotencyKey?.trim() || crypto.randomUUID();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      minDate = row.date < minDate ? row.date : minDate;
      maxDate = row.date > maxDate ? row.date : maxDate;
      try {
        await this.assertDayOpen(workspaceId, actor.userId, row.date);
        const col = row.column.trim().toLowerCase();
        const memberId =
          col === "shared" || col === "هزینه مشترک" || col === "مشترک"
            ? null
            : byName.get(col) ?? null;
        if (memberId === null && !(col === "shared" || col === "هزینه مشترک" || col === "مشترک")) {
          skipped += 1;
          continue;
        }
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

    const ledger = await this.buildLedger(actor, workspaceId, minDate, maxDate);
    return { imported, skipped, ledger };
  }

  async updateEntry(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
    body: UpdateDailyLedgerEntryRequest,
  ): Promise<DailyLedgerResponse> {
    await this.requireMember(workspaceId, actor.userId);
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
    await this.assertDayOpen(workspaceId, actor.userId, current.occurredOn);
    if (nextDate !== current.occurredOn) {
      await this.assertDayOpen(workspaceId, actor.userId, nextDate);
    }

    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members?.length) throw new ForbiddenException({ detail: "عضویت پیدا نشد" });

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
      },
      members.map((m) => m.userId),
      memberId,
    );
    const created = await this.expenseService.createDraft(actor, workspaceId, draft);
    await this.expenseService.post(actor, workspaceId, created.id);
    const from = nextDate < current.occurredOn ? nextDate : current.occurredOn;
    const to = nextDate > current.occurredOn ? nextDate : current.occurredOn;
    return this.buildLedger(actor, workspaceId, from, to);
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
    return this.buildLedger(actor, workspaceId, current.occurredOn, current.occurredOn);
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
  }

  buildDraft(
    actor: AuthActor,
    workspaceId: string,
    body: CreateDailyLedgerEntryRequest,
    allMemberIds: string[],
    memberId: string | null,
  ): CreateExpenseDraftRequest {
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
  ): Promise<DailyLedgerResponse> {
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members) throw new ForbiddenException({ detail: "عضویت پیدا نشد" });
    const me = members.find((m) => m.userId === actor.userId);
    const canManageLocks = Boolean(me && LOCK_ROLES.has(me.role));
    const [expenses, dayMeta, rangeLocks] = await Promise.all([
      this.listVisibleExpenses(workspaceId, actor.userId),
      this.days.listDays(workspaceId, actor.userId, from, to),
      this.locks.list(workspaceId, actor.userId, { activeOnly: true }),
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
    });
    return { ...matrix, rangeLocks, canManageLocks };
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
    const ws = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!ws) {
      throw new ForbiddenException({ detail: "عضویت فضای کاری پیدا نشد" });
    }
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
    const members = await this.iam.listMembers(workspaceId, userId);
    const me = members?.find((m) => m.userId === userId);
    if (!me || !LOCK_ROLES.has(me.role)) {
      throw new ForbiddenException({
        detail: "فقط owner/admin/finance می‌توانند بازه را قفل یا باز کنند",
      });
    }
  }
}
