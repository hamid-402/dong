"use client";

import { useEffect, useState } from "react";
import { Button } from "@dang/ui";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "./statements-tour.module.css";

const STORAGE_KEY = "dang.statements.tour.v1";

const STEPS = [
  { id: "range", titleKey: "statements.tourRangeTitle", bodyKey: "statements.tourRangeBody" },
  { id: "member", titleKey: "statements.tourMemberTitle", bodyKey: "statements.tourMemberBody" },
  { id: "export", titleKey: "statements.tourExportTitle", bodyKey: "statements.tourExportBody" },
] as const;

/**
 * One-shot coach marks for /statements — account ui-prefs + localStorage fallback.
 */
export function StatementsTour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await api.getUiPrefs();
        if (cancelled) return;
        if (prefs.dismissStatementsTour) {
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          return;
        }
      } catch {
        /* fall through */
      }
      try {
        if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
        if (!cancelled) setOpen(true);
      } catch {
        if (!cancelled) setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    void api.putUiPrefs({ dismissStatementsTour: true }).catch(() => undefined);
    setOpen(false);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      dismiss();
      return;
    }
    setStep((s) => s + 1);
  }

  if (!open) return null;
  const current = STEPS[step]!;

  return (
    <aside
      className={styles.tour}
      role="dialog"
      aria-modal="false"
      aria-labelledby="statements-tour-title"
    >
      <p className={styles.eyebrow}>
        {t("statements.tourEyebrow")} · {step + 1}/{STEPS.length}
      </p>
      <h3 id="statements-tour-title">{t(current.titleKey)}</h3>
      <p>{t(current.bodyKey)}</p>
      <div className={styles.actions}>
        <button type="button" className="textButton" onClick={dismiss}>
          {t("statements.tourSkip")}
        </button>
        <Button type="button" onClick={next}>
          {step >= STEPS.length - 1
            ? t("statements.tourDone")
            : t("statements.tourNext")}
        </Button>
      </div>
    </aside>
  );
}
