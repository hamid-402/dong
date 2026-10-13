"use client";

import { AppearanceFields } from "@/components/appearance-fields";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";

export default function AccountAppearancePage() {
  return (
    <WorkspacePageFrame
      title="ظاهر"
      description="چهار تم سفید، مشکی، کاغذی و سرمه‌ای. لهجه آبی در همه مشترک است."
    >
      <AppearanceFields />
    </WorkspacePageFrame>
  );
}
