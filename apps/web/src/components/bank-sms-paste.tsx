"use client";

import { useState } from "react";
import type { ParsedBankSms } from "@dang/contracts";
import { parseBankSms } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { StatusLine } from "@/components/ui-blocks";

const DIRECTION_FA: Record<ParsedBankSms["direction"], string> = {
  deposit: "واریز",
  withdrawal: "برداشت",
  purchase: "خرید",
  unknown: "نامشخص",
};

/**
 * Paste a bank SMS, preview the fields, and apply them onto an existing form.
 * Nothing is saved here.
 */
export function BankSmsPaste({
  onApply,
}: {
  onApply: (parsed: ParsedBankSms) => void;
}) {
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseBankSms(text) : null;

  return (
    <details className="reportDetails">
      <summary>چسباندن پیامک بانک</summary>
      <div className="reportDetails__body">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="متن پیامک واریز یا برداشت را اینجا بگذارید"
          aria-label="متن پیامک بانک"
        />
        {parsed?.ambiguous ? (
          <StatusLine>چند مبلغ در متن است. فرم پر نشد؛ مبلغ را خودتان انتخاب کنید.</StatusLine>
        ) : null}
        {parsed && !parsed.recognized && !parsed.ambiguous && text.trim() ? (
          <StatusLine>مبلغ برچسب‌دار پیدا نشد. فرم دست نخورد.</StatusLine>
        ) : null}
        {parsed?.recognized && parsed.amountMinor ? (
          <>
            <StatusLine>
              {DIRECTION_FA[parsed.direction]}
              {parsed.bankName ? ` · ${parsed.bankName}` : ""}
              {parsed.trackingCode ? ` · پیگیری ${parsed.trackingCode}` : ""}
              {parsed.isoDate ? ` · ${parsed.isoDate}` : ""}
              {" · "}
              <Amount irrMinor={parsed.amountMinor} />
            </StatusLine>
            <Button type="button" variant="secondary" onClick={() => onApply(parsed)}>
              اعمال روی فرم
            </Button>
          </>
        ) : null}
      </div>
    </details>
  );
}
