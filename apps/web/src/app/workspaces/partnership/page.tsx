"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AgreementSummary,
  MemberAccountReport,
  MembershipSummary,
  OwnershipShareSummary,
  PeriodLockSummary,
} from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

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

export default function PartnershipPage() {
  const chrome = useAppChrome();
  const [workspaceId, setWorkspaceId] = useState("");
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [agreements, setAgreements] = useState<AgreementSummary[]>([]);
  const [shares, setShares] = useState<OwnershipShareSummary[]>([]);
  const [locks, setLocks] = useState<PeriodLockSummary[]>([]);
  const [report, setReport] = useState<MemberAccountReport | null>(null);
  const [agreementTitle, setAgreementTitle] = useState("قرارداد شراکت پروژه");
  const [contribToman, setContribToman] = useState("100000000");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.listWorkspaces();
        const id = list[0]?.id ?? "";
        setWorkspaceId(id);
        if (id) await refresh(id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "خطا");
      }
    })();
  }, []);

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
    }
  }

  const agreement = agreements[0];
  const self = members[0];
  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="شراکت"
        title="قرارداد و گزارش شرکا"
        description={
          workspaceId
            ? `${agreements.length} قرارداد · ${shares.length} سهم · ${locks.length} قفل دوره`
            : "قرارداد، آورده، سهم مالکیت و گزارش حساب شرکا."
        }
        actions={
          <>
            <Link href="/workspaces">مالی</Link>
            <Link href="/workspaces/procurement">خرید</Link>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}

      {!workspaceId ? (
        <EmptyHint>
          ابتدا فضای کاری بسازید — <Link href="/workspaces">بازگشت به مالی</Link>
        </EmptyHint>
      ) : (
        <ProductGrid>
          <SectionCard title="قرارداد" badge={agreements.length} delayClass="delay1">
            <FormStack>
              <TextField
                label="عنوان"
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
                        effectiveFrom: new Date().toISOString().slice(0, 10),
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refresh(workspaceId);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطا");
                    }
                  })();
                }}
              >
                ثبت قرارداد
              </Button>
            </FormStack>
            {agreements.length === 0 ? (
              <EmptyHint>قراردادی ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {agreements.map((a) => (
                  <DataRow
                    key={a.id}
                    title={a.title}
                    meta={`نسخه ${a.version}`}
                    trailing={<StatusPill tone={statusTone(a.status)}>{a.status}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          {agreement && self ? (
            <SectionCard title="آورده نقدی" delayClass="delay1">
              <FormStack>
                <TextField
                  label="مبلغ (تومان)"
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
                          idempotencyKey: crypto.randomUUID(),
                        });
                        await refresh(workspaceId);
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "خطا");
                      }
                    })();
                  }}
                >
                  ثبت آورده
                </Button>
              </FormStack>
            </SectionCard>
          ) : null}

          {shares.length > 0 ? (
            <SectionCard title="سهم مالکیت" badge={shares.length} delayClass="delay2">
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
            <SectionCard title="گزارش حساب شخص" delayClass="delay2">
              <FormStack>
                <div className="productHeaderActions" style={{ justifyContent: "flex-start" }}>
                  <Button
                    type="button"
                    onClick={() => {
                      void api.memberReport(workspaceId, self.userId).then(setReport);
                    }}
                  >
                    بارگذاری گزارش
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
                        } catch (err: unknown) {
                          setError(err instanceof Error ? err.message : "خطا");
                        }
                      })();
                    }}
                  >
                    خروجی CSV / Excel
                  </Button>
                </div>
              </FormStack>
              {report ? (
                <DataList>
                  <DataRow
                    title={report.displayName}
                    meta="خالص موقعیت"
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
                <EmptyHint>برای دیدن جزئیات، گزارش را بارگذاری کنید.</EmptyHint>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="قفل دوره" badge={locks.length} delayClass="delay3">
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              پس از قفل، ثبت آورده، قرض و برداشت در آن بازه مسدود می‌شود.
            </p>
            <FormStack>
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const today = new Date().toISOString().slice(0, 10);
                      await api.createPeriodLock(workspaceId, {
                        workspaceId,
                        periodStart: `${today.slice(0, 7)}-01`,
                        periodEnd: today,
                        reason: "بستن ماه جاری",
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refresh(workspaceId);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطا");
                    }
                  })();
                }}
              >
                قفل ماه جاری تا امروز
              </Button>
            </FormStack>
            {locks.length === 0 ? (
              <EmptyHint>قفل دوره‌ای ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {locks.map((l) => (
                  <DataRow
                    key={l.id}
                    title={`${l.periodStart} → ${l.periodEnd}`}
                    meta={l.reason ?? undefined}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>
        </ProductGrid>
      )}
    </AppShell>
  );
}
