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
import { isReadOnlyRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
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
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { hubPathFor } from "@/lib/hub-links";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { agreementStatusLabel, membershipRoleLabel } from "@/lib/status-labels";
import { t } from "@/lib/i18n";
import { useFlashMessage } from "@/lib/use-flash-message";
import { MotionSceneStrip } from "@/components/visual/motion-scene";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
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
  const [agreementTitle, setAgreementTitle] = useState("قرارداد شراکت پروژه");
  const [contribToman, setContribToman] = useState("100000000");
  const [loanToman, setLoanToman] = useState("1000000");
  const [loanBorrowerId, setLoanBorrowerId] = useState("");
  const [agreedPrices, setAgreedPrices] = useState<AgreedPriceSummary[]>([]);
  const [priceTitle, setPriceTitle] = useState("قیمت توافقی پایه");
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
        setError(friendlyErrorMessage(err, "خطا"));
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
  const workspace = chrome.workspaces.find((item) => item.id === workspaceId);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      {pageError ? <p className="liveError">{pageError}</p> : null}
      <MotionSceneStrip kind="partners" />
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}
      {workspaceId && workspace ? (
        <OperationsModuleHeader
          ariaLabel={t("partners.opsAria")}
          destinations={[
            { key: "partners", label: t("nav.partners"), href: wPath(workspace.slug, "partners"), active: true },
            { key: "expenses", label: t("nav.expenses"), href: wPath(workspace.slug, "expenses"), active: false },
            { key: "procurement", label: t("nav.procurement"), href: wPath(workspace.slug, "procurement"), active: false },
            { key: "members", label: t("nav.members"), href: wPath(workspace.slug, "members"), active: false },
          ]}
          metrics={[
            {
              label: t("partners.metricAgreement"),
              value: String(agreements.length),
              detail: t("partners.metricActive", {
                count: agreements.filter((item) => item.status === "active").length,
              }),
            },
            {
              label: t("partners.metricShares"),
              value: String(shares.length),
              detail: agreement ? agreement.title : t("partners.metricNoAgreement"),
            },
            {
              label: t("partners.metricLocks"),
              value: String(locks.length),
              detail: t("partners.metricLocksDetail"),
            },
            {
              label: t("partners.metricReport"),
              value: report ? t("partners.metricReportLoaded") : t("partners.metricReportReady"),
              detail: self?.displayName ?? t("partners.metricNoMember"),
              tone: report ? "positive" : "neutral",
            },
          ]}
          roleLabel={myRole ? membershipRoleLabel(myRole) : null}
          persistenceLabel={chrome.persistenceLabel}
          pending={loading}
          onRefresh={() => {
            setLoading(true);
            void refresh(workspaceId)
              .catch((reason: unknown) => setError(friendlyErrorMessage(reason, "تازه‌سازی شرکا ناموفق")))
              .finally(() => setLoading(false));
          }}
        />
      ) : null}
      {readOnly && workspaceId ? (
        <StatusLine>
          نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ثبت قرارداد و آورده فعال نیست.
        </StatusLine>
      ) : null}

      {loading ? (
        <EmptyHint>{t("partners.loading")}</EmptyHint>
      ) : !workspaceId ? (
        <EmptyHint>
          ابتدا فضای کاری بسازید — <Link href={hubPathFor("/workspaces")}>بازگشت به مالی</Link>
        </EmptyHint>
      ) : (
        <ProductGrid>
          <SectionCard title={t("partners.sectionAgreement")} badge={agreements.length} delayClass="delay1">
            <GuardedForm>
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
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("قرارداد ثبت شد");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "خطا"));
                    }
                  })();
                }}
              >
                ثبت قرارداد
              </Button>
            </GuardedForm>
            {agreements.length === 0 ? (
              <EmptyStateBlock
                title={t("partners.emptyAgreements")}
                sticker="handshake"
              />
            ) : (
              <DataList>
                {agreements.map((a) => (
                  <DataRow
                    key={a.id}
                    title={a.title}
                    meta={`نسخه ${a.version}`}
                    trailing={<StatusPill tone={statusTone(a.status)}>{agreementStatusLabel(a.status)}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          {agreement && self ? (
            <SectionCard title={t("partners.sectionCashIn")} delayClass="delay1">
              <GuardedForm>
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
                          idempotencyKey: newClientId(),
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("آورده ثبت شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "خطا"));
                      }
                    })();
                  }}
                >
                  ثبت آورده
                </Button>
              </GuardedForm>
            </SectionCard>
          ) : null}

          {agreement && self && !readOnly ? (
            <SectionCard title={t("partners.sectionLoan")} delayClass="delay1">
              <GuardedForm>
                <TextField
                  label="مبلغ (تومان)"
                  value={loanToman}
                  onChange={(e) => setLoanToman(e.target.value)}
                />
                <SelectField
                  label="قرض‌گیرنده"
                  value={loanBorrowerId}
                  onChange={(e) => setLoanBorrowerId(e.target.value)}
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </SelectField>
                <Button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const amount = tomanInputToIrrMinor(loanToman);
                        if (!amount) {
                          setError("مبلغ نامعتبر است");
                          return;
                        }
                        const borrower =
                          loanBorrowerId ||
                          members.find((m) => m.userId !== self.userId)?.userId ||
                          self.userId;
                        await api.recordPartnerLoan(workspaceId, {
                          workspaceId,
                          agreementId: agreement.id,
                          lenderUserId: self.userId,
                          borrowerUserId: borrower,
                          principal: amount,
                          idempotencyKey: newClientId(),
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("قرض شریک ثبت شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "ثبت قرض ناموفق"));
                      }
                    })();
                  }}
                >
                  ثبت قرض (من قرض می‌دهم)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void (async () => {
                      try {
                        const amount = tomanInputToIrrMinor(loanToman);
                        if (!amount) {
                          setError("مبلغ نامعتبر است");
                          return;
                        }
                        await api.recordWithdrawal(workspaceId, {
                          workspaceId,
                          agreementId: agreement.id,
                          memberUserId: self.userId,
                          amount,
                          idempotencyKey: newClientId(),
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("برداشت ثبت شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "ثبت برداشت ناموفق"));
                      }
                    })();
                  }}
                >
                  ثبت برداشت من
                </Button>
              </GuardedForm>
            </SectionCard>
          ) : null}

          {partnerPricesLive && agreement ? (
            <SectionCard title={t("partners.sectionPrices")} badge={agreedPrices.length} delayClass="delay1">
              <GuardedForm>
                <TextField
                  label="عنوان"
                  value={priceTitle}
                  onChange={(e) => setPriceTitle(e.target.value)}
                />
                <TextField
                  label="مبلغ (تومان)"
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
                          setError("مبلغ نامعتبر است (عدد تومان / IRR)");
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
                        flashSuccess("قیمت توافقی ثبت شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "خطا"));
                      }
                    })();
                  }}
                >
                  ثبت قیمت توافقی
                </Button>
              </GuardedForm>
              {agreedPrices.length === 0 ? (
                <EmptyHint>{t("partners.emptyPrices")}</EmptyHint>
              ) : (
                <DataList>
                  {agreedPrices.map((p) => (
                    <DataRow
                      key={p.id}
                      title={p.title}
                      meta={`نسخه ${p.version} · از ${p.effectiveFrom}`}
                      trailing={<Amount irrMinor={p.amount.amountMinor} />}
                    />
                  ))}
                </DataList>
              )}
            </SectionCard>
          ) : agreement ? (
            <SectionCard title={t("partners.sectionPrices")} delayClass="delay1">
              <StatusLine>
                قیمت توافقی وقتی providers.partnerPrices برابر partner_prices_v1 باشد در دسترس
                است — بدون آن فرم ساخت قیمت نشان داده نمی‌شود.
              </StatusLine>
            </SectionCard>
          ) : null}

          {shares.length > 0 ? (
            <SectionCard title={t("partners.sectionShares")} badge={shares.length} delayClass="delay2">
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
            <SectionCard title={t("partners.sectionReport")} delayClass="delay2">
              <GuardedForm>
                <div className="productHeaderActions" style={{ justifyContent: "flex-start" }}>
                  <Button
                    type="button"
                    onClick={() => {
                      void api.memberReport(workspaceId, self.userId).then((next) => {
                        setReport(next);
                        setError(null);
                        flashSuccess("گزارش بارگذاری شد");
                      });
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
                          flashSuccess("فایل CSV دانلود شد");
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "خطا"));
                        }
                      })();
                    }}
                  >
                    خروجی CSV / Excel
                  </Button>
                </div>
              </GuardedForm>
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
                <EmptyHint>{t("partners.emptyReport")}</EmptyHint>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title={t("partners.sectionLocks")} badge={locks.length} delayClass="delay3">
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              پس از قفل، ثبت آورده، قرض و برداشت در آن بازه مسدود می‌شود.
            </p>
            <GuardedForm>
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
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("دوره قفل شد");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "خطا"));
                    }
                  })();
                }}
              >
                قفل ماه جاری تا امروز
              </Button>
            </GuardedForm>
            {locks.length === 0 ? (
              <EmptyHint>{t("partners.emptyLocks")}</EmptyHint>
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
