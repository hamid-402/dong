"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipSummary } from "@dang/contracts";
import { AppShell } from "@/components/app-shell";
import { EmptyHint, PageHeader } from "@/components/ui-blocks";
import { AddonChargesPanel } from "@/components/views/friends-group/addon-charges-panel";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";

/** Additive /w/.../addons — only interactive when productFlags.addonAck. */
export default function WorkspaceAddonsPage() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [, startTransition] = useTransition();
  const enabled = Boolean(chrome.capabilities?.productFlags?.addonAck);

  useEffect(() => {
    if (!chrome.workspaceId || !enabled) {
      setMembers([]);
      return;
    }
    startTransition(() => {
      void api
        .listMembers(chrome.workspaceId)
        .then(setMembers)
        .catch((err: unknown) => setError(friendlyErrorMessage(err, "بارگذاری اعضا ناموفق")));
    });
  }, [chrome.workspaceId, enabled, setError]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="مالی"
        title="اضافهٔ شخصی داخل گروه"
        description="جدا از خرج مشترک — تا تأیید عضو هدف در صورتحساب قطعی نیست."
      />
      <FlashMessages error={error} successMessage={successMessage} />
      {!enabled ? (
        <EmptyHint>
          این قابلیت پشت پرچم محصول خاموش است. برای فعال‌سازی runtime، ENABLE_ADDON_ACK=1 و
          capabilities باید addonAck را تأیید کند — دکمهٔ جعلی نشان داده نمی‌شود.
        </EmptyHint>
      ) : !chrome.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : (
        <AddonChargesPanel
          workspaceId={chrome.workspaceId}
          actorUserId={chrome.actor?.userId ?? null}
          members={members}
          onError={setError}
          onSuccess={flashSuccess}
        />
      )}
    </AppShell>
  );
}
