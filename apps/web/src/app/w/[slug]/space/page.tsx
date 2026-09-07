"use client";

import { spaceKindForTemplate } from "@dang/contracts";
import { PersonalSpaceView } from "@/components/views/personal-space-view";
import { FriendsGroupView } from "@/components/views/friends-group-view";
import { OrgSpaceView } from "@/components/views/org-space-view";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { useAppChrome } from "@/lib/use-app-chrome";

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
