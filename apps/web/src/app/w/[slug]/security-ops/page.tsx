"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipSummary, SecurityEvent } from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import {
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { t } from "@/lib/i18n";

function formatWhen(iso: string): string {
  return formatFaDateTime(iso);
}

export default function WorkspaceSecurityOpsPage() {
  return (
    <WorkspacePageGate page="securityOps">
      <WorkspaceSecurityOpsInner />
    </WorkspacePageGate>
  );
}

function WorkspaceSecurityOpsInner() {
  const chrome = useAppChrome();
  const antifraudLive =
    chrome.capabilities?.providers?.antifraud === "heuristics_v1";
  const makerMode = chrome.capabilities?.providers?.makerChecker ?? "off";
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [category, setCategory] = useState<"fraud" | "access" | "auth" | "">("fraud");
  const [severity, setSeverity] = useState<
    "" | "info" | "low" | "medium" | "high" | "critical"
  >("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [, setMyRole] = useState("");

  function refresh() {
    if (!chrome.workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const [page, members, me] = await Promise.all([
            api.listWorkspaceSecurityEvents(chrome.workspaceId, {
              category: category || undefined,
              severity: severity || undefined,
              limit: 50,
            }),
            api.listMembers(chrome.workspaceId),
            api.me(),
          ]);
          setEvents(page.items);
          setMyRole(
            members.find((m: MembershipSummary) => m.userId === me.actor.userId)
              ?.role ?? "",
          );
          setError(null);
        } catch (err: unknown) {
          setEvents([]);
          setError(
            friendlyErrorMessage(err, t("securityOps.loadError")),
          );
        } finally {
          setLoaded(true);
        }
      })();
    });
  }

  useEffect(() => {
    refresh();
  }, [chrome.workspaceId, category, severity]);

  function onExportJson() {
    if (events.length === 0) {
      setInfo(t("securityOps.exportEmpty"));
      return;
    }
    const blob = new Blob([JSON.stringify({ items: events }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-events-${chrome.workspaceId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setInfo(t("securityOps.exportDone", { count: String(events.length) }));
  }

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.securityOps}
      description={t("securityOps.description")}
      state={!loaded ? "loading" : "ready"}
      loadingLabel={t("common.loading")}
      primaryAction={
        <Button type="button" variant="secondary" disabled={pending || !loaded} onClick={onExportJson}>
          {t("securityOps.exportJson")}
        </Button>
      }
    >
      <FlashMessages error={error} successMessage={info} />
      <ProductGrid>
        <SectionCard title={t("securityOps.filterTitle")}>
          <FormStack>
            <SelectField
              label={t("securityOps.category")}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as "fraud" | "access" | "auth" | "")
              }
            >
              <option value="fraud">{t("securityOps.catFraud")}</option>
              <option value="access">{t("securityOps.catAccess")}</option>
              <option value="auth">{t("securityOps.catAuth")}</option>
              <option value="">{t("securityOps.catAll")}</option>
            </SelectField>
            <SelectField
              label={t("securityOps.severity")}
              value={severity}
              onChange={(e) =>
                setSeverity(
                  e.target.value as
                    | ""
                    | "info"
                    | "low"
                    | "medium"
                    | "high"
                    | "critical",
                )
              }
            >
              <option value="">{t("securityOps.allSeverities")}</option>
              <option value="info">info</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </SelectField>
            <StatusLine>
              {antifraudLive
                ? t("securityOps.antifraudHint")
                : t("securityOps.antifraudOff")}
              {makerMode !== "off"
                ? ` · ${t("securityOps.makerHint", { mode: makerMode })}`
                : ""}
            </StatusLine>
          </FormStack>
        </SectionCard>
        <SectionCard title={t("securityOps.listTitle")}>
          {!loaded ? (
            <ContentSkeleton rows={3} label={t("common.loading")} />
          ) : events.length === 0 ? (
            <EmptyHint>{t("securityOps.empty")}</EmptyHint>
          ) : (
            <ul className="stackList">
              {events.map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.event}</strong>
                  {" · "}
                  {ev.category}/{ev.severity}
                  {" · "}
                  {formatWhen(ev.occurredAt)}
                  {ev.reason ? ` · ${ev.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </ProductGrid>
    </WorkspacePageFrame>
  );
}
