"use client";

import type { PersonalMoneyAccountSummary } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";

type Props = {
  activeAccounts: PersonalMoneyAccountSummary[];
  pending: boolean;
  fromAccountId: string;
  toAccountId: string;
  transferToman: string;
  transferDate: string;
  onFromAccountIdChange: (id: string) => void;
  onToAccountIdChange: (id: string) => void;
  onTransferTomanChange: (value: string) => void;
  onTransferDateChange: (value: string) => void;
  onTransfer: () => void;
};

/** Transfer between personal money accounts. */
export function PersonalResourcesTransferForm({
  activeAccounts,
  pending,
  fromAccountId,
  toAccountId,
  transferToman,
  transferDate,
  onFromAccountIdChange,
  onToAccountIdChange,
  onTransferTomanChange,
  onTransferDateChange,
  onTransfer,
}: Props) {
  return (
    <>
      <h3 className="pfSubhead">انتقال بین حساب‌ها</h3>
      <div className="pfRangeRow">
        <SelectField
          label="از"
          value={fromAccountId}
          onChange={(e) => onFromAccountIdChange(e.target.value)}
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="به"
          value={toAccountId}
          onChange={(e) => onToAccountIdChange(e.target.value)}
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="مبلغ (تومان)"
          value={transferToman}
          onChange={(e) => onTransferTomanChange(e.target.value)}
        />
        <JalaliDateField
          label="تاریخ"
          value={transferDate}
          onChange={onTransferDateChange}
        />
        <Button
          type="button"
          onClick={onTransfer}
          disabled={pending || activeAccounts.length < 2}
        >
          انتقال
        </Button>
      </div>
    </>
  );
}
