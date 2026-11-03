"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHomeView } from "@/components/views/app-home-view";
import { homeListAlias } from "@/lib/workspace-paths";

export function HomeClient() {
  const router = useRouter();
  const search = useSearchParams();
  const target = homeListAlias(search.toString());

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (target) return <p className="liveHint">در حال انتقال به فضاها…</p>;
  return <AppHomeView serverLead />;
}
