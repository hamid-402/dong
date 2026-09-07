import type { ReactNode } from "react";
import { AccountAppFrame } from "@/components/shell/account-app-frame";

export default function WhatsNewLayout({ children }: { children: ReactNode }) {
  return <AccountAppFrame>{children}</AccountAppFrame>;
}
