"use client";

import { RouteErrorState } from "@/components/shell/route-error-state";
import { t } from "@/lib/i18n";

export default function ForbiddenPage() {
  return (
    <RouteErrorState
      code="403"
      title={t("error.forbidden.title")}
      description={t("error.forbidden.description")}
    />
  );
}
