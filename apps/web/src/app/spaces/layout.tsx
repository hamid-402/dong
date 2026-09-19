"use client";

import { Suspense, type ReactNode } from "react";
import { AccountAppFrame } from "@/components/shell/account-app-frame";

export default function SpacesLayout({ children }: { children: ReactNode }) {
  return (
    <AccountAppFrame>
      <Suspense fallback={<p className="liveHint">در حال بارگذاری فضاها…</p>}>
        {children}
      </Suspense>
    </AccountAppFrame>
  );
}
