"use client";

import { Suspense } from "react";
import { InviteAcceptView } from "@/components/views/invite-accept-view";

/** Public invite accept — must keep `?token=` (no hub redirect). */
export default function InvitePage() {
  return (
    <Suspense fallback={<p className="liveHint">در حال بارگذاری دعوت…</p>}>
      <InviteAcceptView />
    </Suspense>
  );
}
