"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { MembershipRole, MembershipSummary, PersonalAddonChargeSummary } from "@dang/contracts";
import { isReadOnlyRole } from "@dang/contracts";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { AddonChargesPanel } from "@/components/views/friends-group/addon-charges-panel";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

/** Additive /w/.../addons — only interactive when productFlags.addonAck. */
export default function WorkspaceAddonsPage() {
  return (
    <WorkspacePageGate page="addons">
      <WorkspaceAddonsPageInner />
    </WorkspacePageGate>
  );
}

function WorkspaceAddonsPageInner() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [charges, setCharges] = useState<PersonalAddonChargeSummary[]>([]);
  const [myRole, setMyRole] = useState<MembershipRole | "">("");
  const [pending, startTransition] = useTransition();
  const enabled = Boolean(chrome.capabilities?.productFlags?.addonAck);
  const readOnly = isReadOnlyRole(myRole);

  function refresh() {
    if (!scope.workspaceId || !enabled) {
      setMembers([]);
      setCharges([]);
      setMyRole("");
      return;
    }
    startTransition(() => {
      void api
        .listMembers(scope.workspaceId)
        .then((memberList) => {
          setMembers(memberList);
          setMyRole(
            memberList.find((member) => member.userId === chrome.actor?.userId)?.role ?? "",
          );
          setError(null);
        })
        .catch((err: unknown) =>
          setError(friendlyErrorMessage(err, "بارگذاری اضافه‌های شخصی ناموفق")),
        );
    });
  }

  useEffect(() => {
    refresh();
  }, [scope.workspaceId, enabled, chrome.actor?.userId]);

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.addons}
      description="هزینهٔ شخصی داخل گروه — تا تأیید عضو هدف در صورتحساب قطعی نیست."
      primaryAction={
        enabled && !readOnly ? (
          <a href="#addon-charge-form">ثبت اضافه</a>
        ) : (
          <Link href={wPath(scope.slug, "expenses")}>{NAV_LABELS.expenses}</Link>
        )
      }

      state={
        !enabled
          ? "empty"
          : !scope.workspaceId
            ? "empty"
            : error && charges.length === 0 && !pending
              ? "error"
              : pending && charges.length === 0
                ? "loading"
                : "ready"
      }
      loadingLabel="در حال بارگذاری اضافه‌های شخصی…"
      skeletonRows={3}
      error={
        <StatusLine>
          {error}{" "}
          <button type="button" className="textButton" onClick={refresh} disabled={pending}>
            تلاش دوباره
          </button>
        </StatusLine>
      }
      empty={
        !enabled ? (
          <EmptyHint>
            این قابلیت پشت پرچم محصول خاموش است. برای فعال‌سازی runtime، ENABLE_ADDON_ACK=1 و
            capabilities باید addonAck را تأیید کند — دکمهٔ جعلی نشان داده نمی‌شود.
          </EmptyHint>
        ) : (
          <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
        )
      }
    >
      <FlashMessages error={error} successMessage={successMessage} />
      <AddonChargesPanel
        workspaceId={scope.workspaceId}
        actorUserId={chrome.actor?.userId ?? null}
        members={members}
        readOnly={readOnly}
        onError={setError}
        onSuccess={(message) => {
          flashSuccess(message);
          refresh();
        }}
        onChargesChange={setCharges}
      />
    </WorkspacePageFrame>
  );
}
