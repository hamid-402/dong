"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipRole, MembershipSummary, PersonalAddonChargeSummary } from "@dang/contracts";
import { isReadOnlyRole } from "@dang/contracts";
import { EmptyHint } from "@/components/ui-blocks";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import { AddonChargesPanel } from "@/components/views/friends-group/addon-charges-panel";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { membershipRoleLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

/** Additive /w/.../addons — only interactive when productFlags.addonAck. */
export default function WorkspaceAddonsPage() {
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

  const pendingAck = charges.filter((charge) => charge.status === "pending_ack").length;
  const confirmed = charges.filter((charge) => charge.status === "confirmed").length;
  const disputed = charges.filter((charge) => charge.status === "disputed").length;

  return (
    <div>
      <OperationsModuleHeader
        ariaLabel="اضافه شخصی داخل گروه"
        destinations={[
          {
            key: "addons",
            label: NAV_LABELS.addons,
            href: wPath(scope.slug, "addons"),
            active: true,
          },
          {
            key: "expenses",
            label: NAV_LABELS.expenses,
            href: wPath(scope.slug, "expenses"),
            active: false,
          },
          {
            key: "approvals",
            label: NAV_LABELS.approvals,
            href: wPath(scope.slug, "approvals"),
            active: false,
          },
          {
            key: "invoices",
            label: NAV_LABELS.invoices,
            href: wPath(scope.slug, "invoices"),
            active: false,
          },
        ]}
        metrics={[
          {
            label: "کل اضافه‌ها",
            value: enabled ? new Intl.NumberFormat("fa-IR").format(charges.length) : "—",
            detail: enabled ? "از API اضافه شخصی" : "قابلیت خاموش",
          },
          {
            label: "در انتظار تأیید",
            value: enabled ? new Intl.NumberFormat("fa-IR").format(pendingAck) : "—",
            detail: "تا تأیید عضو هدف قطعی نیست",
            tone: pendingAck > 0 ? "attention" : "neutral",
          },
          {
            label: "تأییدشده",
            value: enabled ? new Intl.NumberFormat("fa-IR").format(confirmed) : "—",
            tone: confirmed > 0 ? "positive" : "neutral",
          },
          {
            label: "اعتراض",
            value: enabled ? new Intl.NumberFormat("fa-IR").format(disputed) : "—",
            tone: disputed > 0 ? "attention" : "neutral",
          },
        ]}
        roleLabel={myRole ? membershipRoleLabel(myRole) : null}
        persistenceLabel={chrome.persistenceLabel}
        pending={pending || !chrome.ready}
        onRefresh={refresh}
      />
      <FlashMessages error={error} successMessage={successMessage} />
      {!enabled ? (
        <EmptyHint>
          این قابلیت پشت پرچم محصول خاموش است. برای فعال‌سازی runtime، ENABLE_ADDON_ACK=1 و
          capabilities باید addonAck را تأیید کند — دکمهٔ جعلی نشان داده نمی‌شود.
        </EmptyHint>
      ) : !scope.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : (
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
      )}
    </div>
  );
}
