"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MembershipSummary, PaymentLinkSummary, SettlementSummary } from "@dang/contracts";
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
import { membershipRoleLabel, paymentLinkStatusLabel, settlementStatusLabel } from "@/lib/status-labels";
import styles from "./settlement-panel.module.css";

type SettlementPanelProps = {
  members: MembershipSummary[];
  settleToUserId: string;
  onSettleToUserIdChange: (value: string) => void;
  settleAmountToman: string;
  onSettleAmountTomanChange: (value: string) => void;
  settlements: SettlementSummary[];
  paymentLinks: PaymentLinkSummary[];
  paymentsLive: boolean;
  /** Auditor/guest — list only, no claim/confirm/payment. */
  readOnly?: boolean;
  pending: boolean;
  settlementNps: boolean;
  onDismissNps: () => void;
  memberLabel: (userId: string) => string;
  membersHref?: string;
  onCreateSettlement: () => void;
  onConfirmSettlement: (settlementId: string) => void;
  onDisputeSettlement: (settlementId: string) => void;
  onCancelSettlement: (settlementId: string) => void;
  onCreatePaymentLink: (settlement: SettlementSummary) => void;
};

/**
 * Member settlement claims/confirmations with optional post-settlement NPS prompt.
 * Extracted from finance-view.tsx (dong-50 #29) — presentational, driven by parent state/handlers.
 */
export function SettlementPanel({
  members,
  settleToUserId,
  onSettleToUserIdChange,
  settleAmountToman,
  onSettleAmountTomanChange,
  settlements,
  paymentLinks,
  paymentsLive,
  readOnly = false,
  pending,
  settlementNps,
  onDismissNps,
  memberLabel,
  membersHref,
  onCreateSettlement,
  onConfirmSettlement,
  onDisputeSettlement,
  onCancelSettlement,
  onCreatePaymentLink,
}: SettlementPanelProps) {
  const [selectedSettlementId, setSelectedSettlementId] = useState("");
  const selectedSettlement =
    settlements.find((settlement) => settlement.id === selectedSettlementId) ??
    settlements[0] ??
    null;

  useEffect(() => {
    if (
      selectedSettlementId &&
      !settlements.some((settlement) => settlement.id === selectedSettlementId)
    ) {
      setSelectedSettlementId(settlements[0]?.id ?? "");
    }
  }, [selectedSettlementId, settlements]);

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
                {readOnly
                ? null
                : settlement.status === "claimed"
                  ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onConfirmSettlement(settlement.id)}
                        disabled={pending}
                      >
                        تأیید
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onDisputeSettlement(settlement.id)}
                        disabled={pending}
                      >
                        اعتراض
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onCancelSettlement(settlement.id)}
                        disabled={pending}
                      >
                        لغو
                      </Button>
                      {paymentsLive ? (
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
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onCancelSettlement(settlement.id)}
                        disabled={pending}
                      >
                        لغو
                      </Button>
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
            <div><dt>ثبت</dt><dd><time dateTime={selectedSettlement.createdAt}>{new Date(selectedSettlement.createdAt).toLocaleDateString("fa-IR")}</time></dd></div>
            <div><dt>پرداخت آنلاین</dt><dd>{paymentsLive ? "متصل" : "غیرفعال"}</dd></div>
          </dl>
          {selectedSettlement.paymentLinkUrl && paymentsLive ? (
            <a href={selectedSettlement.paymentLinkUrl} target="_blank" rel="noreferrer">بازکردن صفحه پرداخت</a>
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
    </SectionCard>
  );
}
