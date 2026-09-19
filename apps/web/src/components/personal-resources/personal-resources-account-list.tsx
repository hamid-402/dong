"use client";

import type {
  PersonalMoneyAccountKind,
  PersonalMoneyAccountSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { DataList, DataRow, EmptyHint } from "@/components/ui-blocks";
import { accountKindLabel } from "./use-personal-resources-data";

type Props = {
  accounts: PersonalMoneyAccountSummary[];
  pending: boolean;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
  accountName: string;
  onAccountNameChange: (value: string) => void;
  accountKind: PersonalMoneyAccountKind;
  onAccountKindChange: (kind: PersonalMoneyAccountKind) => void;
  openingToman: string;
  onOpeningTomanChange: (value: string) => void;
  renameId: string;
  renameValue: string;
  onRenameIdChange: (id: string) => void;
  onRenameValueChange: (value: string) => void;
  onCreateAccount: () => void;
  onRenameAccount: () => void;
  onToggleArchive: (account: PersonalMoneyAccountSummary) => void;
};

/** Account list, rename, archive toggle, and create form. */
export function PersonalResourcesAccountList({
  accounts,
  pending,
  showArchived,
  onShowArchivedChange,
  accountName,
  onAccountNameChange,
  accountKind,
  onAccountKindChange,
  openingToman,
  onOpeningTomanChange,
  renameId,
  renameValue,
  onRenameIdChange,
  onRenameValueChange,
  onCreateAccount,
  onRenameAccount,
  onToggleArchive,
}: Props) {
  return (
    <>
      <h3 className="pfSubhead">حساب‌ها</h3>
      <label className="pfCheck">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => onShowArchivedChange(e.target.checked)}
        />
        نمایش بایگانی‌شده‌ها
      </label>
      {accounts.length === 0 ? (
        <EmptyHint>هنوز حسابی نساخته‌اید.</EmptyHint>
      ) : (
        <DataList>
          {accounts.map((account) => (
            <DataRow
              key={account.id}
              title={account.name}
              meta={
                <span className="pfRowMeta">
                  {accountKindLabel(account.kind)}
                  {account.archived ? " · بایگانی" : ""}
                  {" · "}
                  <button
                    type="button"
                    className="pfTextBtn"
                    onClick={() => {
                      onRenameIdChange(account.id);
                      onRenameValueChange(account.name);
                    }}
                  >
                    تغییر نام
                  </button>
                  {" · "}
                  <button
                    type="button"
                    className="pfTextBtn"
                    onClick={() => onToggleArchive(account)}
                    disabled={pending}
                  >
                    {account.archived ? "خروج از بایگانی" : "بایگانی"}
                  </button>
                </span>
              }
              trailing={<Amount irrMinor={account.balance.amountMinor} />}
            />
          ))}
        </DataList>
      )}

      {renameId ? (
        <div className="pfRangeRow">
          <TextField
            label="نام جدید"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
          />
          <Button type="button" onClick={onRenameAccount} disabled={pending}>
            ذخیره نام
          </Button>
          <Button
            type="button"
            onClick={() => {
              onRenameIdChange("");
              onRenameValueChange("");
            }}
          >
            انصراف
          </Button>
        </div>
      ) : null}

      <div className="pfRangeRow">
        <TextField
          label="نام حساب"
          value={accountName}
          onChange={(e) => onAccountNameChange(e.target.value)}
        />
        <SelectField
          label="نوع"
          value={accountKind}
          onChange={(e) =>
            onAccountKindChange(e.target.value as PersonalMoneyAccountKind)
          }
        >
          <option value="cash">نقد</option>
          <option value="bank">بانک</option>
          <option value="card">کارت</option>
          <option value="other">سایر</option>
        </SelectField>
        <TextField
          label="موجودی اولیه (تومان)"
          value={openingToman}
          onChange={(e) => onOpeningTomanChange(e.target.value)}
        />
        <Button type="button" onClick={onCreateAccount} disabled={pending}>
          افزودن حساب
        </Button>
      </div>
    </>
  );
}
