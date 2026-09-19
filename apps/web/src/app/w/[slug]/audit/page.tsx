"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { MembershipSummary } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { EmptyHint, SectionCard, StatusLine, StatusPill } from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api, type AuditEventDto } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { NAV_LABELS } from "@/lib/nav-labels";
import { t } from "@/lib/i18n";
import { formatFaDateTime } from "@/lib/fa-datetime";
import styles from "./audit.module.css";

type ResultFilter = "all" | AuditEventDto["result"];

function formatTimestamp(value: string): string {
  return formatFaDateTime(value);
}

function resultLabel(result: AuditEventDto["result"]): string {
  if (result === "success") return "موفق";
  if (result === "denied") return "رد دسترسی";
  return "ناموفق";
}

function resultTone(result: AuditEventDto["result"]): "ok" | "warn" | "danger" {
  if (result === "success") return "ok";
  if (result === "denied") return "warn";
  return "danger";
}

export default function WorkspaceAuditPage() {
  const scope = useWorkspaceScope();
  const chrome = useAppChrome();
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    if (!scope.workspaceId) return;
    startTransition(() => {
      void Promise.all([
        api.listAuditEvents(scope.workspaceId),
        api.listMembers(scope.workspaceId),
      ])
        .then(([nextEvents, nextMembers]) => {
          const sorted = [...nextEvents].sort(
            (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
          );
          setEvents(sorted);
          setMembers(nextMembers);
          setSelectedId((current) =>
            current && sorted.some((event) => event.id === current)
              ? current
              : sorted[0]?.id ?? null,
          );
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "بارگذاری تاریخچه ناموفق بود"));
        });
    });
  }

  useEffect(() => {
    refresh();
  }, [scope.workspaceId]);

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.userId, member.displayName])),
    [members],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fa");
    return events.filter((event) => {
      if (resultFilter !== "all" && event.result !== resultFilter) return false;
      if (!normalized) return true;
      const actorName = event.actorUserId ? memberNames.get(event.actorUserId) ?? "" : "";
      return [
        event.action,
        event.targetType,
        event.targetId,
        event.reason,
        actorName,
      ].some((value) => value?.toLocaleLowerCase("fa").includes(normalized));
    });
  }, [events, memberNames, query, resultFilter]);
  const selected = events.find((event) => event.id === selectedId) ?? null;

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.audit}
      description="رخدادهای واقعی audit همین فضا — فیلتر و جزئیات بدون دادهٔ نمایشی."
      primaryAction={
        <Button type="button" onClick={refresh} disabled={pending || !scope.workspaceId}>
          {pending ? "در حال همگام‌سازی…" : "تازه‌سازی"}
        </Button>
      }
      state={
        !scope.workspaceId
          ? "empty"
          : pending && events.length === 0
            ? "loading"
            : error && events.length === 0
              ? "error"
              : "ready"
      }
      loadingLabel="در حال بارگذاری رخدادها…"
      skeletonRows={4}
      empty={<EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>}
      error={
        <StatusLine>
          {error}{" "}
          <Button type="button" variant="secondary" onClick={refresh} disabled={pending}>
            تلاش دوباره
          </Button>
        </StatusLine>
      }
    >
      <FlashMessages error={error} />
      {chrome.capabilities ? (
        <StatusLine>
          {t("audit.integrityHint", {
            mode: chrome.capabilities.providers?.auditIntegrity ?? "—",
          })}
        </StatusLine>
      ) : null}

      {scope.workspaceId ? (
      <SectionCard title="جستجو و بازبینی رخدادها">
        <div className={styles.filters}>
          <TextField
            id="audit-search"
            label="جستجو در عملیات، هدف یا عامل"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <SelectField
            id="audit-result"
            label="نتیجه عملیات"
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value as ResultFilter)}
          >
            <option value="all">همه نتایج</option>
            <option value="success">موفق</option>
            <option value="denied">رد دسترسی</option>
            <option value="failure">ناموفق</option>
          </SelectField>
        </div>

        <div className={styles.masterDetail}>
          <div className={styles.eventList} aria-label="فهرست رخدادهای audit">
            {pending && events.length === 0 ? (
              <ContentSkeleton rows={4} label="در حال بارگذاری رخدادها…" />
            ) : filtered.length ? (
              filtered.map((event) => (
                <article
                  key={event.id}
                  className={event.id === selectedId ? styles.selected : undefined}
                >
                  <div>
                    <span>{event.action.replaceAll(".", " / ")}</span>
                    <b>{event.targetType}{event.targetId ? ` · ${event.targetId}` : ""}</b>
                    <small>
                      {event.actorUserId
                        ? memberNames.get(event.actorUserId) ?? event.actorUserId
                        : "عامل سیستمی"}
                      {" · "}
                      {formatTimestamp(event.occurredAt)}
                    </small>
                  </div>
                  <div className={styles.rowActions}>
                    <StatusPill tone={resultTone(event.result)}>
                      {resultLabel(event.result)}
                    </StatusPill>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedId(event.id)}
                    >
                      جزئیات
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyHint>رخدادی مطابق این فیلتر ثبت نشده است.</EmptyHint>
            )}
          </div>

          <aside className={styles.inspector} aria-label="جزئیات رخداد انتخاب‌شده">
            {selected ? (
              <>
                <header>
                  <div>
                    <span>رخداد انتخاب‌شده</span>
                    <h3>{selected.action}</h3>
                  </div>
                  <StatusPill tone={resultTone(selected.result)}>
                    {resultLabel(selected.result)}
                  </StatusPill>
                </header>
                <dl>
                  <div><dt>زمان</dt><dd>{formatTimestamp(selected.occurredAt)}</dd></div>
                  <div><dt>عامل</dt><dd>{selected.actorUserId ? memberNames.get(selected.actorUserId) ?? selected.actorUserId : "عامل سیستمی"}</dd></div>
                  <div><dt>نوع هدف</dt><dd>{selected.targetType}</dd></div>
                  <div><dt>شناسه هدف</dt><dd>{selected.targetId ?? "ثبت نشده"}</dd></div>
                  <div><dt>Request ID</dt><dd>{selected.requestId ?? "ثبت نشده"}</dd></div>
                  <div><dt>علت</dt><dd>{selected.reason ?? "ثبت نشده"}</dd></div>
                </dl>
                <section>
                  <b>فراداده ثبت‌شده</b>
                  {selected.metadata && Object.keys(selected.metadata).length ? (
                    <dl>
                      {Object.entries(selected.metadata).map(([key, value]) => (
                        <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
                      ))}
                    </dl>
                  ) : (
                    <p>فراداده‌ای برای این رخداد ثبت نشده است.</p>
                  )}
                </section>
              </>
            ) : (
              <EmptyHint>برای مشاهده جزئیات، یک رخداد را انتخاب کنید.</EmptyHint>
            )}
          </aside>
        </div>
      </SectionCard>
      ) : null}
    </WorkspacePageFrame>
  );
}