"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AgreedPriceSummary,
  AgreementSummary,
  MemberAccountReport,
  MembershipSummary,
  OwnershipShareSummary,
  PeriodLockSummary,
} from "@dang/contracts";
import { isReadOnlyRole, resolveDailyLedgerRange } from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { NAV_LABELS } from "@/lib/nav-labels";
import { agreementStatusLabel, membershipRoleLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import type { ComponentProps } from "react";

function downloadCsv(filename: string, content: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "active" || status === "signed") return "ok";
  if (status === "draft") return "warn";
  if (status === "terminated" || status === "cancelled") return "danger";
  return "neutral";
}

export function PartnershipView() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [agreements, setAgreements] = useState<AgreementSummary[]>([]);
  const [shares, setShares] = useState<OwnershipShareSummary[]>([]);
  const [locks, setLocks] = useState<PeriodLockSummary[]>([]);
  const [report, setReport] = useState<MemberAccountReport | null>(null);
  const [agreementTitle, setAgreementTitle] = useState("??????? ????? ?????");
  const [contribToman, setContribToman] = useState("100000000");
  const [agreedPrices, setAgreedPrices] = useState<AgreedPriceSummary[]>([]);
  const [priceTitle, setPriceTitle] = useState("???? ?????? ????");
  const [priceToman, setPriceToman] = useState("45000000");

  const partnerPricesLive =
    chrome.capabilities?.providers?.partnerPrices === "partner_prices_v1";

  function GuardedForm(props: ComponentProps<typeof FormStack>) {
    if (isReadOnlyRole(members.find((m) => m.userId === chrome.actor?.userId)?.role)) {
      return null;
    }
    return <FormStack {...props} />;
  }

  useEffect(() => {
    if (!chrome.ready) return;
    if (!chrome.workspaceId) {
      setWorkspaceId("");
      setLoading(false);
      return;
    }
    setWorkspaceId(chrome.workspaceId);
    setLoading(true);
    void refresh(chrome.workspaceId)
      .then(() => setError(null))
      .catch((err: unknown) => {
        setError(friendlyErrorMessage(err, "???"));
      })
      .finally(() => setLoading(false));
  }, [chrome.workspaceId, chrome.ready]);

  async function refresh(id: string) {
    const [m, a, l] = await Promise.all([
      api.listMembers(id),
      api.listAgreements(id),
      api.listPeriodLocks(id),
    ]);
    setMembers(m);
    setAgreements(a);
    setLocks(l);
    if (a[0]) {
      const s = await api.ownershipShares(id, a[0].id);
      setShares(s);
      if (partnerPricesLive) {
        try {
          const prices = await api.listAgreedPrices(id, a[0].id);
          setAgreedPrices(prices);
        } catch {
          setAgreedPrices([]);
        }
      } else {
        setAgreedPrices([]);
      }
    } else {
      setShares([]);
      setAgreedPrices([]);
    }
  }

  const agreement = agreements[0];
  const self = members[0];
  const pageError = error ?? chrome.error;
  const myRole = members.find((m) => m.userId === chrome.actor?.userId)?.role;
  const readOnly = isReadOnlyRole(myRole);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.partners}
        description="???????? ????? ? ??? ???? ?? ????? ????? ???? ??? � ?? ???? ??????."
        primaryAction={
          workspaceId ? (
            <a href="#partner-agreement-panel">??? ???????</a>
          ) : (
            <Link href="/spaces/new?kind=org">{NAV_LABELS.createSpace}</Link>
          )
        }
        state={!chrome.ready || loading ? "loading" : !workspaceId ? "empty" : "ready"}
        loadingLabel="?? ??? ???????? ???? ????�"
        empty={
          <EmptyStateBlock
            title="????? ?????? ????"
            description="????? ???? ??????? ?? ???????? ??????? ??? ??????? ? ????? ?? ??? ????."
            action={<Link href="/home">{NAV_LABELS.home}</Link>}
          />
        }
      >
        <FlashMessages error={pageError} successMessage={successMessage} />
        {readOnly && workspaceId ? (
          <StatusLine>
            ??? {membershipRoleLabel(myRole)} ??? ?????? ???? � ??? ??????? ? ????? ???? ????.
          </StatusLine>
        ) : null}

        {workspaceId ? (
        <ProductGrid>
          <SectionCard title="???????" badge={agreements.length} delayClass="delay1">
            <div id="partner-agreement-panel" />
            <GuardedForm>
              <TextField
                label="?????"
                value={agreementTitle}
                onChange={(e) => setAgreementTitle(e.target.value)}
              />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await api.createAgreement(workspaceId, {
                        workspaceId,
                        title: agreementTitle,
                        effectiveFrom: todayIsoLocal(),
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("??????? ??? ??");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???"));
                    }
                  })();
                }}
              >
                ??? ???????
              </Button>
            </GuardedForm>
            {agreements.length === 0 ? (
              <EmptyHint>???????? ??? ????.</EmptyHint>
            ) : (
              <DataList>
                {agreements.map((a) => (
                  <DataRow
                    key={a.id}
                    title={a.title}
                    meta={`???? ${a.version}`}
                    trailing={<StatusPill tone={statusTone(a.status)}>{agreementStatusLabel(a.status)}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          {agreement && self ? (
            <SectionCard title="????? ????" delayClass="delay1">
              <GuardedForm>
                <TextField
                  label="???? (?????)"
                  value={contribToman}
                  onChange={(e) => setContribToman(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const toman = Number(contribToman.replaceAll(",", ""));
                        await api.recordContribution(workspaceId, {
                          workspaceId,
                          agreementId: agreement.id,
                          memberUserId: self.userId,
                          kind: "cash",
                          amount: {
                            amountMinor: String(Math.round(toman) * 10),
                            currency: "IRR",
                          },
                          idempotencyKey: newClientId(),
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("????? ??? ??");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "???"));
                      }
                    })();
                  }}
                >
                  ??? ?????
                </Button>
              </GuardedForm>
            </SectionCard>
          ) : null}

          {partnerPricesLive && agreement ? (
            <SectionCard title="???????? ??????" badge={agreedPrices.length} delayClass="delay1">
              <GuardedForm>
                <TextField
                  label="?????"
                  value={priceTitle}
                  onChange={(e) => setPriceTitle(e.target.value)}
                />
                <TextField
                  label="???? (?????)"
                  value={priceToman}
                  onChange={(e) => setPriceToman(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const amount = tomanInputToIrrMinor(priceToman);
                        if (!amount) {
                          setError("???? ??????? ??? (??? ????? / IRR)");
                          return;
                        }
                        await api.createAgreedPrice(workspaceId, agreement.id, {
                          workspaceId,
                          agreementId: agreement.id,
                          title: priceTitle,
                          amount,
                          effectiveFrom: todayIsoLocal(),
                          idempotencyKey: newClientId(),
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("???? ?????? ??? ??");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "???"));
                      }
                    })();
                  }}
                >
                  ??? ???? ??????
                </Button>
              </GuardedForm>
              {agreedPrices.length === 0 ? (
                <EmptyHint>???? ?????? ??? ???? � ?? ???? ????? ???? ???? ?????? ???.</EmptyHint>
              ) : (
                <DataList>
                  {agreedPrices.map((p) => (
                    <DataRow
                      key={p.id}
                      title={p.title}
                      meta={`???? ${p.version} � ?? ${p.effectiveFrom}`}
                      trailing={<Amount irrMinor={p.amount.amountMinor} />}
                    />
                  ))}
                </DataList>
              )}
            </SectionCard>
          ) : agreement ? (
            <SectionCard title="???????? ??????" delayClass="delay1">
              <StatusLine>
                ???? ?????? ???? providers.partnerPrices ????? partner_prices_v1 ???? ????
                ?????? � ???? ????? ???? ???? ?????? ???? ???? ???????.
              </StatusLine>
            </SectionCard>
          ) : null}

          {shares.length > 0 ? (
            <SectionCard title="??? ??????" badge={shares.length} delayClass="delay2">
              <DataList>
                {shares.map((s) => (
                  <DataRow
                    key={s.memberUserId}
                    title={s.displayName}
                    trailing={<StatusPill tone="gold">{s.sharePercent}%</StatusPill>}
                  />
                ))}
              </DataList>
            </SectionCard>
          ) : null}

          {self ? (
            <SectionCard title="????? ???? ???" delayClass="delay2">
              <GuardedForm>
                <div className="productHeaderActions" style={{ justifyContent: "flex-start" }}>
                  <Button
                    type="button"
                    onClick={() => {
                      void api.memberReport(workspaceId, self.userId).then((next) => {
                        setReport(next);
                        setError(null);
                        flashSuccess("????? ???????? ??");
                      });
                    }}
                  >
                    ???????? ?????
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      void (async () => {
                        try {
                          const payload = await api.exportMemberReport(workspaceId, self.userId);
                          downloadCsv(payload.filename, payload.content);
                          setError(null);
                          flashSuccess("???? CSV ?????? ??");
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "???"));
                        }
                      })();
                    }}
                  >
                    ????? CSV / Excel
                  </Button>
                </div>
              </GuardedForm>
              {report ? (
                <DataList>
                  <DataRow
                    title={report.displayName}
                    meta="???? ??????"
                    trailing={<Amount irrMinor={report.netPositionMinor} />}
                  />
                  {report.lines.map((line, i) => (
                    <DataRow
                      key={i}
                      title={line.label}
                      meta={line.category}
                      trailing={<Amount irrMinor={line.amountMinor} />}
                    />
                  ))}
                </DataList>
              ) : (
                <EmptyHint>???? ???? ??????? ????? ?? ???????? ????.</EmptyHint>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="??? ????" badge={locks.length} delayClass="delay3">
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              ?? ?? ???? ??? ?????? ??? ? ?????? ?? ?? ???? ????? ??????.
            </p>
            <GuardedForm>
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const { from, to } = resolveDailyLedgerRange("month");
                      await api.createPeriodLock(workspaceId, {
                        workspaceId,
                        periodStart: from,
                        periodEnd: to,
                        reason: "???? ??? ???? ????",
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("???? ??? ??");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???"));
                    }
                  })();
                }}
              >
                ??? ??? ???? ?? ?????
              </Button>
            </GuardedForm>
            {locks.length === 0 ? (
              <EmptyHint>??? ??????? ??? ????.</EmptyHint>
            ) : (
              <DataList>
                {locks.map((l) => (
                  <DataRow
                    key={l.id}
                    title={`${l.periodStart} ? ${l.periodEnd}`}
                    meta={l.reason ?? undefined}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>
        </ProductGrid>
        ) : null}
      </WorkspacePageFrame>
    </AppShell>
  );
}
