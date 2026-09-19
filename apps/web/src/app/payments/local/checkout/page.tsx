"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { LocalPspIntentSummary, LocalPspVerifyResponse } from "@dang/contracts";
import { Button } from "@dang/ui";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import styles from "./local-checkout.module.css";

function formatIrrMinor(minor: string): string {
  try {
    return new Intl.NumberFormat("fa-IR").format(Number(BigInt(minor) / 10n));
  } catch {
    return minor;
  }
}

function LocalCheckoutInner() {
  const search = useSearchParams();
  const intentId = search.get("intentId")?.trim() ?? "";
  const [intent, setIntent] = useState<LocalPspIntentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<LocalPspVerifyResponse | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!intentId) {
      setError("شناسهٔ پرداخت در نشانی نیست.");
      return;
    }
    let cancelled = false;
    void api
      .getLocalPspIntent(intentId)
      .then((row) => {
        if (!cancelled) {
          setIntent(row);
          setError(null);
          if (row.status === "verified") {
            setDone({
              ok: true,
              status: "verified",
              intentId: row.intentId,
              amount: row.amount,
              refId: row.refId,
              returnUrl: row.returnUrl,
            });
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(friendlyErrorMessage(err, "بارگذاری پرداخت ناموفق"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [intentId]);

  function confirmPay() {
    if (!intentId) return;
    startTransition(() => {
      void api
        .verifyLocalPsp(intentId)
        .then((res) => {
          setDone(res);
          setError(null);
          if (res.ok && res.returnUrl) {
            window.setTimeout(() => {
              window.location.assign(res.returnUrl);
            }, 1200);
          }
        })
        .catch((err: unknown) => {
          setError(friendlyErrorMessage(err, "تأیید پرداخت ناموفق"));
        });
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <main className={styles.panel}>
        <nav className={styles.trail} aria-label="مسیر صفحه">
          <a
            className={styles.back}
            href={intent?.returnUrl || done?.returnUrl || "/spaces"}
          >
            ← بازگشت
          </a>
          <span className={styles.crumb}>پرداخت آزمایشی</span>
        </nav>
        <p className={styles.brand}>دنگ · LocalPSP</p>
        <h1 className={styles.title}>پرداخت آزمایشی محلی</h1>
        <p className={styles.lead}>
          این مسیر PSP داخل محصول است — بدون زرین‌پال. مبلغ فقط از سرور خوانده می‌شود.
        </p>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {intent && intent.status === "expired" && !done?.ok ? (
          <div className={styles.summary}>
            <p className={styles.error} role="alert">
              این پرداخت منقضی شده است. مبلغ سرور تغییر نمی‌کند — لینک جدید بسازید.
            </p>
            <p className={styles.meta}>
              مبلغ سرور: {formatIrrMinor(intent.amount.amountMinor)} تومان
            </p>
          </div>
        ) : null}

        {intent && intent.status === "pending" && !done?.ok ? (
          <div className={styles.summary}>
            <p className={styles.amount}>
              {formatIrrMinor(intent.amount.amountMinor)}{" "}
              <span className={styles.unit}>تومان</span>
            </p>
            <p className={styles.desc}>{intent.description}</p>
            <p className={styles.meta}>وضعیت: در انتظار پرداخت</p>
            <Button type="button" onClick={confirmPay} disabled={pending}>
              {pending ? "در حال تأیید…" : "پرداخت و تأیید"}
            </Button>
          </div>
        ) : null}

        {done?.ok ? (
          <div className={styles.success}>
            <p>پرداخت تأیید شد.</p>
            <p className={styles.meta}>
              مبلغ سرور: {formatIrrMinor(done.amount.amountMinor)} تومان
              {done.refId ? ` · ref ${done.refId}` : ""}
            </p>
            <p className={styles.meta}>در حال بازگشت…</p>
          </div>
        ) : null}

        {!intent && !error ? (
          <p className={styles.meta}>در حال بارگذاری…</p>
        ) : null}
      </main>
    </div>
  );
}

export default function LocalPspCheckoutPage() {
  return (
    <Suspense fallback={<p className={styles.meta}>در حال بارگذاری…</p>}>
      <LocalCheckoutInner />
    </Suspense>
  );
}
