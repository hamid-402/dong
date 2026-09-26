"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type {
  CreditPurchaseSummary,
  ExpenseSplitLine,
  MembershipRole,
  OnBehalfPaymentSummary,
  PaymentReceiptSummary,
  PettyCashFundSummary,
  PettyCashHealthReport,
  PettyCashLedgerResponse,
} from "@dang/contracts";
import { isFinanceManagerRole, isReadOnlyRole, spaceKindForTemplate, treasuryLabelsForKind } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { membershipRoleLabel } from "@/lib/status-labels";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { TreasuryBalanceCard } from "@/components/shell/treasury-balance-card";
import { PettyCashLedgerTable } from "@/components/shell/petty-cash-ledger-table";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { JalaliDateField } from "@/components/jalali-date-field";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api } from "@/lib/api";
import { friendlyErrorMessage, uploadErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { readFileAsBase64, resolveUploadMimeType, sha256HexFromFile } from "@/lib/file-hash";
import { displayInputToIrrMinor, irrMinorToDisplayInput } from "@/lib/irr-money";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyFieldLabel, moneyUnitSuffix } from "@/lib/money-labels";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useFlashMessage, FlashMessages } from "@/lib/use-flash-message";
import { t } from "@/lib/i18n";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function receiptStatusLabel(status: PaymentReceiptSummary["status"]): string {
  if (status === "submitted") return "در انتظار تأیید";
  if (status === "approved") return "تأیید شده";
  return "رد شده";
}

