"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@dang/contracts";
import { api } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

const MESSAGE =
  "برای نهایی‌کردن هزینه و تأیید تسویه در فضای گروهی، ابتدا تأیید دو مرحله‌ای (TOTP) را فعال کنید. تا وقتی فعال نشود، سرور این کار را رد می‌کند.";

/**
 * Shown before group expense post and settlement confirm when this environment
 * requires MFA and this account still has no TOTP. Does not change the server gate.
 */
export function GroupMfaEnrollmentNotice({ active }: { active: boolean }) {
  const chrome = useAppChrome();
  const required = chrome.capabilities?.mfa === true;
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!active || !required) return;
    let cancelled = false;
    void api.profile().then(
      (next) => {
        if (!cancelled) setProfile(next);
      },
      () => {
        if (!cancelled) setProfile(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, required]);

  if (!active || !required || !profile) return null;
  if (profile.mfaEnabled || profile.mfaEnrollmentRequired !== true) return null;

  return (
    <div role="status">
      <p>{MESSAGE}</p>
      <a href="/account/security">فعال‌سازی تأیید دو مرحله‌ای</a>
    </div>
  );
}
