"use client";

import { useEffect, useState, useTransition } from "react";
import type { FxConvertPreviewResponse, FxRateSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
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
import { formatFaDate, todayIsoLocal } from "@/lib/fa-datetime";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";

/**
 * Authenticated FX rate table. conversionLive stays false —
 * preview is read-only math from the rate table (G13).
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
  const [asOf, setAsOf] = useState(() => todayIsoLocal());
  const [source, setSource] = useState("manual");
  const [previewFrom, setPreviewFrom] = useState("USD");
  const [previewTo, setPreviewTo] = useState("IRR");
  const [previewAmount, setPreviewAmount] = useState("100");
  const [previewResult, setPreviewResult] = useState<FxConvertPreviewResponse | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const chrome = useOptionalAppChrome();
  const providerLive = chrome?.capabilities?.providers?.fxProvider === "http_v1";
  const previewOn = chrome?.capabilities?.providers?.fxPreview === "preview_v1";

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

  function onPreview() {
    if (!previewOn) return;
    startTransition(() => {
      void api
        .previewFxConvert({
          fromCurrency: previewFrom.trim().toUpperCase(),
          toCurrency: previewTo.trim().toUpperCase(),
          amount: previewAmount.trim(),
          asOf,
        })
        .then((result) => {
          setPreviewResult(result);
          onError(null);
        })
        .catch((err: unknown) => {
          setPreviewResult(null);
          onError(friendlyErrorMessage(err, "پیش‌نمایش تبدیل ناموفق"));
        });
    });
  }

  return (
    <SectionCard title="جدول نرخ ارز" badge={rows.length} delayClass="delay3">
      <div id="fx-rates" />
      <StatusLine>
        {conversionLive
          ? "تبدیل زنده فعال است."
          : "تبدیل زنده در capabilities خاموش است — فقط جدول نرخ و پیش‌نمایش (بدون ثبت خودکار خرج)."}
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
          <JalaliDateField label="تاریخ" value={asOf} onChange={setAsOf} />
          <TextField label="منبع" value={source} onChange={(e) => setSource(e.target.value)} />
          <Button type="button" disabled={pending} onClick={onCreate}>
            ثبت / به‌روزرسانی نرخ
          </Button>
          {providerLive ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(() => {
                  void api
                    .syncFxProvider()
                    .then((result) => {
                      onError(null);
                      void api.listFxRates().then(setRows);
                      setSource(result.source);
                    })
                    .catch((err: unknown) =>
                      onError(friendlyErrorMessage(err, "همگام‌سازی provider ناموفق")),
                    );
                });
              }}
            >
              همگام‌سازی از FX_PROVIDER_URL
            </Button>
          ) : (
            <EmptyHint>
              provider HTTP خاموش است — فقط وقتی FX_PROVIDER_URL تنظیم شود دکمه همگام‌سازی
              ظاهر می‌شود.
            </EmptyHint>
          )}
        </FormStack>
      ) : readOnly ? (
        <EmptyHint>نقش شما فقط مشاهده دارد — ثبت نرخ فعال نیست.</EmptyHint>
      ) : (
        <EmptyHint>
          نوشتن نرخ پشت ENABLE_FX_RATES است؛ در این محیط فقط خواندن جدول ممکن است.
        </EmptyHint>
      )}
      {previewOn ? (
        <FormStack density="compact">
          <StatusLine>پیش‌نمایش تبدیل (فقط محاسبه — live=false)</StatusLine>
          <TextField
            label="از ارز"
            value={previewFrom}
            onChange={(e) => setPreviewFrom(e.target.value)}
          />
          <TextField
            label="به ارز"
            value={previewTo}
            onChange={(e) => setPreviewTo(e.target.value)}
          />
          <TextField
            label="مبلغ"
            value={previewAmount}
            onChange={(e) => setPreviewAmount(e.target.value)}
          />
          <Button type="button" variant="secondary" disabled={pending} onClick={onPreview}>
            محاسبه پیش‌نمایش
          </Button>
          {previewResult ? (
            <StatusLine>
              {previewResult.amount} {previewResult.fromCurrency} →{" "}
              {previewResult.convertedAmount} {previewResult.toCurrency}
              {previewResult.inverted ? " (نرخ معکوس)" : ""} · نرخ {previewResult.rate} ·{" "}
              {formatFaDate(previewResult.rateAsOf)}
            </StatusLine>
          ) : null}
        </FormStack>
      ) : null}
      {rows.length === 0 ? (
        <EmptyHint>نرخی ثبت نشده.</EmptyHint>
      ) : (
        <DataList>
          {rows.map((row) => (
            <DataRow
              key={row.id}
              title={`${row.baseCurrency}/${row.quoteCurrency}`}
              meta={`${formatFaDate(row.asOf)} · ${row.source}`}
              trailing={row.rate}
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
