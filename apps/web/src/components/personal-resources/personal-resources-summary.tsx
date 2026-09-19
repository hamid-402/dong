"use client";

import type { PersonalResourcesSummary } from "@dang/contracts";
import { Amount } from "@dang/ui";
import { budgetAlertText } from "./use-personal-resources-data";

type Props = {
  summary: PersonalResourcesSummary | null;
};

/** Totals + current-month budget strip from personalResourcesSummary API. */
export function PersonalResourcesSummaryBlock({ summary }: Props) {
  if (!summary) return null;

  const alert = summary.currentMonthBudget
    ? budgetAlertText(summary.currentMonthBudget)
    : null;

  return (
    <>
      <div className="pfTotals">
        <div>
          <span className="pfTotalsLabel">جمع موجودی حساب‌های فعال</span>
          <Amount irrMinor={summary.totalBalance.amountMinor} />
        </div>
        <div>
          <span className="pfTotalsLabel">حساب‌های فعال</span>
          <strong>{summary.activeAccountCount}</strong>
          <span className="pfRowMeta">
            {" "}
            · ذخیره: {summary.persistence === "postgres" ? "Postgres" : "حافظه"}
          </span>
        </div>
        {summary.currentMonthBudget ? (
          <div>
            <span className="pfTotalsLabel">
              بودجه {summary.currentMonthBudget.yearMonth}
            </span>
            <div>
              مانده بودجه:{" "}
              <Amount irrMinor={summary.currentMonthBudget.remaining.amountMinor} />
            </div>
            <span className="pfRowMeta">
              سقف <Amount irrMinor={summary.currentMonthBudget.limit.amountMinor} /> ·
              خرج شخصی <Amount irrMinor={summary.currentMonthBudget.spent.amountMinor} />
              {summary.currentMonthBudget.note
                ? ` · ${summary.currentMonthBudget.note}`
                : ""}
            </span>
          </div>
        ) : (
          <div>
            <span className="pfTotalsLabel">بودجه ماه جاری</span>
            <span className="pfRowMeta">هنوز تعریف نشده</span>
          </div>
        )}
      </div>
      {alert ? (
        <p
          className={
            summary.currentMonthBudget?.alertLevel === "exceeded"
              ? "liveError"
              : "pfBudgetWarn"
          }
        >
          {alert}
        </p>
      ) : null}
    </>
  );
}
