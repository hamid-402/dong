"use client";

import { RouteErrorState } from "@/components/shell/route-error-state";
import { t } from "@/lib/i18n";

export default function GlobalNotFound() {
  return (
    <RouteErrorState
      code="404"
      title={t("error.notFound.title")}
      description={t("error.notFound.description")}
    />
  );
}
