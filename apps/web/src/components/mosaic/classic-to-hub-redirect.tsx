"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RAW_MENU_ITEMS } from "@/lib/app-navigation";
import { routeToHubContentPath } from "@/lib/hub-nav-url";

/** Client redirect from classic routes into mosaic hub URLs. */
export function ClassicToHubRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const target = routeToHubContentPath(pathname, RAW_MENU_ITEMS);
    router.replace(target);
  }, [pathname, router]);

  return (
    <main className="app-viewport" style={{ alignItems: "center", color: "var(--muted)" }}>
      <p>انتقال به فضای کاری…</p>
    </main>
  );
}
