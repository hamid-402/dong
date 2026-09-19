"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  DeadLetterJob,
  MembershipRole,
  MembershipSummary,
  WorkerJobName,
} from "@dang/contracts";
import { Button } from "@dang/ui";
import {
  EmptyHint,
  EmptyStateBlock,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api, type JobRunResultDto } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { t } from "@/lib/i18n";
import styles from "./jobs-view.module.css";

function formatWhen(iso: string): string {
  return formatFaDateTime(iso);
}

export function JobsDlqView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const jobsMode = chrome.capabilities?.providers?.jobs;

  const [dlq, setDlq] = useState<DeadLetterJob[]>([]);
  const [, setDlqLength] = useState(0);
  const [runs, setRuns] = useState<JobRunResultDto[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [myRole, setMyRole] = useState<MembershipRole | "">("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const redisLive = jobsMode === "redis_queue";
  const jobsLive = redisLive || jobsMode === "inline_stub";
  const persistLabel =
    chrome.capabilities?.persistence?.jobRuns === "postgres"
      ? t("jobs.persistPostgres")
      : t("jobs.persistMemory");

  function refresh() {
    if (!workspaceId || !jobsLive) return;
    startTransition(() => {
      void Promise.all([
        redisLive
          ? api.listDlq(workspaceId)
          : Promise.resolve({ items: [] as DeadLetterJob[], length: 0 }),
        api.listRecentJobs(workspaceId).catch(() => [] as JobRunResultDto[]),
        api.listMembers(workspaceId).catch(() => [] as MembershipSummary[]),
      ])
        .then(([dlqResult, recent, members]) => {
          setDlq(dlqResult.items);
          setDlqLength(dlqResult.length);
          setRuns(recent);
          setSelectedIdx(0);
          setMyRole(
            members.find((m) => m.userId === chrome.actor?.userId)?.role ?? "",
          );
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, t("jobs.loadError")));
        });
    });
  }

  useEffect(() => {
    refresh();
  }, [workspaceId, jobsMode, chrome.actor?.userId]);

  function onReplay() {
    if (!workspaceId || !redisLive) return;
    startTransition(() => {
      void api
        .replayDlq(workspaceId)
        .then((result) => {
          setInfo(
            result.replayed
              ? t("jobs.replayOk", {
                  remaining: result.remaining ?? "—",
                })
              : t("jobs.replayEmpty"),
          );
          refresh();
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, t("jobs.replayError")));
        });
    });
  }

  function onEnqueue(
    name: Extract<
      WorkerJobName,
      | "ledger.rebuild_balances"
      | "recurrence.tick"
      | "analytics.etl"
      | "analytics.threshold"
      | "retention.purge"
    >,
  ) {
    if (!workspaceId) return;
    startTransition(() => {
      void api
        .runJob(workspaceId, name)
        .then((result) => {
          setInfo(`${result.name}: ${result.detail}`);
          refresh();
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, t("jobs.enqueueError")));
        });
    });
  }

  if (!jobsLive) {
    return (
      <EmptyStateBlock
        title={t("jobs.engineOffTitle")}
        description={t("jobs.engineOffBody")}
        sticker="compass"
      />
    );
  }

  const selected = dlq[selectedIdx] ?? null;
  const canEnqueue = myRole === "owner" || myRole === "admin";

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.jobs}
      description={redisLive ? t("jobs.descRedis") : t("jobs.descInline")}
      primaryAction={
        <Button type="button" onClick={refresh} disabled={pending}>
          {t("jobs.refresh")}
        </Button>
      }
      state="ready"
    >
      <div>
      <FlashMessages error={error} successMessage={info} />

      {!workspaceId ? (
        <EmptyHint>{t("jobs.pickWorkspace")}</EmptyHint>
      ) : pending && runs.length === 0 && (!redisLive || dlq.length === 0) ? (
        <ContentSkeleton rows={3} label={t("jobs.loading")} />
      ) : (
        <>
          <SectionCard title={t("jobs.actionsTitle")}>
            <StatusLine>
              {t("jobs.actionsHint", {
                mode: redisLive ? "redis_queue" : "inline_stub",
                persist: persistLabel,
              })}
              {chrome.capabilities?.providers?.ledgerRebuild === "ack_v1"
                ? t("jobs.ledgerAckHint")
                : null}
            </StatusLine>
            {canEnqueue ? (
              <div className={styles.toolbar}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onEnqueue("ledger.rebuild_balances")}
                >
                  {t("jobs.btnLedgerAck")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onEnqueue("recurrence.tick")}
                >
                  {t("jobs.btnRecurrence")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onEnqueue("analytics.etl")}
                >
                  {t("jobs.btnAnalytics")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onEnqueue("analytics.threshold")}
                >
                  هشدار آستانه
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onEnqueue("retention.purge")}
                >
                  {t("jobs.btnRetention")}
                </Button>
              </div>
            ) : (
              <EmptyHint>{t("jobs.enqueueOwnerOnly")}</EmptyHint>
            )}
          </SectionCard>

          {redisLive ? (
          <SectionCard title={t("jobs.dlqTitle")}>
            <div className={styles.toolbar}>
              <StatusLine>{t("jobs.dlqHint")}</StatusLine>
              <Button type="button" onClick={onReplay} disabled={pending || dlq.length === 0}>
                {t("jobs.dlqReplay")}
              </Button>
            </div>

            <div className={styles.masterDetail}>
              <div className={styles.list} aria-label={t("jobs.dlqListAria")}>
                {dlq.length === 0 ? (
                  <EmptyHint>{t("jobs.dlqEmpty")}</EmptyHint>
                ) : (
                  dlq.map((item, index) => (
                    <article
                      key={`${item.job.jobId}-${item.failedAt}`}
                      className={index === selectedIdx ? styles.selected : undefined}
                    >
                      <button
                        type="button"
                        className={styles.rowButton}
                        onClick={() => setSelectedIdx(index)}
                      >
                        <span>{item.job.name}</span>
                        <b>{item.job.jobId}</b>
                        <small>
                          {formatWhen(item.failedAt)} ·{" "}
                          {t("jobs.dlqAttempts", {
                            count: new Intl.NumberFormat("fa-IR").format(item.attempts),
                          })}
                        </small>
                      </button>
                      <StatusPill tone="danger">{t("jobs.failed")}</StatusPill>
                    </article>
                  ))
                )}
              </div>

              <aside className={styles.inspector} aria-label={t("jobs.dlqDetailAria")}>
                {selected ? (
                  <>
                    <header>
                      <strong>{selected.job.name}</strong>
                      <StatusPill tone="danger">DLQ</StatusPill>
                    </header>
                    <dl className={styles.meta}>
                      <div>
                        <dt>{t("jobs.jobId")}</dt>
                        <dd>{selected.job.jobId}</dd>
                      </div>
                      <div>
                        <dt>{t("jobs.workspace")}</dt>
                        <dd>{selected.job.workspaceId}</dd>
                      </div>
                      <div>
                        <dt>{t("jobs.failedAt")}</dt>
                        <dd>{formatWhen(selected.failedAt)}</dd>
                      </div>
                      <div>
                        <dt>{t("jobs.attemptCount")}</dt>
                        <dd>{new Intl.NumberFormat("fa-IR").format(selected.attempts)}</dd>
                      </div>
                      <div>
                        <dt>{t("jobs.error")}</dt>
                        <dd>{selected.error}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <EmptyHint>{t("jobs.pickDlq")}</EmptyHint>
                )}
              </aside>
            </div>
          </SectionCard>
          ) : (
            <StatusLine>{t("jobs.dlqRedisOnlyLine")}</StatusLine>
          )}

          <SectionCard title={t("jobs.recentTitle")}>
            {runs.length === 0 ? (
              <EmptyHint>{t("jobs.recentEmpty")}</EmptyHint>
            ) : (
              <ul className={styles.runs}>
                {runs.map((run) => (
                  <li key={`${run.jobId}-${run.createdAt}`}>
                    <span>{run.name}</span>
                    <StatusPill tone={run.status === "completed" ? "ok" : "warn"}>
                      {run.status === "completed" ? t("jobs.statusDone") : t("jobs.statusAccepted")}
                    </StatusPill>
                    <small>
                      {formatWhen(run.createdAt)} · {run.execution} · {run.detail}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
    </WorkspacePageFrame>
  );
}
