"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  absoluteForPage,
  classicPathToWorkspacePage,
} from "@/lib/workspace-paths";
import { readStoredWorkspaceId } from "@/lib/workspace-storage";

function RedirectInner({
  page,
}: {
  page?: ReturnType<typeof classicPathToWorkspacePage>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [message, setMessage] = useState("انتقال…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const suffix = `${search}${hash}`;

      // Finance panel hashes must win over a coarse hub/page prop (e.g. expenses).
      const panelFromHash = classicPathToWorkspacePage("/workspaces", hash);
      const isFinancePanelHash =
        hash === "#settlement-panel" ||
        hash === "#period-invoice-panel" ||
        hash === "#reports-panel" ||
        hash === "#expense-panel" ||
        hash === "#quick-expense";
      const mapped =
        isFinancePanelHash && panelFromHash
          ? panelFromHash
          : (page ?? classicPathToWorkspacePage(pathname, hash));

      if (mapped === "invite") {
        router.replace(`/invite${suffix}`);
        return;
      }
      if (mapped === "account") {
        router.replace(`/account${suffix}`);
        return;
      }
      if (mapped === "spaces-new") {
        router.replace(`/spaces/new${suffix}`);
        return;
      }
      if (mapped === "spaces") {
        router.replace(`/spaces${suffix}`);
        return;
      }

      try {
        const list = await api.listWorkspaces();
        let stored = "";
        try {
          stored = readStoredWorkspaceId();
        } catch {
          /* ignore */
        }
        const active = list.find((w) => w.id === stored) ?? list[0] ?? null;
        if (!active) {
          if (!cancelled) setMessage("فضایی ندارید — انتقال به ساخت فضا…");
          router.replace(`/spaces/new${suffix}`);
          return;
        }
        const target = absoluteForPage(mapped, active.slug);
        router.replace(`${target}${suffix}`);
      } catch {
        if (!cancelled) setMessage("خطا در بارگذاری فضاها");
        router.replace(`/login?next=${encodeURIComponent(pathname + suffix)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, pathname, router]);

  return (
    <main id="main" className="app-viewport" style={{ alignItems: "center", color: "var(--muted)" }}>
      <p>{message}</p>
    </main>
  );
}

/**
 * Redirect classic product URLs to `/w/[slug]/…` (or account/spaces),
 * preserving query string and hash (invite token + panel anchors).
 */
export function ClassicToWorkspaceRedirect({
  page,
}: {
  page?: ReturnType<typeof classicPathToWorkspacePage>;
}) {
  return (
    <Suspense
      fallback={
        <main id="main" className="app-viewport" style={{ alignItems: "center", color: "var(--muted)" }}>
          <p>انتقال…</p>
        </main>
      }
    >
      <RedirectInner page={page} />
    </Suspense>
  );
}

/** @deprecated Prefer ClassicToWorkspaceRedirect — kept as alias for additive imports. */
export function ClassicToHubRedirect() {
  return <ClassicToWorkspaceRedirect />;
}
