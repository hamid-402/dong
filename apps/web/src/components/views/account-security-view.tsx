"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UserProfile } from "@dang/contracts";
import { AuthAlert } from "@/components/auth-shell";
import { AppShell } from "@/components/app-shell";
import { PageHeader, ProductGrid } from "@/components/ui-blocks";
import { MfaSettingsPanel } from "@/components/shell/mfa-settings-panel";
import { api, ApiError } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useRouter } from "next/navigation";

export function AccountSecurityView() {
  const chrome = useAppChrome();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setProfile(await api.profile());
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login?next=/account/security");
          return;
        }
        setError(err instanceof Error ? err.message : "بارگذاری ناموفق");
      }
    })();
  }, [router]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || "امنیت"}
      userName={profile?.displayName ?? chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="حساب من"
        title="امنیت"
        description="رمز، نشست‌ها و تأیید دو مرحله‌ای — فقط از API واقعی."
        actions={<Link href="/account">بازگشت به پروفایل</Link>}
      />
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      <ProductGrid>
        <MfaSettingsPanel profile={profile} onProfileChange={setProfile} />
      </ProductGrid>
    </AppShell>
  );
}
