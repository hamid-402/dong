"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  CategoryBudgetUsage,
  ProductFeatureFlags,
  ReimbursementSummary,
  WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import { tomanInputToIrrMinor } from "@/lib/irr-money";

function tomanToMinorString(toman: string): string | null {
  const money = tomanInputToIrrMinor(toman);
  return money?.amountMinor ?? null;
}

function minorToTomanField(minor: string | null | undefined): string {
  if (minor == null || minor === "") return "";
  const n = Number(minor);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n / 10));
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
  const [claims, setClaims] = useState<ReimbursementSummary[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetUsage[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [policy, setPolicy] = useState<WorkspaceExpensePolicySummary | null>(null);
  const [csv, setCsv] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [claimToman, setClaimToman] = useState("");
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetMonth, setBudgetMonth] = useState(
    () => new Date().toISOString().slice(0, 7),
  );
  const [budgetToman, setBudgetToman] = useState("");
  const [approvalToman, setApprovalToman] = useState("");
  const [receiptToman, setReceiptToman] = useState("");
  const [pending, startTransition] = useTransition();

  function reload() {
    return Promise.all([
      flags.reimbursement
        ? api.listReimbursements(workspaceId)
        : Promise.resolve([] as ReimbursementSummary[]),
      flags.categoryBudget
        ? api.listCategoryBudgetUsage(workspaceId)
        : Promise.resolve([] as CategoryBudgetUsage[]),
      flags.categoryBudget
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
        setApprovalToman(minorToTomanField(pol.approvalThresholdMinor));
        setReceiptToman(minorToTomanField(pol.requireReceiptAboveMinor));
      }
    });
  }

  useEffect(() => {
    void reload().catch((e: unknown) =>
      onError(friendlyErrorMessage(e, "بارگذاری مالی Wave F ناموفق")),
    );
  }, [workspaceId, flags.reimbursement, flags.categoryBudget, flags.expensePolicy]);

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
    const amountMinor = tomanToMinorString(claimToman);
    if (!claimTitle.trim() || !amountMinor) {
      onError("عنوان و مبلغ تومان درخواست را کامل کنید");
      return;
    }
    run(async () => {
      await api.createReimbursement(workspaceId, {
        title: claimTitle.trim(),
        amountMinor,
        idempotencyKey: newClientId(),
      });
      setClaimTitle("");
      setClaimToman("");
    });
  }

  function createBudget() {
    const limitMinor = tomanToMinorString(budgetToman);
    if (!budgetCategoryId || !/^\d{4}-\d{2}$/.test(budgetMonth) || !limitMinor) {
      onError("دسته، ماه YYYY-MM و سقف تومان را کامل کنید");
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
      setBudgetToman("");
    });
  }

  function savePolicy() {
    const approval =
      approvalToman.trim() === "" ? null : tomanToMinorString(approvalToman);
    const receipt =
      receiptToman.trim() === "" ? null : tomanToMinorString(receiptToman);
    if (approvalToman.trim() && !approval) {
      onError("آستانه تأیید نامعتبر است");
      return;
    }
    if (receiptToman.trim() && !receipt) {
      onError("آستانه رسید نامعتبر است");
      return;
    }
    run(async () => {
      await api.putExpensePolicy(workspaceId, {
        approvalThresholdMinor: approval,
        requireReceiptAboveMinor: receipt,
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
              <TextField
                label="مبلغ (تومان)"
                value={claimToman}
                onChange={(e) => setClaimToman(e.target.value)}
              />
              <Button type="button" disabled={pending} onClick={createClaim}>
                ثبت پیش‌نویس
              </Button>
            </FormStack>
          )}
          {claims.length ? (
            <DataList>
              {claims.map((c) => (
                <DataRow
                  key={c.id}
                  title={c.title}
                  meta={statusFa[c.status]}
                  trailing={c.amount.amountMinor}
                  actions={
                    readOnly ? null : (
                      <span className="dataRowActions">
                        {c.status === "draft" ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                run(() => api.submitReimbursement(workspaceId, c.id))
                              }
                            >
                              ارسال
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                run(() => api.cancelReimbursement(workspaceId, c.id))
                              }
                            >
                              لغو
                            </Button>
                          </>
                        ) : null}
                        {c.status === "submitted" ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                run(() => api.approveReimbursement(workspaceId, c.id))
                              }
                            >
                              تأیید
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                run(() => api.rejectReimbursement(workspaceId, c.id))
                              }
                            >
                              رد
                            </Button>
                          </>
                        ) : null}
                        {c.status === "approved" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              run(() => api.markReimbursementPaid(workspaceId, c.id))
                            }
                          >
                            پرداخت شد
                          </Button>
                        ) : null}
                      </span>
                    )
                  }
                />
              ))}
            </DataList>
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
                label="ماه (YYYY-MM)"
                value={budgetMonth}
                onChange={(e) => setBudgetMonth(e.target.value)}
              />
              <TextField
                label="سقف (تومان)"
                value={budgetToman}
                onChange={(e) => setBudgetToman(e.target.value)}
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
                  meta={`${b.spent.amountMinor} / ${b.limit.amountMinor}`}
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
            آستانه‌ها به ریال جزئی ذخیره می‌شوند؛ خالی = بدون اجبار.
          </StatusLine>
          {readOnly ? (
            <StatusLine>
              آستانه تأیید: {approvalToman || "—"} تومان · رسید اجباری بالای:{" "}
              {receiptToman || "—"} تومان
            </StatusLine>
          ) : (
            <FormStack>
              <TextField
                label="آستانه تأیید (تومان)"
                value={approvalToman}
                onChange={(e) => setApprovalToman(e.target.value)}
              />
              <TextField
                label="رسید اجباری بالای (تومان)"
                value={receiptToman}
                onChange={(e) => setReceiptToman(e.target.value)}
              />
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
