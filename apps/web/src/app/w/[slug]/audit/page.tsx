"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { MembershipSummary } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import { EmptyHint, SectionCard, StatusPill } from "@/components/ui-blocks";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api, type AuditEventDto } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { membershipRoleLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import styles from "./audit.module.css";

type ResultFilter = "all" | AuditEventDto["result"];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
          setError(reason instanceof Error ? reason.message : "بارگذاری تاریخچه ناموفق بود");
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
  const myRole = members.find((member) => member.userId === chrome.actor?.userId)?.role ?? null;
  const successfulCount = events.filter((event) => event.result === "success").length;
  const deniedCount = events.filter((event) => event.result === "denied").length;
  const actorCount = new Set(events.map((event) => event.actorUserId).filter(Boolean)).size;

  return (
    <div>
      <OperationsModuleHeader
        ariaLabel="تاریخچه عملیات فضای کاری"
        destinations={[
          { key: "audit", label: "تاریخچه", href: wPath(scope.slug, "audit"), active: true },
          { key: "settings", label: "تنظیمات", href: wPath(scope.slug, "settings"), active: false },
          { key: "members", label: "اعضا", href: wPath(scope.slug, "members"), active: false },
          { key: "metrics", label: "متریک محصول", href: wPath(scope.slug, "metrics"), active: false },
        ]}
        metrics={[
          {
            label: "کل رخداد",
            value: pending && events.length === 0 ? "—" : new Intl.NumberFormat("fa-IR").format(events.length),
            detail: "از audit store",
          },
          {
            label: "موفق",
            value: pending && events.length === 0 ? "—" : new Intl.NumberFormat("fa-IR").format(successfulCount),
            tone: "positive",
          },
          {
            label: "رد دسترسی",
            value: pending && events.length === 0 ? "—" : new Intl.NumberFormat("fa-IR").format(deniedCount),
            tone: deniedCount ? "attention" : "neutral",
          },
          {
            label: "عامل ثبت‌شده",
            value: pending && events.length === 0 ? "—" : new Intl.NumberFormat("fa-IR").format(actorCount),
            detail: "شناسه‌های یکتای واقعی",
          },
        ]}
        roleLabel={myRole ? membershipRoleLabel(myRole) : null}
        persistenceLabel={chrome.persistenceLabel}
        pending={pending}
        onRefresh={refresh}
      />
      <FlashMessages error={error} />

      {!scope.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : (
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
            {filtered.length ? (
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
              <p className="liveHint">
                {pending ? "در حال بارگذاری رخدادها…" : "رخدادی مطابق این فیلتر ثبت نشده است."}
              </p>
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
              <p className="liveHint">برای مشاهده جزئیات، یک رخداد را انتخاب کنید.</p>
            )}
          </aside>
        </div>
      </SectionCard>
      )}
    </div>
  );
}