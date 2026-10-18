"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CategoryBudgetUsage,
  ProductFeatureFlags,
  ReimbursementSummary,
  WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import { Amount, Button, MoneyInput, SelectField, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import type { DisplayUnit } from "@dang/contracts";
import { displayUnitLabel } from "@dang/contracts";
import { displayInputToIrrMinor, irrMinorToDisplayInput } from "@/lib/irr-money";
import { useDisplayUnit } from "@/lib/display-unit";
import { normalizeYearMonthInput } from "@/lib/fa-datetime";

function amountToMinorString(raw: string, unit: DisplayUnit): string | null {
  const money = displayInputToIrrMinor(raw, unit);
  return money?.amountMinor ?? null;
}

function minorToAmountField(
  minor: string | null | undefined,
  unit: DisplayUnit,
): string {
  if (minor == null || minor === "") return "";
  return irrMinorToDisplayInput(minor, unit);
}

export function WaveFFinancePanel({
  workspaceId,
  flags,
  readOnly = false,
  onError,
  onChanged,
}: {
  workspaceId: string;
  flags: ProductFeatureFlags;
  /** Auditor/guest — lists only. */
  readOnly?: boolean;
  onError: (message: string | null) => void;
  onChanged: () => void;
}) {
  const unit = useDisplayUnit();
  const unitLabel = displayUnitLabel(unit);
  const [claims, setClaims] = useState<ReimbursementSummary[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetUsage[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [policy, setPolicy] = useState<WorkspaceExpensePolicySummary | null>(null);
  const [csv, setCsv] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetMonth, setBudgetMonth] = useState(
    () => new Date().toISOString().slice(0, 7),
  );
  const [budgetAmount, setBudgetAmount] = useState("");
  const [approvalAmount, setApprovalAmount] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptCategoryIds, setReceiptCategoryIds] = useState<string[]>([]);
  const [requireCostCenter, setRequireCostCenter] = useState(false);
  const [perDiemAmount, setPerDiemAmount] = useState("");
  const [tiersJson, setTiersJson] = useState("");
  const [pending, startTransition] = useTransition();
  const claimIds = useMemo(() => claims.map((c) => c.id), [claims]);
  const claimSelection = useRowSelection(claimIds);
  const barClaim =
    claimSelection.selectedCount === 1
      ? (claims.find((c) => c.id === claimSelection.selectedIds[0]) ?? null)
      : null;

  function reload() {
    return Promise.all([
      flags.reimbursement
        ? api.listReimbursements(workspaceId)
        : Promise.resolve([] as ReimbursementSummary[]),
      flags.categoryBudget
        ? api.listCategoryBudgetUsage(workspaceId)
        : Promise.resolve([] as CategoryBudgetUsage[]),
      flags.categoryBudget || flags.expensePolicy
        ? api.listCategories(workspaceId).catch(() => [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      flags.expensePolicy
        ? api.getExpensePolicy(workspaceId)
        : Promise.resolve(null),
    ]).then(([r, b, cats, pol]) => {
      setClaims(r);
      setBudgets(b);
      setCategories(cats);
      if (cats[0] && !budgetCategoryId) setBudgetCategoryId(cats[0].id);
      setPolicy(pol);
      if (pol) {
        setApprovalAmount(minorToAmountField(pol.approvalThresholdMinor, unit));
        setReceiptAmount(minorToAmountField(pol.requireReceiptAboveMinor, unit));
        setReceiptCategoryIds(pol.requireReceiptCategoryIds ?? []);
        setRequireCostCenter(Boolean(pol.requireCostCenter));
        setPerDiemAmount(minorToAmountField(pol.perDiemDailyMinor ?? null, unit));
        setTiersJson(
          pol.approvalTiers && pol.approvalTiers.length > 0
            ? JSON.stringify(pol.approvalTiers, null, 2)
            : "",
        );
      }
    });
  }

  useEffect(() => {
    void reload().catch((e: unknown) =>
      onError(friendlyErrorMessage(e, "بارگذاری مالی Wave F ناموفق")),
    );
  }, [workspaceId, unit, flags.reimbursement, flags.categoryBudget, flags.expensePolicy]);

  function run(action: () => Promise<unknown>, ok?: string) {
    startTransition(() => {
      void action()
        .then(async () => {
          if (ok) onError(null);
          await reload();
          onChanged();
        })
        .catch((e: unknown) => onError(friendlyErrorMessage(e, "عملیات ناموفق")));
    });
  }

  function createClaim() {
    const amountMinor = amountToMinorString(claimAmount, unit);
    if (!claimTitle.trim() || !amountMinor) {
      onError("عنوان و مبلغ درخواست را کامل کنید");
      return;
    }
    run(async () => {
      await api.createReimbursement(workspaceId, {
        title: claimTitle.trim(),
        amountMinor,
        idempotencyKey: newClientId(),
      });
      setClaimTitle("");
      setClaimAmount("");
    });
  }

  function createBudget() {
    const limitMinor = amountToMinorString(budgetAmount, unit);
    if (!budgetCategoryId || !/^\d{4}-\d{2}$/.test(budgetMonth) || !limitMinor) {
      onError("دسته، ماه بودجه (مثلاً ۲۰۲۶/۱۰) و سقف را کامل کنید");
      return;
    }
    run(async () => {
      await api.createCategoryBudget(workspaceId, {
        categoryId: budgetCategoryId,
        yearMonth: budgetMonth,
        limitMinor,
        alertPct: 80,
        idempotencyKey: newClientId(),
      });
      setBudgetAmount("");
    });
  }

  function savePolicy() {
    const approval =
      approvalAmount.trim() === "" ? null : amountToMinorString(approvalAmount, unit);
    const receipt =
      receiptAmount.trim() === "" ? null : amountToMinorString(receiptAmount, unit);
    const perDiem =
      perDiemAmount.trim() === "" ? null : amountToMinorString(perDiemAmount, unit);
    if (approvalAmount.trim() && !approval) {
      onError("آستانه تأیید نامعتبر است");
      return;
    }
    if (receiptAmount.trim() && !receipt) {
      onError("آستانه رسید نامعتبر است");
      return;
    }
    if (perDiemAmount.trim() && !perDiem) {
      onError("سقف روزانه مأموریت نامعتبر است");
      return;
    }
    let approvalTiers: WorkspaceExpensePolicySummary["approvalTiers"] = null;
    if (tiersJson.trim()) {
      try {
        const parsed = JSON.parse(tiersJson) as unknown;
        if (!Array.isArray(parsed)) {
          onError("قالب پله‌های تأیید باید فهرست باشد");
          return;
        }
        approvalTiers = parsed as NonNullable<
          WorkspaceExpensePolicySummary["approvalTiers"]
        >;
      } catch {
        onError("قالب پله‌های تأیید نامعتبر است");
        return;
      }
    }
    run(async () => {
      await api.putExpensePolicy(workspaceId, {
        approvalThresholdMinor: approval,
        requireReceiptAboveMinor: receipt,
        requireReceiptCategoryIds: receiptCategoryIds,
        requireCostCenter,
        perDiemDailyMinor: perDiem,
        approvalTiers,
      });
    });
  }

  function importCsv() {
    if (!csv.trim()) return;
    run(async () => {
      await api.importExpensesCsv(workspaceId, {
        csvText: csv,
        idempotencyKey: newClientId(),
      });
      setCsv("");
    });
  }

  const statusFa: Record<ReimbursementSummary["status"], string> = {
    draft: "پیش‌نویس",
    submitted: "ارسال‌شده",
    approved: "تأیید",
    rejected: "رد",
    paid: "پرداخت‌شده",
    cancelled: "لغو",
  };

  return (
    <>
      {flags.reimbursement ? (
        <SectionCard title="درخواست‌های بازپرداخت" badge={claims.length}>
          {readOnly ? (
            <EmptyHint>نقش شما فقط مشاهده دارد — ثبت/تأیید بازپرداخت فعال نیست.</EmptyHint>
          ) : (
            <FormStack>
              <TextField
                label="عنوان"
                value={claimTitle}
                onChange={(e) => setClaimTitle(e.target.value)}
              />
              <MoneyInput
                id="wave-f-claim-amount"
                label="مبلغ"
                value={claimAmount}
                onValueChange={setClaimAmount}
              />
              <Button type="button" disabled={pending} onClick={createClaim}>
                ثبت پیش‌نویس
              </Button>
            </FormStack>
          )}
          {claims.length ? (
            <>
              {!readOnly ? (
                <SelectionActionBar
                  selectedCount={claimSelection.selectedCount}
                  idleHint="روی ردیف کلیک کنید یا مربع کنار درخواست را تیک بزنید"
                  onClear={claimSelection.clear}
                >
                  {barClaim?.status === "draft" ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          run(() => api.submitReimbursement(workspaceId, barClaim.id));
                          claimSelection.clear();
                        }}
                      >
                        ارسال
                      </button>
                      <button
                        type="button"
                        className={selStyles.danger}
                        disabled={pending}
                        onClick={() => {
                          run(() => api.cancelReimbursement(workspaceId, barClaim.id));
                          claimSelection.clear();
                        }}
                      >
                        لغو
                      </button>
                    </>
                  ) : null}
                  {barClaim?.status === "submitted" ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          run(() => api.approveReimbursement(workspaceId, barClaim.id));
                          claimSelection.clear();
                        }}
                      >
                        تأیید
                      </button>
                      <button
                        type="button"
                        className={selStyles.danger}
                        disabled={pending}
                        onClick={() => {
                          run(() => api.rejectReimbursement(workspaceId, barClaim.id));
                          claimSelection.clear();
                        }}
                      >
                        رد
                      </button>
                    </>
                  ) : null}
                  {barClaim?.status === "approved" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        run(() => api.markReimbursementPaid(workspaceId, barClaim.id));
                        claimSelection.clear();
                      }}
                    >
                      پرداخت شد
                    </button>
                  ) : null}
                </SelectionActionBar>
              ) : null}
              <DataList>
                {claims.map((c) => (
                  <div
                    key={c.id}
                    className={!readOnly ? selStyles.selectableRow : undefined}
                    {...(!readOnly
                      ? rowSelectActivateProps({
                          onActivate: () => {
                            if (claimSelection.isSelected(c.id)) claimSelection.clear();
                            else claimSelection.selectOnly(c.id);
                          },
                        })
                      : {})}
                  >
                    <DataRow
                      title={
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {!readOnly ? (
                            <RowSelectCheckbox
                              checked={claimSelection.isSelected(c.id)}
                              onChange={() => {
                                if (claimSelection.isSelected(c.id)) claimSelection.clear();
                                else claimSelection.selectOnly(c.id);
                              }}
                              label={`انتخاب ${c.title}`}
                            />
                          ) : null}
                          {c.title}
                        </span>
                      }
                      meta={statusFa[c.status]}
                      trailing={<Amount irrMinor={c.amount.amountMinor} />}
                    />
                  </div>
                ))}
              </DataList>
            </>
          ) : (
            <EmptyHint>درخواستی ثبت نشده است.</EmptyHint>
          )}
        </SectionCard>
      ) : null}

      {flags.categoryBudget ? (
        <SectionCard title="بودجه دسته‌ها" badge={budgets.length}>
          {readOnly ? null : (
            <FormStack>
              <SelectField
                label="دسته"
                value={budgetCategoryId}
                onChange={(e) => setBudgetCategoryId(e.target.value)}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="ماه بودجه"
                value={budgetMonth}
                onChange={(e) => setBudgetMonth(normalizeYearMonthInput(e.target.value))}
                hint="مثلاً ۲۰۲۶/۱۰ (سال و ماه میلادی)"
              />
              <MoneyInput
                id="wave-f-budget-limit"
                label="سقف"
                value={budgetAmount}
                onValueChange={setBudgetAmount}
              />
              <Button
                type="button"
                disabled={pending || categories.length === 0}
                onClick={createBudget}
              >
                ثبت بودجه
              </Button>
            </FormStack>
          )}
          {budgets.length ? (
            <DataList>
              {budgets.map((b) => (
                <DataRow
                  key={b.id}
                  title={`${b.yearMonth} · ${b.categoryId.slice(0, 8)}`}
                  meta={<><Amount irrMinor={b.spent.amountMinor} /> از <Amount irrMinor={b.limit.amountMinor} /></>}
                  trailing={b.alertReached ? "هشدار" : ""}
                />
              ))}
            </DataList>
          ) : (
            <EmptyHint>بودجه دسته‌ای ثبت نشده است.</EmptyHint>
          )}
        </SectionCard>
      ) : null}

      {flags.expensePolicy ? (
        <SectionCard title="سیاست خرج سازمانی">
          <StatusLine>
            مبلغ آستانه‌ها به {unitLabel} وارد می‌شود؛ خالی = بدون اجبار.
          </StatusLine>
          {readOnly ? (
            <StatusLine>
              آستانه تأیید: {approvalAmount ? `${approvalAmount} ${unitLabel}` : "تعیین نشده"} ·
              رسید اجباری بالای:{" "}
              {receiptAmount ? `${receiptAmount} ${unitLabel}` : "تعیین نشده"}
              {requireCostCenter ? " · مرکز هزینه اجباری" : ""}
              {perDiemAmount ? ` · سقف روزانه ${perDiemAmount} ${unitLabel}` : ""}
              {receiptCategoryIds.length
                ? ` · ${receiptCategoryIds.length} دسته با رسید اجباری`
                : ""}
            </StatusLine>
          ) : (
            <FormStack>
              <MoneyInput
                id="wave-f-approval-threshold"
                label="آستانه تأیید"
                value={approvalAmount}
                onValueChange={setApprovalAmount}
              />
              <MoneyInput
                id="wave-f-receipt-threshold"
                label="رسید اجباری بالای"
                value={receiptAmount}
                onValueChange={setReceiptAmount}
              />
              <MoneyInput
                id="wave-f-per-diem"
                label="سقف روزانه مأموریت"
                value={perDiemAmount}
                onValueChange={setPerDiemAmount}
                hint="خالی = بدون سقف روزانه؛ تجاوز → صف تأیید"
              />
              <label className="field">
                <input
                  type="checkbox"
                  checked={requireCostCenter}
                  disabled={pending}
                  onChange={(e) => setRequireCostCenter(e.target.checked)}
                />{" "}
                مرکز هزینه اجباری روی ثبت خرج
              </label>
              <label>
                پله‌های تأیید (متن ساختاریافتهٔ اختیاری — خالی = پیش‌فرض سامانه)
                <textarea
                  value={tiersJson}
                  onChange={(e) => setTiersJson(e.target.value)}
                  rows={5}
                  dir="ltr"
                  placeholder='[{"minAmountMinor":"0","requiredApprovals":1},{"minAmountMinor":"10000000","requiredApprovals":2}]'
                />
              </label>
              {categories.length > 0 ? (
                <fieldset className="field">
                  <legend>دسته‌های با رسید اجباری</legend>
                  <div className="formStack">
                    {categories.map((cat) => {
                      const checked = receiptCategoryIds.includes(cat.id);
                      return (
                        <label key={cat.id} className="field">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={pending}
                            onChange={() => {
                              setReceiptCategoryIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== cat.id)
                                  : [...prev, cat.id],
                              );
                            }}
                          />{" "}
                          {cat.name}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <StatusLine>
                  برای اجبار رسید بر اساس دسته، ابتدا دستهٔ خرج بسازید.
                </StatusLine>
              )}
              <Button type="button" disabled={pending} onClick={savePolicy}>
                ذخیره سیاست
              </Button>
              {policy?.updatedAt ? (
                <StatusLine>آخرین به‌روزرسانی: {policy.updatedAt}</StatusLine>
              ) : null}
            </FormStack>
          )}
        </SectionCard>
      ) : null}

      {flags.expenseImport && !readOnly ? (
        <SectionCard title="ورود CSV هزینه">
          <FormStack>
            <label>
              CSV با ستون‌های title,amount_toman,occurred_on,visibility
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={5}
              />
            </label>
            <Button
              type="button"
              disabled={pending || !csv.trim()}
              onClick={importCsv}
            >
              ایجاد پیش‌نویس‌ها
            </Button>
          </FormStack>
        </SectionCard>
      ) : null}
    </>
  );
}
