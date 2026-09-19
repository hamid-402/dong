"use client";

import { useParams } from "next/navigation";
import { ClassicToWorkspaceRedirect } from "@/components/shell/classic-to-workspace-redirect";
import { parseHubLocation } from "@/lib/hub-nav-url";
import { classicPathToWorkspacePage } from "@/lib/workspace-paths";

/** `/hub` → app home; nested mosaic URLs map to `/w/[slug]/…` only when a page is needed. */
export default function HubPage() {
  const params = useParams<{ slug?: string[] }>();
  const splat = Array.isArray(params.slug) ? params.slug.join("/") : "";
  const { contentRoute, groupKeys } = parseHubLocation(splat);

  let page = classicPathToWorkspacePage(contentRoute ?? "") ?? null;
  if (!page && groupKeys.includes("finance")) page = "expenses";
  if (!page && groupKeys.includes("buy")) page = "procurement";
  if (!page && groupKeys.includes("spaces")) page = "spaces";
  if (!page && groupKeys.includes("manage")) page = "account";
  // Bare /hub is the public app home — never auto-enter a workspace.
  if (!page && !contentRoute && groupKeys.length === 0) page = "home";
  if (!page) page = "home";

  return <ClassicToWorkspaceRedirect page={page} />;
}
