"use client";

import { newClientId } from "@/lib/id";

import { useEffect, useState, useTransition } from "react";
import type {
  ExpenseCategorySummary,
  RecurringRuleSummary,
  ReportGroupBy,
  WorkspaceReportResponse,
} from "@dang/contracts";
import { resolveDailyLedgerRange } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { JalaliDateField } from "@/components/jalali-date-field";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";

function monthStart(): string {
  return resolveDailyLedgerRange("month").from;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Real report / category / recurring panel — data only from API. */
export function WorkspaceReportsPanel({
  workspaceId,
  defaultVisibility = "private",
  onChanged,
}: {
  workspaceId: string;
  defaultVisibility?: "shared" | "private" | "company";
  onChanged?: () => void;
}) {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso);
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("day");
  const [report, setReport] = useState<WorkspaceReportResponse | null>(null);
  const [categories, setCategories] = useState<ExpenseCategorySummary[]>([]);
  const [recurring, setRecurring] = useState<RecurringRuleSummary[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleToman, setRuleToman] = useState("");
  const [ruleCadence, setRuleCadence] = useState<"weekly" | "monthly" | "yearly">(
    "monthly",
  );
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refreshMeta() {
    const [cats, rules] = await Promise.all([
      api.listCategories(workspaceId),
      api.listRecurringRules(workspaceId),
    ]);
    setCategories(cats);
    setRecurring(rules);
  }

  useEffect(() => {
    void refreshMeta().catch((err: unknown) =>
      setError(friendlyErrorMessage(err, "بارگذاری گزارش")),
    );
  }, [workspaceId]);

  function onLoadReport() {
    startTransition(() => {
      void (async () => {
        try {
          const data = await api.workspaceReport(workspaceId, { from, to, groupBy });
          setReport(data);
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "گزارش ناموفق"));
        }
      })();
    });
  }

  function onExportCsv() {
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createReportExport(workspaceId, {
            from,
            to,
            groupBy,
            format: "csv",
            idempotencyKey: newClientId(),
          });
          if (!created.hasFile) {
            setError("فایل CSV آماده نشد");
            return;
          }
          window.open(api.downloadReportExportUrl(workspaceId, created.id), "_blank");
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خروجی CSV ناموفق"));
        }
      })();
    });
  }

  function onCreateCategory() {
    const name = categoryName.trim();
    if (!name) {
      setError("نام دسته لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.createCategory(workspaceId, { name });
          setCategoryName("");
          await refreshMeta();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت دسته ناموفق"));
        }
      })();
    });
  }

  function onCreateRecurring() {
    const title = ruleTitle.trim();
    const amount = Number(ruleToman.replaceAll(",", ""));
    if (!title || !Number.isFinite(amount) || amount <= 0) {
      setError("عنوان و مبلغ قاعده لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.createRecurringRule(workspaceId, {
            title,
            amount: { amountMinor: String(Math.round(amount) * 10), currency: "IRR" },
            cadence: ruleCadence,
            nextRunOn: todayIso(),
            visibility: defaultVisibility,
            idempotencyKey: newClientId(),
          });
          setRuleTitle("");
          setRuleToman("");
          await refreshMeta();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت قاعده ناموفق"));
        }
      })();
    });
  }

  function onRunDue() {
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.runRecurringDue(workspaceId);
          await refreshMeta();
          onChanged?.();
          setError(null);
          setInfo(
            result.createdExpenseIds.length
              ? `${result.createdExpenseIds.length} خرج از قواعد ساخته شد`
              : "قاعده سررسیدشده‌ای نبود",
          );
        } catch (err: unknown) {
          setInfo(null);
          setError(friendlyErrorMessage(err, "اجرای قواعد ناموفق"));
        }
      })();
    });
  }

  return (
    <>
      {error ? <p className="liveError">{error}</p> : null}
      {info ? <StatusLine>{info}</StatusLine> : null}
      <SectionCard title="گزارش بازه‌ای" delayClass="delay2" tone="quiet">
        <FormStack density="inline">
          <JalaliDateField label="از تاریخ" value={from} onChange={setFrom} />
          <JalaliDateField label="تا تاریخ" value={to} onChange={setTo} />
          <SelectField
            label="گروه‌بندی"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as ReportGroupBy)}
          >
            <option value="day">روز</option>
            <option value="week">هفته</option>
            <option value="month">ماه</option>
            <option value="year">سال</option>
            <option value="category">دسته</option>
            <option value="visibility">نوع دید</option>
          </SelectField>
        </FormStack>
        <div className="formStack__actions">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFrom(monthStart());
              setTo(todayIso());
              setGroupBy("day");
            }}
          >
            این ماه
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const y = new Date().getFullYear();
              setFrom(`${y}-01-01`);
              setTo(`${y}-12-31`);
              setGroupBy("year");
            }}
          >
            امسال
          </Button>
          <Button type="button" onClick={onLoadReport} disabled={pending}>
            محاسبه گزارش
          </Button>
          <Button type="button" variant="ghost" onClick={onExportCsv} disabled={pending}>
            خروجی CSV
          </Button>
        </div>
        {report ? (
          <DataList>
            <DataRow
              title="جمع کل"
              meta={`${report.expenseCount} خرج`}
              trailing={<Amount irrMinor={report.grandTotal.amountMinor} />}
            />
            {report.buckets.map((bucket) => (
              <DataRow
                key={bucket.key}
                title={bucket.label}
                meta={`${bucket.count} مورد`}
                trailing={<Amount irrMinor={bucket.total.amountMinor} />}
              />
            ))}
            {report.buckets.length === 0 ? <EmptyHint>در این بازه خرجی نیست.</EmptyHint> : null}
          </DataList>
        ) : (
          <StatusLine>بازه را انتخاب و محاسبه کنید.</StatusLine>
        )}
      </SectionCard>

      <details className="reportDetails">
        <summary>
          <span>دسته‌ها</span>
          <span>{categories.length}</span>
        </summary>
        <div className="reportDetails__body">
          <FormStack density="compact">
            <TextField
              label="نام دسته جدید"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
            <Button type="button" onClick={onCreateCategory} disabled={pending}>
              افزودن دسته
            </Button>
          </FormStack>
          {categories.length === 0 ? (
            <EmptyHint>دسته‌ای ثبت نشده.</EmptyHint>
          ) : (
            <DataList>
              {categories.map((cat) => (
                <DataRow key={cat.id} title={cat.name} meta={cat.slug} />
              ))}
            </DataList>
          )}
        </div>
      </details>

      <details className="reportDetails">
        <summary>
          <span>خرج تکراری</span>
          <span>{recurring.length}</span>
        </summary>
        <div className="reportDetails__body">
          <FormStack density="compact">
            <TextField label="عنوان" value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} />
            <TextField
              label="مبلغ (تومان)"
              value={ruleToman}
              onChange={(e) => setRuleToman(e.target.value)}
            />
            <SelectField
              label="دوره"
              value={ruleCadence}
              onChange={(e) =>
                setRuleCadence(e.target.value as "weekly" | "monthly" | "yearly")
              }
            >
              <option value="weekly">هفتگی</option>
              <option value="monthly">ماهانه</option>
              <option value="yearly">سالانه</option>
            </SelectField>
            <div className="formStack__actions">
              <Button type="button" onClick={onCreateRecurring} disabled={pending}>
                ثبت قاعده
              </Button>
              <Button type="button" variant="ghost" onClick={onRunDue} disabled={pending}>
                اجرای سررسیدها (دستی)
              </Button>
            </div>
          </FormStack>
          <p className="liveHint">
            قواعد تکراری خودکار در پس‌زمینه اجرا نمی‌شوند — فقط با دکمهٔ بالا پیش‌نویس ساخته می‌شود.
          </p>
          {recurring.length === 0 ? (
            <EmptyHint>قاعده‌ای نیست.</EmptyHint>
          ) : (
            <DataList>
              {recurring.map((rule) => (
                <DataRow
                  key={rule.id}
                  title={rule.title}
                  meta={`${rule.cadence} · بعدی ${rule.nextRunOn}`}
                  trailing={<Amount irrMinor={rule.amount.amountMinor} />}
                />
              ))}
            </DataList>
          )}
        </div>
      </details>
    </>
  );
}
