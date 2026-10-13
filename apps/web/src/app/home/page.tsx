"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHomeView } from "@/components/views/app-home-view";
import { homeListAlias } from "@/lib/workspace-paths";

function HomeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const target = homeListAlias(search.toString());

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (target) return <p className="liveHint">در حال انتقال به فضاها…</p>;
  return <AppHomeView />;
}

/** Canonical home. `/hub` and `/overview` redirect here; list queries go to `/spaces`. */
export default function AppHomePage() {
  return (
    <Suspense fallback={<p className="liveHint">در حال بارگذاری خانه…</p>}>
      <HomeInner />
    </Suspense>
  );
}
