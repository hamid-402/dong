"use client";

import styles from "./report-range-toolbar.module.css";

export type ReportMonths = 3 | 6 | 12;

const OPTIONS: Array<{ value: ReportMonths; label: string }> = [
  { value: 3, label: "۳ ماه" },
  { value: 6, label: "۶ ماه" },
  { value: 12, label: "۱۲ ماه" },
];

/**
 * Honest range control for chart endpoints that accept months / from-to.
 */
export function ReportRangeToolbar({
  months,
  onMonthsChange,
  onPrint,
  onExport,
  disabled = false,
  label = "بازه گزارش",
}: {
  months: ReportMonths;
  onMonthsChange: (months: ReportMonths) => void;
  onPrint?: () => void;
  onExport?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className={styles.bar} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.chips}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`${styles.chip}${months === opt.value ? ` ${styles.active}` : ""}`}
            aria-pressed={months === opt.value}
            disabled={disabled}
            onClick={() => onMonthsChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        {onExport ? (
          <button type="button" className={styles.ghost} disabled={disabled} onClick={onExport}>
            خروجی CSV
          </button>
        ) : null}
        {onPrint ? (
          <button type="button" className={styles.ghost} onClick={onPrint}>
            چاپ
          </button>
        ) : null}
      </div>
    </div>
  );
}
