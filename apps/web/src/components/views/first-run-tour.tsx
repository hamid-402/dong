"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@dang/ui";
import styles from "@/components/views/statements-tour.module.css";
import { StickerSvg, type StickerName } from "@/components/visual/stickers";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { wPath } from "@/lib/workspace-paths";

const STORAGE_KEY = "dang.shell.first-run.tour.v1";

type Step = {
  id: string;
  titleKey: string;
  bodyKey: string;
  href?: string;
  hrefLabelKey?: string;
  /** Opens command palette instead of navigating. */
  openSearch?: boolean;
  sticker: StickerName;
};

/**
 * One-shot coach on workspace home — account ui-prefs when available,
 * localStorage fallback (honest hybrid until prefs always durable).
 */
export function FirstRunTour({
  workspaceSlug,
}: {
  workspaceSlug?: string | null;
}) {
  const shell = useShellV2Api();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  const steps: Step[] = [
    {
      id: "home",
      titleKey: "shell.tourHomeTitle",
      bodyKey: "shell.tourHomeBody",
      sticker: "compass",
    },
    {
      id: "spaces",
      titleKey: "shell.tourSpacesTitle",
      bodyKey: "shell.tourSpacesBody",
      href: "/home",
      hrefLabelKey: "shell.tourSpacesCta",
      sticker: "invite",
    },
    {
      id: "invite",
      titleKey: "shell.tourInviteTitle",
      bodyKey: "shell.tourInviteBody",
      href: workspaceSlug ? wPath(workspaceSlug, "members") : "/onboarding",
      hrefLabelKey: "shell.tourInviteCta",
      sticker: "invite",
    },
    {
      id: "expense",
      titleKey: "shell.tourExpenseTitle",
      bodyKey: "shell.tourExpenseBody",
      href: workspaceSlug ? wPath(workspaceSlug, "expenses") : undefined,
      hrefLabelKey: "shell.tourExpenseCta",
      sticker: "ledger",
    },
    {
      id: "search",
      titleKey: "shell.tourSearchTitle",
      bodyKey: "shell.tourSearchBody",
      hrefLabelKey: "shell.tourSearchCta",
      openSearch: true,
      sticker: "spark",
    },
  ];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await api.getUiPrefs();
        if (cancelled) return;
        if (prefs.dismissShellTour) {
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          return;
        }
      } catch {
        /* anonymous / offline — fall through to localStorage */
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
    void api.putUiPrefs({ dismissShellTour: true }).catch(() => undefined);
    setOpen(false);
  }

  function next() {
    if (step >= steps.length - 1) {
      dismiss();
      return;
    }
    setStep((s) => s + 1);
  }

  if (!open) return null;
  const current = steps[step]!;

  return (
    <aside
      className={styles.tour}
      role="dialog"
      aria-modal="false"
      aria-labelledby="first-run-tour-title"
    >
      <p className={styles.eyebrow}>
        {t("shell.tourEyebrow")} · {step + 1}/{steps.length}
      </p>
      <StickerSvg name={current.sticker} className={styles.sticker} />
      <h3 id="first-run-tour-title">{t(current.titleKey)}</h3>
      <p>{t(current.bodyKey)}</p>
      {current.openSearch && current.hrefLabelKey ? (
        <p style={{ marginTop: 8 }}>
          <button
            type="button"
            className="textButton"
            onClick={() => shell?.openCommandPalette()}
          >
            {t(current.hrefLabelKey)}
          </button>
        </p>
      ) : null}
      {current.href && current.hrefLabelKey && !current.openSearch ? (
        <p style={{ marginTop: 8 }}>
          <Link href={current.href}>{t(current.hrefLabelKey)}</Link>
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className="textButton" onClick={dismiss}>
          {t("shell.tourSkip")}
        </button>
        <Button type="button" onClick={next}>
          {step >= steps.length - 1 ? t("shell.tourDone") : t("shell.tourNext")}
        </Button>
      </div>
    </aside>
  );
}
