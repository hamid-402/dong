"use client";

import { useEffect, useState } from "react";
import {
  isReadOnlyRole,
  roleNavProfile,
} from "@dang/contracts";
import { StatusLine, StatusPill } from "@/components/ui-blocks";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { membershipRoleLabel } from "@/lib/status-labels";
import styles from "./persona-shell-banner.module.css";

/**
 * Phase B persona chrome: permanent guest/auditor banner + deputy marker.
 * Owner/finance/member stay quiet on every page (homes carry their own hint).
 */
export function PersonaShellBanner() {
  const { role, ready } = useWorkspaceMembershipRole();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(ready);
  }, [ready]);

  const profile = roleNavProfile(role);
  if (!visible || !profile) return null;

  const isDeputy = role === "deputy_finance";
  const isGuestLike =
    profile.persona === "guest" || profile.persona === "auditor";

  if (!isGuestLike && !isDeputy) return null;

  return (
    <div className={styles.banner} role="status">
      <StatusLine>
        {isGuestLike ? (
          <StatusPill tone="warn">
            {profile.persona === "auditor" ? "ناظر" : "مهمان"}
          </StatusPill>
        ) : null}
        {isDeputy ? <StatusPill tone="info">جانشین مالی</StatusPill> : null}{" "}
        <span className={styles.hint}>
          {isDeputy
            ? `نقش ${membershipRoleLabel(role)} — اختیار مالی موقت در بازهٔ جانشینی.`
            : profile.homeHintFa}
          {isGuestLike && isReadOnlyRole(role)
            ? " · ثبت و تغییر مالی برای این نقش فعال نیست."
            : null}
        </span>
      </StatusLine>
    </div>
  );
}
