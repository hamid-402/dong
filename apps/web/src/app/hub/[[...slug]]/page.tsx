"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { MosaicLayout } from "@/components/mosaic/mosaic-layout";
import { MosaicNavProvider } from "@/components/mosaic/mosaic-nav-context";
import { HubShell } from "@/components/mosaic/hub-shell";
import { markClientSession } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";
import { buildNavForTemplate } from "@/lib/workspace-modules";

function HubOidcCallback() {
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("login") === "ok") {
      markClientSession("oidc");
    }
  }, [params]);
  return null;
}

function HubNavTree() {
  const chrome = useAppChrome();
  const template = chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.template;
  const rootNodes = useMemo(() => buildNavForTemplate(template), [template]);

  return (
    <MosaicNavProvider rootNodes={rootNodes}>
      <HubShell />
    </MosaicNavProvider>
  );
}

export default function HubPage() {
  return (
    <MosaicLayout>
      <Suspense fallback={null}>
        <HubOidcCallback />
      </Suspense>
      <HubNavTree />
    </MosaicLayout>
  );
}
