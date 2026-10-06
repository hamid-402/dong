"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ConfirmSettlementRequest,
  MembershipSummary,
  PaymentLinkSummary,
  PettyCashFundSummary,
  PreviewSettlementEffectResponse,
  SettlePayIntent,
  SettlePayPlan,
  SettlementSummary,
  SpaceKind,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import {
  isFinanceManagerRole,
  pettyCashAllowedForKind,
  settlePayIntentNeedsFund,
  suggestedPairwiseSettleMinor,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { BankSmsPaste } from "@/components/bank-sms-paste";
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
import { JalaliDateField } from "@/components/jalali-date-field";
import { hubPathFor } from "@/lib/hub-links";
import { api } from "@/lib/api";
import { useDisplayUnit } from "@/lib/display-unit";
import { displayInputToIrrMinor, irrMinorToDisplayInput } from "@/lib/irr-money";
import { moneyFieldLabel } from "@/lib/money-labels";
import { formatFaDate } from "@/lib/fa-datetime";
import { memberStatementHref } from "@/lib/statement-links";
import { membershipRoleLabel, paymentLinkStatusLabel, settlementStatusLabel } from "@/lib/status-labels";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { ConfirmSettlementDialog } from "@/components/views/finance/confirm-settlement-dialog";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import styles from "./settlement-panel.module.css";
import selStyles from "@/components/selection/selection-action-bar.module.css";

type SettlementPanelProps = {
  workspaceId?: string;
  members: MembershipSummary[];
  settleToUserId: string;
  onSettleToUserIdChange: (value: string) => void;
  settleAmountToman: string;
  onSettleAmountTomanChange: (value: string) => void;
  settlements: SettlementSummary[];
  paymentLinks: PaymentLinkSummary[];
  paymentsLive: boolean;
  balances?: WorkspaceBalancesResponse | null;
  /** Active petty-cash funds for gift intents (runtime list). */
  pettyCashFunds?: PettyCashFundSummary[];
  /** When personal (or no shared treasury), gift intents are hidden. */
  spaceKind?: SpaceKind | null;
  currentUserId?: string;
  myRole?: string;
  /** Auditor/guest — list only, no claim/confirm/payment. */
  readOnly?: boolean;
  pending: boolean;
  settlementNps: boolean;
  onDismissNps: () => void;
  memberLabel: (userId: string) => string;
  membersHref?: string;
  /** Workspace slug for member-statement deep links. */
  slug?: string | null;
  onSettlePay: (input: {
    intent: SettlePayIntent;
    fundId?: string;
    asOf?: string;
  }) => void;
  onConfirmSettlement: (
    settlementId: string,
    evidence?: ConfirmSettlementRequest,
  ) => void;
  onDisputeSettlement: (settlementId: string) => void;
  evidenceRequired?: boolean;
  onCancelSettlement: (settlementId: string) => void;
  onCreatePaymentLink: (settlement: SettlementSummary) => void;
};

function absMinor(amountMinor: string | undefined): string {
  if (!amountMinor) return "0";
  const n = BigInt(amountMinor);
  return (n < 0n ? -n : n).toString();
}

const INTENT_OPTIONS: Array<{ value: SettlePayIntent; label: string; hint: string }> = [
  {
    value: "settle_only",
    label: "فقط تسویه بین اعضا",
    hint: "کل مبلغ ادعای تسویه می‌شود (مازاد = بستانکاری شما).",
  },
  {
    value: "settle_and_fund_gift",
    label: "تسویه + مازاد هدیه به صندوق",
    hint: "تا سقف پیشنهاد تسویه؛ باقی‌مانده بدون بدهی برای بقیه به تنخواه می‌رود.",
  },
  {
    value: "fund_gift_only",
    label: "فقط هدیه به صندوق",
    hint: "بدون تسویه و بدون بدهی برای سایر اعضا.",
  },
];

/**
 * Member settlement claims/confirmations with settle-pay intents (S12).
 */
export function SettlementPanel({
  workspaceId,
  members,
  settleToUserId,
  onSettleToUserIdChange,
  settleAmountToman,
  onSettleAmountTomanChange,
  settlements,
  paymentLinks,
  paymentsLive,
  balances = null,
  pettyCashFunds = [],
  spaceKind = null,
  currentUserId,
  myRole,
  readOnly = false,
  pending,
  settlementNps,
  onDismissNps,
  memberLabel,
  membersHref,
  slug,
  onSettlePay,
  onConfirmSettlement,
  onDisputeSettlement,
  evidenceRequired = false,
  onCancelSettlement,
  onCreatePaymentLink,
}: SettlementPanelProps) {
  const displayUnit = useDisplayUnit();
  const chrome = useOptionalAppChrome();
  const messaging = chrome?.capabilities?.providers?.messaging;
  const messagingLive = messaging === "telegram" || messaging === "bale";
  const fundGiftsAllowed =
    spaceKind == null ? true : pettyCashAllowedForKind(spaceKind);
  const availableIntents = INTENT_OPTIONS.filter(
    (opt) => fundGiftsAllowed || !settlePayIntentNeedsFund(opt.value),
  );
  const [selectedSettlementId, setSelectedSettlementId] = useState("");
  const selection = useRowSelection(settlements.map((s) => s.id));
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null);
  const [apiPreview, setApiPreview] = useState<PreviewSettlementEffectResponse | null>(null);
  const [settlePlan, setSettlePlan] = useState<SettlePayPlan | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [remindHint, setRemindHint] = useState<string | null>(null);
  const [intent, setIntent] = useState<SettlePayIntent>(() =>
    fundGiftsAllowed ? "settle_and_fund_gift" : "settle_only",
  );
  const [asOf, setAsOf] = useState("");
  const [fundId, setFundId] = useState("");
  const selectedSettlement =
    settlements.find((settlement) => settlement.id === selectedSettlementId) ??
    settlements[0] ??
    null;
  const barSettlement =
    selection.selectedCount === 1
      ? (settlements.find((s) => s.id === selection.selectedIds[0]) ?? null)
      : null;
  const finance = isFinanceManagerRole(myRole);
  const settleToNet = balances?.lines.find((l) => l.userId === settleToUserId)?.net
    .amountMinor;
  const settleToIsDebtor = settleToNet != null && BigInt(settleToNet) < 0n;
  const activeFunds = pettyCashFunds.filter((f) => f.active);
  const needsFund = settlePayIntentNeedsFund(intent);
  const intentMeta = availableIntents.find((o) => o.value === intent);

  useEffect(() => {
    if (!fundGiftsAllowed && settlePayIntentNeedsFund(intent)) {
      setIntent("settle_only");
    }
  }, [fundGiftsAllowed, intent]);

  useEffect(() => {
    if (!fundId && activeFunds[0]) setFundId(activeFunds[0].id);
  }, [fundId, activeFunds]);

  useEffect(() => {
    if (
      selectedSettlementId &&
      !settlements.some((settlement) => settlement.id === selectedSettlementId)
    ) {
      setSelectedSettlementId(settlements[0]?.id ?? "");
    }
  }, [selectedSettlementId, settlements]);

  useEffect(() => {
    if (!workspaceId || !currentUserId || !settleToUserId || readOnly) {
      setApiPreview(null);
      setSettlePlan(null);
      setPreviewError(null);
      return;
    }
    if (settleToUserId === currentUserId) {
      setApiPreview(null);
      setSettlePlan(null);
      setPreviewError(null);
      return;
    }
    const amountMinor = displayInputToIrrMinor(settleAmountToman, displayUnit)?.amountMinor ?? null;
    if (!amountMinor) {
      setApiPreview(null);
      setSettlePlan(null);
      setPreviewError(null);
      return;
    }
    if (needsFund && !fundId) {
      setSettlePlan(null);
      setPreviewError("برای هدیه به صندوق، یک صندوق فعال انتخاب کنید");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const planRes = await api.settlePay(workspaceId, {
            counterpartyUserId: settleToUserId,
            amountMinor,
            intent,
            fundId: needsFund ? fundId : undefined,
            asOf: asOf.trim() || undefined,
            previewOnly: true,
            idempotencyKey: `preview:${workspaceId}:${currentUserId}:${settleToUserId}:${amountMinor}:${intent}:${asOf}:${fundId}`,
          });
          if (cancelled) return;
          setSettlePlan(planRes.plan);
          const settleMinor = planRes.plan.settlementAmountMinor;
          if (intent === "fund_gift_only" || BigInt(settleMinor) <= 0n) {
            setApiPreview(null);
          } else {
            const effect = await api.previewSettlementEffect(workspaceId, {
              transfers: [
                {
                  fromUserId: currentUserId,
                  toUserId: settleToUserId,
                  amount: { amountMinor: settleMinor, currency: "IRR" },
                },
              ],
            });
            if (cancelled) return;
            setApiPreview(effect);
          }
          setPreviewError(null);
        } catch {
          if (!cancelled) {
            setApiPreview(null);
            setSettlePlan(null);
            setPreviewError("پیش‌نمایش از API ناموفق بود");
          }
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    workspaceId,
    currentUserId,
    settleToUserId,
    settleAmountToman,
    displayUnit,
    readOnly,
    intent,
    asOf,
    fundId,
    needsFund,
  ]);

  function canConfirm(s: SettlementSummary): boolean {
    if (!currentUserId) return false;
    return finance || s.toUserId === currentUserId;
  }
  function canDispute(s: SettlementSummary): boolean {
    if (!currentUserId) return false;
    return finance || s.toUserId === currentUserId || s.fromUserId === currentUserId;
  }
  function canCancel(s: SettlementSummary): boolean {
    if (!currentUserId) return false;
    return (
      finance ||
      s.fromUserId === currentUserId ||
      s.createdByUserId === currentUserId
    );
  }

  const beforeMe = apiPreview?.before.find((l) => l.userId === currentUserId);
  const beforeOther = apiPreview?.before.find((l) => l.userId === settleToUserId);
  const afterMe = apiPreview?.after.find((l) => l.userId === currentUserId);
  const afterOther = apiPreview?.after.find((l) => l.userId === settleToUserId);

  const myLiveNet = balances?.lines.find((l) => l.userId === currentUserId)?.net.amountMinor;
  const pairwiseSuggest = settlePlan
    ? BigInt(settlePlan.suggestedSettleMinor)
    : myLiveNet != null && settleToNet != null
      ? suggestedPairwiseSettleMinor(myLiveNet, settleToNet)
      : 0n;

  return (
    <SectionCard title="تسویه و تأیید اعضا" delayClass="delay3">
      <div id="settlement-panel" />
      {readOnly ? (
        <StatusLine>
          نقش شما فقط مشاهده دارد — ثبت ادعا، تأیید، اعتراض یا پرداخت فعال نیست.
        </StatusLine>
      ) : (
        <FormStack>
          <StatusLine>
            مانده زنده مبنا است؛ تاریخ as-of فقط پیشنهاد تسویه را محدود می‌کند. هدیه به صندوق
            برای بقیه بدهی نمی‌سازد.
          </StatusLine>
          <SelectField
            label="طرف مقابل"
            value={settleToUserId}
            onChange={(event) => onSettleToUserIdChange(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName} · {membershipRoleLabel(member.role)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="قصد پرداخت"
            value={intent}
            onChange={(event) => setIntent(event.target.value as SettlePayIntent)}
          >
            {availableIntents.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectField>
          {intentMeta ? <StatusLine>{intentMeta.hint}</StatusLine> : null}
          {!fundGiftsAllowed ? (
            <StatusLine>
              این فضا تنخواه مشترک ندارد — فقط تسویه بین اعضا فعال است.
            </StatusLine>
          ) : null}
          {needsFund ? (
            activeFunds.length > 0 ? (
              <>
                <SelectField
                  label="صندوق تنخواه برای هدیه"
                  value={fundId}
                  onChange={(event) => setFundId(event.target.value)}
                >
                  {activeFunds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </SelectField>
                {activeFunds.find((f) => f.id === fundId) ? (
                  <StatusLine>
                    مانده صندوق:{" "}
                    <Amount
                      irrMinor={
                        activeFunds.find((f) => f.id === fundId)?.balanceMinor ?? "0"
                      }
                    />
                  </StatusLine>
                ) : null}
              </>
            ) : (
              <StatusLine>
                صندوق فعال نیست — ابتدا از بخش تنخواه یک صندوق بسازید یا باز کنید.
              </StatusLine>
            )
          ) : null}
          <JalaliDateField
            label="پیشنهاد تا تاریخ (اختیاری)"
            value={asOf}
            onChange={setAsOf}
            hint="خالی = پیشنهاد از مانده زنده. مانده واقعی همیشه زنده است."
          />
          {asOf ? (
            <div className="dataRowActions">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setAsOf("")}
              >
                پاک کردن تاریخ پیشنهاد
              </Button>
            </div>
          ) : null}
          <TextField
            label={moneyFieldLabel("مبلغ پرداخت", displayUnit)}
            value={settleAmountToman}
            onChange={(event) => onSettleAmountTomanChange(event.target.value)}
          />
          <BankSmsPaste
            onApply={(parsed) => {
              if (!parsed.amountMinor) return;
              onSettleAmountTomanChange(
                irrMinorToDisplayInput(parsed.amountMinor, displayUnit),
              );
            }}
          />
          {balances && settleToUserId && settleToUserId !== currentUserId ? (
            <div className="dataRowActions">
              <Button
                type="button"
                variant="secondary"
                disabled={readOnly || pending || pairwiseSuggest <= 0n}
                onClick={() => {
                  const display = irrMinorToDisplayInput(
                    pairwiseSuggest.toString(),
                    displayUnit,
                  );
                  if (display) onSettleAmountTomanChange(display);
                }}
              >
                پیشنهاد تسویه زوجی
                {asOf.trim() ? " (تا تاریخ پیشنهاد)" : " (مانده زنده)"}
              </Button>
            </div>
          ) : null}
          {workspaceId &&
          finance &&
          settleToIsDebtor &&
          settleToUserId !== currentUserId ? (
            <div className="dataRowActions">
              <Button
                type="button"
                variant="secondary"
                disabled={pending || remindBusy}
                onClick={() => {
                  setRemindBusy(true);
                  setRemindHint(null);
                  void api
                    .remindDebt(workspaceId, settleToUserId)
                    .then((res) => {
                      setRemindHint(
                        res.skipped === "already_today"
                          ? "امروز قبلاً یادآوری ارسال شده است."
                          : messagingLive
                            ? "یادآوری بدهی (درون‌برنامه + کانال پیام) ارسال شد."
                            : "یادآوری بدهی درون‌برنامه ارسال شد.",
                      );
                    })
                    .catch(() => setRemindHint("ارسال یادآوری ناموفق بود."))
                    .finally(() => setRemindBusy(false));
                }}
              >
                {remindBusy ? "در حال ارسال…" : "یادآوری بدهی"}
              </Button>
            </div>
          ) : null}
          {messaging && messaging !== "none" && !messagingLive ? (
            <StatusLine>
              کانال پیام‌رسان در حالت stub است — یادآوری فقط درون‌برنامه می‌رود تا توکن
              Telegram/Bale تنظیم شود.
            </StatusLine>
          ) : null}
          {remindHint ? <StatusLine>{remindHint}</StatusLine> : null}
          {settlePlan ? (
            <StatusLine>
              پیش‌نمایش قصد: تسویه{" "}
              <Amount irrMinor={settlePlan.settlementAmountMinor} />
              {" · هدیه صندوق "}
              <Amount irrMinor={settlePlan.giftAmountMinor} />
              {" · پیشنهاد "}
              <Amount irrMinor={settlePlan.suggestedSettleMinor} />
              {" · مانده شما پس از تسویه ≈ "}
              <Amount irrMinor={absMinor(settlePlan.payerNetAfterSettlementMinor)} />
            </StatusLine>
          ) : null}
          {apiPreview && currentUserId && intent !== "fund_gift_only" ? (
            <StatusLine>
              اثر تسویه روی ledger (بدون هدیه): شما{" "}
              <Amount irrMinor={absMinor(beforeMe?.net.amountMinor)} />
              {" → "}
              <Amount irrMinor={absMinor(afterMe?.net.amountMinor)} />
              {" · "}
              {memberLabel(settleToUserId)}{" "}
              <Amount irrMinor={absMinor(beforeOther?.net.amountMinor)} />
              {" → "}
              <Amount irrMinor={absMinor(afterOther?.net.amountMinor)} />
              {apiPreview.zeroSumBefore && apiPreview.zeroSumAfter
                ? " · صفرجمع قبل/بعد برقرار"
                : " · هشدار صفرجمع"}
            </StatusLine>
          ) : previewError ? (
            <StatusLine>{previewError}</StatusLine>
          ) : balances && !readOnly ? (
            <StatusLine>
              مبلغ، قصد و طرف مقابل را وارد کنید تا پیش‌نمایش از API بیاید.
            </StatusLine>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              onSettlePay({
                intent,
                fundId: needsFund ? fundId || undefined : undefined,
                asOf: asOf.trim() || undefined,
              })
            }
            disabled={
              pending ||
              members.length < 2 ||
              (needsFund && (!fundId || activeFunds.length === 0))
            }
          >
            ثبت پرداخت / تسویه
          </Button>
        </FormStack>
      )}
      {members.length < 2 ? (
        <EmptyHint>
          {readOnly ? (
            <>
              برای تسویه حداقل دو عضو لازم است — منتظر دعوت یا افزودن عضو توسط مدیر فضا
              بمانید.
            </>
          ) : (
            <>
              برای تسویه حداقل دو عضو لازم است — از{" "}
              <Link href={membersHref ?? hubPathFor("/workspaces/invite")}>
                اعضا / دعوت
              </Link>{" "}
              استفاده کنید.
            </>
          )}
        </EmptyHint>
      ) : null}
      {!readOnly && settlementNps ? (
        <div className="npsPrompt" role="group" aria-label="بازخورد تسویه">
          <span>این تسویه چطور بود؟</span>
          <div className="npsPrompt__actions">
            {(
              [
                ["خوب", "good"],
                ["متوسط", "ok"],
                ["ضعیف", "bad"],
              ] as Array<[string, string]>
            ).map(([label, rating]) => {
              const subject = `بازخورد تسویه دنگ · ${label} (${rating})`;
              const inbox = chrome?.capabilities?.supportContactEmail?.trim();
              if (inbox) {
                return (
                  <a
                    key={rating}
                    className="npsPrompt__btn"
                    href={`mailto:${inbox}?subject=${encodeURIComponent(subject)}`}
                    onClick={onDismissNps}
                  >
                    {label}
                  </a>
                );
              }
              return (
                <Link
                  key={rating}
                  className="npsPrompt__btn"
                  href={`/contact?topic=${encodeURIComponent(subject)}`}
                  onClick={onDismissNps}
                >
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              className="textButton"
              onClick={onDismissNps}
            >
              بعداً
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.masterDetail}>
      <div>
      {settlements.length > 0 && !readOnly ? (
        <SelectionActionBar
          selectedCount={selection.selectedCount}
          idleHint="روی ردیف کلیک کنید یا مربع کنارش را تیک بزنید"
          onClear={selection.clear}
        >
          <button
            type="button"
            disabled={!barSettlement}
            onClick={() => {
              if (!barSettlement) return;
              setSelectedSettlementId(barSettlement.id);
            }}
          >
            جزئیات
          </button>
          {barSettlement &&
          canConfirm(barSettlement) &&
          barSettlement.status === "claimed" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (evidenceRequired) {
                  setConfirmTargetId(barSettlement.id);
                } else {
                  onConfirmSettlement(barSettlement.id);
                }
                selection.clear();
              }}
            >
              تأیید
            </button>
          ) : null}
          {barSettlement &&
          canDispute(barSettlement) &&
          (barSettlement.status === "claimed" ||
            barSettlement.status === "confirmed") ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onDisputeSettlement(barSettlement.id);
                selection.clear();
              }}
            >
              اعتراض
            </button>
          ) : null}
          {(() => {
            const cancelable = selection.selectedIds.filter((id) => {
              const s = settlements.find((x) => x.id === id);
              return s && canCancel(s) && s.status === "claimed";
            });
            if (cancelable.length === 0) return null;
            return (
              <button
                type="button"
                className={selStyles.danger}
                disabled={pending}
                onClick={() => {
                  const label =
                    cancelable.length === 1
                      ? "این ادعای تسویه لغو شود؟"
                      : `${cancelable.length.toLocaleString("fa-IR")} ادعا لغو شوند؟`;
                  if (!window.confirm(label)) return;
                  for (const id of cancelable) onCancelSettlement(id);
                  selection.clear();
                }}
              >
                لغو
              </button>
            );
          })()}
          {barSettlement &&
          paymentsLive &&
          barSettlement.status === "claimed" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onCreatePaymentLink(barSettlement);
                selection.clear();
              }}
            >
              لینک پرداخت
            </button>
          ) : null}
        </SelectionActionBar>
      ) : null}
      <DataList>
        {settlements.length === 0 && members.length >= 2 ? (
          <EmptyStateBlock
            title="هنوز تسویه‌ای ثبت نشده"
            description={
              readOnly
                ? "وقتی اعضا ادعا ثبت کنند اینجا دیده می‌شود."
                : "اگر بدهکار یا طلبکار هستید، یک ادعای تسویه ثبت کنید تا طرف مقابل تأیید کند."
            }
            sticker="scale"
            action={
              !readOnly ? (
                <Button
                  type="button"
                  onClick={() =>
                    onSettlePay({
                      intent: "settle_only",
                      asOf: asOf.trim() || undefined,
                    })
                  }
                  disabled={pending || members.length < 2}
                >
                  ثبت ادعای تسویه
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {settlements.map((settlement) => (
          <div
            key={settlement.id}
            className={!readOnly ? selStyles.selectableRow : undefined}
            {...(!readOnly
              ? rowSelectActivateProps({
                  onActivate: () => {
                    if (selection.isSelected(settlement.id)) selection.clear();
                    else {
                      selection.selectOnly(settlement.id);
                      setSelectedSettlementId(settlement.id);
                    }
                  },
                })
              : {})}
          >
            <DataRow
              title={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {!readOnly ? (
                    <RowSelectCheckbox
                      checked={selection.isSelected(settlement.id)}
                      onChange={() => {
                        if (selection.isSelected(settlement.id)) selection.clear();
                        else {
                          selection.selectOnly(settlement.id);
                          setSelectedSettlementId(settlement.id);
                        }
                      }}
                      label={`انتخاب تسویه ${memberLabel(settlement.fromUserId)} به ${memberLabel(settlement.toUserId)}`}
                    />
                  ) : null}
                  {`${memberLabel(settlement.fromUserId)} → ${memberLabel(settlement.toUserId)}`}
                </span>
              }
              meta={
                <>
                  <Amount irrMinor={settlement.amount.amountMinor} /> ·{" "}
                  {settlementStatusLabel(settlement.status)}
                </>
              }
            />
          </div>
        ))}
      </DataList>
      </div>
      {selectedSettlement ? (
        <aside className={styles.inspector} aria-label="جزئیات تسویه">
          <span>جزئیات</span>
          <h3>
            {memberLabel(selectedSettlement.fromUserId)} →{" "}
            {memberLabel(selectedSettlement.toUserId)}
          </h3>
          <StatusPill>{settlementStatusLabel(selectedSettlement.status)}</StatusPill>
          <dl>
            <div>
              <dt>مبلغ</dt>
              <dd>
                <Amount irrMinor={selectedSettlement.amount.amountMinor} />
              </dd>
            </div>
            <div>
              <dt>ثبت</dt>
              <dd>{formatFaDate(selectedSettlement.createdAt)}</dd>
            </div>
            {selectedSettlement.note ? (
              <div>
                <dt>یادداشت</dt>
                <dd>{selectedSettlement.note}</dd>
              </div>
            ) : null}
          </dl>
          {slug ? (
            <Link href={memberStatementHref(slug, selectedSettlement.fromUserId)}>
              صورت‌حساب پرداخت‌کننده
            </Link>
          ) : null}
        </aside>
      ) : null}
      </div>
      {paymentLinks.length > 0 ? (
        <DataList>
          {paymentLinks.map((link) => (
            <DataRow
              key={link.id}
              title={`لینک ${link.id.slice(0, 8)}`}
              meta={
                <>
                  <Amount irrMinor={link.amount.amountMinor} /> ·{" "}
                  {paymentLinkStatusLabel(link.status)}
                </>
              }
            />
          ))}
        </DataList>
      ) : null}
      {confirmTargetId ? (
        <ConfirmSettlementDialog
          pending={pending}
          evidenceRequired={evidenceRequired}
          onCancel={() => setConfirmTargetId(null)}
          onConfirm={(evidence) => {
            const id = confirmTargetId;
            setConfirmTargetId(null);
            onConfirmSettlement(id, evidence);
          }}
        />
      ) : null}
    </SectionCard>
  );
}
