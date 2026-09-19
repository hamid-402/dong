"use client";

import { RouteErrorState } from "@/components/shell/route-error-state";

/**
 * Self-contained root for fatal render errors (must include html/body).
 * Matches root layout: fa + rtl + Vazirmatn variable on html.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <RouteErrorState
          code="error"
          title="خطای جدی رابط"
          description="بارگذاری برنامه متوقف شد. پس از تلاش دوباره، اگر مشکل ماند از پشتیبانی با شناسهٔ زیر استفاده کنید."
          detail={error.digest ?? null}
          reset={reset}
        />
      </body>
    </html>
  );
}
