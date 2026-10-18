"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

/**
 * Legacy kind-home path — keep the route, send everyone to the unified خلاصه.
 * Query string is preserved (e.g. ?folder=…).
 */
function SpaceHomeRedirect() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  useEffect(() => {
    if (!slug) return;
    const query = searchParams?.toString() ?? "";
    router.replace(query ? `/w/${encodeURIComponent(slug)}?${query}` : `/w/${encodeURIComponent(slug)}`);
  }, [slug, router, searchParams]);

  return <RouteLoadingHint label="در حال رفتن به خلاصهٔ فضا…" />;
}

export default function WorkspaceSpacePage() {
  return (
    <Suspense fallback={<RouteLoadingHint label="در حال رفتن به خلاصهٔ فضا…" />}>
      <SpaceHomeRedirect />
    </Suspense>
  );
}
