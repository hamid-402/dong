import type { ReactNode } from "react";
import { AccountAppFrame } from "@/components/shell/account-app-frame";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AccountAppFrame>{children}</AccountAppFrame>;
}
