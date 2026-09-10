"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { AccountSessionSummary, UserProfile } from "@dang/contracts";
import { Button } from "@dang/ui";
import { AuthAlert } from "@/components/auth-shell";
import { AppShell } from "@/components/app-shell";
import { ProductGrid, SectionCard, StatusPill } from "@/components/ui-blocks";
import { MfaSettingsPanel } from "@/components/shell/mfa-settings-panel";
import { NotificationPrefsPanel } from "@/components/notification-prefs-panel";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import { api, ApiError, clearClientSession } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useRouter } from "next/navigation";
import styles from "./account-security-view.module.css";

function authModeLabel(mode: UserProfile["authMode"]): string {
  if (mode === "password") return "ایمیل و رمز";
  if (mode === "oidc") return "ورود سازمانی";
  return "هویت توسعه";
}

export function AccountSecurityView() {
  const chrome = useAppChrome();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<AccountSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      try {
        const [nextProfile, nextSessions] = await Promise.all([
          api.profile(),
          api.listSessions(),
        ]);
        setProfile(nextProfile);
        setSessions(nextSessions);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login?next=/account/security");
          return;
        }
        setError(err instanceof Error ? err.message : "بارگذاری ناموفق");
      }
    })();
  }, [router]);

  function revokeAllSessions() {
    if (!window.confirm("همه نشست‌های فعال، شامل همین دستگاه، باطل شوند؟")) return;
    startTransition(() => {
      void api
        .revokeSessions()
        .then(() => {
          clearClientSession();
          router.push("/login");
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "ابطال نشست‌ها ناموفق بود");
        });
    });
  }

  function revokeOneSession(session: AccountSessionSummary) {
    if (!window.confirm(session.current ? "نشست همین دستگاه باطل شود؟" : "این نشست باطل شود؟")) {
      return;
    }
    startTransition(() => {
      void api
        .revokeSession(session.id)
        .then((result) => {
          if (result.currentRevoked) {
            clearClientSession();
            router.push("/login");
            return;
          }
          setSessions((current) => current.filter((item) => item.id !== session.id));
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "ابطال نشست ناموفق بود");
        });
    });
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || "امنیت"}
      userName={profile?.displayName ?? chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <OperationsModuleHeader
        ariaLabel="مرکز امنیت حساب"
        destinations={[
          { key: "profile", label: "پروفایل", href: "/account", active: false },
          { key: "security", label: "امنیت", href: "/account/security", active: true },
          { key: "spaces", label: "فضاهای من", href: "/spaces", active: false },
        ]}
        metrics={[
          {
            label: "MFA",
            value: profile ? (profile.mfaEnabled ? "فعال" : "غیرفعال") : "…",
            detail: profile?.mfaEnrollmentRequired ? "برای نقش مدیریتی الزامی" : "وضعیت حساب",
            tone: profile?.mfaEnabled ? "positive" : "attention",
          },
          {
            label: "ایمیل",
            value: profile ? (profile.emailVerified ? "تأییدشده" : "تأییدنشده") : "…",
            detail: profile?.email ?? "ایمیل ثبت نشده",
            tone: profile?.emailVerified ? "positive" : "attention",
          },
          {
            label: "نشست فعال",
            value: profile ? new Intl.NumberFormat("fa-IR").format(sessions.length) : "…",
            detail: "محاسبه‌شده از session store",
          },
          {
            label: "ورود",
            value: profile ? authModeLabel(profile.authMode) : "…",
            detail: "از حساب جاری",
          },
        ]}
        roleLabel={null}
        persistenceLabel={chrome.persistenceLabel}
        pending={pending || !profile}
        onRefresh={() => {
          startTransition(() => {
            void Promise.all([api.profile(), api.listSessions()])
              .then(([nextProfile, nextSessions]) => {
                setProfile(nextProfile);
                setSessions(nextSessions);
                setError(null);
              })
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "تازه‌سازی امنیت ناموفق بود");
              });
          });
        }}
      />
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      <SectionCard title="دستگاه‌ها و نشست‌های فعال">
        {sessions.length ? (
          <div className={styles.sessions}>
            {sessions.map((session) => (
              <article key={session.id} className={session.current ? styles.currentSession : undefined}>
                <div className={styles.sessionHeading}>
                  <div>
                    <b>{session.current ? "این دستگاه" : "نشست دیگر"}</b>
                    <small>{session.userAgent || "مرورگر گزارش نشده"}</small>
                  </div>
                  <StatusPill tone={session.current ? "ok" : "neutral"}>
                    {session.current ? "جاری" : "فعال"}
                  </StatusPill>
                </div>
                <dl>
                  <div>
                    <dt>IP</dt>
                    <dd>{session.ip || "گزارش نشده"}</dd>
                  </div>
                  <div>
                    <dt>شروع</dt>
                    <dd>{new Intl.DateTimeFormat("fa-IR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(session.createdAt))}</dd>
                  </div>
                  <div>
                    <dt>انقضا</dt>
                    <dd>{new Intl.DateTimeFormat("fa-IR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(session.expiresAt))}</dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => revokeOneSession(session)}
                  disabled={pending}
                >
                  {session.current ? "خروج از این دستگاه" : "ابطال نشست"}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <p className="liveHint">
            نشست کوکی فعالی گزارش نشده است؛ در حالت هویت توسعه این فهرست به‌درستی خالی می‌ماند.
          </p>
        )}
      </SectionCard>
      <SectionCard title="وضعیت امنیت جاری">
        <div className={styles.posture}>
          <div>
            <span>عامل دوم</span>
            <b>{profile?.mfaEnabled ? "محافظت دومرحله‌ای برقرار است" : "عامل دوم فعال نیست"}</b>
            <StatusPill tone={profile?.mfaEnabled ? "ok" : "warn"}>
              {profile?.mfaEnabled ? "فعال" : "نیازمند توجه"}
            </StatusPill>
          </div>
          <div>
            <span>بازیابی هویت</span>
            <b>{profile?.emailVerified ? "ایمیل حساب تأیید شده" : "ایمیل هنوز تأیید نشده"}</b>
            <StatusPill tone={profile?.emailVerified ? "ok" : "warn"}>
              {profile?.emailVerified ? "آماده" : "ناقص"}
            </StatusPill>
          </div>
          <div>
            <span>نشست‌ها</span>
            <b>ابطال سراسری نشست‌ها از backend</b>
            <Button type="button" variant="secondary" size="sm" onClick={revokeAllSessions} disabled={pending}>
              خروج از همه دستگاه‌ها
            </Button>
          </div>
        </div>
        <Link className={styles.profileLink} href="/account">
          تغییر رمز و مشخصات حساب در پروفایل
        </Link>
      </SectionCard>
      <ProductGrid>
        <MfaSettingsPanel profile={profile} onProfileChange={setProfile} />
        <NotificationPrefsPanel
          flags={chrome.capabilities?.productFlags}
          onError={setError}
        />
      </ProductGrid>
    </AppShell>
  );
}
