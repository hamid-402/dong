"use client";

import { useEffect, useState, useTransition } from "react";
import type { FxRateSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
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

/**
 * Authenticated FX rate table. Shows conversionLive=false honesty —
 * no convert UI; write only when productFlags.fxRates is on.
 */
export function FxRatesPanel({
  canWrite,
  conversionLive,
  readOnly = false,
  onError,
}: {
  canWrite: boolean;
  conversionLive: boolean;
  readOnly?: boolean;
  onError: (message: string | null) => void;
}) {
  const [rows, setRows] = useState<FxRateSummary[]>([]);
  const [baseCurrency, setBase] = useState("USD");
  const [quoteCurrency, setQuote] = useState("IRR");
  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("manual");
  const [pending, startTransition] = useTransition();

  function reload() {
    return api.listFxRates().then(setRows);
  }

  useEffect(() => {
    void reload().catch((err: unknown) =>
      onError(friendlyErrorMessage(err, "بارگذاری نرخ ارز ناموفق")),
    );
  }, [onError]);

  function onCreate() {
    if (readOnly || !canWrite) return;
    startTransition(() => {
      void api
        .createFxRate({
          baseCurrency: baseCurrency.trim().toUpperCase(),
          quoteCurrency: quoteCurrency.trim().toUpperCase(),
          rate: rate.trim(),
          asOf,
          source: source.trim() || "manual",
        })
        .then(async () => {
          setRate("");
          onError(null);
          await reload();
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "ثبت نرخ ناموفق")),
        );
    });
  }

  return (
    <SectionCard title="جدول نرخ ارز" badge={rows.length} delayClass="delay3">
      <div id="fx-rates" />
      <StatusLine>
        {conversionLive
          ? "تبدیل زنده فعال است."
          : "تبدیل زنده در capabilities خاموش است — فقط جدول نرخ (بدون تبدیل خودکار خرج)."}
      </StatusLine>
      {canWrite && !readOnly ? (
        <FormStack density="compact">
          <TextField
            label="ارز مبدأ (ISO)"
            value={baseCurrency}
            onChange={(e) => setBase(e.target.value)}
          />
          <TextField
            label="ارز مقصد (ISO)"
            value={quoteCurrency}
            onChange={(e) => setQuote(e.target.value)}
          />
          <TextField label="نرخ" value={rate} onChange={(e) => setRate(e.target.value)} />
          <TextField label="تاریخ" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <TextField label="منبع" value={source} onChange={(e) => setSource(e.target.value)} />
          <Button type="button" disabled={pending} onClick={onCreate}>
            ثبت / به‌روزرسانی نرخ
          </Button>
        </FormStack>
      ) : readOnly ? (
        <EmptyHint>نقش شما فقط مشاهده دارد — ثبت نرخ فعال نیست.</EmptyHint>
      ) : (
        <EmptyHint>
          نوشتن نرخ پشت ENABLE_FX_RATES است؛ در این محیط فقط خواندن جدول ممکن است.
        </EmptyHint>
      )}
      {rows.length === 0 ? (
        <EmptyHint>نرخی ثبت نشده.</EmptyHint>
      ) : (
        <DataList>
          {rows.map((row) => (
            <DataRow
              key={row.id}
              title={`${row.baseCurrency}/${row.quoteCurrency}`}
              meta={`${row.asOf} · ${row.source}`}
              trailing={row.rate}
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
