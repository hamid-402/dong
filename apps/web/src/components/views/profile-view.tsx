"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { UserProfile } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { AuthAlert } from "@/components/auth-shell";
import { AppShell } from "@/components/app-shell";
import {
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { validateDisplayName, validatePassword } from "@/lib/auth-validation";
import { api, ApiError, clearClientSession, getDevIdentity, setDevIdentity } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { MfaSettingsPanel } from "@/components/shell/mfa-settings-panel";
import { NotificationPrefsPanel } from "@/components/notification-prefs-panel";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";

function authModeLabel(mode: UserProfile["authMode"]): string {
  if (mode === "password") return "ورود با ایمیل";
  if (mode === "oidc") return "ورود سازمانی";
  return "حالت توسعه";
}

export function ProfileView() {
  const router = useRouter();
  const chrome = useAppChrome();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("fa-IR");
  const [timezone, setTimezone] = useState("Asia/Tehran");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [debugVerifyUrl, setDebugVerifyUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      try {
        const next = await api.profile();
        setProfile(next);
        setDisplayName(next.displayName);
        setLocale(next.locale);
        setTimezone(next.timezone);
        setAvatarUrl(next.avatarUrl ?? "");
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login?next=/account");
          return;
        }
        setError(err instanceof Error ? err.message : "بارگذاری پروفایل ناموفق");
      }
    })();
  }, [router]);

  function onSaveProfile() {
    const validationError = validateDisplayName(displayName);
    if (validationError) {
      setError(validationError);
      setInfo(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const next = await api.updateProfile({
            displayName,
            locale,
            timezone,
            avatarUrl: avatarUrl.trim() || null,
          });
          setProfile(next);
          try {
            const session = await api.session();
            if (session.actor) {
              setDevIdentity(session.actor.externalSubject, next.displayName);
            } else {
              const identity = getDevIdentity();
              setDevIdentity(identity.subject, next.displayName);
            }
          } catch {
            const identity = getDevIdentity();
            setDevIdentity(identity.subject, next.displayName);
          }
          chrome.refreshChrome();
          setInfo("تغییرات پروفایل ذخیره شد");
          setError(null);
        } catch (err: unknown) {
          setInfo(null);
          setError(err instanceof Error ? err.message : "ذخیره ناموفق");
        }
      })();
    });
  }

  function onChangePassword() {
    if (!currentPassword) {
      setError("رمز فعلی را وارد کنید");
      return;
    }
    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.changePassword({ currentPassword, newPassword });
          setCurrentPassword("");
          setNewPassword("");
          setInfo("رمز عوض شد — دوباره وارد شوید");
          setError(null);
          await api.logout();
          clearClientSession();
          router.push("/login");
        } catch (err: unknown) {
          setInfo(null);
          setError(err instanceof Error ? err.message : "تغییر رمز ناموفق");
        }
      })();
    });
  }

  function onResendVerification() {
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.resendVerification();
          setDebugVerifyUrl(result.debugVerifyUrl ?? null);
          setInfo(result.debugVerifyUrl ? "لینک تأیید (حالت توسعه) آماده است." : "لینک تأیید ارسال شد");
          setError(null);
        } catch (err: unknown) {
          setInfo(null);
          setDebugVerifyUrl(null);
          setError(err instanceof Error ? err.message : "ارسال ناموفق");
        }
      })();
    });
  }

  function onLogout() {
    startTransition(() => {
      void (async () => {
        await api.logout();
        clearClientSession();
        router.push("/login");
      })();
    });
  }

  const initial = (displayName || profile?.displayName || "ک").slice(0, 1);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || "پروفایل"}
      userName={profile?.displayName ?? chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <OperationsModuleHeader
        ariaLabel="عملیات حساب"
        destinations={[
          { key: "profile", label: "پروفایل", href: "/account", active: true },
          { key: "security", label: "امنیت", href: "/account/security", active: false },
          { key: "spaces", label: "فضاهای من", href: "/spaces", active: false },
        ]}
        metrics={[
          {
            label: "هویت",
            value: profile?.displayName ?? "در حال بارگذاری",
            detail: profile?.email ?? "ایمیل ثبت نشده",
          },
          {
            label: "تأیید ایمیل",
            value: profile ? (profile.emailVerified ? "تأییدشده" : "در انتظار") : "…",
            tone: profile?.emailVerified ? "positive" : "attention",
          },
          {
            label: "تأیید دومرحله‌ای",
            value: profile ? (profile.mfaEnabled ? "فعال" : "غیرفعال") : "…",
            tone: profile?.mfaEnabled ? "positive" : "attention",
          },
          {
            label: "شیوه ورود",
            value: profile ? authModeLabel(profile.authMode) : "…",
            detail: "از نشست احراز‌شده",
          },
        ]}
        roleLabel={null}
        persistenceLabel={chrome.persistenceLabel}
        pending={pending || !profile}
        onRefresh={() => {
          startTransition(() => {
            void api.profile().then((next) => {
              setProfile(next);
              setDisplayName(next.displayName);
              setLocale(next.locale);
              setTimezone(next.timezone);
              setAvatarUrl(next.avatarUrl ?? "");
              setError(null);
            }).catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "تازه‌سازی حساب ناموفق بود");
            });
          });
        }}
      />
      <FlashMessages error={error} successMessage={info} />
      {debugVerifyUrl ? (
        <AuthAlert tone="info">
          <a href={debugVerifyUrl}>تأیید ایمیل</a>
        </AuthAlert>
      ) : null}

      <ProductGrid>
        <SectionCard title="آتلیه هویت" delayClass="delay1">
          <div className="profileAtelier">
            <div
              className="profileAtelier__portrait"
              style={
                avatarUrl.trim()
                  ? { backgroundImage: `url(${avatarUrl.trim()})` }
                  : undefined
              }
              data-has-image={avatarUrl.trim() ? "1" : "0"}
              aria-hidden
            >
              {!avatarUrl.trim() ? <span>{initial}</span> : null}
              <i className="profileAtelier__frame" />
            </div>
            <div className="profileAtelier__copy">
              <span className="profileAtelier__eyebrow">عضو دنگ همکاری</span>
              <h3>{profile?.displayName ?? "…"}</h3>
              <StatusLine>
                {profile?.email ?? "بدون ایمیل"}
                {profile ? (
                  <>
                    {" · "}
                    <StatusPill tone={profile.emailVerified ? "ok" : "warn"}>
                      {profile.emailVerified ? "تأییدشده" : "در انتظار تأیید"}
                    </StatusPill>
                  </>
                ) : null}
              </StatusLine>
              {profile ? (
                <ul className="profileAtelier__facts">
                  <li>
                    <small>شیوه ورود</small>
                    <b>{authModeLabel(profile.authMode)}</b>
                  </li>
                  <li>
                    <small>عضویت از</small>
                    <b>
                      {new Intl.DateTimeFormat("fa-IR", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }).format(new Date(profile.createdAt))}
                    </b>
                  </li>
                  <li>
                    <small>پایداری</small>
                    <b>{chrome.persistenceLabel}</b>
                  </li>
                </ul>
              ) : (
                <p className="liveHint">در حال بارگذاری پروفایل…</p>
              )}
            </div>
          </div>

          {!profile?.emailVerified && profile?.email ? (
            <Button type="button" variant="ghost" size="sm" onClick={onResendVerification} disabled={pending}>
              ارسال مجدد لینک تأیید ایمیل
            </Button>
          ) : null}

          <div className="profileFormBlock">
            <p className="profileFormBlock__label">ویرایش مشخصات</p>
            <FormStack>
              <TextField
                id="profile-display-name"
                label="نام نمایشی"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                hint="در هدر و فضاهای کاری دیده می‌شود"
              />
              <TextField
                id="profile-avatar-url"
                label="آدرس تصویر پروفایل"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                hint="اختیاری — URL عمومی تصویر"
              />
              <SelectField
                id="profile-locale"
                label="زبان / قالب تاریخ"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                <option value="fa-IR">فارسی (ایران)</option>
                <option value="en-US">English (US)</option>
              </SelectField>
              <SelectField
                id="profile-timezone"
                label="منطقه زمانی"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="Asia/Tehran">تهران (Asia/Tehran)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">لندن</option>
                <option value="Europe/Berlin">برلین</option>
              </SelectField>
              <div className="profileFormBlock__actions">
                <Button type="button" onClick={onSaveProfile} disabled={pending || !profile}>
                  {pending ? "در حال ذخیره…" : "ذخیره تغییرات"}
                </Button>
              </div>
            </FormStack>
          </div>
        </SectionCard>

        <SectionCard title="صندوق امنیت" tone="quiet" delayClass="delay2">
          {profile?.hasPassword ? (
            <details className="reportDetails" open>
              <summary>
                <span>تغییر رمز عبور</span>
                <span>محرمانه</span>
              </summary>
              <div className="reportDetails__body">
                <FormStack density="compact">
                  <TextField
                    id="profile-current-password"
                    label="رمز فعلی"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <TextField
                    id="profile-new-password"
                    label="رمز جدید"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    hint="حداقل ۱۰ کاراکتر، شامل حرف و عدد"
                  />
                  <Button type="button" variant="secondary" onClick={onChangePassword} disabled={pending}>
                    به‌روزرسانی رمز
                  </Button>
                </FormStack>
              </div>
            </details>
          ) : (
            <StatusLine>
              این نشست رمز عبور ندارد. برای حساب رمزمحور از{" "}
              <Link href="/register">ثبت‌نام</Link> یا <Link href="/login">ورود</Link> استفاده کنید.
            </StatusLine>
          )}

          <div className="profileLinks">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!window.confirm("همه نشست‌ها در همه دستگاه‌ها باطل شوند؟")) return;
                startTransition(() => {
                  void (async () => {
                    try {
                      await api.revokeSessions();
                      clearClientSession();
                      router.push("/login");
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "ابطال نشست ناموفق");
                    }
                  })();
                });
              }}
              disabled={pending}
            >
              خروج از همه دستگاه‌ها
            </Button>
            <button type="button" className="profileLinks__chip is-danger" onClick={onLogout} disabled={pending}>
              خروج از حساب
            </button>
          </div>
        </SectionCard>

        <MfaSettingsPanel profile={profile} onProfileChange={setProfile} />
        <NotificationPrefsPanel
          flags={chrome.capabilities?.productFlags}
          onError={(message) => setError(message)}
        />
      </ProductGrid>
    </AppShell>
  );
}
