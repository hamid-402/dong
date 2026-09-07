import type { ReactNode } from "react";
import { WorkspaceAppFrame } from "@/components/shell/workspace-app-frame";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceAppFrame>{children}</WorkspaceAppFrame>;
}
