"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { JoinGroupView } from "@/components/views/join-group-view";

function JoinFromQuery() {
  const search = useSearchParams();
  const id = search.get("id")?.trim() || search.get("slug")?.trim() || "";
  return <JoinGroupView initialSlug={id} />;
}

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="liveHint">در حال بارگذاری…</p>}>
      <JoinFromQuery />
    </Suspense>
  );
}
