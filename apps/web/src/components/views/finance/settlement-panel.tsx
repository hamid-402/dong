"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConfirmSettlementRequest, MembershipSummary, PaymentLinkSummary, PreviewSettlementEffectResponse, SettlementSummary, WorkspaceBalancesResponse } from "@dang/contracts";
import { isFinanceManagerRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
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
import { hubPathFor } from "@/lib/hub-links";
import { api } from "@/lib/api";
import { formatFaDate } from "@/lib/fa-datetime";
import { memberStatementHref } from "@/lib/statement-links";
import { membershipRoleLabel, paymentLinkStatusLabel, settlementStatusLabel } from "@/lib/status-labels";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { ConfirmSettlementDialog } from "@/components/views/finance/confirm-settlement-dialog";
import styles from "./settlement-panel.module.css";

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
  onCreateSettlement: () => void;
  onConfirmSettlement: (
    settlementId: string,
    evidence?: ConfirmSettlementRequest,
  ) => void;
  onDisputeSettlement: (settlementId: string) => void;
  evidenceRequired?: boolean;
  onCancelSettlement: (settlementId: string) => void;
  onCreatePaymentLink: (settlement: SettlementSummary) => void;
};

function tomanDigitsToIrrMinor(toman: string): string | null {
  const digits = toman.replace(/[^\d]/g, "");
  if (!digits) return null;
  try {
    const irr = BigInt(digits) * 10n;
    if (irr <= 0n) return null;
    return irr.toString();
  } catch {
    return null;
  }
}

function absMinor(amountMinor: string | undefined): string {
  if (!amountMinor) return "0";
  const n = BigInt(amountMinor);
  return (n < 0n ? -n : n).toString();
}

