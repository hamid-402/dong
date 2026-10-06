"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Legacy list URL — unify on `/home` (keep `/spaces/new` and `/spaces/reports`).
 */
function SpacesListRedirectInner() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const kind = search.get("kind");
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    router.replace(`/home${q}`);
  }, [router, search]);

  return <p className="liveHint">در حال انتقال به خانه…</p>;
}

export default function SpacesPage() {
  return (
    <Suspense fallback={<p className="liveHint">در حال انتقال به خانه…</p>}>
      <SpacesListRedirectInner />
    </Suspense>
  );
}
