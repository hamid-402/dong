"use client";

import { useMemo } from "react";
import type {
  PersonalMoneyAccountKind,
  PersonalMoneyAccountSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { DataList, DataRow, EmptyHint } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
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
  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const selection = useRowSelection(accountIds);
  const barAccount =
    selection.selectedCount === 1
      ? (accounts.find((a) => a.id === selection.selectedIds[0]) ?? null)
      : null;
  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selection.selectedIds.includes(a.id)),
    [accounts, selection.selectedIds],
  );

  function startRenameSelected() {
    if (!barAccount) return;
    onRenameIdChange(barAccount.id);
    onRenameValueChange(barAccount.name);
    selection.clear();
  }

  function archiveSelected() {
    if (selectedAccounts.length === 0) return;
    const allArchived = selectedAccounts.every((a) => a.archived);
    const targets = allArchived
      ? selectedAccounts
      : selectedAccounts.filter((a) => !a.archived);
    if (targets.length === 0) return;
    const label =
      targets.length === 1
        ? allArchived
          ? "این حساب از بایگانی خارج شود؟"
          : "این حساب بایگانی شود؟"
        : allArchived
          ? `${targets.length.toLocaleString("fa-IR")} حساب از بایگانی خارج شوند؟`
          : `${targets.length.toLocaleString("fa-IR")} حساب بایگانی شوند؟`;
    if (!window.confirm(label)) return;
    for (const account of targets) {
      onToggleArchive(account);
    }
    selection.clear();
  }

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
        <>
          <SelectionActionBar
            selectedCount={selection.selectedCount}
            idleHint="روی ردیف کلیک کنید یا مربع کنار حساب را تیک بزنید"
            onClear={selection.clear}
          >
            <button
              type="button"
              disabled={!barAccount || pending}
              onClick={startRenameSelected}
            >
              تغییر نام
            </button>
            <button
              type="button"
              className={selStyles.danger}
              disabled={selection.selectedCount === 0 || pending}
              onClick={archiveSelected}
            >
              {barAccount?.archived
                ? "خروج از بایگانی"
                : selectedAccounts.every((a) => a.archived)
                  ? "خروج از بایگانی"
                  : "بایگانی"}
            </button>
          </SelectionActionBar>
          <DataList>
            {accounts.map((account) => (
              <div
                key={account.id}
                className={selStyles.selectableRow}
                {...rowSelectActivateProps({
                  onActivate: () => selection.toggle(account.id),
                })}
              >
                <DataRow
                  title={
                    <span className="pfRowMeta" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <RowSelectCheckbox
                        checked={selection.isSelected(account.id)}
                        onChange={() => selection.toggle(account.id)}
                        label={`انتخاب ${account.name}`}
                      />
                      {account.name}
                    </span>
                  }
                  meta={
                    <span className="pfRowMeta">
                      {accountKindLabel(account.kind)}
                      {account.archived ? " · بایگانی" : ""}
                    </span>
                  }
                  trailing={<Amount irrMinor={account.balance.amountMinor} />}
                />
              </div>
            ))}
          </DataList>
        </>
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
          <option value="investment">سرمایه‌گذاری</option>
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
