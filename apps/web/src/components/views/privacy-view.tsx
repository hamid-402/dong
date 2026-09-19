"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { BlockedUserSummary, DirectoryPrivacySettings } from "@dang/contracts";
import { Button } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { api } from "@/lib/api";
import { authErrorMessage, friendlyErrorMessage } from "@/lib/api-errors";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="privacyToggle">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function PrivacyView() {
  const chrome = useAppChrome();
  const socialLive = chrome.capabilities?.providers?.social === "directory_friends_v1";
  const [settings, setSettings] = useState<DirectoryPrivacySettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const [blocksLoaded, setBlocksLoaded] = useState(false);

  function refresh() {
    if (!socialLive) {
      setLoaded(true);
      setBlocksLoaded(true);
      setSettings(null);
      setBlocked([]);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const [next, blocks] = await Promise.all([
            api.getDirectoryPrivacy(),
            api.listBlockedUsers(),
          ]);
          setSettings(next);
          setBlocked(blocks);
          setError(null);
        } catch (err: unknown) {
          setError(authErrorMessage(err, "بارگذاری حریم خصوصی ناموفق بود"));
        } finally {
          setLoaded(true);
          setBlocksLoaded(true);
        }
      })();
    });
  }

  useEffect(() => {
    if (!chrome.ready) return;
    refresh();
  }, [chrome.ready, socialLive]);

  function patch(partial: Partial<DirectoryPrivacySettings>) {
    if (!settings) return;
    startTransition(() => {
      void (async () => {
        try {
          const next = await api.updateDirectoryPrivacy({
            findableByUsername: partial.findableByUsername,
            findableByPhone: partial.findableByPhone,
            allowFriendRequests: partial.allowFriendRequests,
            allowGroupInvites: partial.allowGroupInvites,
          });
          setSettings(next);
          setInfo("تنظیمات ذخیره شد");
          setError(null);
        } catch (err: unknown) {
          setError(authErrorMessage(err, "ذخیره حریم خصوصی ناموفق بود"));
        }
      })();
    });
  }

  function onUnblock(userId: string) {
    startTransition(() => {
      void (async () => {
        try {
          await api.unblockUser(userId);
          setBlocked((prev) => prev.filter((row) => row.userId !== userId));
          setInfo("مسدودسازی برداشته شد");
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "رفع مسدودسازی ناموفق"));
        }
      })();
    });
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || NAV_LABELS.privacy}
      userName={chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <FlashMessages error={error} successMessage={info} />

      <ProductGrid>
        <SectionCard title="قابلیت یافت‌شدن در فهرست" delayClass="delay1">
          {!socialLive ? (
            <EmptyHint>
              ماژول فهرست اجتماعی روی این استقرار فعال نیست (
              <code>providers.social</code>).
            </EmptyHint>
          ) : !loaded ? (
            <ContentSkeleton rows={4} label="در حال خواندن تنظیمات حریم خصوصی…" />
          ) : !settings ? (
            <EmptyHint>
              تنظیمات بارگذاری نشد.{" "}
              <Button type="button" variant="secondary" onClick={refresh} disabled={pending}>
                تلاش دوباره
              </Button>
            </EmptyHint>
          ) : (
            <>
              <StatusLine>
                جست‌وجو فقط با نام کاربری دقیق یا موبایل است — فهرست‌برداری عمومی وجود ندارد.
                ایمیل همیشه از فهرست خارج است.
              </StatusLine>
              <FormStack>
                <ToggleRow
                  id="privacy-username"
                  label="یافت‌شدن با نام کاربری"
                  hint="دیگران می‌توانند با @نام‌کاربری دقیق شما را پیدا کنند"
                  checked={settings.findableByUsername}
                  disabled={pending}
                  onChange={(findableByUsername) => patch({ findableByUsername })}
                />
                <ToggleRow
                  id="privacy-phone"
                  label="یافت‌شدن با شماره موبایل"
                  hint="فقط تطبیق دقیق شماره — بدون پیشنهاد فهرست"
                  checked={settings.findableByPhone}
                  disabled={pending}
                  onChange={(findableByPhone) => patch({ findableByPhone })}
                />
                <ToggleRow
                  id="privacy-friend-req"
                  label="دریافت درخواست دوستی"
                  hint="اگر خاموش باشد، درخواست جدید پذیرفته نمی‌شود"
                  checked={settings.allowFriendRequests}
                  disabled={pending}
                  onChange={(allowFriendRequests) => patch({ allowFriendRequests })}
                />
                <ToggleRow
                  id="privacy-group-invite"
                  label="دعوت به گروه"
                  hint="اجازهٔ دریافت دعوت عضویت از دیگران"
                  checked={settings.allowGroupInvites}
                  disabled={pending}
                  onChange={(allowGroupInvites) => patch({ allowGroupInvites })}
                />
              </FormStack>
              <StatusLine>
                آخرین به‌روزرسانی: {formatFaDateTime(settings.updatedAt)}
              </StatusLine>
            </>
          )}
        </SectionCard>

        <SectionCard title="کاربران مسدودشده" tone="quiet" delayClass="delay2">
          {!socialLive ? (
            <EmptyHint>ماژول اجتماعی فعال نیست — فهرست بلاک در دسترس نیست.</EmptyHint>
          ) : !blocksLoaded ? (
            <ContentSkeleton rows={2} label="در حال خواندن فهرست مسدودشده‌ها…" />
          ) : blocked.length === 0 ? (
            <EmptyHint>
              کسی مسدود نشده است. مسدودسازی از صفحهٔ{" "}
              <Link href="/account/friends">دوستان</Link> روی همان فرد انجام می‌شود.
            </EmptyHint>
          ) : (
            <ul className="profileAtelier__facts">
              {blocked.map((row) => (
                <li key={row.userId}>
                  <small>
                    {row.displayName}
                    {row.username ? ` · @${row.username}` : ""}
                    {" · "}
                    {formatFaDateTime(row.blockedAt)}
                  </small>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onUnblock(row.userId)}
                  >
                    رفع مسدودسازی
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="خروجی داده" tone="quiet" delayClass="delay3">
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
                      setError(friendlyErrorMessage(err, "خروجی داده ناموفق"));
                    }
                  })();
                });
              }}
            >
              دریافت خروجی داده
            </Button>
          </FormStack>
        </SectionCard>
      </ProductGrid>
    </AppShell>
  );
}
