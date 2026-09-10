"use client";

import dynamic from "next/dynamic";
import { spaceKindForTemplate } from "@dang/contracts";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { useAppChrome } from "@/lib/use-app-chrome";

const PersonalSpaceView = dynamic(
  () =>
    import("@/components/views/personal-space-view").then((mod) => ({
      default: mod.PersonalSpaceView,
    })),
  { ssr: false, loading: () => <RouteLoadingHint label="در حال بارگذاری دفتر شخصی…" /> },
);
const FriendsGroupView = dynamic(
  () =>
    import("@/components/views/friends-group-view").then((mod) => ({
      default: mod.FriendsGroupView,
    })),
  { ssr: false, loading: () => <RouteLoadingHint label="در حال بارگذاری خانه گروه…" /> },
);
const OrgSpaceView = dynamic(
  () =>
    import("@/components/views/org-space-view").then((mod) => ({
      default: mod.OrgSpaceView,
    })),
  { ssr: false, loading: () => <RouteLoadingHint label="در حال بارگذاری خانه سازمان…" /> },
);

/** Kind-specific space home (من / گروه / سازمان) — bound to URL workspace. */
export default function WorkspaceSpacePage() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const workspaceId = scope?.workspaceId || chrome.workspaceId;
  const template = chrome.workspaces.find((w) => w.id === workspaceId)?.template;
  const kind = spaceKindForTemplate(template);
  if (kind === "personal") return <PersonalSpaceView />;
  if (kind === "org") return <OrgSpaceView />;
  return <FriendsGroupView />;
}
