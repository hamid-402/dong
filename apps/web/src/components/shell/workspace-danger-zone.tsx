"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { MembershipRole, WorkspaceSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { AppModal } from "@/components/ui/app-modal";
import { StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { membershipRoleLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
import styles from "./workspace-danger-zone.module.css";
import {
  archiveConsequences,
  dangerZoneActions,
  leaveConsequences,
  slugConfirmState,
  softDeleteConsequences,
  type LifecycleConsequence,
} from "./workspace-danger-zone-actions";

type ConfirmKind = "leave" | "archive" | "unarchive" | "delete" | null;

export type WorkspaceDangerZoneProps = {
  workspace: WorkspaceSummary;
  role: MembershipRole | null;
  slug: string;
  /** Active members (excl. disabled) — from settings load. */
  activeMemberCount?: number;
  /** Pending ownership transfer exists. */
  pendingTransfer?: boolean;
  onWorkspaceChange?: (next: WorkspaceSummary) => void;
  onSuccess?: (message: string) => void;
};

function ConsequenceLists({ data }: { data: LifecycleConsequence }) {
  return (
    <div className={styles.consequenceGrid}>
      <div className={styles.consequenceCol} data-kind="lose">
        <p className={styles.consequenceTitle}>از دست می‌دهید</p>
        <ul>
          {data.lose.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className={styles.consequenceCol} data-kind="keep">
        <p className={styles.consequenceTitle}>حفظ می‌شود</p>
        <ul>
          {data.keep.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Role-aware lifecycle controls with severity ladder, consequence previews,
 * and typed soft-delete confirm — no fake status, API-backed only.
 */
export function WorkspaceDangerZone({
  workspace,
  role,
  slug,
  activeMemberCount,
  pendingTransfer = false,
  onWorkspaceChange,
  onSuccess,
}: WorkspaceDangerZoneProps) {
  const chrome = useAppChrome();
  const router = useRouter();
  const ackId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [leaveReason, setLeaveReason] = useState("");
  const [deleteSlug, setDeleteSlug] = useState("");
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteUnlocked, setDeleteUnlocked] = useState(false);

  const archived = Boolean(workspace.archivedAt);
  const gates = dangerZoneActions({
    template: workspace.template,
    role,
    archived,
  });
  const isOwner = gates.showOwnerLifecycle;
  const isMember = gates.showLeave;
  const slugState = slugConfirmState(deleteSlug, workspace.slug);
  const memberLabel =
    activeMemberCount != null
      ? `${activeMemberCount.toLocaleString("fa-IR")} عضو فعال`
      : null;

  function closeModal() {
    if (pending) return;
    setConfirm(null);
    setLeaveReason("");
    setDeleteSlug("");
    setDeleteAck(false);
    setError(null);
  }

  function afterLifecycle(message: string, goHome: boolean) {
    setError(null);
    setConfirm(null);
    setDeleteUnlocked(false);
    chrome.refreshChrome();
    onSuccess?.(message);
    if (goHome) router.push("/home");
  }

  function runLeave() {
    startTransition(() => {
      void api
        .leaveWorkspace(workspace.id, {
          reason: leaveReason.trim() || undefined,
        })
        .then(() => afterLifecycle("از فضا خارج شدید", true))
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "خروج از فضا ناموفق بود"));
        });
    });
  }

  function runArchive() {
    startTransition(() => {
      void api
        .archiveWorkspace(workspace.id)
        .then(() => afterLifecycle("فضا بایگانی شد", true))
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "بایگانی ناموفق بود"));
        });
    });
  }

  function runUnarchive() {
    startTransition(() => {
      void api
        .unarchiveWorkspace(workspace.id)
        .then((next) => {
          setConfirm(null);
          setError(null);
          chrome.refreshChrome();
          onWorkspaceChange?.(next);
          onSuccess?.("فضا از بایگانی بازگردانده شد");
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "بازگردانی ناموفق بود"));
        });
    });
  }

  function runDelete() {
    if (slugState !== "match" || !deleteAck) return;
    startTransition(() => {
      void api
        .softDeleteWorkspace(workspace.id, {
          confirmSlug: deleteSlug.trim().toLowerCase(),
        })
        .then(() => afterLifecycle("فضا حذف شد", true))
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "حذف فضا ناموفق بود"));
        });
    });
  }

  if (gates.personalProtected) {
    return (
      <section className={styles.zone} id="danger" data-state="protected" aria-labelledby="danger-title">
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>چرخهٔ عمر · محافظت‌شده</p>
            <h2 id="danger-title" className={styles.title}>
              دفتر شخصی قفل است
            </h2>
            <p className={styles.lead}>
              ترک، بایگانی و حذف برای فضای شخصی تعریف نشده — این دفتر به هویت حساب شما
              گره خورده و نباید از بین برود.
            </p>
          </div>
          {role ? (
            <span className={styles.rolePill}>{membershipRoleLabel(role)}</span>
          ) : null}
        </header>
        <ol className={styles.shieldList}>
          <li>یک دفتر شخصی برای هر کاربر</li>
          <li>بدون ترک عضویت یا soft-delete</li>
          <li>مدیریت از مسیر مالی شخصی، نه منطقهٔ خطر</li>
        </ol>
      </section>
    );
  }

  return (
    <section
      className={styles.zone}
      id="danger"
      data-state={archived ? "archived" : "active"}
      aria-labelledby="danger-title"
    >
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>چرخهٔ عمر · منطقهٔ خطر</p>
          <h2 id="danger-title" className={styles.title}>
            اقدامات برگشت‌پذیر و برگشت‌ناپذیر
          </h2>
          <p className={styles.lead}>
            شدت از توصیه تا حذف نرم. فقط گزینه‌های مجاز نقش «
            {role ? membershipRoleLabel(role) : "…"}» نمایش داده می‌شود.
          </p>
        </div>
        <div className={styles.headMeta}>
          {role ? (
            <span className={styles.rolePill}>{membershipRoleLabel(role)}</span>
          ) : null}
          {memberLabel ? <span className={styles.metaChip}>{memberLabel}</span> : null}
          {pendingTransfer ? (
            <span className={styles.metaChip} data-tone="warn">
              انتقال مالکیت در انتظار
            </span>
          ) : null}
        </div>
      </header>

      <ol className={styles.ladder} aria-label="نردبان شدت">
        <li data-active={isOwner || undefined}>
          <span>۱</span>
          انتقال مالکیت
        </li>
        <li data-active={isOwner || undefined}>
          <span>۲</span>
          بایگانی
        </li>
        <li data-active={isMember || undefined}>
          <span>۳</span>
          ترک عضویت
        </li>
        <li data-active={isOwner || undefined} data-severe="">
          <span>۴</span>
          حذف نرم
        </li>
      </ol>

      {archived ? (
        <div className={styles.banner} role="status">
          <strong>وضعیت: بایگانی‌شده</strong>
          <span>
            از {new Date(workspace.archivedAt!).toLocaleString("fa-IR")} — اعضا فضا را در
            فهرست نمی‌بینند؛ دفترکل و audit حفظ شده است.
          </span>
        </div>
      ) : null}

      {error && !confirm ? <p className={styles.inlineError}>{error}</p> : null}

      <div className={styles.actions}>
        {isOwner ? (
          <article className={styles.card} data-tone="transfer" data-step="1">
            <div className={styles.stepBadge} aria-hidden>
              ۱
            </div>
            <div className={styles.cardCopy}>
              <div className={styles.cardTitleRow}>
                <h3>انتقال مالکیت</h3>
                <span className={styles.severity} data-level="recommend">
                  توصیه‌شده
                </span>
              </div>
              <p>
                قبل از ترک یا حذف، مالکیت را به عضو دیگری بسپارید. تا وقتی تنها مالک
                هستید نمی‌توانید خارج شوید.
                {pendingTransfer
                  ? " یک پیشنهاد انتقال هم‌اکنون در انتظار پذیرش است."
                  : ""}
              </p>
            </div>
            <Link
              className={styles.linkBtn}
              href={`${wPath(slug, "members")}#ownership-transfer`}
            >
              {pendingTransfer ? "مشاهدهٔ انتقال" : "اعضا و انتقال"}
            </Link>
          </article>
        ) : null}

        {isOwner && !archived ? (
          <article className={styles.card} data-tone="archive" data-step="2">
            <div className={styles.stepBadge} aria-hidden>
              ۲
            </div>
            <div className={styles.cardCopy}>
              <div className={styles.cardTitleRow}>
                <h3>بایگانی فضا</h3>
                <span className={styles.severity} data-level="caution">
                  قابل بازگردانی
                </span>
              </div>
              <p>
                فضا از فهرست اعضا پنهان می‌شود؛ دادهٔ مالی و audit می‌ماند. مناسب وقتی
                پروژه تمام شده ولی حذف لازم نیست.
                {memberLabel ? ` · ${memberLabel}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirm("archive");
              }}
            >
              بایگانی
            </Button>
          </article>
        ) : null}

        {isOwner && gates.showUnarchive ? (
          <article className={styles.card} data-tone="restore" data-step="2">
            <div className={styles.stepBadge} aria-hidden>
              ۲
            </div>
            <div className={styles.cardCopy}>
              <div className={styles.cardTitleRow}>
                <h3>بازگردانی از بایگانی</h3>
                <span className={styles.severity} data-level="recommend">
                  ایمن
                </span>
              </div>
              <p>فضا دوباره در فهرست اعضا ظاهر می‌شود و ویرایش مشخصات آزاد می‌گردد.</p>
            </div>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirm("unarchive");
              }}
            >
              بازگردانی
            </Button>
          </article>
        ) : null}

        {isMember ? (
          <article className={styles.card} data-tone="leave" data-step="3">
            <div className={styles.stepBadge} aria-hidden>
              ۳
            </div>
            <div className={styles.cardCopy}>
              <div className={styles.cardTitleRow}>
                <h3>ترک عضویت</h3>
                <span className={styles.severity} data-level="caution">
                  قطع دسترسی
                </span>
              </div>
              <p>
                عضویت شما soft-disable می‌شود؛ تاریخچه در دفترکل می‌ماند.
                {role === "finance" || role === "deputy_finance"
                  ? " اگر آخرین مدیر مالی باشید، تا انتقال نقش نمی‌توانید خارج شوید."
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !role}
              onClick={() => {
                setError(null);
                setConfirm("leave");
              }}
            >
              خروج از فضا
            </Button>
          </article>
        ) : null}

        {isOwner ? (
          <article
            className={styles.card}
            data-tone="delete"
            data-step="4"
            data-expanded={deleteUnlocked || undefined}
          >
            <div className={styles.stepBadge} aria-hidden>
              ۴
            </div>
            <div className={styles.cardCopy}>
              <div className={styles.cardTitleRow}>
                <h3>حذف نرم</h3>
                <span className={styles.severity} data-level="severe">
                  برگشت‌ناپذیر در UI
                </span>
              </div>
              <p>
                فضا از همهٔ فهرست‌ها حذف می‌شود. برای تأیید باید شناسهٔ{" "}
                <code>{workspace.slug}</code> را تایپ کنید. حذف سخت نیست — رکورد برای
                بازیابی سیستمی می‌ماند.
              </p>
              {!deleteUnlocked ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setDeleteUnlocked(true)}
                >
                  نمایش کنترل حذف…
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    setDeleteSlug("");
                    setDeleteAck(false);
                    setConfirm("delete");
                  }}
                >
                  ادامه به حذف
                </Button>
              )}
            </div>
          </article>
        ) : null}

        {!role ? (
          <StatusLine>نقش شما هنوز بارگذاری نشده — اقدامات خطرناک غیرفعال‌اند.</StatusLine>
        ) : null}

        {!isOwner && !isMember && role ? (
          <StatusLine>
            برای نقش «{membershipRoleLabel(role)}» اقدام ترک/حذف در این پنل تعریف نشده —
            از مالک بخواهید نقش را ارتقا دهد یا شما را به مسیر اعضا هدایت کند.
          </StatusLine>
        ) : null}
      </div>

      <AppModal
        open={confirm === "leave"}
        ariaLabel="تأیید ترک عضویت"
        title="ترک این فضا؟"
        onClose={closeModal}
        panelClassName={styles.modalPanel}
      >
        <p className={styles.modalLead}>
          بعد از خروج به «{workspace.name}» دسترسی ندارید مگر دوباره دعوت شوید.
        </p>
        <ConsequenceLists data={leaveConsequences()} />
        <TextField
          id="leave-reason"
          label="دلیل (اختیاری — در audit ثبت می‌شود)"
          value={leaveReason}
          onChange={(e) => setLeaveReason(e.target.value)}
          disabled={pending}
        />
        {error ? <p className={styles.inlineError}>{error}</p> : null}
        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={closeModal} disabled={pending}>
            انصراف
          </Button>
          <Button type="button" onClick={runLeave} disabled={pending}>
            {pending ? "…" : "تأیید ترک عضویت"}
          </Button>
        </div>
      </AppModal>

      <AppModal
        open={confirm === "archive"}
        ariaLabel="تأیید بایگانی فضا"
        title="بایگانی این فضا؟"
        onClose={closeModal}
        panelClassName={styles.modalPanel}
      >
        <p className={styles.modalLead}>
          اعضا فضا را در فهرست نمی‌بینند. شما به‌عنوان مالک می‌توانید بعداً بازگردانید.
        </p>
        <ConsequenceLists data={archiveConsequences()} />
        {error ? <p className={styles.inlineError}>{error}</p> : null}
        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={closeModal} disabled={pending}>
            انصراف
          </Button>
          <Button type="button" onClick={runArchive} disabled={pending}>
            {pending ? "…" : "بایگانی کن"}
          </Button>
        </div>
      </AppModal>

      <AppModal
        open={confirm === "unarchive"}
        ariaLabel="تأیید بازگردانی فضا"
        title="بازگردانی از بایگانی؟"
        onClose={closeModal}
      >
        <p className={styles.modalLead}>فضا دوباره در فهرست اعضا ظاهر می‌شود.</p>
        {error ? <p className={styles.inlineError}>{error}</p> : null}
        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={closeModal} disabled={pending}>
            انصراف
          </Button>
          <Button type="button" onClick={runUnarchive} disabled={pending}>
            {pending ? "…" : "بازگردانی"}
          </Button>
        </div>
      </AppModal>

      <AppModal
        open={confirm === "delete"}
        ariaLabel="تأیید حذف نرم فضا"
        title="حذف نرم این فضا؟"
        onClose={closeModal}
        panelClassName={`${styles.modalPanel} ${styles.deletePanel}`}
      >
        <p className={styles.modalLead}>
          این آخرین پله است. شناسه را عیناً بنویسید:{" "}
          <strong className={styles.slugTarget}>{workspace.slug}</strong>
        </p>
        <ConsequenceLists data={softDeleteConsequences()} />
        <label className={styles.ack} htmlFor={ackId}>
          <input
            id={ackId}
            type="checkbox"
            checked={deleteAck}
            disabled={pending}
            onChange={(e) => setDeleteAck(e.target.checked)}
          />
          <span>
            می‌دانم اعضا دیگر به این فضا دسترسی عملیاتی نخواهند داشت و دعوت جدید ممکن
            نیست.
          </span>
        </label>
        <TextField
          id="delete-confirm-slug"
          label="تأیید شناسهٔ مسیر"
          value={deleteSlug}
          onChange={(e) => setDeleteSlug(e.target.value)}
          disabled={pending || !deleteAck}
          autoComplete="off"
          hint={
            slugState === "match"
              ? "شناسه مطابقت دارد"
              : slugState === "mismatch"
                ? "شناسه هنوز یکی نیست"
                : "پس از پذیرش بالا، شناسه را تایپ کنید"
          }
        />
        <div
          className={styles.matchMeter}
          data-state={slugState}
          aria-hidden
        />
        {error ? <p className={styles.inlineError}>{error}</p> : null}
        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={closeModal} disabled={pending}>
            انصراف
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={runDelete}
            disabled={pending || !deleteAck || slugState !== "match"}
          >
            {pending ? "…" : "حذف نرم قطعی"}
          </Button>
        </div>
      </AppModal>
    </section>
  );
}
