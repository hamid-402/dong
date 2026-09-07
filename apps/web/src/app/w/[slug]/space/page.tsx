"use client";

import { spaceKindForTemplate } from "@dang/contracts";
import { PersonalSpaceView } from "@/components/views/personal-space-view";
import { FriendsGroupView } from "@/components/views/friends-group-view";
import { OrgSpaceView } from "@/components/views/org-space-view";
import { useAppChrome } from "@/lib/use-app-chrome";

/** Kind-specific space home (من / گروه / سازمان). */
export default function WorkspaceSpacePage() {
  const chrome = useAppChrome();
  const template = chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.template;
  const kind = spaceKindForTemplate(template);
  if (kind === "personal") return <PersonalSpaceView />;
  if (kind === "org") return <OrgSpaceView />;
  return <FriendsGroupView />;
}
