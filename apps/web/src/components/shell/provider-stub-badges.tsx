"use client";

import type { SystemCapabilities } from "@dang/contracts";
import styles from "./provider-stub-badges.module.css";

export type ProviderStubBadge = {
  key: string;
  label: string;
  /** stub = not production-grade; mode = honest non-stub mode label */
  kind: "stub" | "mode";
};

/**
 * Derive honest provider/stub labels from live capabilities only.
 * Empty when no stubs and payment is not local_psp (e.g. zarinpal + real mail/OCR/AV).
 * Labels are user-facing Persian — no raw env jargon.
 */
export function providerStubBadgesFromCapabilities(
  capabilities: SystemCapabilities | null | undefined,
): ProviderStubBadge[] {
  if (!capabilities) return [];
  const badges: ProviderStubBadge[] = [];
  const providers = capabilities.providers;
  const stubs = capabilities.stubs;

  if (stubs.ocr || providers?.ocr === "stub") {
    badges.push({ key: "ocr", label: "خواندن رسید: آزمایشی", kind: "stub" });
  }
  if (stubs.avScan || providers?.antivirus === "stub") {
    badges.push({ key: "av", label: "آنتی‌ویروس: آزمایشی", kind: "stub" });
  }
  if (stubs.emailDelivery || providers?.email === "log" || providers?.email === "none") {
    const email = providers?.email ?? "none";
    badges.push({
      key: "email",
      label:
        email === "log"
          ? "ایمیل: فقط ثبت محلی (ارسال واقعی نیست)"
          : email === "none"
            ? "ایمیل: خاموش"
            : "ایمیل: آزمایشی",
      kind: "stub",
    });
  }
  if (
    stubs.backgroundWorker ||
    providers?.jobs === "inline_stub" ||
    providers?.jobs === "redis_queue_degraded"
  ) {
    badges.push({
      key: "worker",
      label:
        providers?.jobs === "inline_stub"
          ? "صف پس‌زمینه: آزمایشی"
          : providers?.jobs === "redis_queue_degraded"
            ? "صف کار: Redis بدون کارگر"
            : "کارگر پس‌زمینه: قطع",
      kind: "stub",
    });
  }
  if (stubs.paymentProvider || providers?.payment === "stub") {
    badges.push({ key: "psp", label: "درگاه پرداخت: آزمایشی", kind: "stub" });
  } else if (providers?.payment === "local_psp") {
    badges.push({
      key: "psp",
      label: "درگاه: محلی (زرین‌پال وصل نیست)",
      kind: "mode",
    });
  }
  if (providers?.messaging === "stub") {
    badges.push({ key: "msg", label: "پیام‌رسان: آزمایشی", kind: "stub" });
  }
  if (providers?.sms === "stub") {
    badges.push({ key: "sms", label: "پیامک: آزمایشی", kind: "stub" });
  }

  const fxSurface =
    Boolean(capabilities.productFlags?.fxRates) ||
    providers?.fxPreview === "preview_v1" ||
    providers?.fxProvider === "http_v1";
  if (fxSurface && capabilities.conversionLive !== true) {
    badges.push({
      key: "fx",
      label: "تبدیل ارز زنده: خاموش",
      kind: "mode",
    });
  }

  return badges;
}

/**
 * Compact honesty strip for product chrome.
 * Stubs stay visible (no-fake-data); DevAuth env tips stay collapsed for operators.
 */
export function ProviderStubBadges({
  capabilities,
  className,
  allowDevAuth = false,
}: {
  capabilities: SystemCapabilities | null | undefined;
  className?: string;
  allowDevAuth?: boolean;
}) {
  const badges = providerStubBadgesFromCapabilities(capabilities);
  if (badges.length === 0 && !allowDevAuth) return null;

  return (
    <section
      className={[styles.wrap, className].filter(Boolean).join(" ")}
      aria-label="وضعیت اتصال‌های بیرونی"
    >
      {allowDevAuth ? (
        <details className={styles.devAuth}>
          <summary>
            ورود آزمایشی توسعه‌دهنده فعال است — برای کاربر نهایی در staging خاموش شود
          </summary>
          <p className={styles.devAuthBody}>
            فقط محیط محلی. در staging مقدار{" "}
            <code>ALLOW_DEV_AUTH=false</code> و در صورت نیاز{" "}
            <code>REQUIRE_MFA=1</code> را تنظیم کنید.
          </p>
        </details>
      ) : null}

      {badges.length > 0 ? (
        <>
          <p className={styles.lead}>
            این سرویس‌ها هنوز واقعی وصل نیستند — تا اشتباه با سرویس تولیدی گرفته
            نشوند:
          </p>
          <ul className={styles.strip}>
            {badges.map((b) => (
              <li
                key={b.key}
                className={`${styles.badge} ${b.kind === "stub" ? styles.stub : styles.mode}`}
              >
                {b.label}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
