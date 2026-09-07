"use client";

import { useState, useTransition } from "react";
import type {
  ReportGroupBy,
  WorkspaceReportCompareResponse,
} from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import {
  DataList,
  DataRow,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { JalaliDateField } from "@/components/jalali-date-field";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";

export function ReportComparePanel({
  workspaceId,
  groupBy,
}: {
  workspaceId: string;
  groupBy: ReportGroupBy;
}) {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [priorFrom, setPriorFrom] = useState(`${year - 1}-01-01`);
  const [priorTo, setPriorTo] = useState(`${year - 1}-12-31`);
  const [result, setResult] =
    useState<WorkspaceReportCompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function compare() {
    startTransition(() => {
      void api
        .compareWorkspaceReport(workspaceId, {
          from,
          to,
          priorFrom,
          priorTo,
          groupBy,
        })
        .then((response) => {
          setResult(response);
          setError(null);
        })
        .catch((reason: unknown) =>
          setError(friendlyErrorMessage(reason, "مقایسه دوره ناموفق")),
        );
    });
  }

  return (
    <SectionCard title="مقایسه دوره" tone="quiet">
      {error ? <p className="liveError">{error}</p> : null}
      <FormStack density="inline">
        <JalaliDateField label="دوره جاری از" value={from} onChange={setFrom} />
        <JalaliDateField label="دوره جاری تا" value={to} onChange={setTo} />
        <JalaliDateField
          label="دوره قبل از"
          value={priorFrom}
          onChange={setPriorFrom}
        />
        <JalaliDateField
          label="دوره قبل تا"
          value={priorTo}
          onChange={setPriorTo}
        />
        <Button type="button" onClick={compare} disabled={pending}>
          مقایسه
        </Button>
      </FormStack>
      {result ? (
        <DataList>
          <DataRow
            title="جمع دوره جاری"
            trailing={<Amount irrMinor={result.current.grandTotal.amountMinor} />}
          />
          <DataRow
            title="جمع دوره قبل"
            trailing={<Amount irrMinor={result.prior.grandTotal.amountMinor} />}
          />
          <DataRow
            title="تغییر"
            meta={
              result.deltaPercent === null
                ? "درصد برای دوره مبنای صفر محاسبه نمی‌شود"
                : `${result.deltaPercent}%`
            }
            trailing={<Amount irrMinor={result.deltaTotal.amountMinor} />}
          />
        </DataList>
      ) : (
        <StatusLine>دو بازه را انتخاب کنید.</StatusLine>
      )}
    </SectionCard>
  );
}
