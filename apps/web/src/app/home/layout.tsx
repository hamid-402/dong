import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountAppFrame } from "@/components/shell/account-app-frame";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <AccountAppFrame>
      <Suspense fallback={<p className="liveHint">در حال بارگذاری خانه…</p>}>
        {children}
      </Suspense>
    </AccountAppFrame>
  );
}