/**
 * Member settlement claims/confirmations with optional post-settlement NPS prompt.
 * Extracted from finance-view.tsx (dong-50 #29) — presentational, driven by parent state/handlers.
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
  currentUserId,
  myRole,
  readOnly = false,
  pending,
  settlementNps,
  onDismissNps,
  memberLabel,
  membersHref,
  slug,
  onCreateSettlement,
  onConfirmSettlement,
  onDisputeSettlement,
  evidenceRequired = false,
  onCancelSettlement,
  onCreatePaymentLink,
}: SettlementPanelProps) {
  const chrome = useOptionalAppChrome();
  const messaging = chrome?.capabilities?.providers?.messaging;
  const messagingLive = messaging === "telegram" || messaging === "bale";
  const [selectedSettlementId, setSelectedSettlementId] = useState("");
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null);
  const [apiPreview, setApiPreview] = useState<PreviewSettlementEffectResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [remindHint, setRemindHint] = useState<string | null>(null);
  const selectedSettlement =
    settlements.find((settlement) => settlement.id === selectedSettlementId) ??
    settlements[0] ??
    null;
  const finance = isFinanceManagerRole(myRole);
  const settleToNet = balances?.lines.find((l) => l.userId === settleToUserId)?.net
    .amountMinor;
  const settleToIsDebtor = settleToNet != null && BigInt(settleToNet) < 0n;

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
      setPreviewError(null);
      return;
    }
    if (settleToUserId === currentUserId) {
      setApiPreview(null);
      setPreviewError(null);
      return;
    }
    const amountMinor = tomanDigitsToIrrMinor(settleAmountToman);
    if (!amountMinor) {
      setApiPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api
        .previewSettlementEffect(workspaceId, {
          transfers: [
            {
              fromUserId: currentUserId,
              toUserId: settleToUserId,
              amount: { amountMinor, currency: "IRR" },
            },
          ],
        })
        .then((res) => {
          if (!cancelled) {
            setApiPreview(res);
            setPreviewError(null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setApiPreview(null);
            setPreviewError("پیش‌نمایش از API ناموفق بود");
          }
        });
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
    readOnly,
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
            عضو بدهکار ادعا ثبت می‌کند یا طلبکار پیشنهاد می‌دهد؛ طرف مقابل تأیید می‌کند.
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
          <TextField
            label="مبلغ تسویه (تومان)"
            value={settleAmountToman}
            onChange={(event) => onSettleAmountTomanChange(event.target.value)}
          />
          {balances && settleToUserId && settleToUserId !== currentUserId ? (
            <div className="dataRowActions">
              <Button
                type="button"
                variant="secondary"
                disabled={readOnly || pending}
                onClick={() => {
                  const line = balances.lines.find((l) => l.userId === settleToUserId);
                  if (!line) return;
                  const toman = Math.abs(Math.round(Number(line.net.amountMinor) / 10));
                  if (toman > 0) onSettleAmountTomanChange(String(toman));
                }}
              >
                پیشنهاد مبلغ از مانده زنده
              </Button>
            </div>
          ) : null}
          {workspaceId && settleToIsDebtor && settleToUserId !== currentUserId ? (
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
          {apiPreview && currentUserId ? (
            <StatusLine>
              پیش‌نمایش زنده از ledger: شما{" "}
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
              مبلغ و طرف مقابل را وارد کنید تا پیش‌نمایش از API مانده‌ها بیاید.
            </StatusLine>
          ) : null}
          <Button type="button" onClick={onCreateSettlement} disabled={pending || members.length < 2}>
            ثبت ادعای تسویه
          </Button>
        </FormStack>
      )}
      {members.length < 2 ? (
        <EmptyHint>
          برای تسویه حداقل دو عضو لازم است — از{" "}
          <Link href={membersHref ?? hubPathFor("/workspaces/invite")}>دعوت</Link>{" "}
          استفاده کنید.
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
            ).map(([label, rating]) => (
              <a
                key={rating}
                className="npsPrompt__btn"
                href={`mailto:support@dang.local?subject=${encodeURIComponent(
                  `بازخورد تسویه دنگ · ${label} (${rating})`,
                )}`}
                onClick={onDismissNps}
              >
                {label}
              </a>
            ))}
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
              readOnly ? undefined : (
                <Button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("settlement-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  ثبت ادعای تسویه
                </Button>
              )
            }
          />
        ) : null}
        {settlements.map((settlement) => (
          <DataRow
            key={settlement.id}
            title={`${memberLabel(settlement.fromUserId)} → ${memberLabel(settlement.toUserId)}`}
            meta={
              <StatusPill tone={settlement.status === "confirmed" ? "ok" : "gold"}>
                {settlementStatusLabel(settlement.status)}
              </StatusPill>
            }
            trailing={<Amount irrMinor={settlement.amount.amountMinor} />}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={selectedSettlement?.id === settlement.id}
                  onClick={() => setSelectedSettlementId(settlement.id)}
                >
                  جزئیات
                </Button>
                {slug ? (
                  <>
                    <Link
                      className="textButton"
                      href={memberStatementHref(slug, settlement.fromUserId)}
                    >
                      صورتحساب بدهکار
                    </Link>
                    <Link
                      className="textButton"
                      href={memberStatementHref(slug, settlement.toUserId)}
                    >
                      صورتحساب طلبکار
                    </Link>
                  </>
                ) : null}
                {readOnly
                ? null
                : settlement.status === "claimed"
                  ? (
                    <>
                      {canConfirm(settlement) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConfirmTargetId(settlement.id)}
                          disabled={pending}
                        >
                          تأیید
                        </Button>
                      ) : null}
                      {canDispute(settlement) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onDisputeSettlement(settlement.id)}
                          disabled={pending}
                        >
                          اعتراض
                        </Button>
                      ) : null}
                      {canCancel(settlement) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onCancelSettlement(settlement.id)}
                          disabled={pending}
                        >
                          لغو
                        </Button>
                      ) : null}
                      {paymentsLive && canConfirm(settlement) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onCreatePaymentLink(settlement)}
                          disabled={pending}
                        >
                          لینک پرداخت
                        </Button>
                      ) : null}
                    </>
                  )
                  : settlement.status === "disputed"
                    ? (
                      canCancel(settlement) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onCancelSettlement(settlement.id)}
                        disabled={pending}
                      >
                        لغو
                      </Button>
                      ) : null
                    )
                    : null
                }
              </>
            }
          />
        ))}
      </DataList>
      {selectedSettlement ? (
        <aside className={styles.inspector} aria-label="جزئیات تسویه انتخاب‌شده">
          <span>SETTLEMENT INSPECTOR</span>
          <h3>{memberLabel(selectedSettlement.fromUserId)} ← {memberLabel(selectedSettlement.toUserId)}</h3>
          <Amount irrMinor={selectedSettlement.amount.amountMinor} />
          <dl>
            <div><dt>وضعیت</dt><dd>{settlementStatusLabel(selectedSettlement.status)}</dd></div>
            <div><dt>پرداخت‌کننده</dt><dd>{memberLabel(selectedSettlement.fromUserId)}</dd></div>
            <div><dt>دریافت‌کننده</dt><dd>{memberLabel(selectedSettlement.toUserId)}</dd></div>
            <div><dt>ثبت</dt><dd><time dateTime={selectedSettlement.createdAt}>{formatFaDate(selectedSettlement.createdAt)}</time></dd></div>
            <div><dt>پرداخت آنلاین</dt><dd>{paymentsLive ? "متصل" : "غیرفعال"}</dd></div>
          </dl>
          {selectedSettlement.paymentLinkUrl && paymentsLive ? (
            <a href={selectedSettlement.paymentLinkUrl} target="_blank" rel="noreferrer">بازکردن صفحه پرداخت</a>
          ) : null}
          {slug ? (
            <p className="liveHint" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              <Link href={memberStatementHref(slug, selectedSettlement.fromUserId)}>
                صورتحساب {memberLabel(selectedSettlement.fromUserId)}
              </Link>
              <Link href={memberStatementHref(slug, selectedSettlement.toUserId)}>
                صورتحساب {memberLabel(selectedSettlement.toUserId)}
              </Link>
            </p>
          ) : null}
        </aside>
      ) : null}
      </div>
      {paymentLinks.length > 0 ? (
        <DataList>
          {paymentLinks.map((link) => (
            <DataRow
              key={link.id}
              title={`پرداخت ${paymentLinkStatusLabel(link.status)}`}
              meta={
                paymentsLive ? (
                  <a href={link.checkoutUrl} target="_blank" rel="noreferrer">
                    صفحه پرداخت
                  </a>
                ) : (
                  <span>لینک ذخیره‌شده — PSP واقعی هنوز وصل نیست</span>
                )
              }
              trailing={<Amount irrMinor={link.amount.amountMinor} />}
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
