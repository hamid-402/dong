"use client";

import { Suspense } from "react";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { InviteAcceptView } from "@/components/views/invite-accept-view";

/** Public invite accept — must keep `?token=` (no hub redirect). Uses live accept API only. */
export default function InvitePage() {
  return (
    <Suspense fallback={<ContentSkeleton rows={3} label="در حال بارگذاری دعوت…" />}>
      <InviteAcceptView />
    </Suspense>
  );
}