export function PaymentsView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const searchParams = useSearchParams();
  const displayUnit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(displayUnit);
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [pending, startTransition] = useTransition();

  const [receipts, setReceipts] = useState<PaymentReceiptSummary[]>([]);
  const [funds, setFunds] = useState<PettyCashFundSummary[]>([]);
  const [fundHealth, setFundHealth] = useState<PettyCashHealthReport | null>(null);
  const [ledger, setLedger] = useState<PettyCashLedgerResponse | null>(null);
  const [ledgerFundId, setLedgerFundId] = useState("");
  const [credits, setCredits] = useState<CreditPurchaseSummary[]>([]);
  const [onBehalf, setOnBehalf] = useState<OnBehalfPaymentSummary[]>([]);
  const [members, setMembers] = useState<
    Array<{
      userId: string;
      displayName?: string;
      role: MembershipRole;
      defaultShares: number;
    }>
  >([]);
  const [role, setRole] = useState<MembershipRole | "">("");
  const [loaded, setLoaded] = useState(false);

  const [amountMinor, setAmountMinor] = useState("");
  const [destLast4, setDestLast4] = useState("");
  const [destHolderName, setDestHolderName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [method, setMethod] = useState<"card_to_card" | "cash" | "bank_transfer">(
    "card_to_card",
  );
  const [settlementId, setSettlementId] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  useEffect(() => {
    const fromStatement = searchParams?.get("amountMinor")?.trim() ?? "";
    if (/^\d+$/.test(fromStatement) && BigInt(fromStatement) > 0n) {
      setAmountMinor(irrMinorToDisplayInput(fromStatement, displayUnit));
    }
  }, [searchParams, displayUnit]);

  const [fundName, setFundName] = useState("تنخواه گروه");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [spendFundId, setSpendFundId] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [topupFundId, setTopupFundId] = useState("");
  const [topupToman, setTopupToman] = useState("");
  const [topupSplitMethod, setTopupSplitMethod] = useState<"equal" | "shares">(
    "equal",
  );
  const [topupPreview, setTopupPreview] = useState<ExpenseSplitLine[] | null>(
    null,
  );

  const [supplierRef, setSupplierRef] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [obDebtorId, setObDebtorId] = useState("");
  const [obPayerId, setObPayerId] = useState("");
  const [obAmount, setObAmount] = useState("");
  const [obSettlementId, setObSettlementId] = useState("");
  const [obMethod, setObMethod] = useState<
    "card_to_card" | "cash" | "bank_transfer"
  >("bank_transfer");
  const [obNote, setObNote] = useState("");

  const receiptsLive =
    chrome.capabilities?.providers?.paymentReceipts === "manual_review_v1";
  const pettyLive = chrome.capabilities?.providers?.pettyCash === "fund_v1";
  const onBehalfLive =
    chrome.capabilities?.providers?.paymentOnBehalf === "on_behalf_v1";
  const attachmentsLive =
    chrome.capabilities?.providers?.attachmentBlob === "local" ||
    chrome.capabilities?.persistence?.attachmentBlob === "local";
  const gatewayLive =
    chrome.capabilities?.providers?.payment === "zarinpal" ||
    chrome.capabilities?.providers?.payment === "local_psp";
  const canReview = isFinanceManagerRole(role || null);
  const readOnly = isReadOnlyRole(role || null);
  const canSubmitReceipt = Boolean(role) && !readOnly;
  const actorId = chrome.actor?.userId ?? "";
  const activeWs = chrome.workspaces.find((w) => w.id === workspaceId);
  const spaceKind = spaceKindForTemplate(activeWs?.template);
  const treasuryLabels = treasuryLabelsForKind(spaceKind);
  const paymentsHref = scope.slug
    ? `/w/${encodeURIComponent(scope.slug)}/payments`
    : "#petty-cash";

  const reload = () => {
    if (!workspaceId || !receiptsLive) return;
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const [r, f, c, memberRows, ob, health] = await Promise.all([
            api.listReceipts(workspaceId),
            pettyLive ? api.listPettyCash(workspaceId) : Promise.resolve([]),
            api.listCreditPurchases(workspaceId),
            api.listMembers(workspaceId),
            onBehalfLive
              ? api.listOnBehalf(workspaceId)
              : Promise.resolve([] as OnBehalfPaymentSummary[]),
            pettyLive
              ? api.pettyCashHealth(workspaceId).catch(() => null)
              : Promise.resolve(null),
          ]);
          setReceipts(r);
          setFunds(f);
          setFundHealth(health);
          setCredits(c);
          setOnBehalf(ob);
          setMembers(
            memberRows.map((m) => ({
              userId: m.userId,
              displayName: m.displayName,
              role: m.role,
              defaultShares: m.defaultShares > 0 ? m.defaultShares : 1,
            })),
          );
          setRole(
            (memberRows.find((m) => m.userId === chrome.actor?.userId)?.role ??
              ""),
          );
          const activeFundId =
            (ledgerFundId && f.some((x) => x.id === ledgerFundId)
              ? ledgerFundId
              : null) ||
            f.find((x) => x.active)?.id ||
            f[0]?.id ||
            "";
          setLedgerFundId(activeFundId);
          if (pettyLive && activeFundId) {
            const led = await api.getPettyCashLedger(workspaceId, activeFundId).catch(() => null);
            setLedger(led);
          } else {
            setLedger(null);
          }
          setLoaded(true);
        } catch (err) {
          setError(friendlyErrorMessage(err, "بارگذاری پرداخت‌ها ناموفق"));
          setLoaded(true);
        }
      })();
    });
  };

  useEffect(() => {
    reload();
  }, [workspaceId, receiptsLive, pettyLive, onBehalfLive, chrome.actor?.userId]);

  // A receipt someone else files, or an invoice that just went paid, changes
  // this list and the amounts owed beside it.
  useLiveInvalidation(["settlements", "balances", "invoices:"], () => {
    if (!workspaceId) return;
    reload();
  });

  if (!receiptsLive) {
    return (
      <AppShell
        workspaceId={chrome.workspaceId}
        workspaceName={chrome.workspaceName || undefined}
        userName={chrome.userName || undefined}
        persistenceLabel={chrome.persistenceLabel}
      >
        <EmptyHint>
          مسیر پرداخت دستی وقتی providers.paymentReceipts برابر manual_review_v1
          باشد فعال می‌شود.
        </EmptyHint>
      </AppShell>
    );
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
      title={NAV_LABELS.payments}
      description={`فیش، ${treasuryLabels.pettyCash} و خرید اعتباری — اثر مالی فقط پس از تأیید. دفتر معین: تاریخ، واریز/برداشت و سهم اعضا.`}
      primaryAction={<a href="#petty-cash-ledger">دفتر تنخواه</a>}
      state="ready"
    >
      <p className="pageLead">
        فیش کارت‌به‌کارت، پرداخت از حساب دیگری، {treasuryLabels.pettyCash} و خرید
        اعتباری — اثر مالی فقط پس از تأیید
      </p>
      <FlashMessages successMessage={successMessage} error={error} />

      {pettyLive || spaceKind === "personal" ? (
        <div style={{ marginBottom: "1.1rem" }}>
          <TreasuryBalanceCard
            spaceKind={spaceKind}
            funds={funds}
            paymentsHref={paymentsHref}
            savingsHref="/me/finance#goals"
            canManage={canReview}
            pending={pending}
            memberLabel={(userId) =>
              members.find((m) => m.userId === userId)?.displayName?.trim() ||
              userId.slice(0, 8)
            }
            onEnsureDefault={
              canReview && spaceKind !== "personal"
                ? () => {
                    startTransition(() => {
                      void (async () => {
                        try {
                          const result = await api.ensureDefaultPettyCashFund(
                            workspaceId,
                            { idempotencyKey: crypto.randomUUID() },
                          );
                          setFunds(result.funds);
                          flashSuccess(
                            result.created
                              ? `${treasuryLabels.defaultFundName} ایجاد شد`
                              : "تنخواه اصلی از قبل وجود داشت",
                          );
                          reload();
                        } catch (err) {
                          setError(
                            friendlyErrorMessage(err, "ایجاد تنخواه ناموفق"),
                          );
                        }
                      })();
                    });
                  }
                : undefined
            }
          />
        </div>
      ) : null}

      <StatusLine>
        درگاه:{" "}
        {chrome.capabilities?.providers?.payment === "zarinpal"
          ? "فعال (زرین‌پال)"
          : gatewayLive
            ? "فعال (LocalPSP — تست محلی)"
            : "stub — لینک آنلاین پنهان"}{" "}
        ·
        {treasuryLabels.pettyCash}: {pettyLive ? "فعال" : "غیرفعال"} ·{" "}
        {t("payments.onBehalf.statusLabel")}:{" "}
        {onBehalfLive ? t("common.active") : t("common.inactive")}
      </StatusLine>

      <SectionCard title="ثبت فیش" id="receipt-form">
        {readOnly ? (
          <StatusLine>
            نقش {membershipRoleLabel(role)} فقط مشاهده دارد — ثبت فیش فعال نیست.
          </StatusLine>
        ) : (
        <FormStack>
          <SelectField
            label="روش"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="card_to_card">کارت‌به‌کارت</option>
            <option value="cash">نقد</option>
            <option value="bank_transfer">حواله</option>
          </SelectField>
          <TextField
            label={moneyFieldLabel("مبلغ", displayUnit)}
            value={amountMinor}
            onChange={(e) => setAmountMinor(e.target.value)}
            inputMode="numeric"
          />
          <TextField
            label="شناسه تسویه (اختیاری)"
            value={settlementId}
            onChange={(e) => setSettlementId(e.target.value)}
          />
          <TextField
            label="نام صاحب حساب مقصد"
            value={destHolderName}
            onChange={(e) => setDestHolderName(e.target.value)}
          />
          <TextField
            label="۴ رقم آخر مقصد"
            value={destLast4}
            onChange={(e) =>
              setDestLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            inputMode="numeric"
            maxLength={4}
          />
          {method === "card_to_card" ? (
            <TextField
              label="کد پیگیری / شماره مرجع *"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          ) : (
            <TextField
              label="شماره مرجع (اختیاری)"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          )}
          {method === "card_to_card" ? (
            <p className="liveHint">
              برای کارت‌به‌کارت کد پیگیری الزامی است — طرف مقابل با همین کد تأیید می‌کند.
            </p>
          ) : null}
          {attachmentsLive ? (
            <label className="receiptUpload__label">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  if (file && file.size > MAX_RECEIPT_BYTES) {
                    setError("حجم فایل بیش از ۱۰ مگابایت است");
                    setReceiptFile(null);
                    return;
                  }
                  setReceiptFile(file);
                }}
              />
              {receiptFile
                ? `پیوست: ${receiptFile.name}`
                : "پیوست تصویر فیش (اختیاری)"}
            </label>
          ) : null}
          <Button
            disabled={
              pending ||
              !amountMinor.trim() ||
              (method === "card_to_card" && !referenceNo.trim())
            }
            onClick={() => {
              if (!workspaceId) return;
              if (method === "card_to_card" && !referenceNo.trim()) {
                setError("کد پیگیری کارت‌به‌کارت الزامی است");
                return;
              }
              startTransition(() => {
                void (async () => {
                  try {
                    let attachmentId: string | undefined;
                    if (attachmentsLive && receiptFile) {
                      const mimeType = resolveUploadMimeType(receiptFile);
                      const contentHash = await sha256HexFromFile(receiptFile);
                      const settlement = settlementId.trim();
                      const targetType = settlement
                        ? ("settlement" as const)
                        : ("payment_receipt" as const);
                      const targetId = settlement || crypto.randomUUID();
                      const attachment = await api.createAttachment(workspaceId, {
                        workspaceId,
                        targetType,
                        targetId,
                        kind: "receipt",
                        fileName: receiptFile.name,
                        mimeType,
                        sizeBytes: receiptFile.size,
                        contentHash,
                        idempotencyKey: `payment-receipt:${contentHash.slice(0, 16)}`,
                      });
                      const contentBase64 = await readFileAsBase64(receiptFile);
                      const stored = await api.uploadAttachmentContent(
                        workspaceId,
                        attachment.id,
                        { contentBase64 },
                      );
                      attachmentId = stored.id;
                    }
                    await api.createReceipt(workspaceId, {
                      method,
                      amountMinor: (() => {
                        const money = displayInputToIrrMinor(amountMinor, displayUnit);
                        if (!money) throw new Error("INVALID_AMOUNT");
                        return money.amountMinor;
                      })(),
                      paidAt: new Date().toISOString(),
                      settlementId: settlementId.trim() || undefined,
                      destHolderName: destHolderName.trim() || undefined,
                      destLast4: destLast4.trim() || undefined,
                      referenceNo: referenceNo.trim() || undefined,
                      attachmentId,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    flashSuccess(
                      method === "card_to_card"
                        ? "فیش ثبت شد — منتظر تأیید طرف مقابل"
                        : "فیش ثبت شد — هنوز روی بدهی اثر ندارد",
                    );
                    setAmountMinor("");
                    setDestLast4("");
                    setReferenceNo("");
                    setReceiptFile(null);
                    reload();
                  } catch (err) {
                    setError(
                      receiptFile
                        ? uploadErrorMessage(err, "ثبت فیش یا آپلود پیوست ناموفق")
                        : friendlyErrorMessage(err, "خطای ناشناخته"),
                    );
                  }
                })();
              });
            }}
          >
            ثبت فیش
          </Button>
        </FormStack>
        )}
      </SectionCard>

      <SectionCard title="فیش‌ها">
        {!loaded ? (
          <ContentSkeleton rows={3} label="در حال بارگذاری فیش‌ها…" />
        ) : receipts.length === 0 ? (
          <EmptyStateBlock
            title="فیشی نیست"
            description={
              canSubmitReceipt
                ? "اولین فیش را از فرم بالا ثبت کنید."
                : "وقتی فیشی ثبت شود اینجا دیده می‌شود."
            }
            sticker="ledger"
            action={
              canSubmitReceipt ? (
                <a href="#receipt-form">رفتن به ثبت فیش</a>
              ) : undefined
            }
          />
        ) : (
          <DataList>
            {receipts.map((r) => (
              <DataRow
                key={r.id}
                title={<Amount irrMinor={r.amount.amountMinor} />}
                meta={
                  <>
                    <StatusPill
                      tone={
                        r.status === "approved"
                          ? "ok"
                          : r.status === "rejected"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {receiptStatusLabel(r.status)}
                    </StatusPill>
                    {r.method === "card_to_card" ? " · کارت‌به‌کارت" : null}
                    {r.referenceNo ? ` · پیگیری ${r.referenceNo}` : null}
                    {r.destLast4 ? ` · ****${r.destLast4}` : null}
                    {r.attachmentId ? " · پیوست دارد" : null}
                    {r.status === "submitted" &&
                    r.payerUserId !== actorId &&
                    !canReview &&
                    !readOnly
                      ? " · منتظر تأیید شما"
                      : null}
                  </>
                }
                actions={
                  !readOnly &&
                  r.status === "submitted" &&
                  r.payerUserId !== actorId ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        disabled={pending}
                        onClick={() => {
                          startTransition(() => {
                            void (async () => {
                              try {
                                await api.approveReceipt(workspaceId, r.id);
                                flashSuccess(
                                  canReview
                                    ? "فیش تأیید و ژورنال ثبت شد"
                                    : "دریافت تأیید شد — تسویه بسته شد",
                                );
                                reload();
                              } catch (err) {
                                setError(friendlyErrorMessage(err, "خطای ناشناخته"));
                              }
                            })();
                          });
                        }}
                      >
                        تأیید
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          const note = window.prompt("دلیل رد فیش:");
                          if (!note?.trim()) return;
                          startTransition(() => {
                            void (async () => {
                              try {
                                await api.rejectReceipt(workspaceId, r.id, {
                                  note: note.trim(),
                                });
                                flashSuccess("فیش رد شد");
                                reload();
                              } catch (err) {
                                setError(friendlyErrorMessage(err, "خطای ناشناخته"));
                              }
                            })();
                          });
                        }}
                      >
                        رد
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </DataList>
        )}
      </SectionCard>

      {onBehalfLive ? (
        <>
          <SectionCard title={t("payments.onBehalf.sectionTitle")}>
            {readOnly ? (
              <StatusLine>
                نقش {membershipRoleLabel(role)} فقط مشاهده دارد — پرداخت به‌جای فعال نیست.
              </StatusLine>
            ) : (
            <FormStack>
              <SelectField
                label={t("payments.onBehalf.debtor")}
                value={obDebtorId}
                onChange={(e) => setObDebtorId(e.target.value)}
              >
                <option value="">{t("payments.onBehalf.selectMember")}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName || m.userId.slice(0, 8)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t("payments.onBehalf.payer")}
                value={obPayerId}
                onChange={(e) => setObPayerId(e.target.value)}
              >
                <option value="">{t("payments.onBehalf.selectMember")}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName || m.userId.slice(0, 8)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t("payments.onBehalf.method")}
                value={obMethod}
                onChange={(e) => setObMethod(e.target.value as typeof obMethod)}
              >
                <option value="bank_transfer">حواله</option>
                <option value="card_to_card">کارت‌به‌کارت</option>
                <option value="cash">نقد</option>
              </SelectField>
              <TextField
                label={moneyFieldLabel(t("payments.onBehalf.amount"), displayUnit)}
                value={obAmount}
                onChange={(e) => setObAmount(e.target.value)}
                inputMode="numeric"
              />
              <TextField
                label={t("payments.onBehalf.settlement")}
                value={obSettlementId}
                onChange={(e) => setObSettlementId(e.target.value)}
              />
              <TextField
                label={t("payments.onBehalf.note")}
                value={obNote}
                onChange={(e) => setObNote(e.target.value)}
              />
              <Button
                disabled={
                  pending ||
                  !obDebtorId ||
                  !obPayerId ||
                  !obAmount.trim() ||
                  obDebtorId === obPayerId
                }
                onClick={() => {
                  if (!workspaceId) return;
                  startTransition(() => {
                    void (async () => {
                      try {
                        const money = displayInputToIrrMinor(obAmount, displayUnit);
                        if (!money) {
                          setError("مبلغ معتبر نیست");
                          return;
                        }
                        await api.createOnBehalf(workspaceId, {
                          debtorUserId: obDebtorId,
                          payerUserId: obPayerId,
                          amountMinor: money.amountMinor,
                          settlementId: obSettlementId.trim() || undefined,
                          method: obMethod,
                          note: obNote.trim() || undefined,
                          idempotencyKey: crypto.randomUUID(),
                        });
                        flashSuccess(t("payments.onBehalf.success"));
                        setObAmount("");
                        setObSettlementId("");
                        setObNote("");
                        reload();
                      } catch (err) {
                        setError(
                          friendlyErrorMessage(err, "ثبت پرداخت به‌جای ناموفق"),
                        );
                      }
                    })();
                  });
                }}
              >
                {t("payments.onBehalf.submit")}
              </Button>
            </FormStack>
            )}
          </SectionCard>

          <SectionCard title={t("payments.onBehalf.pendingTitle")}>
            {!loaded ? (
              <ContentSkeleton rows={2} label={t("common.loading")} />
            ) : onBehalf.filter((r) => r.status === "pending").length === 0 ? (
              <EmptyStateBlock
                title={t("payments.onBehalf.emptyTitle")}
                description={t("payments.onBehalf.emptyDescription")}
                sticker="handshake"
              />
            ) : (
              <DataList>
                {onBehalf
                  .filter((r) => r.status === "pending")
                  .map((r) => {
                    const canAct =
                      canReview || (actorId !== "" && actorId === r.payerUserId);
                    return (
                      <DataRow
                        key={r.id}
                        title={<Amount irrMinor={r.amount.amountMinor} />}
                        meta={
                          <>
                            بدهکار: {r.debtorUserId.slice(0, 8)} · پرداخت‌کننده:{" "}
                            {r.payerUserId.slice(0, 8)} · {r.method}
                            {r.settlementId
                              ? ` · تسویه ${r.settlementId.slice(0, 8)}`
                              : ""}
                          </>
                        }
                        actions={
                          canAct ? (
                            <div className="rowActions">
                              <Button
                                disabled={pending}
                                onClick={() => {
                                  startTransition(() => {
                                    void (async () => {
                                      try {
                                        await api.approveOnBehalf(
                                          workspaceId,
                                          r.id,
                                        );
                                        flashSuccess(
                                          "تأیید شد — ژورنال دوطرفه ثبت شد",
                                        );
                                        reload();
                                      } catch (err) {
                                        setError(
                                          friendlyErrorMessage(
                                            err,
                                            "تأیید ناموفق",
                                          ),
                                        );
                                      }
                                    })();
                                  });
                                }}
                              >
                                {t("payments.onBehalf.approve")}
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={pending}
                                onClick={() => {
                                  startTransition(() => {
                                    void (async () => {
                                      try {
                                        await api.rejectOnBehalf(
                                          workspaceId,
                                          r.id,
                                          { note: "رد تأیید پرداخت به‌جای" },
                                        );
                                        flashSuccess("درخواست رد شد");
                                        reload();
                                      } catch (err) {
                                        setError(
                                          friendlyErrorMessage(err, "رد ناموفق"),
                                        );
                                      }
                                    })();
                                  });
                                }}
                              >
                                {t("payments.onBehalf.reject")}
                              </Button>
                            </div>
                          ) : undefined
                        }
                      />
                    );
                  })}
              </DataList>
            )}
          </SectionCard>
        </>
      ) : null}

      {pettyLive ? (
        <SectionCard title={treasuryLabels.pettyCash} id="petty-cash">
          {canReview ? (
            <FormStack>
              <TextField
                label="نام صندوق"
                value={fundName}
                onChange={(e) => setFundName(e.target.value)}
              />
              <TextField
                label={moneyFieldLabel("مانده اولیه", displayUnit)}
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                inputMode="numeric"
              />
              <Button
                disabled={pending}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        const opening =
                          openingBalance.trim() === "" || openingBalance.trim() === "0"
                            ? "0"
                            : displayInputToIrrMinor(openingBalance, displayUnit)?.amountMinor;
                        if (opening == null) {
                          setError("مانده اولیه معتبر نیست");
                          return;
                        }
                        await api.createPettyCashFund(workspaceId, {
                          name: fundName.trim() || "تنخواه",
                          openingBalanceMinor: opening,
                          idempotencyKey: crypto.randomUUID(),
                        });
                        flashSuccess("صندوق تنخواه ساخته شد");
                        reload();
                      } catch (err) {
                        setError(friendlyErrorMessage(err, "خطای ناشناخته"));
                      }
                    })();
                  });
                }}
              >
                ساخت صندوق
              </Button>
              {funds.length > 0 ? (
                <>
                  <p className="liveHint">
                    برداشت از تنخواه یک خرج مشترک ثبت می‌کند و موجودی صندوق را کم
                    می‌کند.
                  </p>
                  <SelectField
                    label="برداشت از"
                    value={spendFundId || funds[0]?.id || ""}
                    onChange={(e) => setSpendFundId(e.target.value)}
                  >
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({irrMinorToDisplayInput(f.balanceMinor, displayUnit) || "0"} {unitLabel})
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label={moneyFieldLabel("مبلغ برداشت", displayUnit)}
                    value={spendAmount}
                    onChange={(e) => setSpendAmount(e.target.value)}
                    inputMode="numeric"
                  />
                  <Button
                    disabled={pending || !spendAmount.trim() || members.length === 0}
                    onClick={() => {
                      const fid = spendFundId || funds[0]?.id;
                      if (!fid) return;
                      const total = displayInputToIrrMinor(spendAmount, displayUnit);
                      if (!total) {
                        setError("مبلغ برداشت معتبر نیست");
                        return;
                      }
                      startTransition(() => {
                        void (async () => {
                          try {
                            await api.spendPettyCashAsExpense(workspaceId, fid, {
                              amountMinor: total.amountMinor,
                              participantUserIds: members.map((m) => m.userId),
                              splitMethod: "equal",
                              idempotencyKey: crypto.randomUUID(),
                            });
                            flashSuccess("برداشت با سهم اعضا ثبت شد");
                            setSpendAmount("");
                            reload();
                          } catch (err) {
                            setError(friendlyErrorMessage(err, "خطای ناشناخته"));
                          }
                        })();
                      });
                    }}
                  >
                    برداشت با سهم
                  </Button>

                  <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "8px 0" }} />
                  <p className="liveHint">
                    شارژ صندوق: مبلغ را بین اعضا تقسیم می‌کند (مانده هر نفر)،
                    سپس موجودی تنخواه را افزایش می‌دهد.
                  </p>
                  <SelectField
                    label="شارژ صندوق"
                    value={topupFundId || funds[0]?.id || ""}
                    onChange={(e) => {
                      setTopupFundId(e.target.value);
                      setTopupPreview(null);
                    }}
                  >
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label={moneyFieldLabel("مبلغ شارژ", displayUnit)}
                    value={topupToman}
                    onChange={(e) => {
                      setTopupToman(e.target.value);
                      setTopupPreview(null);
                    }}
                    inputMode="numeric"
                  />
                  <SelectField
                    label="روش سهم"
                    value={topupSplitMethod}
                    onChange={(e) => {
                      setTopupSplitMethod(e.target.value as "equal" | "shares");
                      setTopupPreview(null);
                    }}
                  >
                    <option value="equal">مساوی</option>
                    <option value="shares">بر اساس سهم پیش‌فرض اعضا</option>
                  </SelectField>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending || !topupToman.trim() || members.length === 0}
                    onClick={() => {
                      const total = displayInputToIrrMinor(topupToman, displayUnit);
                      if (!total || !workspaceId) {
                        setError("مبلغ شارژ معتبر نیست");
                        return;
                      }
                      startTransition(() => {
                        void (async () => {
                          try {
                            const participantUserIds = members.map((m) => m.userId);
                            const splitLines =
                              topupSplitMethod === "shares"
                                ? members.map((m) => ({
                                    userId: m.userId,
                                    amount: {
                                      amountMinor: "0",
                                      currency: "IRR" as const,
                                    },
                                    shares: m.defaultShares,
                                  }))
                                : undefined;
                            const preview = await api.previewExpenseSplit(
                              workspaceId,
                              {
                                total,
                                splitMethod: topupSplitMethod,
                                participantUserIds,
                                splitLines,
                              },
                            );
                            setTopupPreview(preview.splits);
                            setError(null);
                          } catch (err) {
                            setError(
                              friendlyErrorMessage(err, "پیش‌نمایش سهم ناموفق"),
                            );
                          }
                        })();
                      });
                    }}
                  >
                    پیش‌نمایش سهم هر نفر
                  </Button>
                  {topupPreview ? (
                    <DataList>
                      {topupPreview.map((line) => {
                        const member = members.find((m) => m.userId === line.userId);
                        return (
                          <DataRow
                            key={line.userId}
                            title={member?.displayName || line.userId}
                            meta={
                              topupSplitMethod === "shares"
                                ? `سهم ${member?.defaultShares ?? 1}`
                                : "مساوی"
                            }
                            trailing={
                              <Amount irrMinor={line.amount.amountMinor} />
                            }
                          />
                        );
                      })}
                    </DataList>
                  ) : null}
                  <Button
                    disabled={pending || !topupToman.trim() || members.length === 0}
                    onClick={() => {
                      const fid = topupFundId || funds[0]?.id;
                      const total = displayInputToIrrMinor(topupToman, displayUnit);
                      if (!fid || !total || !workspaceId) {
                        setError("مبلغ یا صندوق معتبر نیست");
                        return;
                      }
                      startTransition(() => {
                        void (async () => {
                          try {
                            const participantUserIds = members.map((m) => m.userId);
                            const result = await api.topupPettyCashFromMembers(
                              workspaceId,
                              fid,
                              {
                                amountMinor: total.amountMinor,
                                splitMethod: topupSplitMethod,
                                participantUserIds,
                                splitLines:
                                  topupSplitMethod === "shares"
                                    ? members.map((m) => ({
                                        userId: m.userId,
                                        shares: m.defaultShares,
                                      }))
                                    : undefined,
                                paidByUserId: actorId || undefined,
                                idempotencyKey: crypto.randomUUID(),
                              },
                            );
                            flashSuccess(
                              `تنخواه شارژ شد · مانده جدید ${result.balanceMinor}`,
                            );
                            setTopupToman("");
                            setTopupPreview(result.splits);
                            reload();
                          } catch (err) {
                            setError(
                              friendlyErrorMessage(err, "شارژ تنخواه ناموفق"),
                            );
                          }
                        })();
                      });
                    }}
                  >
                    شارژ با سهم اعضا
                  </Button>
                </>
              ) : null}
            </FormStack>
          ) : null}
          {funds.length === 0 ? (
            <EmptyHint>صندوق تنخواهی ثبت نشده.</EmptyHint>
          ) : (
            <>
              {fundHealth ? (
                <StatusLine>
                  سلامت صندوق: {fundHealth.activeFundCount} فعال از{" "}
                  {fundHealth.fundCount} · جمع مانده{" "}
                  <Amount irrMinor={fundHealth.totalBalanceMinor} /> ·{" "}
                  {
                    fundHealth.funds.filter((x) => x.status === "empty").length
                  }{" "}
                  خالی
                </StatusLine>
              ) : null}
              <DataList>
              {funds.map((f) => (
                <DataRow
                  key={f.id}
                  title={f.name}
                  meta={
                    <>
                      مانده: <Amount irrMinor={f.balanceMinor} />
                      {fundHealth
                        ? ` · ${
                            fundHealth.funds.find((x) => x.id === f.id)?.status ===
                            "empty"
                              ? "خالی"
                              : fundHealth.funds.find((x) => x.id === f.id)
                                    ?.status === "inactive"
                                ? "غیرفعال"
                                : "سالم"
                          }`
                        : null}
                    </>
                  }
                />
              ))}
            </DataList>
            </>
          )}
          <PettyCashLedgerTable
            ledger={ledger}
            fundLabel={treasuryLabels.pettyCash}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="خرید اعتباری">
        {canReview ? (
          <FormStack>
            <TextField
              label="فروشنده / مرجع"
              value={supplierRef}
              onChange={(e) => setSupplierRef(e.target.value)}
            />
            <TextField
              label={moneyFieldLabel("مبلغ", displayUnit)}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              inputMode="numeric"
            />
            <JalaliDateField
              label="سررسید"
              value={dueDate}
              onChange={setDueDate}
            />
            <Button
              disabled={pending || !supplierRef.trim() || !creditAmount.trim()}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      const money = displayInputToIrrMinor(creditAmount, displayUnit);
                      if (!money) {
                        setError("مبلغ معتبر نیست");
                        return;
                      }
                      await api.createCreditPurchase(workspaceId, {
                        supplierRef: supplierRef.trim(),
                        amountMinor: money.amountMinor,
                        purchasedAt: new Date().toISOString(),
                        dueDate: dueDate.trim() || todayIsoLocal(),
                        idempotencyKey: crypto.randomUUID(),
                      });
                      flashSuccess("خرید اعتباری به‌عنوان بدهی گروه ثبت شد");
                      setSupplierRef("");
                      setCreditAmount("");
                      reload();
                    } catch (err) {
                      setError(friendlyErrorMessage(err, "خطای ناشناخته"));
                    }
                  })();
                });
              }}
            >
              ثبت خرید اعتباری
            </Button>
          </FormStack>
        ) : null}
        {credits.length === 0 ? (
          <EmptyHint>خرید اعتباری باز نیست.</EmptyHint>
        ) : (
          <DataList>
            {credits.map((c) => (
              <DataRow
                key={c.id}
                title={c.supplierRef}
                meta={
                  <>
                    {c.status} · باقیمانده{" "}
                    <Amount irrMinor={c.remainingMinor} />
                  </>
                }
              />
            ))}
          </DataList>
        )}
      </SectionCard>
    
      </WorkspacePageFrame></AppShell>
  );
}
