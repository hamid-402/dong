import type { ReactNode } from "react";
import { AccountAppFrame } from "@/components/shell/account-app-frame";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountAppFrame>{children}</AccountAppFrame>;
}
