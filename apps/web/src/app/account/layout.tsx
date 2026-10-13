import type { ReactNode } from "react";
import { AccountAppFrame } from "@/components/shell/account-app-frame";
import { AccountSectionNav } from "@/components/shell/account-section-nav";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <AccountAppFrame>
      <AccountSectionNav />
      {children}
    </AccountAppFrame>
  );
}
