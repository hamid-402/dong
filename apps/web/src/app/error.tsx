"use client";

import { RouteErrorState } from "@/components/shell/route-error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      code="error"
      title="خطای غیرمنتظره"
      description="اجرای این صفحه متوقف شد. می‌توانید دوباره تلاش کنید یا به فهرست فضاها برگردید."
      detail={error.digest ?? null}
      reset={reset}
    />
  );
}
