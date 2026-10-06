"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { WorkspaceJoinPreview } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import {
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import { NAV_LABELS } from "@/lib/nav-labels";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { wPath } from "@/lib/workspace-paths";

const KIND_FA = {
  personal: "شخصی",
  group: "گروه",
  building: "ساختمان",
  org: "سازمان",
} as const;

function normalizeGroupId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\/join\//i, "")
    .replace(/^\/join\//i, "")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "");
}

/**
 * Authenticated join-by-public-id flow — preview by slug, then POST join-request.
 */
export function JoinGroupView({ initialSlug = "" }: { initialSlug?: string }) {
  // AccountAppFrame provides chrome; optional avoids SSR/Suspense edge throws.
  const chrome = useOptionalAppChrome();
  const router = useRouter();
  const [groupId, setGroupId] = useState(() => normalizeGroupId(initialSlug));
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<WorkspaceJoinPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const workspaces = chrome?.workspaces ?? [];

  useEffect(() => {
    const seed = normalizeGroupId(initialSlug);
    if (!seed) return;
    setGroupId(seed);
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const hit = await api.previewWorkspaceBySlug(seed);
          setPreview(hit);
        } catch (err: unknown) {
          setPreview(null);
          setError(friendlyErrorMessage(err, "جست‌وجوی فضا ناموفق"));
        }
      })();
    });
  }, [initialSlug]);

  function lookup() {
    const slug = normalizeGroupId(groupId);
    if (!slug) {
      setError("شناسه فضا را وارد کنید");
      setPreview(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setSuccess(null);
          setGroupId(slug);
          const hit = await api.previewWorkspaceBySlug(slug);
          setPreview(hit);
        } catch (err: unknown) {
          setPreview(null);
          setError(friendlyErrorMessage(err, "جست‌وجوی فضا ناموفق"));
        }
      })();
    });
  }

  function requestJoin() {
    const slug = normalizeGroupId(preview?.slug || groupId);
    if (!slug) {
      setError("اول شناسه را جست‌وجو کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          await api.createJoinRequest(
            slug,
            { message: message.trim() || undefined },
            newClientId(),
          );
          setSuccess(
            "درخواست عضویت ثبت شد — بعد از تأیید مدیر، این فضا در فهرست فضاهای شما می‌آید.",
          );
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت درخواست عضویت ناموفق"));
        }
      })();
    });
  }

  const alreadyMember = workspaces.some(
    (w) => w.slug === (preview?.slug ?? normalizeGroupId(groupId)),
  );

  return (
    <WorkspacePageFrame
      title="پیوستن با شناسه فضا"
      description="شناسه‌ای که صاحب گروه، ساختمان یا سازمان به شما داده را وارد کنید و درخواست عضویت بفرستید."
      primaryAction={<Link href="/home">{NAV_LABELS.spacesList}</Link>}
      secondaryActions={<Link href="/home">خانه</Link>}
      state="ready"
    >
      <FlashMessages error={error} successMessage={success} />

      <SectionCard title="شناسه فضا" delayClass="delay1">
        <FormStack>
          <TextField
            label="شناسه یا لینک دعوت"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setPreview(null);
              setSuccess(null);
            }}
            hint="مثال: friends-trip یا /join/tower-12 — لینک کامل هم پذیرفته می‌شود"
            dir="ltr"
          />
          <Button type="button" onClick={lookup} disabled={pending || !groupId.trim()}>
            پیدا کردن فضا
          </Button>
        </FormStack>
      </SectionCard>

      {preview ? (
        <SectionCard title="فضا پیدا شد" delayClass="delay2">
          <StatusLine>
            <StatusPill tone="ok">{KIND_FA[preview.spaceKind]}</StatusPill>{" "}
            <strong>{preview.name}</strong>
            {" · "}
            {workspaceTemplateLabel(preview.template)}
            {" · "}
            <code dir="ltr">{preview.slug}</code>
          </StatusLine>
          {alreadyMember ? (
            <EmptyHint>
              شما از قبل عضو این فضا هستید.{" "}
              <button
                type="button"
                className="textButton"
                onClick={() => router.push(wPath(preview.slug))}
              >
                رفتن به خانهٔ{" "}
                {preview.spaceKind === "building"
                  ? "ساختمان"
                  : preview.spaceKind === "org"
                    ? "سازمان"
                    : "گروه"}
              </button>
            </EmptyHint>
          ) : (
            <FormStack>
              <TextField
                label="پیام برای مدیر (اختیاری)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                hint={
                  preview.spaceKind === "building"
                    ? "مثلاً: ساکن واحد ۱۰۱ هستم"
                    : preview.spaceKind === "org"
                      ? "مثلاً: از بخش مالی دعوت شدم"
                      : "مثلاً: حمید دعوتم کرد"
                }
              />
              <Button type="button" onClick={requestJoin} disabled={pending}>
                ارسال درخواست عضویت
              </Button>
            </FormStack>
          )}
        </SectionCard>
      ) : null}

      <StatusLine>
        صاحب فضا شناسه را از صفحهٔ اعضا یا خانه کپی می‌کند. درخواست‌های رسیده آنجا تأیید
        می‌شوند — بعد از تأیید، فضا در فهرست و خانهٔ شما ظاهر می‌شود.
      </StatusLine>
    </WorkspacePageFrame>
  );
}
