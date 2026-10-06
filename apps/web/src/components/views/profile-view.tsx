"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { UserProfile } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { AuthAlert } from "@/components/auth-shell";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { validateDisplayName, validatePassword, validatePhoneOptional, validateUsernameInput } from "@/lib/auth-validation";
import { api, ApiError, clearClientSession, getDevIdentity, setDevIdentity } from "@/lib/api";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { MotionSceneStrip } from "@/components/visual/motion-scene";
import { MfaSettingsPanel } from "@/components/shell/mfa-settings-panel";
import { NotificationPrefsPanel } from "@/components/notification-prefs-panel";
import { t } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav-labels";

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
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [displayUnit, setDisplayUnit] = useState<"rial" | "toman" | "">("");
  const [locale, setLocale] = useState("fa-IR");
  const [timezone, setTimezone] = useState("Asia/Tehran");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [debugVerifyUrl, setDebugVerifyUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyProfile(next: UserProfile) {
    setProfile(next);
    setDisplayName(next.displayName);
    setUsername(next.username ?? "");
    setPhone(next.phone ?? "");
    setDisplayUnit(next.displayUnit ?? "");
    setLocale(next.locale);
    setTimezone(next.timezone);
    setAvatarUrl(next.avatarUrl ?? "");
  }

  useEffect(() => {
    void (async () => {
      try {
        const next = await api.profile();
        applyProfile(next);
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
    const validationError =
      validateDisplayName(displayName) ??
      (username.trim() ? validateUsernameInput(username) : profile?.usernameRequired ? "نام کاربری را انتخاب کنید" : null) ??
      validatePhoneOptional(phone);
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
            ...(username.trim() ? { username: username.trim() } : {}),
            phone: phone.trim() ? phone.trim() : null,
            displayUnit: displayUnit === "" ? null : displayUnit,
          });
          applyProfile(next);
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

  function onChangeEmail() {
    if (!newEmail.trim() || !emailPassword) {
      setError("ایمیل جدید و رمز فعلی لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.changeEmail({
            newEmail: newEmail.trim(),
            currentPassword: emailPassword,
          });
          applyProfile(result.profile);
          setNewEmail("");
          setEmailPassword("");
          setDebugVerifyUrl(result.debugVerifyUrl ?? null);
          setInfo(
            result.debugVerifyUrl
              ? "ایمیل عوض شد؛ لینک تأیید (حالت توسعه) آماده است."
              : "ایمیل عوض شد؛ لینک تأیید ارسال شد.",
          );
          setError(null);
        } catch (err: unknown) {
          setInfo(null);
          setError(err instanceof Error ? err.message : "تغییر ایمیل ناموفق");
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
      <FlashMessages error={error} successMessage={info} />
      <PageHeader
        eyebrow="حساب"
        title="حساب من"
        description="هویت، امنیت و ترجیح‌های شخصی — جدا از خانهٔ فضای کاری."
        actions={
          <>
            <Link href="/home">{NAV_LABELS.spacesList}</Link>
            <Link href="/account/security">امنیت</Link>
            <Link href="/account/privacy">حریم خصوصی</Link>
          </>
        }
      />
      <MotionSceneStrip kind="security" prominence="banner" />
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
                      {formatFaDateTime(profile.createdAt)}
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
                id="profile-username"
                label="نام کاربری"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                hint={
                  profile?.usernameRequired
                    ? "حساب قدیمی است — یک نام کاربری یکتا انتخاب کنید"
                    : "برای پیدا کردن و ورود"
                }
                required={Boolean(profile?.usernameRequired)}
              />
              <TextField
                id="profile-phone"
                label="شماره موبایل"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                hint="اختیاری — تا اتصال SMS تأییدشده اعلام نمی‌شود"
              />
              <SelectField
                id="profile-display-unit"
                label="واحد نمایش مبلغ"
                value={displayUnit}
                onChange={(e) => setDisplayUnit(e.target.value as "rial" | "toman" | "")}
              >
                <option value="">پیروی از فضای کاری (پیش‌فرض ریال)</option>
                <option value="rial">ریال</option>
                <option value="toman">تومان</option>
              </SelectField>
              <TextField
                id="profile-avatar-url"
                label="آدرس تصویر پروفایل"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                hint="اختیاری — URL عمومی تصویر"
              />
              <SelectField
                id="profile-locale"
                label="زبان رابط"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                hint="تقویم و نمایش تاریخ در محصول همیشه شمسی است؛ این فقط زبان متن‌هاست."
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

          {profile?.hasPassword ? (
            <div className="profileFormBlock">
              <p className="profileFormBlock__label">تغییر ایمیل</p>
              <FormStack>
                <TextField
                  id="profile-new-email"
                  label="ایمیل جدید"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  hint="پس از تغییر باید دوباره تأیید شود"
                />
                <TextField
                  id="profile-email-password"
                  label="رمز فعلی"
                  type="password"
                  autoComplete="current-password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                />
                <div className="profileFormBlock__actions">
                  <Button type="button" variant="ghost" onClick={onChangeEmail} disabled={pending}>
                    تغییر ایمیل
                  </Button>
                </div>
              </FormStack>
            </div>
          ) : null}
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

        <SectionCard title={t("privacy.dsar.title")}>
          <StatusLine>{t("privacy.dsar.honestNote")}</StatusLine>
          <EmptyHint>{t("privacy.dsar.noTicket")}</EmptyHint>
          <FormStack>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      const password = window.prompt("برای خروجی داده، رمز فعلی را وارد کنید");
                      if (!password) {
                        setError("خروجی لغو شد — رمز لازم است");
                        return;
                      }
                      const payload = await api.exportMyData({ password });
                      const blob = new Blob([JSON.stringify(payload, null, 2)], {
                        type: "application/json;charset=utf-8",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `dang-account-export-${payload.exportedAt.slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      setInfo("خروجی داده ذخیره شد");
                      setError(null);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خروجی داده ناموفق");
                    }
                  })();
                });
              }}
            >
              {t("privacy.dsar.export")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "حساب ناشناس می‌شود و نشست‌ها باطل می‌گردند. ادامه؟",
                  )
                ) {
                  return;
                }
                const typed = window.prompt('برای تأیید، عبارت DELETE را وارد کنید');
                if (typed !== "DELETE") {
                  setError("حذف لغو شد — عبارت تأیید نادرست بود");
                  return;
                }
                const password = profile?.hasPassword
                  ? window.prompt("رمز فعلی را وارد کنید") ?? ""
                  : undefined;
                if (profile?.hasPassword && !password) {
                  setError("رمز برای حذف حساب لازم است");
                  return;
                }
                startTransition(() => {
                  void (async () => {
                    try {
                      await api.deleteMyAccount({
                        confirm: "DELETE",
                        ...(password ? { password } : {}),
                      });
                      clearClientSession();
                      router.push("/login");
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "حذف حساب ناموفق");
                    }
                  })();
                });
              }}
            >
              {t("privacy.dsar.anonymize")}
            </Button>
          </FormStack>
        </SectionCard>

        <MfaSettingsPanel profile={profile} onProfileChange={setProfile} />
        <NotificationPrefsPanel
          flags={chrome.capabilities?.productFlags}
          emailProvider={chrome.capabilities?.providers?.email}
          onError={(message) => setError(message)}
        />
      </ProductGrid>
    </AppShell>
  );
}
