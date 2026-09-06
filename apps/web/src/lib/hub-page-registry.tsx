"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

function PageFallback() {
  return <p className="liveHint">در حال بارگذاری…</p>;
}

function lazyView(
  loader: () => Promise<{ default: ComponentType } | Record<string, ComponentType>>,
  exportName: string,
): ComponentType {
  return dynamic(
    async () => {
      const mod = await loader();
      if ("default" in mod && typeof mod.default === "function") {
        return { default: mod.default };
      }
      const named = (mod as Record<string, ComponentType>)[exportName];
      if (!named) throw new Error(`Hub page export missing: ${exportName}`);
      return { default: named };
    },
    { ssr: false, loading: PageFallback },
  );
}

/** Lazy registry — hub shell must not eagerly pull every product view into the first JS chunk. */
export const HUB_PAGE_REGISTRY: Record<string, ComponentType> = {
  "/overview": lazyView(() => import("@/components/views/overview-view"), "OverviewView"),
  "/me": lazyView(() => import("@/components/views/personal-space-view"), "PersonalSpaceView"),
  "/group": lazyView(() => import("@/components/views/friends-group-view"), "FriendsGroupView"),
  "/groups": lazyView(() => import("@/components/views/friends-group-view"), "FriendsGroupView"),
  "/orgs": lazyView(() => import("@/components/views/org-space-view"), "OrgSpaceView"),
  "/workspaces": lazyView(() => import("@/components/views/finance-view"), "FinanceView"),
  "/workspaces/invite": lazyView(
    () => import("@/components/views/workspace-invite-view"),
    "WorkspaceInviteView",
  ),
  "/workspaces/procurement": lazyView(
    () => import("@/components/views/procurement-view"),
    "ProcurementView",
  ),
  "/workspaces/assets": lazyView(() => import("@/components/views/assets-view"), "AssetsView"),
  "/workspaces/partnership": lazyView(
    () => import("@/components/views/partnership-view"),
    "PartnershipView",
  ),
  "/proposals": lazyView(() => import("@/components/views/proposals-view"), "ProposalsView"),
  "/daily-ledger": lazyView(
    () => import("@/components/views/daily-ledger-view"),
    "DailyLedgerView",
  ),
  "/onboarding": lazyView(() => import("@/components/views/onboarding-view"), "OnboardingView"),
  "/invite": lazyView(() => import("@/components/views/invite-accept-view"), "InviteAcceptView"),
  "/profile": lazyView(() => import("@/components/views/profile-view"), "ProfileView"),
};

export function getHubPage(route: string): ComponentType | null {
  return HUB_PAGE_REGISTRY[route] ?? null;
}
