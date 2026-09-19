"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { SpaceKind } from "@dang/contracts";
import { KindReportsView } from "@/components/views/kind-reports-view";
import { parseReportMonths } from "@/lib/chart-insights";
import type { ReportMonths } from "@/components/charts/report-range-toolbar";

function parseKind(raw: string | null): SpaceKind {
  if (raw === "personal" || raw === "group" || raw === "building" || raw === "org") {
    return raw;
  }
  return "group";
}

export default function SpacesReportsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const kind = parseKind(search.get("kind"));
  const months = parseReportMonths(search.get("months"));

  const onMonthsChange = useCallback(
    (next: ReportMonths) => {
      const params = new URLSearchParams(search.toString());
      params.set("kind", kind);
      params.set("months", String(next));
      router.replace(`/spaces/reports?${params.toString()}`);
    },
    [router, search, kind],
  );

  return (
    <KindReportsView
      kind={kind}
      months={months}
      onMonthsChange={onMonthsChange}
    />
  );
}
