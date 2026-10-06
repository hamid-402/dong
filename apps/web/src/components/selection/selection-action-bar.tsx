"use client";

import type { ReactNode } from "react";
import styles from "./selection-action-bar.module.css";

export {
  isRowSelectIgnoredTarget,
  rowSelectActivateProps,
} from "./row-select-activate";

type SelectionActionBarProps = {
  selectedCount: number;
  /** Shown when nothing is selected — e.g. “یک ردیف را تیک بزنید”. */
  idleHint?: ReactNode;
  children?: ReactNode;
  onClear?: () => void;
};

/**
 * Toolbar for the Bulk actions / «نوار انتخاب» pattern.
 * Actions are disabled or hidden until at least one row is selected.
 */
export function SelectionActionBar({
  selectedCount,
  idleHint = "روی ردیف کلیک کنید یا مربع کنارش را تیک بزنید",
  children,
  onClear,
}: SelectionActionBarProps) {
  const active = selectedCount > 0;
  return (
    <div
      className={`${styles.bar} ${active ? styles.barActive : ""}`}
      role="toolbar"
      aria-label="عملیات ردیف‌های انتخاب‌شده"
      aria-disabled={!active}
    >
      <span className={styles.count} aria-live="polite">
        {active
          ? `${selectedCount.toLocaleString("fa-IR")} انتخاب`
          : idleHint}
      </span>
      <div className={styles.actions}>{children}</div>
      {active && onClear ? (
        <button type="button" className={styles.clear} onClick={onClear}>
          لغو انتخاب
        </button>
      ) : null}
    </div>
  );
}

type RowSelectCheckboxProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  indeterminate?: boolean;
};

/** Compact checkbox for the first column / card corner of selectable rows. */
export function RowSelectCheckbox({
  checked,
  onChange,
  label,
  indeterminate = false,
}: RowSelectCheckboxProps) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={onChange}
        aria-label={label}
      />
    </label>
  );
}
